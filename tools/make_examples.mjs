// Pick three synthetic example profiles per algorithm (from the synthetic test.csv rows):
// lower risk (~10th percentile), typical (median), higher risk (~90th percentile).
import { readFileSync, writeFileSync } from "node:fs";
import { makeModel } from "../docs/js/engine.js";
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const out = {};
for (const a of ["algo1", "algo2"]) {
  const m = makeModel(load(`../docs/models/${a}.json`));
  const rows = load(`./reference/${a}.json`).rows
    .filter((r) => Object.values(r).filter((v) => v === null).length <= 1)
    .map((r) => ({ r, p: m.predict(r) })).sort((x, y) => x.p - y.p);
  const at = (q) => rows[Math.min(rows.length - 1, Math.round(q * (rows.length - 1)))];
  out[a] = { low: at(0.1).r, typical: at(0.5).r, high: at(0.9).r };
  console.log(a, rows.length, [0.1, 0.5, 0.9].map((q) => at(q).p.toFixed(3)).join(" "));
}
writeFileSync(new URL("../docs/models/examples.json", import.meta.url), JSON.stringify(out, null, 1));
