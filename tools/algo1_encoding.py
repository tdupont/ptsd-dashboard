"""One-hot encoding of algo 1 inputs, reproducing the sklearn ColumnTransformer of export_modele.ipynb
(OneHotEncoder(handle_unknown='ignore'): sorted categories, NaN as its own category when present in train,
then numeric columns passed through)."""
import numpy as np
import pandas as pd

NUMERIC = ["Patient's age", "Number of beds", "Duration of stay", "Relative's age"]
# categories seen by the fitted OneHotEncoder (from get_feature_names_out in export_modele.ipynb); None = NaN category
CATEGORIES = {
    "Patient's sex": ["Female", "Male"],
    "Death in ICU": ["No", "Yes"],
    "Performans status": ["Good (1-2)", "Poor (3-4)", None],
    "History of cancer": ["No", "Yes", None],
    "Center type": ["General", "Private", "University", None],
    "Psychologist": ["No", "Yes", None],
    "Mechanical ventilation": ["No", "Yes", None],
    "Treatment limitation": ["No", "Yes", None],
    "Relationship": ["Children", "Other", "Parent", "Spouse", None],
    "Relative's sex": ["Female", "Male", None],
    "Relative's activity status": ["Active", "Other", "Retired", "Unemployed", None],
    "Relative has children": ["No", "Yes", None],
}
COLUMNS = [(v, c) for v, cats in CATEGORIES.items() for c in cats] + [(v, "num") for v in NUMERIC]
assert len(COLUMNS) == 43


def encode(df):
    out = np.zeros((len(df), len(COLUMNS)))
    for j, (v, c) in enumerate(COLUMNS):
        s = df[v]
        if c == "num":
            out[:, j] = pd.to_numeric(s, errors="coerce").to_numpy(float)
        elif c is None:
            out[:, j] = s.isna().to_numpy(float)
        else:
            out[:, j] = (s == c).to_numpy(float)
    return out
