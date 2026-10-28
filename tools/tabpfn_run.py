"""TabPFN comparator, run from the Terminal (outside Jupyter) with visible progress and timings.

Uses the SAME data and splits as the main model, saved by the notebooks into a PRIVATE folder
(individual-level data: never inside the dashboard repository).

    python tools/tabpfn_run.py <PRIVATE folder> --algo algo2              # TabPFN-3.5, CPU
    python tools/tabpfn_run.py <PRIVATE folder> --algo algo2 --device mps # Apple GPU (much faster)
    python tools/tabpfn_run.py <PRIVATE folder> --algo algo2 --version 3.5-fast
    python tools/tabpfn_run.py <PRIVATE folder> --algo algo1              # held-out test split of algo 1
    python tools/tabpfn_run.py <PRIVATE folder> --algo algo2 --probe      # 1 fold, 1 estimator: timing check only

Writes <PRIVATE>/<algo>_tabpfn.csv (outcome, predicted probability, model description), read by the
last cell of the notebook. Requires: pip install tabpfn (Python >= 3.10) and an accepted licence.
"""
import faulthandler
import os
import sys

faulthandler.enable()  # on a crash, print where it happened instead of a bare "segmentation fault"

# Load PyTorch BEFORE numpy / pandas / scikit-learn: on macOS, conda's OpenMP (used by scikit-learn) and
# PyTorch's bundled OpenMP clash when scikit-learn is imported first (segfault or endless hang).
import torch  # noqa: E402

import argparse  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("private", type=Path)
ap.add_argument("--algo", choices=["algo1", "algo2"], required=True)
ap.add_argument("--version", default="3.5", choices=["3.5", "3.5-fast", "3", "2.6", "2.5"])
ap.add_argument("--device", default="cpu", help="cpu | mps | cuda")
ap.add_argument("--n-estimators", default="auto", help='"auto" (model default) or an integer, e.g. 4 for speed')
ap.add_argument("--probe", action="store_true", help="time one fold with one estimator, write nothing")
ap.add_argument("--threads", type=int, default=0, help="CPU threads for PyTorch (0 = all cores; try 1 if it crashes or hangs)")
a = ap.parse_args()

import tabpfn  # noqa: E402
from tabpfn import TabPFNClassifier  # noqa: E402
from tabpfn.constants import ModelVersion  # noqa: E402

torch.set_num_threads(a.threads or os.cpu_count() or 4)
print("PyTorch self-test:", float((torch.ones(64, 64) @ torch.ones(64, 64)).sum()), flush=True)
VERSIONS = {"3.5": ModelVersion.V3_5, "3.5-fast": ModelVersion.V3_5_FAST, "3": ModelVersion.V3,
            "2.6": ModelVersion.V2_6, "2.5": ModelVersion.V2_5}
n_est = 1 if a.probe else ("auto" if a.n_estimators == "auto" else int(a.n_estimators))
print(f"tabpfn {tabpfn.__version__} | torch {torch.__version__} | model TabPFN-{a.version} | device {a.device} | "
      f"n_estimators {n_est} | threads {torch.get_num_threads()}", flush=True)


def make(cat_idx=None):
    kw = dict(random_state=0, device=a.device, n_estimators=n_est, show_progress_bar=True)
    if cat_idx:
        kw["categorical_features_indices"] = cat_idx
    return TabPFNClassifier.create_default_for_version(VERSIONS[a.version], **kw)


def run(model, Xtr, ytr, Xte):
    t0 = time.time()
    model.fit(Xtr, ytr)
    p = model.predict_proba(Xte)[:, 1]
    return p, time.time() - t0


if a.algo == "algo2":
    df = pd.read_csv(a.private / "algo2_data.csv")
    y, fold = df.pop("_y").to_numpy().astype(int), df.pop("_fold").to_numpy()
    X = df
    p = np.full(len(y), np.nan)
    folds = sorted(set(fold))[:1] if a.probe else sorted(set(fold))
    for k in folds:
        tr, te = fold != k, fold == k
        p[te], sec = run(make(), X[tr], y[tr], X[te])
        print(f"fold {k + 1}/{len(set(fold))}: AUC {roc_auc_score(y[te], p[te]):.3f}, {sec / 60:.1f} min", flush=True)
else:
    tr = pd.read_csv(a.private / "algo1_train.csv")
    te = pd.read_csv(a.private / "algo1_test.csv")
    categorical = (a.private / "algo1_categorical.txt").read_text(encoding="utf-8").splitlines()
    ytr, y = tr.pop("_y").to_numpy().astype(int), te.pop("_y").to_numpy().astype(int)
    for c in categorical:  # ordinal codes, NaN kept as NaN
        codes = {v: i for i, v in enumerate(sorted(pd.concat([tr[c], te[c]]).dropna().unique()))}
        tr[c], te[c] = tr[c].map(codes).astype(float), te[c].map(codes).astype(float)
    p, sec = run(make([tr.columns.get_loc(c) for c in categorical]), tr, ytr, te)
    print(f"test set: AUC {roc_auc_score(y, p):.3f}, {sec / 60:.1f} min", flush=True)

if a.probe:
    print("probe only: nothing written. Multiply the time by the number of folds and by n_estimators "
          "(auto is usually 4 to 8) to estimate the full run.")
    sys.exit(0)

print(f"all: AUC {roc_auc_score(y, p):.3f} | predicted probabilities min {p.min():.3f}, mean {p.mean():.3f}, "
      f"max {p.max():.3f} (prevalence {y.mean():.3f})")
if np.std(p) < 0.02:
    sys.exit("TabPFN probabilities are flat: broken run (try --device cpu, or another --version). Nothing written.")
desc = f"TabPFN-{a.version} (tabpfn {tabpfn.__version__}, n_estimators {n_est})"
out = a.private / f"{a.algo}_tabpfn.csv"
pd.DataFrame({"_y": y, "p_tabpfn": p, "model": desc}).to_csv(out, index=False)
print("written:", out)
