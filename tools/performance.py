"""Aggregated performance summary for the website (no individual-level data is written).

    from performance import make_performance, write_performance
    perf = make_performance(y, p, label="XGBoost", validation="...", threshold=0.218)
    write_performance(perf, "docs/models/algo1_performance.json")

Contents: AUC (bootstrap 95 % CI), ROC curve with bootstrap band, a threshold grid (0.005 steps) with
sensitivity / specificity / PPV / NPV and their bootstrap 95 % CIs, calibration by deciles (Wilson CI),
calibration slope / intercept / Brier / ECE, decision-curve net benefit, and histograms of predicted
probabilities by outcome. Optionally a global importance list and comparator models (e.g. TabPFN).
Dependencies: numpy, scikit-learn.
"""
import json
import warnings
from datetime import date

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score, roc_curve

GRID = np.round(np.arange(0.005, 1.0, 0.005), 3)
FPR_GRID = np.linspace(0, 1, 101)
DCA_GRID = np.round(np.arange(0.01, 0.61, 0.01), 2)


def _counts(y, p, thr):
    """TP, FP, FN, TN for p >= thr, vectorised over thresholds."""
    pos, neg = np.sort(p[y == 1]), np.sort(p[y == 0])
    tp = len(pos) - np.searchsorted(pos, thr, side="left")
    fp = len(neg) - np.searchsorted(neg, thr, side="left")
    return tp, fp, len(pos) - tp, len(neg) - fp


def _rates(tp, fp, fn, tn):
    with np.errstate(divide="ignore", invalid="ignore"):
        return {"sens": tp / (tp + fn), "spec": tn / (tn + fp),
                "ppv": tp / (tp + fp), "npv": tn / (tn + fn)}


def _wilson(k, n, z=1.96):
    if n == 0:
        return np.nan, np.nan
    ph = k / n
    d = 1 + z ** 2 / n
    c = (ph + z ** 2 / (2 * n)) / d
    h = z * np.sqrt(ph * (1 - ph) / n + z ** 2 / (4 * n ** 2)) / d
    return c - h, c + h


def _calibration(y, p):
    eps = 1e-6
    lp = np.log(np.clip(p, eps, 1 - eps) / (1 - np.clip(p, eps, 1 - eps)))
    m = LogisticRegression(C=1e8, max_iter=1000).fit(lp.reshape(-1, 1), y)
    edges = np.unique(np.quantile(p, np.linspace(0, 1, 11)))
    b = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, len(edges) - 2)
    bins, ece = [], 0.0
    for k in range(len(edges) - 1):
        s = b == k
        if s.sum() == 0:
            continue
        lo, hi = _wilson(int(y[s].sum()), int(s.sum()))
        bins.append({"p": float(p[s].mean()), "obs": float(y[s].mean()), "lo": float(lo), "hi": float(hi),
                     "n": int(s.sum())})
        ece += s.mean() * abs(p[s].mean() - y[s].mean())
    return {"slope": float(m.coef_[0, 0]), "intercept": float(m.intercept_[0]),
            "brier": float(brier_score_loss(y, p)), "log_loss": float(log_loss(y, p)),
            "ece": float(ece), "mean_p": float(p.mean()), "bins": bins}


def dependence_profiles(values, shap, *, min_n=10, n_bins=8, max_levels=12):
    """Binned SHAP dependence profiles (aggregated: no individual values are written).

    values : DataFrame of the input variables as entered (numbers or category labels, NaN = missing)
    shap   : dict {variable: array of SHAP values (log-odds), same rows as `values`}
    For categorical / few-valued variables: one group per level; for numeric ones: quantile bins.
    Groups with fewer than `min_n` people are dropped. Missing values form their own group.
    """
    import pandas as pd

    out = []
    for var, phi in shap.items():
        x = values[var]
        phi = np.asarray(phi, dtype=float)
        miss = x.isna().to_numpy()
        groups = []
        xn = pd.to_numeric(x, errors="coerce")
        numeric = xn.notna().sum() == x.notna().sum() and x.notna().any()
        nunique = x.dropna().nunique()
        if numeric and nunique > max_levels:
            qs = np.unique(np.nanquantile(xn, np.linspace(0, 1, n_bins + 1)))
            b = np.clip(np.searchsorted(qs, xn, side="right") - 1, 0, len(qs) - 2)
            for k in range(len(qs) - 1):
                s_ = (~miss) & (b == k)
                if s_.sum() >= min_n:
                    groups.append({"label": f"{qs[k]:g}–{qs[k + 1]:g}", "x": float(np.nanmean(xn[s_])),
                                   "lo": float(qs[k]), "hi": float(qs[k + 1]),
                                   "mean": float(phi[s_].mean()), "sd": float(phi[s_].std()), "n": int(s_.sum())})
            kind = "binned"
        else:
            levels = sorted(x.dropna().unique(), key=lambda v: (float(v) if numeric else str(v)))
            for lev in levels:
                s_ = (~miss) & (x == lev).to_numpy()
                if s_.sum() >= min_n:
                    groups.append({"label": str(lev) if not numeric else f"{float(lev):g}",
                                   "x": float(lev) if numeric else None,
                                   "mean": float(phi[s_].mean()), "sd": float(phi[s_].std()), "n": int(s_.sum())})
            kind = "ordinal" if numeric else "categorical"
        if miss.sum() >= min_n:
            groups.append({"label": "missing", "x": None, "mean": float(phi[miss].mean()),
                           "sd": float(phi[miss].std()), "n": int(miss.sum()), "missing": True})
        out.append({"name": var, "kind": kind, "groups": groups})
    return out


def make_performance(y, p, *, label, validation, threshold=None, n_boot=2000, seed=2026,
                     importance=None, importance_kind=None, comparators=None, note=None, dependence=None):
    y = np.asarray(y).astype(int)
    p = np.asarray(p, dtype=float)
    n, n1 = len(y), int(y.sum())
    rng = np.random.default_rng(seed)

    # point estimates on the grid
    tp, fp, fn, tn = _counts(y, p, GRID)
    rates = _rates(tp, fp, fn, tn)

    # bootstrap
    auc_b, tpr_b, rate_b = [], [], {k: [] for k in rates}
    for _ in range(n_boot):
        i = rng.integers(0, n, n)
        yb, pb = y[i], p[i]
        if yb.min() == yb.max():
            continue
        auc_b.append(roc_auc_score(yb, pb))
        f, t, _ = roc_curve(yb, pb)
        tpr_b.append(np.interp(FPR_GRID, f, t))
        for k, v in _rates(*_counts(yb, pb, GRID)).items():
            rate_b[k].append(v)

    def q(a):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            return np.nanpercentile(np.asarray(a, dtype=float), [2.5, 97.5], axis=0)

    fpr, tpr, _ = roc_curve(y, p)
    keep = np.unique(np.r_[0, np.linspace(0, len(fpr) - 1, min(len(fpr), 400)).astype(int), len(fpr) - 1])
    band = q(tpr_b)

    grid = []
    ci = {k: q(v) for k, v in rate_b.items()}
    for j, t in enumerate(GRID):
        row = {"t": float(t), "flagged": float((tp[j] + fp[j]) / n),
               "tp": int(tp[j]), "fp": int(fp[j]), "fn": int(fn[j]), "tn": int(tn[j])}
        for k in rates:
            v = rates[k][j]
            row[k] = None if np.isnan(v) else float(v)
            lo, hi = ci[k][0][j], ci[k][1][j]
            row[k + "_ci"] = None if np.isnan(lo) else [float(lo), float(hi)]
        grid.append(row)

    prev = n1 / n
    dca = []
    for t in DCA_GRID:
        a, b_, _, _ = _counts(y, p, np.array([t]))
        w = t / (1 - t)
        dca.append({"t": float(t), "model": float(a[0] / n - b_[0] / n * w), "all": float(prev - (1 - prev) * w)})

    edges = np.linspace(0, 1, 41)
    hist = {"edges": edges.round(3).tolist(),
            "neg": np.histogram(p[y == 0], edges)[0].tolist(),
            "pos": np.histogram(p[y == 1], edges)[0].tolist()}

    out = {
        "label": label, "validation": validation, "note": note, "created": date.today().isoformat(),
        "n": n, "n_events": n1, "prevalence": prev,
        "auc": float(roc_auc_score(y, p)), "auc_ci": [float(x) for x in q(auc_b)],
        "roc": {"fpr": fpr[keep].round(5).tolist(), "tpr": tpr[keep].round(5).tolist(),
                "band": {"fpr": FPR_GRID.round(3).tolist(), "lo": band[0].round(5).tolist(),
                         "hi": band[1].round(5).tolist()}},
        "calibration": _calibration(y, p),
        "grid": grid, "dca": dca, "hist": hist,
        "default_threshold": threshold,
    }
    if importance is not None:
        out["importance"] = {"kind": importance_kind,
                             "values": [{"name": k, "value": float(v)} for k, v in importance.items()]}
    if dependence is not None:
        out["dependence"] = dependence
    if comparators:
        out["comparators"] = comparators
    return out


def paired_auc_difference(y, p_ref, p_cmp, n_boot=2000, seed=2026):
    """AUC(p_cmp) - AUC(p_ref) on the same individuals, with paired bootstrap 95 % CI."""
    y, p_ref, p_cmp = np.asarray(y).astype(int), np.asarray(p_ref, float), np.asarray(p_cmp, float)
    rng = np.random.default_rng(seed)
    d = []
    for _ in range(n_boot):
        i = rng.integers(0, len(y), len(y))
        if y[i].min() == y[i].max():
            continue
        d.append(roc_auc_score(y[i], p_cmp[i]) - roc_auc_score(y[i], p_ref[i]))
    lo, hi = np.percentile(d, [2.5, 97.5])
    return {"diff": float(roc_auc_score(y, p_cmp) - roc_auc_score(y, p_ref)), "ci": [float(lo), float(hi)]}


def write_performance(perf, path):
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        if isinstance(o, float) and not np.isfinite(o):
            return None
        return o
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean(perf), f, ensure_ascii=False, separators=(",", ":"))
    print("written:", path)
