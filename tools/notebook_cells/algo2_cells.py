# Cells to append at the END of 2-algo2-export-train.ipynb (algo 2), after section 10.
# They use the objects already in memory: X, y, INPUTS, OUTER_CV, SEED, p_cal_oof, clf, CAL_A, THRESHOLD.
# Nothing individual-level is written: only aggregated curves/tables go into the JSON.

# %% [markdown]
# ## 11. Export for the dashboard (aggregated performance)

# %% Paths
import sys
from pathlib import Path

DASH = Path("/Users/tdupont/Desktop/2022_PhD/ptsd-dashboard")   # <-- adapt: folder of the dashboard repo
assert (DASH / "tools" / "performance.py").exists(), f"Unzip ptsd-dashboard.zip so that {DASH} exists, or adapt DASH"
sys.path.insert(0, str(DASH / "tools"))
import importlib
import performance
importlib.reload(performance)   # always use the current tools/performance.py
from performance import dependence_profiles, make_performance, paired_auc_difference, write_performance

# %% TabPFN comparator (optional, ~1 min). TabPFN runs in a separate Python process (tools/tabpfn_run.py):
# inside Jupyter, scikit-learn and PyTorch load two clashing OpenMP libraries on macOS (crash or endless hang).
# Data and the SAME fold ids are saved to PRIVATE (outside the repo); predictions come back as a CSV.
import subprocess

RUN_TABPFN = True            # False: skip TabPFN entirely
RERUN_TABPFN = False         # True: recompute even if predictions already exist
TABPFN_PYTHON = sys.executable                     # this kernel's Python (needs: pip install tabpfn)
TABPFN_ARGS = ["--device", "cpu"]                  # e.g. ["--device", "cpu", "--version", "3.5-fast"]

PRIVATE = OUT_DIR.parent / "dashboard_private"
PRIVATE.mkdir(exist_ok=True)
fold_id = np.zeros(len(y), dtype=int)
for k, (_, te) in enumerate(OUTER_CV.split(X, y)):
    fold_id[te] = k
X.assign(_y=y, _fold=fold_id).to_csv(PRIVATE / "algo2_data.csv", index=False)

tab_file = PRIVATE / "algo2_tabpfn.csv"
if RUN_TABPFN and (RERUN_TABPFN or not tab_file.exists()):
    cmd = [str(TABPFN_PYTHON), str(DASH / "tools" / "tabpfn_run.py"), str(PRIVATE), "--algo", "algo2", *TABPFN_ARGS]
    print("running:", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    print(proc.stdout[-2500:])
    if proc.returncode != 0:
        print(proc.stderr[-2500:])
        print("TabPFN failed: comparator skipped (run the command above in a Terminal to see the full error)")

comparators = None
if RUN_TABPFN and tab_file.exists():
    tab = pd.read_csv(tab_file)
    assert len(tab) == len(y) and (tab["_y"].to_numpy() == y).all(), "TabPFN predictions do not match this data: set RERUN_TABPFN = True"
    p_tab_oof = tab["p_tabpfn"].to_numpy()
    comparators = {"tabpfn": make_performance(
        y, p_tab_oof, label=tab["model"].iloc[0],
        validation="Same stratified 5-fold outer splits; no tuning, no recalibration", n_boot=1000)}
    comparators["tabpfn"]["auc_diff_vs_main"] = paired_auc_difference(y, p_cal_oof, p_tab_oof)
    print(tab["model"].iloc[0], "AUC", round(comparators["tabpfn"]["auc"], 3), "| difference vs LR", comparators["tabpfn"]["auc_diff_vs_main"])

# %% Global importance: mean |SHAP| per input variable (exact for a linear model, calibrated log-odds)
imputer, scaler, lr = clf.steps[0][1], clf.steps[1][1], clf.steps[2][1].best_estimator_
contrib = CAL_A * scaler.transform(imputer.transform(X)) * lr.coef_.ravel()
names = [d["name"] for d in INPUTS]


def var_of(col):
    return max((f for f in names if col == f or col.startswith(f + "_")), key=len)


per_var = {f: np.zeros(len(X)) for f in names}
for j, c in enumerate(X.columns):
    per_var[var_of(c)] += contrib[:, j]
importance = dict(sorted(((f, float(np.abs(v).mean())) for f, v in per_var.items()), key=lambda kv: -kv[1]))
# binned SHAP dependence profiles (groups of >= 10 relatives only)
dependence = dependence_profiles(data[names], per_var, min_n=10)
importance

# %% Write docs/models/algo2_performance.json
perf = make_performance(
    y, p_cal_oof, label="L2 logistic regression", threshold=THRESHOLD,
    validation=f"Stratified 5-fold cross-validation, out-of-fold predictions; Platt fitted within training folds (n = {len(y)})",
    importance=importance, importance_kind="mean_abs_shap", dependence=dependence,
    comparators=comparators)
write_performance(perf, DASH / "docs" / "models" / "algo2_performance.json")
print(f"AUC {perf['auc']:.3f} [{perf['auc_ci'][0]:.3f}-{perf['auc_ci'][1]:.3f}]")
