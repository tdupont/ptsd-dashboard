"""Placeholder performance files so the site works before the real export is run.

Curves are SIMULATED (prevalence, n and AUC matched to the README values) and flagged with
"placeholder": true, which makes the site display a warning banner. Overwrite them by running the
export cells in the two notebooks. Global importance is real (derived from the model files only).
"""
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from performance import make_performance, write_performance  # noqa: E402

MODELS = HERE.parent / "docs" / "models"


def simulate(n, prev, auc, seed):
    rng = np.random.default_rng(seed)
    best = None
    for s in np.linspace(0.4, 2.5, 120):
        z = rng.normal(0, s, 200_000)
        mu = np.log(prev / (1 - prev)) - 0.0
        # shift so that the mean probability equals the prevalence
        for _ in range(30):
            mu -= (1 / (1 + np.exp(-(z + mu)))).mean() - prev
        p = 1 / (1 + np.exp(-(z + mu)))
        y = rng.random(len(p)) < p
        a = roc_auc_score(y, p)
        if best is None or abs(a - auc) < abs(best[0] - auc):
            best = (a, s, mu)
    _, s, mu = best
    p = 1 / (1 + np.exp(-(rng.normal(0, s, n) + mu)))
    y = (rng.random(n) < p).astype(int)
    return y, p


# algo 1 importance: total split gain per input variable (from the trees)
s1 = json.loads((MODELS / "algo1.json").read_text())
raw_gain = {}
src = Path(sys.argv[1]) / "model.json"
trees = json.loads(src.read_text())["learner"]["gradient_booster"]["model"]["trees"]
gain = {d["name"]: 0.0 for d in s1["inputs"]}
for t in trees:
    for n_, f in enumerate(t["split_indices"]):
        if t["left_children"][n_] != -1:
            gain[s1["columns"][f]["variable"]] += t["loss_changes"][n_]
tot = sum(gain.values())
imp1 = {k: v / tot for k, v in sorted(gain.items(), key=lambda kv: -kv[1])}

# algo 2 importance: |calibrated coefficient| per SD, summed over dummies
s2 = json.loads((MODELS / "algo2.json").read_text())
imp2 = {d["name"]: 0.0 for d in s2["inputs"]}
for f in s2["features"]:
    var = next(d["name"] for d in s2["inputs"] if f["name"] == d["name"] or f["name"].startswith(d["name"] + "_"))
    imp2[var] += abs(s2["calibration"]["a"] * f["coef"])
imp2 = dict(sorted(imp2.items(), key=lambda kv: -kv[1]))

for algo, n, prev, auc, thr, imp, kind, label, val in [
    ("algo1", 542, 0.338, 0.715, 0.218, imp1, "gain", "XGBoost",
     "Held-out internal test set (20 %, stratified on outcome and cohort)"),
    ("algo2", 932, 0.114, 0.780, 0.084, imp2, "abs_coef", "L2 logistic regression",
     "Stratified 5-fold cross-validation (out-of-fold predictions, Platt fitted within training folds)"),
]:
    y, p = simulate(n, prev, auc, seed=7 if algo == "algo1" else 11)
    perf = make_performance(y, p, label=label, validation=val, threshold=thr, n_boot=300,
                            importance=imp, importance_kind=kind)
    perf["placeholder"] = True
    write_performance(perf, MODELS / f"{algo}_performance.json")
    print(algo, "simulated AUC", round(perf["auc"], 3))
