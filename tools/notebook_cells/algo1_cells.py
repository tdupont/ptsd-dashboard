# Cells to append at the END of export_modele.ipynb (algo 1), after section "1d" and the threshold cell.
# They use the objects already in memory: final, X, X_tr, X_te, y_tr, y_te, FEATURES, CATEGORICAL, WD.
# Requires REFIT_ON_ALL = False (so that X_te is a true held-out set).
# Only aggregated curves/tables go into the dashboard JSON.
#
# TabPFN needs Python >= 3.10, but this notebook runs Python 3.9 (needed for model.pkl). So:
#   cell A (here)            -> writes the train/test split to a PRIVATE folder outside the repo
#   terminal, Python >= 3.10 -> python tools/tabpfn_run.py <PRIVATE folder> --algo algo1
#   cell B (here)            -> builds algo1_performance.json, including TabPFN if its predictions exist

# %% [markdown]
# ## 6. Export for the dashboard (aggregated performance)

# %% Paths
import sys
from pathlib import Path

DASH = Path("/Users/tdupont/Desktop/2022_PhD/ptsd-dashboard")   # <-- adapt: folder of the dashboard repo
PRIVATE = WD / "dashboard_private"                               # outside the repo, never pushed
PRIVATE.mkdir(exist_ok=True)
assert (DASH / "tools" / "performance.py").exists(), f"Unzip ptsd-dashboard.zip so that {DASH} exists, or adapt DASH"
sys.path.insert(0, str(DASH / "tools"))
import importlib
import performance
importlib.reload(performance)   # always use the current tools/performance.py
from performance import dependence_profiles, make_performance, paired_auc_difference, write_performance

assert not REFIT_ON_ALL, "X_te must be held out"
y_te_ = y_te.to_numpy().astype(int)
p_te = final.predict_proba(X_te)[:, 1]

# %% Cell A: save the split for the TabPFN script (individual-level data: stays in PRIVATE)
X_tr.assign(_y=y_tr.to_numpy()).to_csv(PRIVATE / "algo1_train.csv", index=False)
X_te.assign(_y=y_te_).to_csv(PRIVATE / "algo1_test.csv", index=False)
(PRIVATE / "algo1_categorical.txt").write_text("\n".join(CATEGORICAL), encoding="utf-8")

# %% TabPFN comparator (optional, ~1 min). This kernel is Python 3.9 (needed for model.pkl) and TabPFN needs
# Python >= 3.10, so it runs with the Python of another environment, in a separate process.
import subprocess

RUN_TABPFN = True
RERUN_TABPFN = False
TABPFN_PYTHON = Path.home() / "miniforge3" / "envs" / "python13-env" / "bin" / "python"   # <-- env with tabpfn
TABPFN_ARGS = ["--device", "cpu"]

tab_file = PRIVATE / "algo1_tabpfn.csv"
if RUN_TABPFN and (RERUN_TABPFN or not tab_file.exists()):
    assert TABPFN_PYTHON.exists(), f"adapt TABPFN_PYTHON: {TABPFN_PYTHON} not found"
    cmd = [str(TABPFN_PYTHON), str(DASH / "tools" / "tabpfn_run.py"), str(PRIVATE), "--algo", "algo1", *TABPFN_ARGS]
    print("running:", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    print(proc.stdout[-2500:])
    if proc.returncode != 0:
        print(proc.stderr[-2500:])
        print("TabPFN failed: comparator skipped")

# %% Global importance: mean |SHAP| per input variable on the test set (TreeSHAP, log-odds)
import xgboost as xgb

prep, booster = final.named_steps["prep"], final.named_steps["xgb"].get_booster()
contrib = booster.predict(xgb.DMatrix(prep.transform(X_te), missing=np.nan), pred_contribs=True)[:, :-1]


def var_of(col):
    col = col.split("__", 1)[1]
    return max((f for f in FEATURES if col == f or col.startswith(f + "_")), key=len)


per_var = {f: np.zeros(len(X_te)) for f in FEATURES}
for j, c in enumerate(prep.get_feature_names_out()):
    per_var[var_of(c)] += contrib[:, j]
importance = dict(sorted(((f, float(np.abs(v).mean())) for f, v in per_var.items()), key=lambda kv: -kv[1]))
# binned SHAP dependence profiles (groups of >= 10 relatives only)
dependence = dependence_profiles(X_te[FEATURES].reset_index(drop=True), per_var, min_n=10)
importance

# %% Cell B: write docs/models/algo1_performance.json (+ TabPFN comparator if available)
comparators = None
tab_file = PRIVATE / "algo1_tabpfn.csv"
if RUN_TABPFN and tab_file.exists():
    tab = pd.read_csv(tab_file)
    assert len(tab) == len(y_te_) and (tab["_y"].to_numpy() == y_te_).all()
    p_tab = tab["p_tabpfn"].to_numpy()
    comparators = {"tabpfn": make_performance(
        y_te_, p_tab, label=tab["model"].iloc[0],
        validation="Same held-out internal test set; no tuning, no recalibration", n_boot=1000)}
    comparators["tabpfn"]["auc_diff_vs_main"] = paired_auc_difference(y_te_, p_te, p_tab)
    print("TabPFN AUC", round(comparators["tabpfn"]["auc"], 3))

perf = make_performance(
    y_te_, p_te, label="XGBoost", threshold=0.218,
    validation=f"Held-out internal test set (20 %, stratified on outcome and cohort; n = {len(y_te_)})",
    importance=importance, importance_kind="mean_abs_shap", dependence=dependence, comparators=comparators)
write_performance(perf, DASH / "docs" / "models" / "algo1_performance.json")
print(f"AUC {perf['auc']:.3f} [{perf['auc_ci'][0]:.3f}-{perf['auc_ci'][1]:.3f}]")
