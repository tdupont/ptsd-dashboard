# PTSD risk in relatives of ICU patients: interactive companion

Static website (GitHub Pages) presenting the two prediction models of the PhD thesis of Thibault Dupont:

- **Algorithm 1**: XGBoost, 16 routinely available variables (Dupont et al., *Intensive Care Med* 2024;50:114–124, [doi:10.1007/s00134-023-07288-1](https://doi.org/10.1007/s00134-023-07288-1)).
- **Algorithm 2**: L2 logistic regression with Platt calibration, 23 variables including questionnaire items at discharge (FAME cohort).

Visitors choose a model, enter a relative's profile and get the predicted probability with:

- the relative placed on the distribution of predicted probabilities, with a draggable decision threshold;
- an exact SHAP waterfall: TreeSHAP for XGBoost, linear SHAP for the logistic regression;
- a what-if curve for any single variable.

A **Performance** tab has:
- a switch between the published model and the TabPFN comparator;
- a threshold slider with sensitivity, specificity, PPV and NPV (95 % CIs), an icon array and a prevalence adjustment;
- **risk zones** (low / intermediate / high, adjustable rule-out and rule-in cutoffs);
- six figures: ROC, precision–recall, calibration, decision curve analysis, metrics by threshold, and workload vs cases detected.

The **About the model** tab shows global importance, binned SHAP dependence profiles, the coefficients of the logistic regression, and the variables. A research-use disclaimer must be accepted on the first visit. Every figure downloads as SVG (font embedded), 300-dpi PNG or CSV.

TabPFN appears in the Performance tab only. 

**Everything runs in the browser.** No server, no tracking, and the entered values are never transmitted.

## Repository layout

```
docs/                     the website (served by GitHub Pages)
  index.html, css/, js/   app (vanilla JS + D3 v7, vendored)
  models/algo1.json       XGBoost trees (converted from export-algo1/model.json)
  models/algo2.json       logistic regression (copied from export-algo2/model.json)
  models/*_performance.json   aggregated performance (no individual-level data)
  models/examples.json    synthetic example profiles
  fonts/, vendor/         Literata, Libre Franklin (SIL OFL), d3.min.js (ISC)
tools/
  build_models.py         export folders -> docs/models/algo*.json + Python reference predictions
  check_js.mjs            checks the browser engine against xgboost / predict.py
  performance.py          builds the aggregated performance JSON (bootstrap CIs, DCA, calibration)
  notebook_cells/         cells to paste at the end of the two export notebooks
  tabpfn_run.py           TabPFN comparator, run in a separate process (needs Python >= 3.10 and an accepted licence)
  make_placeholders.py    simulated performance files used until the real export is run
  make_examples.mjs       picks synthetic example profiles
```

Only aggregated quantities are written:
- ROC points;
- metrics on a 0.005 threshold grid;
- calibration deciles;
- net benefit;
- histograms of predicted probabilities (40 bins);
- mean |SHAP| per variable;
- binned SHAP dependence profiles (groups of fewer than 10 relatives are dropped).

The split files used by the TabPFN script stay in `dashboard_private/`, outside the repository.

Research tool. Not a medical device and not validated for clinical decision-making.
