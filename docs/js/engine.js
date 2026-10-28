// Prediction engines, run entirely in the browser.
// - XGBModel: evaluates a native XGBoost (binary:logistic) model exported to JSON, with exact TreeSHAP
//   (path-dependent, node cover = sum_hessian), i.e. the same algorithm as xgboost's pred_contribs.
// - LRModel: L2 logistic regression with mean imputation, standardisation and Platt calibration;
//   contributions are exact (linear SHAP with the training mean as reference) on the calibrated logit scale.
// Both return contributions aggregated per *input variable* (one-hot columns summed back).

const f32 = Math.fround;
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const logit = (p) => Math.log(p / (1 - p));

const isMissing = (v) => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

// ---------------------------------------------------------------- XGBoost
export class XGBModel {
  constructor(spec) {
    this.spec = spec;
    this.inputs = spec.inputs;
    this.columns = spec.columns; // [{variable, level}] level: string | null (NaN category) | "__num__"
    this.baseMargin = logit(spec.base_score);
    this.trees = spec.trees.map((t) => ({
      ...t,
      c32: Float32Array.from(t.c),
      mean: nodeMeans(t),
    }));
    this.expectedMargin = this.baseMargin + this.trees.reduce((s, t) => s + t.mean[0], 0);
    this.colVar = this.columns.map((c) => this.inputs.findIndex((d) => d.name === c.variable));
  }

  encode(row) {
    return this.columns.map(({ variable, level }) => {
      const v = row[variable];
      if (level === "__num__") return isMissing(v) ? NaN : f32(Number(v));
      if (level === null) return isMissing(v) ? 1 : 0;
      return !isMissing(v) && String(v) === level ? 1 : 0;
    });
  }

  marginFromX(x) {
    let m = this.baseMargin;
    for (const t of this.trees) m += t.c[leafOf(t, x)];
    return m;
  }

  predict(row) {
    return sigmoid(this.marginFromX(this.encode(row)));
  }

  explain(row) {
    const x = this.encode(row);
    const phiCol = new Float64Array(x.length);
    for (const t of this.trees) treeShap(t, x, phiCol);
    const phi = new Array(this.inputs.length).fill(0);
    phiCol.forEach((v, j) => (phi[this.colVar[j]] += v));
    const margin = this.marginFromX(x);
    return {
      p: sigmoid(margin),
      scale: "log-odds",
      base: this.expectedMargin,
      value: margin,
      contributions: this.inputs.map((d, i) => ({ name: d.name, phi: phi[i], value: row[d.name] })),
      _phiCol: phiCol,
    };
  }
}

function leafOf(t, x) {
  let n = 0;
  while (t.l[n] !== -1) {
    const v = x[t.f[n]];
    n = Number.isNaN(v) ? (t.d[n] ? t.l[n] : t.r[n]) : f32(v) < t.c32[n] ? t.l[n] : t.r[n];
  }
  return n;
}

function nodeMeans(t) {
  const mean = new Float64Array(t.l.length);
  const rec = (n) => {
    if (t.l[n] === -1) return (mean[n] = t.c[n]);
    const l = t.l[n], r = t.r[n];
    return (mean[n] = (rec(l) * t.h[l] + rec(r) * t.h[r]) / t.h[n]);
  };
  rec(0);
  return mean;
}

// TreeSHAP (Lundberg et al., Nat Mach Intell 2020, Algorithm 2), as implemented in xgboost/src/tree/tree_model.cc
function extendPath(path, d, zero, one, feat) {
  path[d] = { f: feat, z: zero, o: one, w: d === 0 ? 1 : 0 };
  for (let i = d - 1; i >= 0; i--) {
    path[i + 1].w += (one * path[i].w * (i + 1)) / (d + 1);
    path[i].w = (zero * path[i].w * (d - i)) / (d + 1);
  }
}

function unwindPath(path, d, idx) {
  const { o: one, z: zero } = path[idx];
  let next = path[d].w;
  for (let i = d - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = path[i].w;
      path[i].w = (next * (d + 1)) / ((i + 1) * one);
      next = tmp - (path[i].w * zero * (d - i)) / (d + 1);
    } else {
      path[i].w = (path[i].w * (d + 1)) / (zero * (d - i));
    }
  }
  for (let i = idx; i < d; i++) {
    path[i].f = path[i + 1].f;
    path[i].z = path[i + 1].z;
    path[i].o = path[i + 1].o;
  }
}

function unwoundPathSum(path, d, idx) {
  const { o: one, z: zero } = path[idx];
  let next = path[d].w, total = 0;
  for (let i = d - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = (next * (d + 1)) / ((i + 1) * one);
      total += tmp;
      next = path[i].w - (tmp * zero * (d - i)) / (d + 1);
    } else if (zero !== 0) {
      total += path[i].w / zero / ((d - i) / (d + 1));
    }
  }
  return total;
}

function treeShap(t, x, phi) {
  const rec = (n, parentPath, d, zero, one, feat) => {
    const path = parentPath.slice(0, d).map((e) => ({ ...e }));
    extendPath(path, d, zero, one, feat);
    if (t.l[n] === -1) {
      for (let i = 1; i <= d; i++) {
        const w = unwoundPathSum(path, d, i);
        phi[path[i].f] += w * (path[i].o - path[i].z) * t.c[n];
      }
      return;
    }
    const split = t.f[n];
    const v = x[split];
    const goLeft = Number.isNaN(v) ? t.d[n] : f32(v) < t.c32[n];
    const hot = goLeft ? t.l[n] : t.r[n];
    const cold = goLeft ? t.r[n] : t.l[n];
    let inZero = 1, inOne = 1;
    let k = 0;
    for (; k <= d; k++) if (path[k].f === split) break;
    if (k !== d + 1) {
      inZero = path[k].z;
      inOne = path[k].o;
      unwindPath(path, d, k);
      d -= 1;
    }
    rec(hot, path, d + 1, (t.h[hot] / t.h[n]) * inZero, inOne, split);
    rec(cold, path, d + 1, (t.h[cold] / t.h[n]) * inZero, 0, split);
  };
  rec(0, [], 0, 1, 1, -1);
}

// ---------------------------------------------------------------- Logistic regression
export class LRModel {
  constructor(spec) {
    this.spec = spec;
    this.inputs = spec.inputs;
    this.features = spec.features; // [{name, impute_value, mean, scale, coef}]
    this.a = spec.calibration.a;
    this.b = spec.calibration.b;
    this.featVar = this.features.map((f) => {
      const direct = this.inputs.findIndex((d) => d.name === f.name);
      if (direct >= 0) return { i: direct, level: undefined };
      const i = this.inputs.findIndex((d) => f.name.startsWith(d.name + "_"));
      return { i, level: f.name.slice(this.inputs[i].name.length + 1) };
    });
  }

  encode(row) {
    return this.features.map((f, j) => {
      const { i, level } = this.featVar[j];
      const d = this.inputs[i];
      const v = row[d.name];
      if (level !== undefined) return !isMissing(v) && String(v) === level ? 1 : 0;
      if (isMissing(v)) return NaN;
      if (d.kind === "binary") return this.spec.binary_coding[v];
      return Number(v);
    });
  }

  terms(row) {
    const x = this.encode(row);
    return this.features.map((f, j) => {
      const xi = Number.isNaN(x[j]) ? f.impute_value : x[j];
      return (f.coef * (xi - f.mean)) / f.scale;
    });
  }

  predict(row) {
    const z = this.spec.intercept + this.terms(row).reduce((s, v) => s + v, 0);
    return sigmoid(this.a * z + this.b);
  }

  explain(row) {
    const terms = this.terms(row);
    const phi = new Array(this.inputs.length).fill(0);
    terms.forEach((v, j) => (phi[this.featVar[j].i] += this.a * v));
    const base = this.a * this.spec.intercept + this.b; // calibrated log-odds at the training mean
    const value = base + phi.reduce((s, v) => s + v, 0);
    return {
      p: sigmoid(value),
      scale: "log-odds",
      base,
      value,
      contributions: this.inputs.map((d, i) => ({ name: d.name, phi: phi[i], value: row[d.name] })),
    };
  }
}

export function makeModel(spec) {
  return spec.type === "xgboost" ? new XGBModel(spec) : new LRModel(spec);
}
