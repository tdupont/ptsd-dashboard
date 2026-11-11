# PTSD risk in relatives of ICU patients: interactive companion

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

The **About the model** tab shows global importance, binned SHAP dependence profiles, the coefficients of the logistic regression, and the variables. 

**Everything runs in the browser.** No server, no tracking, and the entered values are never transmitted.

Research tool. Not a medical device and not validated for clinical decision-making.
