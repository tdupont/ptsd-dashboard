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

## 1. Replace the placeholder performance curves (required before publication)

The two `docs/models/*_performance.json` files currently contain **simulated** curves. The site shows a warning banner while `"placeholder": true`. To replace them with the real aggregated results:

1. **Algo 1:** open `export_modele.ipynb`, run it up to section 1d and the threshold cell (with `REFIT_ON_ALL = False`). Then paste and run the cells of `tools/notebook_cells/algo1_cells.py`. Set `DASH` to this repository's folder first.
   - *TabPFN comparator:* the TabPFN cell runs `tools/tabpfn_run.py` in a separate Python process. For algo 1, `TABPFN_PYTHON` points to an environment with Python ≥ 3.10 and `tabpfn`. Set `RERUN_TABPFN = True` to recompute, or `RUN_TABPFN = False` to skip it. In Jupyter itself, TabPFN crashes or hangs on macOS, because scikit-learn and PyTorch load clashing OpenMP libraries. The licence key goes in `~/.cache/tabpfn/auth_token`.
2. **Algo 2:** run `2-algo2-export-train.ipynb` to the end, then paste and run `tools/notebook_cells/algo2_cells.py`. The TabPFN cell is optional and runs in the same environment.

Only aggregated quantities are written:
- ROC points;
- metrics on a 0.005 threshold grid;
- calibration deciles;
- net benefit;
- histograms of predicted probabilities (40 bins);
- mean |SHAP| per variable;
- binned SHAP dependence profiles (groups of fewer than 10 relatives are dropped).

The split files used by the TabPFN script stay in `dashboard_private/`, outside the repository.

## 2. If a model is retrained

```bash
pip install xgboost pandas numpy
python tools/build_models.py /path/to/export-algo1 /path/to/export-algo2
node tools/check_js.mjs          # must print OK
node tools/make_examples.mjs
```

`check_js.mjs` compares the browser engine with xgboost's `pred_contribs` and with `predict.py` on the synthetic `test.csv` rows. Current result: max |Δp| = 1.4e-7 (float32 rounding) and max |ΔSHAP| = 4e-7 for algo 1; 4e-17 for algo 2.

## 3. Preview locally

```bash
cd docs && python -m http.server 8000     # then open http://localhost:8000
```

Opening `index.html` directly from disk does not work, because browsers block `fetch` on `file://`.

## 4. Publish on GitHub Pages

1. Create a public repository (e.g. `ptsd-dashboard`) and push this folder:
   ```bash
   git init && git add . && git commit -m "Interactive companion to the PhD thesis"
   git branch -M main
   git remote add origin https://github.com/tdupont/ptsd-dashboard.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then branch `main`, folder **`/docs`**, and save.
3. After about a minute the site is live at `https://<account>.github.io/ptsd-dashboard/`.
4. In `docs/index.html`, set the **Thesis** and **Code** links. Links left as `#` are hidden.

### Deep links (for the paper and the thesis)

The URL keeps the model, tab and language, so you can link directly to a view:

- `…/ptsd-dashboard/#algo=algo2&tab=predict&lang=fr`: algorithm 2, French, prediction.
- `…/ptsd-dashboard/#algo=algo1&tab=performance&lang=en`: algorithm 1, performance.

## 5. Get a DOI (recommended for the thesis)

A DOI keeps the reference valid even if the URL changes.

1. Log in to [zenodo.org](https://zenodo.org) with GitHub. Under **Account → GitHub**, switch the repository on.
2. On GitHub, create a release (e.g. `v1.0.0`). Zenodo archives it and mints a DOI.
3. Cite both: *Dupont T. PTSD risk in relatives of ICU patients: interactive companion (v1.0.0). Zenodo. doi:10.5281/zenodo.XXXXXXX. Available at https://<account>.github.io/ptsd-dashboard/*

`CITATION.cff` is read by both GitHub and Zenodo. Update it before the release.

## Before going public: checklist

- [ ] Replace the placeholder performance files (section 1).
- [ ] Algo 2: confirm in the eCRF the direction of `Social support`, `Social exclusion` and `Financial stress`. The form shows the anchors from the data dictionary (`TODO(author)` in `docs/js/vars.js`).
- [ ] Algo 1: `data_dictionary.csv` of the export says the outcome is "HADS". The paper uses IES (cut-off 24) / IES-R (cut-off 26), which is what the site states.
- [ ] Algo 1 cohort size on the site (2,710 relatives with a day-90 outcome, 2,168 train / 542 test) comes from the export notebook. The paper reports 2,374; adjust the wording in `docs/js/i18n.js` if needed.
- [ ] Citation of the algo 2 paper once accepted (`ABOUT.algo2.cite` in `docs/js/i18n.js`).
- [ ] Thesis and code links (`docs/index.html`).
- [ ] Choose a licence for the code (e.g. MIT) and for the model files.

Research tool. Not a medical device and not validated for clinical decision-making.
