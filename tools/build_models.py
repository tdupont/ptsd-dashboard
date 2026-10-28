"""Convert the two exported models into the compact JSON read by the website, and write reference
predictions/contributions computed in Python (xgboost / numpy) to validate the JavaScript engine.

    python tools/build_models.py <export-algo1 dir> <export-algo2 dir>

Writes docs/models/algo1.json, docs/models/algo2.json and tools/reference/*.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from algo1_encoding import CATEGORIES, COLUMNS, NUMERIC, encode  # noqa: E402

ROOT = HERE.parent
OUT = ROOT / "docs" / "models"
REF = HERE / "reference"
OUT.mkdir(parents=True, exist_ok=True)
REF.mkdir(exist_ok=True)

a1, a2 = Path(sys.argv[1]), Path(sys.argv[2])

# ------------------------------------------------------------------ algo 1
raw = json.loads((a1 / "model.json").read_text())
L = raw["learner"]
assert L["objective"]["name"] == "binary:logistic"
trees = []
for t in L["gradient_booster"]["model"]["trees"]:
    assert all(s == 0 for s in t["split_type"]), "categorical splits not supported"
    trees.append({"l": t["left_children"], "r": t["right_children"], "f": t["split_indices"],
                  "c": t["split_conditions"], "d": t["default_left"], "h": t["sum_hessian"]})
info1 = json.loads((a1 / "model_info.json").read_text())
order = info1["features"]
inputs1 = []
for name in order:
    if name in NUMERIC:
        inputs1.append({"name": name, "kind": "numeric"})
    else:
        inputs1.append({"name": name, "kind": "categorical", "levels": [c for c in CATEGORIES[name] if c is not None]})
spec1 = {
    "id": "algo1", "type": "xgboost", "target": info1["target"],
    "base_score": float(L["learner_model_param"]["base_score"]),
    "inputs": inputs1,
    "columns": [{"variable": v, "level": ("__num__" if c == "num" else c)} for v, c in COLUMNS],
    "threshold": 0.218,
    "trees": trees,
}
(OUT / "algo1.json").write_text(json.dumps(spec1, separators=(",", ":")))

bst = xgb.Booster()
bst.load_model(str(a1 / "model.json"))
t1 = pd.read_csv(a1 / "test.csv")
X1 = encode(t1)
d1 = xgb.DMatrix(X1, missing=np.nan)
p1 = bst.predict(d1)
c1 = bst.predict(d1, pred_contribs=True)  # 43 columns + bias, log-odds
rows1 = t1[order].astype(object).where(t1[order].notna(), None).to_dict("records")
(REF / "algo1.json").write_text(json.dumps({"rows": rows1, "p": p1.tolist(), "contribs": c1.tolist()}))

# ------------------------------------------------------------------ algo 2
m2 = json.loads((a2 / "model.json").read_text())
spec2 = {"id": "algo2", "type": "logistic", **{k: m2[k] for k in
         ("target", "inputs", "binary_coding", "features", "intercept", "calibration", "threshold")}}
(OUT / "algo2.json").write_text(json.dumps(spec2, indent=1, ensure_ascii=False))

sys.path.insert(0, str(a2))
sys.dont_write_bytecode = True
from predict import predict_proba  # noqa: E402  (the user's own predict.py, numpy only)

t2 = pd.read_csv(a2 / "test.csv")
names2 = [d["name"] for d in m2["inputs"]]
p2 = predict_proba(t2, m2)
rows2 = t2[names2].astype(object).where(t2[names2].notna(), None).to_dict("records")
(REF / "algo2.json").write_text(json.dumps({"rows": rows2, "p": np.asarray(p2).tolist()}))

print("algo1:", len(trees), "trees,", (OUT / "algo1.json").stat().st_size // 1024, "kB")
print("algo2:", len(m2["features"]), "features")
