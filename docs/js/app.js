import { makeModel } from "./engine.js";
import { VARIABLES, GROUPS, optionLabel } from "./vars.js";
import { STR, ABOUT } from "./i18n.js";
import * as C from "./charts.js";
import { exportSVG, exportPNG, exportCSV } from "./export.js";

/* global d3 */

const $ = (s) => document.querySelector(s);
const ALGOS = ["algo1", "algo2"];
const DISCLAIMER_KEY = "ptsd-icu-disclaimer-v1";
const state = {
  algo: "algo1", tab: "predict", lang: "en",
  inputs: { algo1: {}, algo2: {} },
  perfModel: { algo1: "main", algo2: "main" }, // model shown in the Performance tab: "main" | "tabpfn"
  overlay: true,
  thr: {}, zones: {}, prevalence: {},           // keyed by "algo|model"
  whatIf: { algo1: null, algo2: null }, depAll: false,
};
const M = {}; // per algo: { spec, model, perf, examples, vars, labels }
let lastExp = null;

const t = () => STR[state.lang];
const THEME_KEY = "ptsd-icu-theme";
const dark = () => document.documentElement.dataset.theme === "dark";
const theme = () => (dark() ? C.DARK : C.LIGHT);
const fmtNum = (v, d = 2) => (state.lang === "fr" ? v.toFixed(d).replace(".", ",") : v.toFixed(d));
const localPct = (v, d = 1) => (state.lang === "fr" ? C.fmtPct(v, d).replace(".", ",") : C.fmtPct(v, d));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable: ignore */ } },
};

// ------------------------------------------------------------------ models, thresholds, zones
const keyOf = (a = state.algo, m = state.perfModel[a]) => `${a}|${m}`;
const hasComp = (a = state.algo) => Boolean(M[a].perf.comparators?.tabpfn);
function perfOf(a = state.algo, m = state.perfModel[a]) {
  const p = M[a].perf;
  return m === "tabpfn" && p.comparators?.tabpfn ? p.comparators.tabpfn : p;
}
const mainLabel = (a = state.algo) => (M[a].spec.type === "xgboost" ? "XGBoost" : (state.lang === "fr" ? "Régression logistique" : "Logistic regression"));
const compLabel = (a = state.algo) => (M[a].perf.comparators?.tabpfn?.label || "TabPFN").split(" (")[0];
const modelLabel = (a = state.algo, m = state.perfModel[a]) => (m === "tabpfn" ? compLabel(a) : mainLabel(a));

function largestT(perf, f) { let best = null; for (const g of perf.grid) if (f(g)) best = g.t; return best; }
function smallestT(perf, f) { for (const g of perf.grid) if (f(g)) return g.t; return null; }
function defaultThreshold(perf) { return perf.default_threshold ?? largestT(perf, (g) => g.sens !== null && g.sens >= 0.85) ?? 0.5; }
function defaultZones(perf) {
  const lo = largestT(perf, (g) => g.sens !== null && g.sens >= 0.9) ?? 0.05;
  let hi = smallestT(perf, (g) => g.spec !== null && g.spec >= 0.9) ?? 0.5;
  if (hi <= lo) hi = +(lo + 0.005).toFixed(3);
  return { lo, hi };
}
function ensure(a = state.algo, m = state.perfModel[a]) {
  const k = keyOf(a, m), perf = perfOf(a, m);
  if (!(k in state.thr)) state.thr[k] = defaultThreshold(perf);
  if (!(k in state.zones)) state.zones[k] = defaultZones(perf);
  if (!(k in state.prevalence)) state.prevalence[k] = perf.prevalence;
  return k;
}

function wilson(k, n) {
  if (!n) return [NaN, NaN];
  const z = 1.96, ph = k / n, d = 1 + z * z / n, c = (ph + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function zoneStats(perf, { lo, hi }) {
  const T = t(), gl = C.gridAt(perf, lo), gh = C.gridAt(perf, hi);
  const n = perf.n, E = perf.n_events;
  const low = { n: gl.fn + gl.tn, e: gl.fn }, high = { n: gh.tp + gh.fp, e: gh.tp };
  const mid = { n: n - low.n - high.n, e: E - low.e - high.e };
  const L = localPct(lo, 1), H = localPct(hi, 1);
  return [
    { key: "low", label: T.zoneLow, range: T.zoneRange.low(L), ...low },
    { key: "mid", label: T.zoneMid, range: T.zoneRange.mid(L, H), ...mid },
    { key: "high", label: T.zoneHigh, range: T.zoneRange.high(H), ...high },
  ].map((z) => ({ ...z, events: z.e, share: z.n / n, obs: z.n ? z.e / z.n : 0, ci: wilson(z.e, z.n), capture: E ? z.e / E : 0 }));
}

// ------------------------------------------------------------------ boot
async function boot() {
  const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  const [s1, s2, p1, p2, ex] = await Promise.all([
    get("models/algo1.json"), get("models/algo2.json"),
    get("models/algo1_performance.json"), get("models/algo2_performance.json"), get("models/examples.json"),
  ]);
  for (const [k, spec, perf] of [["algo1", s1, p1], ["algo2", s2, p2]]) {
    M[k] = { spec, perf, model: makeModel(spec), examples: ex[k], vars: VARIABLES[k] };
    state.inputs[k] = { ...ex[k].typical };
    ensure(k, "main");
    if (perf.comparators?.tabpfn) ensure(k, "tabpfn");
  }
  readHash();
  document.documentElement.lang = state.lang;
  bindStatic();
  renderAll();
  new ResizeObserver(debounce(() => redrawCharts(), 120)).observe($("main"));
  if (store.get(DISCLAIMER_KEY) !== "accepted") openDisclaimer();
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (ALGOS.includes(h.get("algo"))) state.algo = h.get("algo");
  if (["predict", "performance", "model"].includes(h.get("tab"))) state.tab = h.get("tab");
  if (["en", "fr"].includes(h.get("lang"))) state.lang = h.get("lang");
  else if ((navigator.language || "").startsWith("fr")) state.lang = "fr";
}
function writeHash() {
  const h = `#algo=${state.algo}&tab=${state.tab}&lang=${state.lang}`;
  if (location.hash !== h) history.replaceState(null, "", h);
}
function debounce(f, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => f(...a), ms); }; }

// ------------------------------------------------------------------ disclaimer
function openDisclaimer() {
  const d = $("#disclaimer");
  const accepted = store.get(DISCLAIMER_KEY) === "accepted";
  $("#dlg-ok").checked = accepted;
  $("#dlg-btn").disabled = !accepted;
  renderDisclaimerText();
  if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
}
function renderDisclaimerText() {
  $("#dlg-items").innerHTML = t().dlgItems.map((x) => `<li>${x}</li>`).join("");
  $("#dlg-lang").textContent = t().langSwitch;
}

// ------------------------------------------------------------------ static bindings
function bindStatic() {
  document.querySelectorAll(".links a").forEach((l) => { if (l.getAttribute("href") === "#") l.hidden = true; });
  const toggleLang = () => { state.lang = state.lang === "en" ? "fr" : "en"; document.documentElement.lang = state.lang; renderAll(); renderDisclaimerText(); };
  $("#lang").addEventListener("click", toggleLang);
  $("#dlg-lang").addEventListener("click", toggleLang);
  $("#notice").addEventListener("click", openDisclaimer);
  $("#theme").addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set(THEME_KEY, next);
    renderThemeButton();
    redrawCharts();
  });
  $("#dlg-ok").addEventListener("change", (e) => { $("#dlg-btn").disabled = !e.target.checked; });
  $("#disclaimer").addEventListener("close", () => { if ($("#dlg-ok").checked) store.set(DISCLAIMER_KEY, "accepted"); });
  $("#disclaimer").addEventListener("cancel", (e) => { if (!$("#dlg-ok").checked && store.get(DISCLAIMER_KEY) !== "accepted") e.preventDefault(); });

  document.querySelectorAll("#tabs [role=tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#tabs").addEventListener("keydown", (e) => {
    const tabs = [...document.querySelectorAll("#tabs [role=tab]")];
    const i = tabs.findIndex((b) => b.dataset.tab === state.tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      setTab(tabs[j].dataset.tab); tabs[j].focus();
    }
  });
  document.querySelectorAll("[data-example]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.example;
    state.inputs[state.algo] = k === "clear" ? {} : { ...M[state.algo].examples[k] };
    renderForm(); updatePrediction();
  }));
  $("#whatif-var").addEventListener("change", (e) => { state.whatIf[state.algo] = e.target.value; drawWhatIf(); });
  $("#thr").addEventListener("input", (e) => setThreshold(+e.target.value, true, keyOf()));
  $("#prev").addEventListener("input", (e) => { state.prevalence[keyOf()] = +e.target.value; updatePerformance(); });
  $("#overlay").addEventListener("change", (e) => { state.overlay = e.target.checked; updatePerformance(); });
  $("#zlo").addEventListener("input", (e) => setZone("lo", +e.target.value));
  $("#zhi").addEventListener("input", (e) => setZone("hi", +e.target.value));
  bindDownloads(document);
  const io = new IntersectionObserver(([en]) => {
    $("#dock").hidden = !(!en.isIntersecting && state.tab === "predict" && en.boundingClientRect.top < 0);
  });
  io.observe($("#result-main"));
}

function bindDownloads(root) {
  root.querySelectorAll(".dl:not([data-bound])").forEach((el) => {
    el.dataset.bound = "1";
    el.innerHTML = `<button type="button" data-f="svg">SVG</button><button type="button" data-f="png">PNG</button><button type="button" data-f="csv">CSV</button>`;
    el.addEventListener("click", (e) => { const f = e.target.dataset.f; if (f) downloadFigure(el.dataset.fig, f); });
  });
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs [role=tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
  });
  for (const k of ["predict", "performance", "model"]) $(`#panel-${k}`).hidden = k !== tab;
  if (tab !== "predict") $("#dock").hidden = true;
  writeHash();
  redrawCharts();
}

function setAlgo(a) {
  if (a === state.algo) return;
  state.algo = a;
  renderAll();
}

// ------------------------------------------------------------------ render
function renderAll() {
  const T = t();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = T[el.dataset.i18n];
    if (typeof v === "string") el.textContent = v;
  });
  $("#lang").textContent = T.langSwitch;
  $("#lang").lang = state.lang === "en" ? "fr" : "en";
  renderThemeButton();
  document.title = t().title;
  M.algo1.labels = labelMap("algo1"); M.algo2.labels = labelMap("algo2");
  renderChooser();
  renderReference();
  renderForm();
  setTab(state.tab);
  updatePrediction();
  updatePerformance(true);
  renderAbout();
  writeHash();
}

function renderThemeButton() {
  const T = t(), d = dark();
  $("#theme-label").textContent = d ? T.themeLight : T.themeDark;
  $("#theme").setAttribute("aria-label", d ? T.themeLightAria : T.themeDarkAria);
  $("#theme").setAttribute("aria-pressed", String(d));
  document.querySelector('meta[name="color-scheme"]').setAttribute("content", d ? "dark" : "light");
}

function labelMap(a) { return Object.fromEntries(VARIABLES[a].map((v) => [v.name, v.short[state.lang]])); }

function renderChooser() {
  const T = t();
  const el = $("#chooser");
  el.innerHTML = ALGOS.map((a) => {
    const n = a === "algo1" ? 1 : 2;
    const on = a === state.algo;
    const perf = M[a].perf;
    const auc = perf.placeholder ? null : `AUC ${fmtNum(perf.auc)}`;
    return `<button type="button" role="radio" class="option" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-algo="${a}">
      <span class="radio" aria-hidden="true"></span>
      <span class="option-name">${T[`algo${n}Name`]}</span>
      <span class="option-desc">${T[`algo${n}Desc`]}</span>
      <ul class="facts">${[...T[`algo${n}Meta`], ...(auc ? [auc] : [])].map((f) => `<li>${f}</li>`).join("")}</ul>
    </button>`;
  }).join("");
  el.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => setAlgo(b.dataset.algo)));
  el.onkeydown = (e) => {
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      const next = state.algo === "algo1" ? "algo2" : "algo1";
      setAlgo(next);
      el.querySelector(`[data-algo=${next}]`).focus();
    }
  };
}

function citationText(a = state.algo) { const A = ABOUT[a]; return A.doi ? `${A.cite} doi:${A.doi}` : A.cite; }

function renderReference() {
  const T = t(), A = ABOUT[state.algo];
  $("#reference").innerHTML = A.doi
    ? `<span class="ref-label">${T.reference}</span><span class="ref-text">${A.cite} <a href="https://doi.org/${A.doi}" target="_blank" rel="noopener">doi:${A.doi}</a></span><button type="button" class="copy" data-copy>${T.copy}</button>`
    : `<span class="ref-label">${T.reference}</span><span class="ref-text">${T.referenceNone}</span>`;
  const b = $("#reference [data-copy]");
  if (b) b.addEventListener("click", () => copyCitation(b));
}

async function copyCitation(btn) {
  try { await navigator.clipboard.writeText(citationText()); btn.textContent = t().copied; setTimeout(() => { btn.textContent = t().copy; }, 1600); } catch { /* clipboard blocked */ }
}

// ------------------------------------------------------------------ form
function renderForm() {
  const a = state.algo, L = state.lang, vals = state.inputs[a];
  const groups = [];
  for (const v of VARIABLES[a]) {
    let g = groups.find((x) => x.key === v.group);
    if (!g) groups.push((g = { key: v.group, vars: [] }));
    g.vars.push(v);
  }
  const fields = $("#fields");
  fields.innerHTML = groups.map((g) => `<fieldset class="group" style="border:0;margin-left:0;margin-right:0;padding-left:0;padding-right:0">
      <legend class="visually-hidden">${GROUPS[g.key][L]}</legend><h3 aria-hidden="true">${GROUPS[g.key][L]}</h3>
      ${g.vars.map((v) => fieldHTML(v, vals[v.name])).join("")}</fieldset>`).join("");

  fields.querySelectorAll("[data-var]").forEach((wrap) => {
    const v = VARIABLES[a].find((x) => x.name === wrap.dataset.var);
    if (v.widget === "number") {
      const input = wrap.querySelector("input");
      const set = (val) => { setValue(v, val); input.value = val ?? ""; refreshField(wrap, v); };
      input.addEventListener("input", () => { const s = input.value.trim().replace(",", "."); setValue(v, s === "" || Number.isNaN(+s) ? null : +s); refreshField(wrap, v); });
      wrap.querySelector("[data-step='-1']").addEventListener("click", () => set(clamp(v, (vals[v.name] ?? defaultNum(v)) - v.step)));
      wrap.querySelector("[data-step='1']").addEventListener("click", () => set(clamp(v, (vals[v.name] ?? defaultNum(v) - v.step) + v.step)));
      wrap.querySelector(".clear-x").addEventListener("click", () => set(null));
    } else {
      wrap.querySelectorAll("button[data-val]").forEach((b) => b.addEventListener("click", () => {
        let val = b.dataset.val;
        if (v.widget === "scale" || v.numeric) val = +val;
        setValue(v, state.inputs[a][v.name] === val ? null : val);
        refreshField(wrap, v);
      }));
    }
  });
  updateProvided();
}

function defaultNum(v) { return Math.round((v.min + v.max) / 2); }
function clamp(v, x) { return Math.max(v.min, Math.min(v.max, x)); }

function fieldHTML(v, val) {
  const L = state.lang, id = `f-${state.algo}-${v.name.replace(/[^a-z0-9]/gi, "")}`;
  const [code, text] = v.label[L].includes(" · ") ? v.label[L].split(" · ") : [null, v.label[L]];
  const label = `${code ? `<span class="code">${code}</span>` : ""}${text}`;
  const help = v.help ? `<p class="field-help">${v.help[L]}</p>` : "";
  if (v.widget === "number") {
    return `<div class="field" data-var="${v.name}"><label class="field-label" for="${id}">${label}</label>${help}
      <div class="num-row"><div class="num"><button type="button" data-step="-1" aria-label="−">−</button>
      <input id="${id}" inputmode="decimal" value="${val ?? ""}" placeholder="–" aria-describedby="${id}-w">
      <button type="button" data-step="1" aria-label="+">+</button></div>
      ${v.unit ? `<span class="unit">${v.unit[L]}</span>` : ""}<button type="button" class="clear-x">${L === "fr" ? "effacer" : "clear"}</button></div>
      <p class="warn" id="${id}-w" aria-live="polite"></p></div>`;
  }
  const opts = v.widget === "scale" ? v.options.map((o) => [o.value, String(o.value), o[L]]) : Object.entries(v.options).map(([k, o]) => [k, o[L], o[L]]);
  const buttons = opts.map(([k, lab, title]) => {
    const on = val !== null && val !== undefined && String(val) === String(k);
    return `<button type="button" data-val="${k}" aria-pressed="${on}"${v.widget === "scale" && title ? ` title="${title}"` : ""}>${lab}</button>`;
  }).join("");
  const note = v.widget === "scale" ? `<div class="scale-note" aria-live="polite">${scaleNote(v, val)}</div>` : "";
  return `<div class="field" data-var="${v.name}" role="group" aria-labelledby="${id}"><span class="field-label" id="${id}">${label}</span>${help}
    <div class="seg${v.widget === "scale" ? " scale" : ""}">${buttons}</div>${note}</div>`;
}

function scaleNote(v, val) {
  const L = state.lang;
  if (val !== null && val !== undefined && v.options.find((o) => o.value === val)?.[L]) return `<span class="sel">${v.options.find((o) => o.value === val)[L]}</span>`;
  if (v.ends) return `<span>${v.options[0].value} ${v.ends[L][0]}</span><span>${v.options.at(-1).value} ${v.ends[L][1]}</span>`;
  return `<span>${v.options[0].value} ${v.options[0][L]}</span><span>${v.options.at(-1).value} ${v.options.at(-1)[L]}</span>`;
}

function refreshField(wrap, v) {
  const val = state.inputs[state.algo][v.name];
  if (v.widget === "number") {
    const w = wrap.querySelector(".warn");
    w.textContent = val !== null && val !== undefined && (val < v.min || val > v.max) ? t().outOfRange(v.min, v.max) : "";
  } else {
    wrap.querySelectorAll("button[data-val]").forEach((b) => b.setAttribute("aria-pressed", val !== null && val !== undefined && String(val) === b.dataset.val));
    const n = wrap.querySelector(".scale-note");
    if (n) n.innerHTML = scaleNote(v, val);
  }
}

function setValue(v, val) {
  if (val === null || val === undefined) delete state.inputs[state.algo][v.name];
  else state.inputs[state.algo][v.name] = val;
  updateProvided();
  updatePrediction();
}

function updateProvided() {
  const n = VARIABLES[state.algo].length;
  const k = VARIABLES[state.algo].filter((v) => state.inputs[state.algo][v.name] !== undefined && state.inputs[state.algo][v.name] !== null).length;
  $("#provided").textContent = t().provided(k, n);
}

// ------------------------------------------------------------------ prediction (always the published model)
const ICON_UP = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 L14 13 H2 Z" fill="var(--up)"/></svg>`;
const ICON_OK = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--down)" stroke-width="2"/></svg>`;

function row() {
  const r = {};
  for (const v of VARIABLES[state.algo]) r[v.name] = state.inputs[state.algo][v.name] ?? null;
  return r;
}

function updatePrediction(skipRisk = false) {
  const a = state.algo, m = M[a], T = t();
  const k = keyOf(a, "main");
  lastExp = m.model.explain(row());
  const p = lastExp.p, thr = state.thr[k], Z = state.zones[k];
  $("#prob").textContent = localPct(p, 1);
  $("#dock-prob").textContent = localPct(p, 1);
  const flagged = p >= thr;
  const zs = zoneStats(m.perf, Z);
  const z = p < Z.lo ? zs[0] : p >= Z.hi ? zs[2] : zs[1];
  const ph = m.perf.placeholder;
  $("#status").innerHTML = `${flagged ? ICON_UP : ICON_OK}<span>${T.thresholdLine(localPct(thr, 1), flagged)}</span>`;
  $("#zone-line").innerHTML = ph ? "" : `<span class="zone-badge ${z.key}">${z.label}</span><span>${T.zoneStatus(z.label, z.range, localPct(z.obs, 0), localPct(z.ci[0], 0), localPct(z.ci[1], 0))}</span>`;
  $("#dock-status").textContent = `${z.label}. ${flagged ? T.flagged : T.notFlagged}`;
  $("#zone-legend").innerHTML = zs.map((q) => `<li><i style="background:var(--${q.key === "low" ? "down" : q.key === "high" ? "up" : "sheet-2"});${q.key === "mid" ? "border:1px solid var(--rule)" : "opacity:.35"}"></i>${q.label}: ${q.range}</li>`).join("");
  const bins = m.perf.calibration.bins;
  const b = bins.find((x, i) => p <= (bins[i + 1] ? (x.p + bins[i + 1].p) / 2 : 1)) || bins.at(-1);
  const i = bins.indexOf(b);
  const lo = i === 0 ? 0 : (bins[i - 1].p + b.p) / 2, hi = i === bins.length - 1 ? 1 : (b.p + bins[i + 1].p) / 2;
  $("#similar").textContent = T.similar(localPct(lo, 0), localPct(hi, 0), localPct(b.obs, 0), b.n);
  $("#ph-predict").hidden = !ph;
  $("#ph-predict").textContent = ph ? T.placeholder : "";
  $("#similar").hidden = !!ph;
  $("#why-caption").textContent = T.whyCaption(localPct(1 / (1 + Math.exp(-lastExp.base)), 1));
  if (state.tab === "predict") drawPredictCharts(skipRisk);
}

function chartOpts(el, extra = {}) {
  return { theme: theme(), width: Math.max(280, Math.floor(el.clientWidth || 600)), lang: state.lang, t: t(), mainLabel: mainLabel(), ...extra };
}

function riskData() {
  const a = state.algo, k = keyOf(a, "main");
  return { perf: M[a].perf, p: lastExp.p, threshold: state.thr[k], zones: state.zones[k], onThreshold: (v, end) => setThreshold(v, end, k) };
}

function drawPredictCharts(skipRisk = false) {
  const el = $("#chart-risk");
  if (!skipRisk) C.riskScale(el, riskData(), chartOpts(el));
  const w = $("#chart-why");
  C.waterfall(w, waterfallData(), chartOpts(w));
  fillWhatIfSelect();
  drawWhatIf();
}

function waterfallData() {
  const vars = M[state.algo].vars;
  return {
    exp: lastExp,
    labels: lastExp.contributions.map((c) => vars.find((v) => v.name === c.name).short[state.lang]),
    values: lastExp.contributions.map((c) => optionLabel(vars.find((v) => v.name === c.name), c.value, state.lang)),
  };
}

function fillWhatIfSelect() {
  const a = state.algo, sel = $("#whatif-var");
  const order = [...lastExp.contributions].sort((x, y) => Math.abs(y.phi) - Math.abs(x.phi)).map((c) => c.name);
  if (!state.whatIf[a] || !order.includes(state.whatIf[a])) state.whatIf[a] = order[0];
  const vars = M[a].vars;
  const html = vars.map((v) => `<option value="${v.name}"${v.name === state.whatIf[a] ? " selected" : ""}>${v.label[state.lang].replace(" · ", " ")}</option>`).join("");
  if (sel.dataset.sig !== a + state.lang) { sel.innerHTML = html; sel.dataset.sig = a + state.lang; }
  sel.value = state.whatIf[a];
}

function whatIfData() {
  const a = state.algo, m = M[a];
  const v = m.vars.find((x) => x.name === state.whatIf[a]);
  const base = row();
  const pred = (val) => m.model.predict({ ...base, [v.name]: val });
  const L = state.lang, thr = state.thr[keyOf(a, "main")];
  if (v.widget === "number") {
    const n = v.max - v.min;
    const step = n <= 120 ? v.step : n / 60;
    const pts = d3.range(v.min, v.max + 1e-9, step).map((x) => ({ key: x, p: pred(x), label: `${fmtNum(x, step < 1 ? 1 : 0)}${v.unit ? " " + v.unit[L] : ""}` }));
    return { v, data: { points: pts, current: base[v.name], threshold: thr, xLabel: v.label[L] + (v.unit ? ` (${v.unit[L]})` : ""), categorical: false } };
  }
  const keys = v.widget === "scale" ? v.options.map((o) => o.value) : Object.keys(v.options).map((k) => (v.numeric ? +k : k));
  const pts = keys.map((k) => ({ key: String(k), p: pred(k), label: v.widget === "scale" ? String(k) : v.options[k][L] }));
  pts.push({ key: "__na__", p: pred(null), label: t().notProvided });
  const cur = base[v.name] === null ? "__na__" : String(base[v.name]);
  return { v, data: { points: pts, current: cur, threshold: thr, categorical: true, ordinal: v.widget === "scale", xLabel: v.label[L].replace(" · ", " ") } };
}

function drawWhatIf() {
  const el = $("#chart-whatif");
  C.whatIf(el, whatIfData().data, chartOpts(el));
}

function setThreshold(v, final, k = keyOf()) {
  state.thr[k] = Math.max(0.005, Math.min(0.995, +(+v).toFixed(3)));
  updatePrediction(final === false); // while dragging, keep the dragged chart in place
  updatePerformance();
}

function setZone(which, v) {
  const k = keyOf(), z = { ...state.zones[k] };
  z[which] = +(+v).toFixed(3);
  if (which === "lo" && z.lo >= z.hi) z.hi = +(z.lo + 0.005).toFixed(3);
  if (which === "hi" && z.hi <= z.lo) z.lo = +Math.max(0.005, z.hi - 0.005).toFixed(3);
  state.zones[k] = z;
  updatePerformance();
  if (state.perfModel[state.algo] === "main") updatePrediction();
}

// ------------------------------------------------------------------ performance
function presets(perf) {
  let best = perf.grid[0];
  for (const g of perf.grid) if (g.sens !== null && g.spec !== null && g.sens + g.spec > (best.sens ?? 0) + (best.spec ?? 0)) best = g;
  return [
    { t: defaultThreshold(perf), label: t().presetDefault },
    { t: best.t, label: `${t().presetYouden} (${localPct(best.t, 1)})` },
    { t: Math.round(perf.prevalence / 0.005) * 0.005, label: `${t().presetPrev} (${localPct(perf.prevalence, 1)})` },
  ];
}

function sliderMax(perf) {
  let lastNZ = 0;
  perf.hist.edges.slice(1).forEach((e, i) => { if (perf.hist.neg[i] + perf.hist.pos[i] > 0) lastNZ = e; });
  return Math.min(0.95, Math.max(0.3, Math.ceil(lastNZ * 20) / 20));
}

function largestRemainder(vals, total) {
  const fl = vals.map(Math.floor);
  const rest = total - fl.reduce((s, x) => s + x, 0);
  const order = vals.map((v, i) => [v - fl[i], i]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; k < rest; k++) fl[order[k % order.length][1]]++;
  return fl;
}

function countsAt(perf, thr, prev) {
  const g = C.gridAt(perf, thr);
  const [tp, fn, fp, tn] = largestRemainder([g.sens * prev, (1 - g.sens) * prev, (1 - g.spec) * (1 - prev), g.spec * (1 - prev)].map((x) => x * 100), 100);
  return { tp, fn, fp, tn };
}

function renderModelSwitch() {
  const a = state.algo, T = t(), box = $("#model-switch");
  box.hidden = !hasComp(a);
  if (!hasComp(a)) { state.perfModel[a] = "main"; return; }
  const cur = state.perfModel[a];
  $("#model-seg").innerHTML = [["main", mainLabel(a), "currentColor"], ["tabpfn", compLabel(a), "var(--comp)"]]
    .map(([m, lab, col]) => `<button type="button" role="radio" aria-checked="${m === cur}" aria-pressed="${m === cur}" data-m="${m}"><span class="sw" style="background:${col}"></span>${lab}</button>`).join("");
  $("#model-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    state.perfModel[a] = b.dataset.m; ensure(a, b.dataset.m); updatePerformance(true);
  }));
  $("#overlay").checked = state.overlay;
  const cmp = M[a].perf.comparators.tabpfn, d = cmp.auc_diff_vs_main;
  $("#model-note").textContent = `${cmp.label}. ${cmp.validation}. ${d ? T.compareLine(fmtSigned(d.diff), fmtSigned(d.ci[0]), fmtSigned(d.ci[1])) : ""} ${T.tabpfnOnlyPerf}`;
}

function updatePerformance(full = false) {
  const a = state.algo, T = t();
  renderModelSwitch();
  const k = ensure(), perf = perfOf();
  const thr = state.thr[k];
  $("#ph-perf").hidden = !M[a].perf.placeholder;
  $("#ph-perf").textContent = M[a].perf.placeholder ? T.placeholder : "";

  const s = $("#thr");
  s.max = sliderMax(perf); s.value = thr;
  $("#thr-out").textContent = localPct(thr, 1);
  const sig = k + state.lang;
  if (full || $("#presets").dataset.sig !== sig) {
    $("#presets").innerHTML = presets(perf).map((p) => `<button type="button" class="chip" data-t="${p.t}">${p.label}</button>`).join("");
    $("#presets").dataset.sig = sig;
    $("#presets").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setThreshold(+b.dataset.t, true, keyOf())));
  }
  $("#presets").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", Math.abs(+b.dataset.t - thr) < 0.0026));

  const prev = state.prevalence[k];
  $("#prev").value = prev;
  $("#prev-out").textContent = localPct(prev, 0);
  $("#prev-hint").textContent = T.prevHint(localPct(perf.prevalence, 1));
  $("#compare").innerHTML = hasComp(a) ? "" : `<p class="hint">${T.compareNone}</p>`;

  const g = C.gridAt(perf, thr);
  const adjusted = Math.abs(prev - perf.prevalence) > 0.004;
  const ppv = adjusted ? (g.sens * prev) / (g.sens * prev + (1 - g.spec) * (1 - prev)) : g.ppv;
  const npv = adjusted ? (g.spec * (1 - prev)) / (g.spec * (1 - prev) + (1 - g.sens) * prev) : g.npv;
  const flagged = adjusted ? g.sens * prev + (1 - g.spec) * (1 - prev) : g.flagged;
  const ci = (c) => (c ? `95 % CI ${localPct(c[0], 0)}–${localPct(c[1], 0)}` : "");
  const recomputed = state.lang === "fr" ? `recalculée pour ${localPct(prev, 0)}` : `recomputed for ${localPct(prev, 0)}`;
  const metric = (label, v, c, help) => `<div class="metric"><dt>${label}</dt><dd><span class="v">${localPct(v, 0)}</span><span class="ci">${c}</span><span class="help">${help}</span></dd></div>`;
  $("#metrics").innerHTML = [
    metric(T.sens, g.sens, ci(g.sens_ci), T.sensHelp),
    metric(T.spec, g.spec, ci(g.spec_ci), T.specHelp),
    metric(T.ppv, ppv, adjusted ? recomputed : ci(g.ppv_ci), T.ppvHelp),
    metric(T.npv, npv, adjusted ? recomputed : ci(g.npv_ci), T.npvHelp),
    metric(T.flaggedPct, flagged, adjusted ? recomputed : "", ""),
  ].join("");

  const counts = countsAt(perf, thr, prev);
  C.iconArray($("#icon-array"), { counts }, { theme: theme(), width: 300, t: T });
  const sw = (fill, stroke) => `<svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/></svg>`;
  $("#icon-legend").innerHTML = [
    [counts.tp, sw("var(--up)", "none"), T.tpL], [counts.fn, sw("none", "var(--up)"), T.fnL],
    [counts.fp, sw("var(--down)", "none"), T.fpL], [counts.tn, sw("none", "var(--down)"), T.tnL],
  ].map(([n, s2, l]) => `<li>${s2}<b>${n}</b> ${l}</li>`).join("");

  // zones
  const Z = state.zones[k];
  for (const [id, v] of [["#zlo", Z.lo], ["#zhi", Z.hi]]) { $(id).max = sliderMax(perf); $(id).value = v; }
  $("#zlo-out").textContent = localPct(Z.lo, 1);
  $("#zhi-out").textContent = localPct(Z.hi, 1);
  const zs = zoneStats(perf, Z);
  const head = T.zoneTable;
  $("#zone-table").innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${zs.map((z) =>
    `<tr><td>${z.label}</td><td class="muted">${z.range}</td><td>${z.n} (${localPct(z.share, 0)})</td><td>${z.events}/${z.n} = ${localPct(z.obs, 0)} <span class="muted">(${localPct(z.ci[0], 0)}–${localPct(z.ci[1], 0)})</span></td><td>${localPct(z.capture, 0)}</td></tr>`).join("")}</tbody>`;

  $("#cap-roc").textContent = T.capROC(`${fmtNum(perf.auc)} (95 % CI ${fmtNum(perf.auc_ci[0])}–${fmtNum(perf.auc_ci[1])})`);
  $("#cap-cal").textContent = T.capCal(fmtNum(perf.calibration.slope), fmtNum(perf.calibration.intercept));
  $("#validation").textContent = `${modelLabel()}. ${T.validation}: ${perf.validation}. n = ${perf.n}, ${perf.n_events} ${state.lang === "fr" ? "évènements" : "events"} (${localPct(perf.prevalence, 1)}).`;
  if (state.tab === "performance") drawPerfCharts();
}

function fmtSigned(v) { return (v >= 0 ? "+" : "−") + fmtNum(Math.abs(v), 3); }

// Curves: colour follows the model (main = ink, TabPFN = ochre). Without overlay, only the selected model is drawn.
function curveSet(th) {
  const a = state.algo, sel = state.perfModel[a], main = M[a].perf, comp = main.comparators?.tabpfn || null;
  const k = keyOf();
  const thr = state.thr[k];
  if (comp && state.overlay) return { perf: main, comp, focus: sel === "tabpfn" ? "comp" : "main", threshold: thr, theme: th };
  if (sel === "tabpfn" && comp) return { perf: comp, comp: null, focus: "main", threshold: thr, theme: { ...th, model: th.comp }, mainLabel: compLabel() };
  return { perf: main, comp: null, focus: "main", threshold: thr, theme: th };
}

function perfDraw(fig, th) {
  const cs = curveSet(th), pick = (v) => setThreshold(v, true, keyOf());
  const sel = perfOf();
  const o = { theme: cs.theme, mainLabel: cs.mainLabel || mainLabel() };
  return {
    roc: [C.roc, { ...cs, mainLabel: o.mainLabel, onPick: pick }, o],
    pr: [C.prCurve, { ...cs, mainLabel: o.mainLabel, onPick: pick }, o],
    calibration: [C.calibration, { perf: cs.perf, comp: cs.comp }, o],
    dca: [C.dca, { perf: cs.perf, comp: cs.comp, threshold: cs.threshold }, o],
    threshold: [C.thresholdCurves, { perf: sel, threshold: cs.threshold, onPick: pick }, { theme: th }],
    gain: [C.gainCurve, { ...cs, mainLabel: o.mainLabel, onPick: pick }, o],
    zones: [C.zonesChart, { zones: zoneStats(sel, state.zones[keyOf()]) }, { theme: th }],
  }[fig];
}

function drawPerfCharts() {
  const ids = { roc: "#chart-roc", pr: "#chart-pr", calibration: "#chart-cal", dca: "#chart-dca", threshold: "#chart-thr", gain: "#chart-gain", zones: "#chart-zones" };
  for (const [fig, sel] of Object.entries(ids)) {
    const el = $(sel);
    const [f, data, o] = perfDraw(fig, theme());
    f(el, data, chartOpts(el, o));
  }
  C.iconArray($("#icon-array"), { counts: countsAt(perfOf(), state.thr[keyOf()], state.prevalence[keyOf()]) }, { theme: theme(), width: 300, t: t() });
}

// ------------------------------------------------------------------ about
function levelLabel(a) {
  return (name, gr) => {
    if (gr.missing) return t().notProvided;
    const v = VARIABLES[a].find((x) => x.name === name);
    if (!v) return gr.label;
    if (v.widget === "choice") return v.options[gr.label]?.[state.lang] ?? gr.label;
    if (v.widget === "scale") return gr.label;
    return gr.label + (v.unit ? ` ${v.unit[state.lang]}` : "");
  };
}

function dependenceData() {
  const a = state.algo, perf = M[a].perf;
  const order = (perf.importance?.values || []).map((v) => v.name);
  const prof = [...(perf.dependence || [])].filter((p) => p.groups.length)
    .sort((x, y) => order.indexOf(x.name) - order.indexOf(y.name));
  return { profiles: state.depAll ? prof : prof.slice(0, 6), labels: M[a].labels, levelLabel: levelLabel(a), total: prof.length };
}

function coefData() {
  const a = state.algo, spec = M[a].spec, L = state.lang;
  if (spec.type !== "logistic") return null;
  const vars = VARIABLES[a];
  const rows = spec.features.map((f) => {
    const direct = vars.find((v) => v.name === f.name);
    if (direct) return { label: direct.short[L], value: spec.calibration.a * f.coef, name: f.name };
    const v = vars.find((x) => f.name.startsWith(x.name + "_"));
    const lev = f.name.slice(v.name.length + 1);
    return { label: `${v.short[L]}: ${(v.options[lev]?.[L] ?? lev)}`, value: spec.calibration.a * f.coef, name: f.name };
  }).sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  return { rows };
}

function renderAbout() {
  const a = state.algo, L = state.lang, T = t(), A = ABOUT[a], m = M[a];
  const imp = m.perf.importance;
  const vars = m.vars;
  const typeName = (v) => (v.widget === "number" ? (L === "fr" ? "numérique" : "numeric") : v.widget === "scale" ? (L === "fr" ? "score d'item" : "item score") : (L === "fr" ? "catégorielle" : "categorical"));
  const allowed = (v) => (v.widget === "number" ? `${v.min}–${v.max}${v.unit ? " " + v.unit[L] : ""}` : v.widget === "scale" ? `${v.options[0].value}–${v.options.at(-1).value}` : Object.values(v.options).map((o) => o[L]).join(", "));
  const dep = dependenceData();
  const coef = coefData();
  $("#about").innerHTML = `
    <div>
      <section><h2>${T.outcome}</h2><p>${A[L].outcome}</p></section>
      <section><h2>${T.cohort}</h2><p>${A[L].cohort}</p></section>
      <section><h2>${T.modelSpec}</h2><p>${A[L].model}</p></section>
      <section><h2>${T.limits}</h2><ul>${A[L].limits.map((x) => `<li>${x}</li>`).join("")}</ul>${hasComp(a) ? `<p class="hint" style="margin-top:10px">${T.tabpfnOnlyPerf}</p>` : ""}</section>
      <section><h2>${T.privacy}</h2><p>${T.privacyText}</p></section>
      <section><h2>${T.cite}</h2><p class="cite">${A.cite}${A.doi ? ` <a href="https://doi.org/${A.doi}" target="_blank" rel="noopener">doi:${A.doi}</a>` : ""}</p>
        ${A.doi ? `<button type="button" class="copy" data-copy style="margin-top:8px">${T.copy}</button>` : ""}</section>
    </div>
    <div>
      ${imp ? `<section><div class="block-head"><h2>${T.importanceTitle}</h2><div class="dl" data-fig="importance"></div></div>
        <p class="caption">${T.importanceCap[imp.kind] || ""}</p><div class="chart" id="chart-imp"></div></section>` : ""}
      ${coef ? `<section><div class="block-head"><h2>${T.coefTitle}</h2><div class="dl" data-fig="coef"></div></div>
        <p class="caption">${T.coefCap}</p><div class="chart" id="chart-coef"></div></section>` : ""}
    </div>
    <section style="grid-column:1/-1"><div class="block-head"><h2>${T.depTitle}</h2>${dep.total ? `<div class="dl" data-fig="dependence"></div>` : ""}</div>
      <p class="caption">${dep.total ? T.depCap : T.depNone}</p>
      <div class="chart" id="chart-dep"></div>
      ${dep.total > 6 ? `<button type="button" class="chip dep-toggle" id="dep-toggle">${state.depAll ? T.depFewer : T.depShow}</button>` : ""}
    </section>
    <section style="grid-column:1/-1"><h2>${T.variables}</h2>
      <div class="table-wrap"><table class="vars"><thead><tr><th>Variable</th><th>Type</th><th>${L === "fr" ? "Valeurs" : "Values"}</th></tr></thead>
      <tbody>${vars.map((v) => `<tr><td>${v.label[L].replace(" · ", " ")}</td><td class="muted">${typeName(v)}</td><td class="muted">${allowed(v)}</td></tr>`).join("")}</tbody></table></div>
    </section>`;
  bindDownloads($("#about"));
  const cb = $("#about [data-copy]");
  if (cb) cb.addEventListener("click", () => copyCitation(cb));
  const tg = $("#dep-toggle");
  if (tg) tg.addEventListener("click", () => { state.depAll = !state.depAll; renderAbout(); });
  if (state.tab === "model") drawAboutCharts();
}

function importanceData() { const m = M[state.algo]; return { values: m.perf.importance.values, labels: m.labels }; }

function drawAboutCharts() {
  const el = $("#chart-imp");
  if (el) C.importance(el, importanceData(), chartOpts(el));
  const ce = $("#chart-coef"), cd = coefData();
  if (ce && cd) C.coefPlot(ce, cd, chartOpts(ce));
  const de = $("#chart-dep"), dd = dependenceData();
  if (de && dd.total) C.dependence(de, dd, chartOpts(de));
}

function redrawCharts() {
  if (!lastExp) return;
  if (state.tab === "predict") drawPredictCharts();
  if (state.tab === "performance") drawPerfCharts();
  if (state.tab === "model") drawAboutCharts();
}

// ------------------------------------------------------------------ downloads
function downloadFigure(fig, fmt) {
  const a = state.algo, T = t(), perf = perfOf();
  const sfx = ["roc", "pr", "calibration", "dca", "threshold", "gain", "zones"].includes(fig) && state.perfModel[a] === "tabpfn" ? "-tabpfn" : "";
  const name = `${a}-${fig}${sfx}`;
  const base = (o) => ({ lang: state.lang, t: T, mainLabel: mainLabel(), ...o });
  const perfFig = (key) => (el, o) => {
    const [f, data, extra] = perfDraw(key, o.theme);
    return f(el, { ...data, onPick: null, onThreshold: null }, base({ ...o, ...extra }));
  };
  const map = {
    waterfall: [(el, o) => C.waterfall(el, waterfallData(), base(o)), () => waterfallData().exp.contributions.map((c, i) => ({ variable: c.name, value: c.value, shap_log_odds: c.phi, odds_factor: Math.exp(c.phi), label: waterfallData().labels[i] }))],
    whatif: [(el, o) => C.whatIf(el, whatIfData().data, base(o)), () => whatIfData().data.points.map((p) => ({ value: p.label ?? p.key, probability: p.p }))],
    roc: [perfFig("roc"), () => perf.roc.fpr.map((f, i) => ({ fpr: f, tpr: perf.roc.tpr[i] }))],
    pr: [perfFig("pr"), () => perf.grid.map((g) => ({ threshold: g.t, sensitivity: g.sens, ppv: g.ppv }))],
    calibration: [perfFig("calibration"), () => perf.calibration.bins],
    dca: [perfFig("dca"), () => perf.dca],
    threshold: [perfFig("threshold"), () => perf.grid.map((g) => ({ threshold: g.t, sensitivity: g.sens, specificity: g.spec, ppv: g.ppv, npv: g.npv, flagged: g.flagged, tp: g.tp, fp: g.fp, fn: g.fn, tn: g.tn }))],
    gain: [perfFig("gain"), () => perf.grid.map((g) => ({ threshold: g.t, flagged: g.flagged, cases_detected: g.sens }))],
    zones: [perfFig("zones"), () => zoneStats(perf, state.zones[keyOf()]).map((z) => ({ zone: z.label, range: z.range, n: z.n, events: z.events, observed: z.obs, ci_low: z.ci[0], ci_high: z.ci[1], share_of_cases: z.capture }))],
    importance: [(el, o) => C.importance(el, importanceData(), base(o)), () => M[a].perf.importance.values],
    coef: [(el, o) => C.coefPlot(el, coefData(), base(o)), () => coefData().rows.map((r) => ({ feature: r.name, label: r.label, calibrated_coef_per_sd: r.value, odds_ratio_per_sd: Math.exp(r.value) }))],
    dependence: [(el, o) => C.dependence(el, dependenceData(), base(o)), () => dependenceData().profiles.flatMap((p) => p.groups.map((gr) => ({ variable: p.name, group: gr.label, mean_shap: gr.mean, sd_shap: gr.sd, n: gr.n })))],
  };
  const [draw, rows] = map[fig];
  if (fmt === "svg") exportSVG(draw, name);
  else if (fmt === "png") exportPNG(draw, name);
  else exportCSV(rows(), name);
}

// d3 is loaded with `defer`; module scripts run after deferred classic scripts, so d3 is available here.
boot().catch((e) => {
  console.error(e);
  $("#main").insertAdjacentHTML("afterbegin", `<p class="placeholder-note">The models could not be loaded (${e.message}). If you opened the file directly, serve the folder over http, for example with <code>python -m http.server</code>.</p>`);
});
