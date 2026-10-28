// Compare the browser engine with the Python references (xgboost pred_contribs / predict.py).
import { readFileSync } from "node:fs";
import { makeModel } from "../docs/js/engine.js";
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

const m1 = makeModel(load("../docs/models/algo1.json"));
const r1 = load("./reference/algo1.json");
let dp = 0, dc = 0, dsum = 0;
r1.rows.forEach((row, k) => {
  const e = m1.explain(row);
  dp = Math.max(dp, Math.abs(e.p - r1.p[k]));
  const ref = r1.contribs[k];
  e._phiCol.forEach((v, j) => (dc = Math.max(dc, Math.abs(v - ref[j]))));
  dc = Math.max(dc, Math.abs(e.base - ref[ref.length - 1]));
  dsum = Math.max(dsum, Math.abs(e.base + e.contributions.reduce((s, c) => s + c.phi, 0) - e.value));
});
console.log(`algo1  max|Δp| = ${dp.toExponential(2)}  max|ΔSHAP| = ${dc.toExponential(2)}  additivity = ${dsum.toExponential(2)}`);

const m2 = makeModel(load("../docs/models/algo2.json"));
const r2 = load("./reference/algo2.json");
let dp2 = 0, dsum2 = 0;
r2.rows.forEach((row, k) => {
  const e = m2.explain(row);
  dp2 = Math.max(dp2, Math.abs(e.p - r2.p[k]), Math.abs(m2.predict(row) - r2.p[k]));
  dsum2 = Math.max(dsum2, Math.abs(1 / (1 + Math.exp(-(e.base + e.contributions.reduce((s, c) => s + c.phi, 0)))) - r2.p[k]));
});
console.log(`algo2  max|Δp| = ${dp2.toExponential(2)}  additivity (Σφ → p) = ${dsum2.toExponential(2)}`);
if (dp > 1e-6 || dc > 1e-5 || dp2 > 1e-10 || dsum2 > 1e-10) { console.error("MISMATCH"); process.exit(1); }
console.log("OK");
