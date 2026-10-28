import sys, json
import numpy as np, pandas as pd, xgboost as xgb
sys.path.insert(0, sys.argv[1]); from algo1_encoding import encode, COLUMNS
bst = xgb.Booster(); bst.load_model(sys.argv[2])
df = pd.read_csv(sys.argv[3])
X = encode(df)
d = xgb.DMatrix(X, missing=np.nan)
p = bst.predict(d)
print("first 5:", p[:5])
print("expected: [0.2549755 0.37911674 0.2703839 0.5958282 0.56006896]")
print("num features in booster:", bst.num_features(), "trees:", bst.num_boosted_rounds())
cfg = json.loads(bst.save_config()); print("base_score:", cfg["learner"]["learner_model_param"]["base_score"])
