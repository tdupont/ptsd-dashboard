// Publication-style charts (D3 v7, global `d3`). Every chart takes (el, data, opts) where
// opts = { theme, width, lang, t (strings), ... } and draws a self-contained <svg> into `el`.
// The same functions are used for on-screen rendering and for figure export (light theme, fixed width).

/* global d3 */

export const LIGHT = {
  surface: "#ffffff", ink: "#1d2733", ink2: "#4b5766", ink3: "#6b7684", grid: "#e4e8ec", axis: "#c3cad2",
  up: "#b83a68", down: "#2874b2", comp: "#b7791f", model: "#1d2733", spec: "#7b8694", wash: "rgba(29,39,51,0.045)",
};
export const DARK = {
  surface: "#151a20", ink: "#e6eaf0", ink2: "#b4bdc8", ink3: "#8d97a3", grid: "#262d36", axis: "#3a434e",
  up: "#d9608c", down: "#4c93d6", comp: "#c8963a", model: "#e6eaf0", spec: "#8d97a3", wash: "rgba(230,234,240,0.05)",
};
export const FONT = "'Libre Franklin', 'Helvetica Neue', Arial, sans-serif";

let LANG = "en";
const dec = (str) => (LANG === "fr" ? str.replace(".", ",") : str);
const pct = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : dec(`${(100 * v).toFixed(d)} %`));
const f1 = (v) => dec(d3.format(".1f")(v));
const f2 = (v) => dec(d3.format(".2f")(v));
// shorten a label to fit a width, with an ellipsis
function fit(str, maxW, size = 12) {
  if (textWidth(str, size) <= maxW) return str;
  let s2 = str;
  while (s2.length > 3 && textWidth(s2 + "…", size) > maxW) s2 = s2.slice(0, -1);
  return s2.trimEnd() + "…";
}
export const fmtPct = pct;
const logit = (p) => Math.log(p / (1 - p));
const expit = (z) => 1 / (1 + Math.exp(-z));

// ------------------------------------------------------------------ shared
function frame(el, { width, height, margin, theme, title, lang }) {
  if (lang) LANG = lang;
  d3.select(el).selectAll("svg").remove();
  const svg = d3.select(el).append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width).attr("height", height)
    .attr("role", "img")
    .attr("font-family", FONT).attr("font-size", 12).attr("fill", theme.ink)
    .style("max-width", "100%").style("height", "auto");
  if (title) svg.append("title").text(title);
  svg.append("rect").attr("class", "bg").attr("width", width).attr("height", height).attr("fill", theme.surface);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  return { svg, g, w: width - margin.left - margin.right, h: height - margin.top - margin.bottom };
}

function axes(g, { x, y, w, h, theme, xLabel, yLabel, xFormat, yFormat, xTicks = 5, yTicks = 5, grid = true }) {
  if (grid) {
    g.append("g").selectAll("line").data(y.ticks(yTicks)).join("line")
      .attr("x1", 0).attr("x2", w).attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", theme.grid).attr("stroke-width", 1).attr("shape-rendering", "crispEdges");
  }
  const xa = g.append("g").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(xTicks).tickFormat(xFormat || f1).tickSizeOuter(0).tickSize(4));
  const ya = g.append("g").call(d3.axisLeft(y).ticks(yTicks).tickFormat(yFormat || f1).tickSizeOuter(0).tickSize(4));
  for (const a of [xa, ya]) {
    a.select(".domain").attr("stroke", theme.axis);
    a.selectAll(".tick line").attr("stroke", theme.axis);
    a.selectAll(".tick text").attr("fill", theme.ink2).attr("font-size", 11.5).attr("font-family", FONT)
      .style("font-variant-numeric", "tabular-nums");
  }
  ya.select(".domain").remove();
  if (xLabel) g.append("text").attr("x", w / 2).attr("y", h + 36).attr("text-anchor", "middle").attr("fill", theme.ink2).text(xLabel);
  if (yLabel) g.append("text").attr("transform", `translate(${-42},${h / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("fill", theme.ink2).text(yLabel);
}

function legend(g, items, theme, x = 0, y = -14) {
  const L = g.append("g").attr("transform", `translate(${x},${y})`);
  let cx = 0;
  for (const it of items) {
    const gi = L.append("g").attr("transform", `translate(${cx},0)`);
    if (it.kind === "line") gi.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 0).attr("y2", 0).attr("stroke", it.color).attr("stroke-width", 2).attr("stroke-linecap", "round");
    else if (it.kind === "ring") gi.append("circle").attr("cx", 6).attr("r", 4.5).attr("fill", "none").attr("stroke", it.color).attr("stroke-width", 1.6);
    else gi.append("rect").attr("x", 0).attr("y", -5).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", it.color);
    const tx = gi.append("text").attr("x", it.kind === "line" ? 22 : 16).attr("y", 4).attr("fill", theme.ink2).text(it.label);
    cx += (it.kind === "line" ? 22 : 16) + textWidth(it.label) + 18;
    void tx;
  }
  return L;
}

let _ctx;
export function textWidth(s, size = 12, weight = 400) {
  _ctx = _ctx || document.createElement("canvas").getContext("2d");
  _ctx.font = `${weight} ${size}px ${FONT}`;
  return _ctx.measureText(String(s)).width;
}

// Tooltip (one shared element)
let tipEl;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    tipEl.setAttribute("role", "status");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
export function showTip(evt, html) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = "block";
  const pad = 14, r = t.getBoundingClientRect();
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
export function hideTip() { if (tipEl) tipEl.style.display = "none"; }

// ------------------------------------------------------------------ risk distribution (hero)
export function riskScale(el, { perf, p, threshold, onThreshold, zones }, o) {
  const { theme, t } = o;
  const width = o.width, compact = width < 520;
  const margin = { top: 58, right: 16, bottom: 34, left: 16 };
  const height = compact ? 206 : 226;
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.distCaption, lang: o.lang });
  const edges = perf.hist.edges, neg = perf.hist.neg, pos = perf.hist.pos;
  const nNeg = d3.sum(neg) || 1, nPos = d3.sum(pos) || 1;
  let lastNZ = 0;
  edges.slice(1).forEach((e, i) => { if (neg[i] + pos[i] > 0) lastNZ = e; });
  const xmax = Math.min(1, Math.max(0.5, Math.ceil(Math.max(lastNZ, p ?? 0, threshold) * 10 + 0.5) / 10));
  const x = d3.scaleLinear([0, xmax], [0, w]);
  const mid = h / 2;
  const dens = [...neg.map((c) => c / nNeg), ...pos.map((c) => c / nPos)];
  const y = d3.scaleLinear([0, d3.max(dens) || 1], [0, mid - 6]);

  // risk zones (low / intermediate / high) as background bands
  if (zones) {
    const lo = Math.min(zones.lo, xmax), hi = Math.min(zones.hi, xmax);
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", x(lo)).attr("height", h).attr("fill", theme.down).attr("opacity", 0.08);
    g.append("rect").attr("x", x(hi)).attr("y", 0).attr("width", Math.max(0, w - x(hi))).attr("height", h).attr("fill", theme.up).attr("opacity", 0.08);
    for (const c of [lo, hi]) g.append("line").attr("x1", x(c)).attr("x2", x(c)).attr("y1", 0).attr("y2", h).attr("stroke", theme.ink3).attr("stroke-width", 1);
  }

  const bins = edges.slice(0, -1).map((e, i) => ({ x0: e, x1: edges[i + 1], neg: neg[i] / nNeg, pos: pos[i] / nPos, nn: neg[i], np: pos[i] }))
    .filter((b) => b.x0 < xmax);
  const bw = (b) => Math.max(1, x(Math.min(b.x1, xmax)) - x(b.x0) - 2);
  g.append("g").selectAll("rect").data(bins).join("rect")
    .attr("x", (b) => x(b.x0) + 1).attr("width", bw)
    .attr("y", (b) => mid - 1 - y(b.neg)).attr("height", (b) => y(b.neg)).attr("rx", 1.5).attr("fill", theme.down).attr("opacity", 0.85);
  g.append("g").selectAll("rect").data(bins).join("rect")
    .attr("x", (b) => x(b.x0) + 1).attr("width", bw)
    .attr("y", mid + 1).attr("height", (b) => y(b.pos)).attr("rx", 1.5).attr("fill", theme.up).attr("opacity", 0.85);
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", mid).attr("y2", mid).attr("stroke", theme.axis);

  // axis
  const xa = g.append("g").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(compact ? 5 : 10).tickFormat((d) => `${Math.round(d * 100)} %`).tickSize(4).tickSizeOuter(0));
  xa.select(".domain").attr("stroke", theme.axis);
  xa.selectAll(".tick line").attr("stroke", theme.axis);
  xa.selectAll(".tick text").attr("fill", theme.ink2).attr("font-size", 11.5);

  // class labels inside the plot, at left
  for (const [lab, col, yy] of [[t.cohortNoPtsd, theme.down, 12], [t.cohortPtsd, theme.up, h - 6]]) {
    const tw = textWidth(lab);
    g.append("rect").attr("x", w - tw - 14).attr("y", yy - 8).attr("width", 8).attr("height", 8).attr("rx", 2).attr("fill", col);
    g.append("text").attr("x", w).attr("y", yy).attr("text-anchor", "end").attr("fill", theme.ink2).text(lab);
  }

  // hover on bins
  g.append("g").selectAll("rect").data(bins).join("rect")
    .attr("x", (b) => x(b.x0)).attr("width", (b) => x(Math.min(b.x1, xmax)) - x(b.x0)).attr("y", 0).attr("height", h).attr("fill", "transparent")
    .on("pointermove", (e, b) => showTip(e, `<b>${Math.round(b.x0 * 100)}–${Math.round(b.x1 * 100)} %</b><br>${t.cohortNoPtsd}: ${b.nn}<br>${t.cohortPtsd}: ${b.np}`))
    .on("pointerleave", hideTip);

  // this relative (row 1, above the plot)
  if (p !== null && p !== undefined) {
    const px = x(Math.min(p, xmax));
    const m = g.append("g").attr("transform", `translate(${px},0)`).style("pointer-events", "none");
    m.append("line").attr("y1", -34).attr("y2", h).attr("stroke", theme.ink).attr("stroke-width", 2.5);
    m.append("circle").attr("cy", mid).attr("r", 6).attr("fill", theme.ink).attr("stroke", theme.surface).attr("stroke-width", 2);
    const lab = `${t.thisRelative} ${pct(p, 1)}`;
    const lw = textWidth(lab, 13, 600);
    const anchor = px + lw / 2 + 2 > w ? "end" : px - lw / 2 - 2 < -margin.left ? "start" : "middle";
    m.append("text").attr("y", -40).attr("text-anchor", anchor).attr("dx", anchor === "end" ? 4 : anchor === "start" ? -4 : 0)
      .attr("font-size", 13).attr("font-weight", 600).attr("fill", theme.ink).text(lab);
  }

  // threshold handle (row 2), draggable
  const thText = (v) => `${t.threshold} ${(Math.round(v * 1000) / 10).toLocaleString(o.lang === "fr" ? "fr-FR" : "en-US")} %`;
  const th = g.append("g").attr("class", "thr").attr("transform", `translate(${x(threshold)},0)`).style("cursor", onThreshold ? "ew-resize" : null);
  th.append("line").attr("y1", -6).attr("y2", h).attr("stroke", theme.ink2).attr("stroke-width", 1.5);
  const thW = textWidth(thText(0.888), 12) + 18;
  const tag = th.append("g");
  const tagBox = tag.append("rect").attr("y", -26).attr("width", thW).attr("height", 20).attr("rx", 3).attr("fill", theme.surface).attr("stroke", theme.ink2);
  const tagTxt = tag.append("text").attr("y", -12).attr("text-anchor", "middle").attr("fill", theme.ink).text(thText(threshold));
  const placeTag = (xv) => {
    const right = xv + thW > w + margin.right;
    tagBox.attr("x", right ? -thW : 0);
    tagTxt.attr("x", right ? -thW / 2 : thW / 2);
  };
  placeTag(x(threshold));
  th.append("rect").attr("x", -10).attr("y", -28).attr("width", 20).attr("height", h + 28).attr("fill", "transparent");
  if (onThreshold) {
    const snap = (px) => +Math.max(0.005, Math.min(Math.min(0.995, xmax), Math.round(x.invert(px) / 0.005) * 0.005)).toFixed(3);
    th.call(d3.drag()
      .on("drag", (e) => {
        const v = snap(e.x);
        th.attr("transform", `translate(${x(v)},0)`);
        placeTag(x(v));
        tagTxt.text(thText(v));
        onThreshold(v, false);
      })
      .on("end", (e) => onThreshold(snap(e.x), true)));
  }
  return svg.node();
}

// ------------------------------------------------------------------ SHAP waterfall
export function waterfall(el, { exp, labels, values, maxRows = 9 }, o) {
  const { theme, t } = o;
  const width = o.width;
  const sorted = exp.contributions.map((c, i) => ({ ...c, i })).sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));
  const shown = sorted.slice(0, maxRows);
  const rest = sorted.slice(maxRows);
  const restPhi = d3.sum(rest, (c) => c.phi);
  const rows = [];
  let cum = exp.base;
  for (const c of shown) { rows.push({ label: labels[c.i], value: values[c.i], start: cum, end: cum + c.phi, phi: c.phi }); cum += c.phi; }
  if (rest.length) { rows.push({ label: t.otherVars(rest.length), value: "", start: cum, end: cum + restPhi, phi: restPhi, other: true }); cum += restPhi; }

  const rowH = 34, labelW = Math.min(250, Math.max(116, width * 0.36));
  const margin = { top: 50, right: width < 480 ? 44 : 56, bottom: 50, left: labelW };
  const height = margin.top + margin.bottom + rowH * rows.length;
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.whyTitle, lang: o.lang });
  const ext = d3.extent([exp.base, exp.value, ...rows.flatMap((r) => [r.start, r.end])]);
  const padZ = Math.max(0.15, (ext[1] - ext[0]) * 0.08);
  const x = d3.scaleLinear([ext[0] - padZ, ext[1] + padZ], [0, w]);

  // probability ticks on the log-odds axis: add "nice" values tier by tier while they keep their spacing
  const tiers = [
    [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95],
    [0.03, 0.04, 0.06, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.98],
    [0.005, 0.015, 0.07, 0.09, 0.12, 0.14, 0.16, 0.18, 0.22, 0.24, 0.26, 0.28, 0.32, 0.34, 0.36, 0.38],
  ];
  const minGap = width < 480 ? 30 : 40;
  const [z0, z1] = x.domain();
  const kept = [];
  for (const tier of tiers) {
    for (const pp of tier) {
      const z = logit(pp);
      if (z < z0 || z > z1) continue;
      if (kept.every((q) => Math.abs(x(logit(q)) - x(z)) >= minGap)) kept.push(pp);
    }
  }
  kept.sort((u, v) => u - v);
  g.append("g").selectAll("line").data(kept).join("line")
    .attr("x1", (pp) => x(logit(pp))).attr("x2", (pp) => x(logit(pp))).attr("y1", 0).attr("y2", h)
    .attr("stroke", theme.grid).attr("shape-rendering", "crispEdges");
  const ax = g.append("g").attr("transform", `translate(0,${h})`);
  ax.append("line").attr("x1", 0).attr("x2", w).attr("stroke", theme.axis);
  ax.selectAll("text").data(kept).join("text").attr("x", (pp) => x(logit(pp))).attr("y", 18).attr("text-anchor", "middle")
    .attr("fill", theme.ink2).attr("font-size", 11.5).text((pp) => dec(`${+(pp * 100).toFixed(1)} %`));
  g.append("text").attr("x", w / 2).attr("y", h + 40).attr("text-anchor", "middle").attr("fill", theme.ink2).text(t.whyAxis);

  // base and final markers
  const marker = (z, label, top) => {
    g.append("line").attr("x1", x(z)).attr("x2", x(z)).attr("y1", top ? -26 : 0).attr("y2", h).attr("stroke", top ? theme.ink3 : theme.ink).attr("stroke-width", top ? 1 : 1.5);
  };
  marker(exp.base, t.averageRelative, true);
  const baseLab = `${t.averageRelative} ${pct(expit(exp.base), 1)}`;
  const finLab = `${t.thisRelative} ${pct(expit(exp.value), 1)}`;
  const bx = x(exp.base), fx = x(exp.value);
  const place = (cx, lab, wgt) => {
    const half = textWidth(lab, 12, wgt) / 2 + 2;
    return Math.max(-margin.left + half, Math.min(w + margin.right - half, cx));
  };
  g.append("text").attr("x", place(bx, baseLab, 400)).attr("y", -32).attr("text-anchor", "middle").attr("fill", theme.ink2).text(baseLab);
  g.append("text").attr("x", place(fx, finLab, 600)).attr("y", -14).attr("text-anchor", "middle").attr("font-weight", 600).attr("fill", theme.ink).text(finLab);
  g.append("line").attr("x1", fx).attr("x2", fx).attr("y1", -8).attr("y2", h).attr("stroke", theme.ink).attr("stroke-width", 1.5);

  const R = g.append("g").selectAll("g").data(rows).join("g").attr("transform", (_, i) => `translate(0,${i * rowH})`);
  R.append("text").attr("x", -12).attr("y", rowH / 2 - 3).attr("text-anchor", "end").attr("fill", theme.ink)
    .attr("font-style", (r) => (r.other ? "italic" : null)).text((r) => fit(r.label, labelW - 16));
  R.append("text").attr("x", -12).attr("y", rowH / 2 + 11).attr("text-anchor", "end").attr("fill", theme.ink3).attr("font-size", 11).text((r) => fit(r.value, labelW - 16, 11));
  R.append("rect")
    .attr("x", (r) => x(Math.min(r.start, r.end))).attr("y", rowH / 2 - 7)
    .attr("width", (r) => Math.max(1.5, Math.abs(x(r.end) - x(r.start)))).attr("height", 14).attr("rx", 2)
    .attr("fill", (r) => (r.phi >= 0 ? theme.up : theme.down)).attr("opacity", (r) => (r.other ? 0.55 : 1));
  R.filter((_, i) => i < rows.length - 1).append("line")
    .attr("x1", (r) => x(r.end)).attr("x2", (r) => x(r.end)).attr("y1", rowH / 2 + 7).attr("y2", rowH + rowH / 2 - 7)
    .attr("stroke", theme.ink3).attr("stroke-width", 1);
  R.append("text")
    .attr("x", (r) => x(Math.max(r.start, r.end)) + 6).attr("y", rowH / 2 + 4)
    .attr("fill", theme.ink2).attr("font-size", 11.5).style("font-variant-numeric", "tabular-nums")
    .attr("stroke", theme.surface).attr("stroke-width", 3).attr("paint-order", "stroke").attr("stroke-linejoin", "round")
    .text((r) => `×${f2(Math.exp(r.phi))}`);
  R.append("rect").attr("x", -labelW).attr("width", labelW + w).attr("height", rowH).attr("fill", "transparent")
    .on("pointermove", (e, r) => showTip(e, `<b>${r.label}</b>${r.value ? ` = ${r.value}` : ""}<br>${r.phi >= 0 ? t.raises : t.lowers}<br>log-odds ${r.phi >= 0 ? "+" : "−"}${Math.abs(r.phi).toFixed(3)}, odds ×${Math.exp(r.phi).toFixed(2)}`))
    .on("pointerleave", hideTip);
  return svg.node();
}

// ------------------------------------------------------------------ what-if
export function whatIf(el, { points, ordinal, current, threshold, xLabel, categorical }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: 18, right: 18, bottom: categorical ? 64 : 48, left: 54 };
  const height = 250;
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.whatIfTitle, lang: o.lang });
  const ymax = Math.min(1, Math.max(0.1, Math.ceil(Math.max(threshold, ...points.map((d) => d.p)) * 10 + 0.5) / 10));
  const y = d3.scaleLinear([0, ymax], [h, 0]);
  let x;
  if (categorical) {
    x = d3.scalePoint(points.map((d) => d.key), [0, w]).padding(0.5);
    g.append("g").selectAll("line").data(y.ticks(5)).join("line").attr("x1", 0).attr("x2", w).attr("y1", y).attr("y2", y).attr("stroke", theme.grid);
    const xa = g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickFormat((k) => points.find((d) => d.key === k).label).tickSize(4));
    xa.select(".domain").attr("stroke", theme.axis);
    xa.selectAll(".tick line").attr("stroke", theme.axis);
    xa.selectAll(".tick text").attr("fill", theme.ink2).attr("font-size", 11.5);
    const maxLab = d3.max(points, (d) => textWidth(d.label, 11.5));
    if (maxLab > x.step() - 6) xa.selectAll(".tick text").attr("transform", "rotate(-25)").attr("text-anchor", "end").attr("dx", -4).attr("dy", 8);
    const ya = g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${Math.round(d * 100)} %`).tickSize(4));
    ya.select(".domain").remove();
    ya.selectAll(".tick line").attr("stroke", theme.axis);
    ya.selectAll(".tick text").attr("fill", theme.ink2).attr("font-size", 11.5);
  } else {
    x = d3.scaleLinear(d3.extent(points, (d) => d.key), [0, w]);
    axes(g, { x, y, w, h, theme, xFormat: (v) => dec(d3.format("~g")(v)), yFormat: (d) => `${Math.round(d * 100)} %` });
  }
  g.append("text").attr("transform", `translate(${-42},${h / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("fill", theme.ink2).text(t.predicted);
  if (xLabel && !categorical) g.append("text").attr("x", w / 2).attr("y", h + 38).attr("text-anchor", "middle").attr("fill", theme.ink2).text(xLabel);

  // threshold reference
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(threshold)).attr("y2", y(threshold)).attr("stroke", theme.ink3).attr("stroke-width", 1);
  g.append("text").attr("x", w).attr("y", y(threshold) - 5).attr("text-anchor", "end").attr("fill", theme.ink3).attr("font-size", 11).text(`${t.threshold} ${pct(threshold, 1)}`);

  if (!categorical || ordinal) {
    g.append("path").datum(points.filter((d) => d.key !== "__na__")).attr("fill", "none").attr("stroke", theme.model).attr("stroke-width", categorical ? 1.5 : 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
      .attr("d", d3.line().x((d) => x(d.key)).y((d) => y(d.p)).curve(categorical ? d3.curveLinear : d3.curveStepAfter));
  }
  if (categorical) {
    g.append("g").selectAll("circle").data(points).join("circle").attr("cx", (d) => x(d.key)).attr("cy", (d) => y(d.p)).attr("r", 5)
      .attr("fill", (d) => (d.key === current ? theme.ink : theme.surface)).attr("stroke", theme.ink).attr("stroke-width", 2);
  } else if (current !== null && current !== undefined && current !== "") {
    const cp = points.reduce((a, b) => (Math.abs(b.key - current) < Math.abs(a.key - current) ? b : a));
    g.append("circle").attr("cx", x(Number(current))).attr("cy", y(cp.p)).attr("r", 6).attr("fill", theme.ink).attr("stroke", theme.surface).attr("stroke-width", 2);
  }
  // hover
  const hov = g.append("circle").attr("r", 5).attr("fill", "none").attr("stroke", theme.ink).attr("stroke-width", 1.5).style("display", "none");
  g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent")
    .on("pointermove", (e) => {
      const [mx] = d3.pointer(e);
      const d = points.reduce((a, b) => (Math.abs(x(b.key) - mx) < Math.abs(x(a.key) - mx) ? b : a));
      hov.style("display", null).attr("cx", x(d.key)).attr("cy", y(d.p));
      showTip(e, `${d.label ?? d.key}<br><b>${pct(d.p, 1)}</b>`);
    })
    .on("pointerleave", () => { hov.style("display", "none"); hideTip(); });
  return svg.node();
}

// ------------------------------------------------------------------ performance figures
function gridAt(perf, thr) {
  return perf.grid.reduce((a, b) => (Math.abs(b.t - thr) < Math.abs(a.t - thr) ? b : a));
}
export { gridAt };

export function roc(el, { perf, comp, threshold, onPick, mainLabel, focus = "main" }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: comp ? 30 : 14, right: 14, bottom: 48, left: 54 };
  const height = Math.round(width * 0.8);
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.figROC, lang: o.lang });
  const x = d3.scaleLinear([0, 1], [0, w]), y = d3.scaleLinear([0, 1], [h, 0]);
  axes(g, { x, y, w, h, theme, xLabel: t.fpr, yLabel: t.tpr });
  g.append("line").attr("x1", 0).attr("y1", h).attr("x2", w).attr("y2", 0).attr("stroke", theme.axis);
  const b = perf.roc.band;
  g.append("path").datum(b.fpr.map((f, i) => [f, b.lo[i], b.hi[i]])).attr("fill", theme.model).attr("opacity", 0.1)
    .attr("d", d3.area().x((d) => x(d[0])).y0((d) => y(d[1])).y1((d) => y(d[2])));
  const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1])).curve(d3.curveStepAfter);
  if (comp) g.append("path").datum(comp.roc.fpr.map((f, i) => [f, comp.roc.tpr[i]])).attr("fill", "none").attr("stroke", theme.comp).attr("stroke-width", 2).attr("d", line);
  g.append("path").datum(perf.roc.fpr.map((f, i) => [f, perf.roc.tpr[i]])).attr("fill", "none").attr("stroke", theme.model).attr("stroke-width", 2).attr("d", line);
  const fp = focus === "comp" && comp ? comp : perf;
  const op = gridAt(fp, threshold);
  if (op.spec !== null && op.sens !== null)
    g.append("circle").attr("cx", x(1 - op.spec)).attr("cy", y(op.sens)).attr("r", 5.5).attr("fill", fp === perf ? theme.model : theme.comp).attr("stroke", theme.surface).attr("stroke-width", 2);
  const f3 = (v) => dec(v.toFixed(2));
  if (comp) {
    legend(g, [
      { kind: "line", color: theme.model, label: `${mainLabel} ${f3(perf.auc)}` },
      { kind: "line", color: theme.comp, label: `TabPFN ${f3(comp.auc)}` },
    ], theme, 0, -16);
  } else {
    g.append("text").attr("x", w - 4).attr("y", h - 10).attr("text-anchor", "end").attr("fill", theme.ink)
      .text(`AUC ${f3(perf.auc)} (${f3(perf.auc_ci[0])}–${f3(perf.auc_ci[1])})`);
  }
  // hover over operating points of the grid (focused model)
  const pts = fp.grid.filter((d) => d.sens !== null && d.spec !== null);
  const hov = g.append("circle").attr("r", 5).attr("fill", "none").attr("stroke", theme.ink).attr("stroke-width", 1.5).style("display", "none");
  g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent").style("cursor", onPick ? "pointer" : null)
    .on("pointermove", (e) => {
      const [mx, my] = d3.pointer(e);
      const d = pts.reduce((a, c) => (Math.hypot(x(1 - c.spec) - mx, y(c.sens) - my) < Math.hypot(x(1 - a.spec) - mx, y(a.sens) - my) ? c : a));
      hov.style("display", null).attr("cx", x(1 - d.spec)).attr("cy", y(d.sens));
      showTip(e, `${t.threshold} <b>${pct(d.t, 1)}</b><br>${t.sens} ${pct(d.sens)}<br>${t.spec} ${pct(d.spec)}`);
      hov.datum(d);
    })
    .on("pointerleave", () => { hov.style("display", "none"); hideTip(); })
    .on("click", () => { const d = hov.datum(); if (d && onPick) onPick(d.t); });
  return svg.node();
}

export function calibration(el, { perf, comp }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: comp ? 30 : 14, right: 14, bottom: 48, left: 54 };
  const height = Math.round(width * 0.8);
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.figCal, lang: o.lang });
  const all = [...perf.calibration.bins, ...(comp ? comp.calibration.bins : [])];
  const m = Math.min(1, Math.ceil(Math.max(...all.map((b) => Math.max(b.p, b.hi ?? b.obs))) * 10 + 0.4) / 10);
  const x = d3.scaleLinear([0, m], [0, w]), y = d3.scaleLinear([0, m], [h, 0]);
  const f = (d) => `${Math.round(d * 100)} %`;
  axes(g, { x, y, w, h, theme, xLabel: t.predicted, yLabel: t.observed, xFormat: f, yFormat: f });
  g.append("line").attr("x1", 0).attr("y1", h).attr("x2", w).attr("y2", 0).attr("stroke", theme.axis);
  const draw = (bins, color, dx) => {
    const G = g.append("g");
    G.append("path").datum(bins).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.5).attr("opacity", 0.6)
      .attr("d", d3.line().x((d) => x(d.p) + dx).y((d) => y(d.obs)));
    G.selectAll("line").data(bins).join("line").attr("x1", (d) => x(d.p) + dx).attr("x2", (d) => x(d.p) + dx)
      .attr("y1", (d) => y(d.lo)).attr("y2", (d) => y(d.hi)).attr("stroke", color).attr("stroke-width", 1.5);
    G.selectAll("circle").data(bins).join("circle").attr("cx", (d) => x(d.p) + dx).attr("cy", (d) => y(d.obs)).attr("r", 4.5)
      .attr("fill", color).attr("stroke", theme.surface).attr("stroke-width", 2)
      .on("pointermove", (e, d) => showTip(e, `${t.predicted} <b>${pct(d.p, 1)}</b><br>${t.observed} <b>${pct(d.obs, 1)}</b> (${pct(d.lo, 0)}–${pct(d.hi, 0)})<br>n = ${d.n}`))
      .on("pointerleave", hideTip);
  };
  if (comp) draw(comp.calibration.bins, theme.comp, 3);
  draw(perf.calibration.bins, theme.model, 0);
  if (comp) legend(g, [{ kind: "line", color: theme.model, label: o.mainLabel }, { kind: "line", color: theme.comp, label: "TabPFN" }], theme, 0, -16);
  return svg.node();
}

export function dca(el, { perf, comp, threshold }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: 30, right: 14, bottom: 48, left: 58 };
  const height = Math.round(width * 0.8);
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.figDCA, lang: o.lang });
  const xmax = Math.min(0.6, Math.max(0.3, Math.ceil(Math.max(perf.prevalence * 2, threshold + 0.05) * 10) / 10));
  const D = perf.dca.filter((d) => d.t <= xmax + 1e-9);
  const C = comp ? comp.dca.filter((d) => d.t <= xmax + 1e-9) : [];
  const ymax = Math.max(perf.prevalence, ...D.map((d) => d.model)) * 1.08;
  const ymin = -0.02 - ymax * 0.06;
  const x = d3.scaleLinear([0, xmax], [0, w]), y = d3.scaleLinear([ymin, ymax], [h, 0]);
  axes(g, { x, y, w, h, theme, xLabel: t.thresholdProb, yLabel: t.netBenefit, xFormat: (d) => `${Math.round(d * 100)} %`, yFormat: f2 });
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", theme.ink3).attr("stroke-width", 1.5);
  const ln = (key) => d3.line().defined((d) => d[key] >= ymin).x((d) => x(d.t)).y((d) => y(d[key]));
  g.append("path").datum(D).attr("fill", "none").attr("stroke", theme.spec).attr("stroke-width", 1.5).attr("d", ln("all"));
  if (comp) g.append("path").datum(C).attr("fill", "none").attr("stroke", theme.comp).attr("stroke-width", 2).attr("d", ln("model"));
  g.append("path").datum(D).attr("fill", "none").attr("stroke", theme.model).attr("stroke-width", 2).attr("d", ln("model"));
  if (threshold <= xmax) g.append("line").attr("x1", x(threshold)).attr("x2", x(threshold)).attr("y1", 0).attr("y2", h).attr("stroke", theme.ink3);
  const items = [{ kind: "line", color: theme.model, label: o.mainLabel }];
  if (comp) items.push({ kind: "line", color: theme.comp, label: "TabPFN" });
  items.push({ kind: "line", color: theme.spec, label: t.treatAll });
  g.append("text").attr("x", 6).attr("y", y(0) + 16).attr("fill", theme.ink2).attr("font-size", 11.5).text(t.treatNone);
  legend(g, items, theme, 0, -16);
  const hov = g.append("line").attr("y1", 0).attr("y2", h).attr("stroke", theme.ink2).style("display", "none");
  g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent")
    .on("pointermove", (e) => {
      const [mx] = d3.pointer(e);
      const d = D.reduce((a, b) => (Math.abs(x(b.t) - mx) < Math.abs(x(a.t) - mx) ? b : a));
      const c = comp ? C.find((q) => q.t === d.t) : null;
      hov.style("display", null).attr("x1", x(d.t)).attr("x2", x(d.t));
      showTip(e, `${t.thresholdProb} <b>${pct(d.t)}</b><br>${o.mainLabel} ${d.model.toFixed(3)}${c ? `<br>TabPFN ${c.model.toFixed(3)}` : ""}<br>${t.treatAll} ${d.all.toFixed(3)}`);
    })
    .on("pointerleave", () => { hov.style("display", "none"); hideTip(); });
  return svg.node();
}

export function thresholdCurves(el, { perf, threshold, onPick }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: 30, right: 14, bottom: 48, left: 54 };
  const height = Math.round(width * 0.8);
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.figThr, lang: o.lang });
  let lastNZ = 0;
  perf.hist.edges.slice(1).forEach((e, i) => { if (perf.hist.neg[i] + perf.hist.pos[i] > 0) lastNZ = e; });
  const xmax = Math.min(1, Math.max(0.3, Math.ceil(Math.max(lastNZ, threshold) * 10) / 10));
  const G = perf.grid.filter((d) => d.t <= xmax);
  const x = d3.scaleLinear([0, xmax], [0, w]), y = d3.scaleLinear([0, 1], [h, 0]);
  const f = (d) => `${Math.round(d * 100)} %`;
  axes(g, { x, y, w, h, theme, xLabel: t.threshold, xFormat: f, yFormat: f });
  const series = [{ k: "sens", color: theme.up, label: t.sens }, { k: "spec", color: theme.down, label: t.spec }];
  for (const s of series) {
    const B = G.filter((d) => d[s.k + "_ci"]);
    g.append("path").datum(B).attr("fill", s.color).attr("opacity", 0.12)
      .attr("d", d3.area().x((d) => x(d.t)).y0((d) => y(d[s.k + "_ci"][0])).y1((d) => y(d[s.k + "_ci"][1])));
    g.append("path").datum(G.filter((d) => d[s.k] !== null)).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2)
      .attr("d", d3.line().x((d) => x(d.t)).y((d) => y(d[s.k])));
  }
  g.append("line").attr("x1", x(threshold)).attr("x2", x(threshold)).attr("y1", 0).attr("y2", h).attr("stroke", theme.ink2).attr("stroke-width", 1.5);
  legend(g, series.map((s) => ({ kind: "line", color: s.color, label: s.label })), theme, 0, -16);
  const hov = g.append("line").attr("y1", 0).attr("y2", h).attr("stroke", theme.ink3).style("display", "none");
  g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent").style("cursor", onPick ? "pointer" : null)
    .on("pointermove", (e) => {
      const [mx] = d3.pointer(e);
      const d = G.reduce((a, b) => (Math.abs(x(b.t) - mx) < Math.abs(x(a.t) - mx) ? b : a));
      hov.style("display", null).attr("x1", x(d.t)).attr("x2", x(d.t)).datum(d);
      showTip(e, `${t.threshold} <b>${pct(d.t, 1)}</b><br>${t.sens} ${pct(d.sens)}<br>${t.spec} ${pct(d.spec)}<br>PPV ${pct(d.ppv)}<br>NPV ${pct(d.npv)}`);
    })
    .on("pointerleave", () => { hov.style("display", "none"); hideTip(); })
    .on("click", () => { const d = hov.datum(); if (d && onPick) onPick(d.t); });
  return svg.node();
}

export function importance(el, { values, labels }, o) {
  const { theme } = o;
  const width = o.width;
  const rowH = 26, labelW = Math.min(240, width * 0.42);
  const margin = { top: 8, right: 56, bottom: 10, left: labelW };
  const height = margin.top + margin.bottom + rowH * values.length;
  const { svg, g, w } = frame(el, { width, height, margin, theme, title: "Importance", lang: o.lang });
  const x = d3.scaleLinear([0, d3.max(values, (d) => d.value)], [0, w]);
  const R = g.selectAll("g").data(values).join("g").attr("transform", (_, i) => `translate(0,${i * rowH})`);
  R.append("text").attr("x", -10).attr("y", rowH / 2 + 4).attr("text-anchor", "end").attr("fill", theme.ink).text((d) => fit(labels[d.name] || d.name, labelW - 14));
  R.append("path").attr("fill", theme.model).attr("d", (d) => {
    const L = Math.max(2, x(d.value)), y0 = rowH / 2 - 6, hh = 12, r = Math.min(4, L / 2);
    return `M0,${y0}H${L - r}Q${L},${y0} ${L},${y0 + r}V${y0 + hh - r}Q${L},${y0 + hh} ${L - r},${y0 + hh}H0Z`;
  });
  R.append("text").attr("x", (d) => x(d.value) + 6).attr("y", rowH / 2 + 4).attr("fill", theme.ink2).attr("font-size", 11.5)
    .style("font-variant-numeric", "tabular-nums").text((d) => dec(d.value < 0.1 ? d.value.toFixed(3) : d.value.toFixed(2)));
  return svg.node();
}

// 10 x 10 icon array: colour = true status, filled = flagged
export function iconArray(el, { counts }, o) {
  const { theme, t } = o;
  const width = Math.min(o.width, 300);
  const cell = width / 10;
  const height = cell * 10;
  d3.select(el).selectAll("svg").remove();
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
    .attr("role", "img").attr("aria-label", `${counts.tp} ${t.tpL}, ${counts.fn} ${t.fnL}, ${counts.fp} ${t.fpL}, ${counts.tn} ${t.tnL}`)
    .style("max-width", "100%").style("height", "auto");
  const kinds = [...Array(counts.tp).fill("tp"), ...Array(counts.fn).fill("fn"), ...Array(counts.fp).fill("fp"), ...Array(counts.tn).fill("tn")];
  const r = cell * 0.34;
  svg.selectAll("circle").data(kinds).join("circle")
    .attr("cx", (_, i) => (i % 10) * cell + cell / 2).attr("cy", (_, i) => Math.floor(i / 10) * cell + cell / 2)
    .attr("r", (k) => (k === "fn" || k === "tn" ? r - 1 : r))
    .attr("fill", (k) => (k === "tp" ? theme.up : k === "fp" ? theme.down : "none"))
    .attr("stroke", (k) => (k === "fn" ? theme.up : k === "tn" ? theme.down : "none"))
    .attr("stroke-width", 1.8).attr("opacity", (k) => (k === "tn" ? 0.55 : 1));
  return svg.node();
}


// ------------------------------------------------------------------ precision-recall
function curveFromGrid(perf, xKey, yKey) {
  return perf.grid.filter((d) => d[xKey] !== null && d[yKey] !== null).map((d) => ({ x: d[xKey], y: d[yKey], d }))
    .sort((a, b) => a.x - b.x);
}

function focusPoint(g, x, y, perf, threshold, xKey, yKey, color, theme) {
  const d = gridAt(perf, threshold);
  if (d[xKey] === null || d[yKey] === null) return;
  g.append("circle").attr("cx", x(d[xKey])).attr("cy", y(d[yKey])).attr("r", 5.5).attr("fill", color).attr("stroke", theme.surface).attr("stroke-width", 2);
}

function hoverGrid(g, w, h, x, y, perf, xKey, yKey, theme, html, onPick) {
  const pts = curveFromGrid(perf, xKey, yKey);
  const hov = g.append("circle").attr("r", 5).attr("fill", "none").attr("stroke", theme.ink).attr("stroke-width", 1.5).style("display", "none");
  g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent").style("cursor", onPick ? "pointer" : null)
    .on("pointermove", (e) => {
      const [mx, my] = d3.pointer(e);
      const p = pts.reduce((a, c) => (Math.hypot(x(c.x) - mx, y(c.y) - my) < Math.hypot(x(a.x) - mx, y(a.y) - my) ? c : a));
      hov.style("display", null).attr("cx", x(p.x)).attr("cy", y(p.y)).datum(p.d);
      showTip(e, html(p.d));
    })
    .on("pointerleave", () => { hov.style("display", "none"); hideTip(); })
    .on("click", () => { const d = hov.datum(); if (d && onPick) onPick(d.t); });
}

export function prCurve(el, { perf, comp, threshold, onPick, mainLabel, focus = "main" }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: 30, right: 14, bottom: 48, left: 54 };
  const height = Math.round(width * 0.8);
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.figPR, lang: o.lang });
  const ymax = Math.min(1, Math.max(0.3, Math.ceil(d3.max([...curveFromGrid(perf, "sens", "ppv"), ...(comp ? curveFromGrid(comp, "sens", "ppv") : [])], (d) => d.y) * 10) / 10));
  const x = d3.scaleLinear([0, 1], [0, w]), y = d3.scaleLinear([0, ymax], [h, 0]);
  const f = (d) => `${Math.round(d * 100)} %`;
  axes(g, { x, y, w, h, theme, xLabel: t.tpr, yLabel: t.ppvShort, xFormat: f, yFormat: f });
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(perf.prevalence)).attr("y2", y(perf.prevalence)).attr("stroke", theme.ink3);
  g.append("text").attr("x", w).attr("y", y(perf.prevalence) - 5).attr("text-anchor", "end").attr("fill", theme.ink3).attr("font-size", 11).text(`${t.presetPrev} ${pct(perf.prevalence, 1)}`);
  const line = d3.line().x((d) => x(d.x)).y((d) => y(d.y));
  if (comp) g.append("path").datum(curveFromGrid(comp, "sens", "ppv")).attr("fill", "none").attr("stroke", theme.comp).attr("stroke-width", 2).attr("d", line);
  g.append("path").datum(curveFromGrid(perf, "sens", "ppv")).attr("fill", "none").attr("stroke", theme.model).attr("stroke-width", 2).attr("d", line);
  const fp = focus === "comp" && comp ? comp : perf;
  focusPoint(g, x, y, fp, threshold, "sens", "ppv", fp === perf ? theme.model : theme.comp, theme);
  if (comp) legend(g, [{ kind: "line", color: theme.model, label: mainLabel }, { kind: "line", color: theme.comp, label: "TabPFN" }], theme, 0, -16);
  hoverGrid(g, w, h, x, y, fp, "sens", "ppv", theme,
    (d) => `${t.threshold} <b>${pct(d.t, 1)}</b><br>${t.sens} ${pct(d.sens)}<br>${t.ppvShort} ${pct(d.ppv)}`, onPick);
  return svg.node();
}

// ------------------------------------------------------------------ workload vs cases detected (gain curve)
export function gainCurve(el, { perf, comp, threshold, onPick, mainLabel, focus = "main" }, o) {
  const { theme, t } = o;
  const width = o.width;
  const margin = { top: 30, right: 14, bottom: 48, left: 54 };
  const height = Math.round(width * 0.8);
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.figGain, lang: o.lang });
  const x = d3.scaleLinear([0, 1], [0, w]), y = d3.scaleLinear([0, 1], [h, 0]);
  const f = (d) => `${Math.round(d * 100)} %`;
  axes(g, { x, y, w, h, theme, xLabel: t.flaggedPct, yLabel: t.casesDetected, xFormat: f, yFormat: f });
  g.append("line").attr("x1", 0).attr("y1", h).attr("x2", w).attr("y2", 0).attr("stroke", theme.axis);
  g.append("path").datum([[0, 0], [perf.prevalence, 1], [1, 1]]).attr("fill", "none").attr("stroke", theme.ink3).attr("stroke-width", 1)
    .attr("d", d3.line().x((d) => x(d[0])).y((d) => y(d[1])));
  g.append("text").attr("x", x(perf.prevalence) + 6).attr("y", y(1) + 14).attr("fill", theme.ink3).attr("font-size", 11).text(t.perfectModel);
  const pts = (pf) => [{ x: 0, y: 0 }, ...curveFromGrid(pf, "flagged", "sens"), { x: 1, y: 1 }].sort((a, b) => a.x - b.x || a.y - b.y);
  const line = d3.line().x((d) => x(d.x)).y((d) => y(d.y));
  if (comp) g.append("path").datum(pts(comp)).attr("fill", "none").attr("stroke", theme.comp).attr("stroke-width", 2).attr("d", line);
  g.append("path").datum(pts(perf)).attr("fill", "none").attr("stroke", theme.model).attr("stroke-width", 2).attr("d", line);
  const fp = focus === "comp" && comp ? comp : perf;
  focusPoint(g, x, y, fp, threshold, "flagged", "sens", fp === perf ? theme.model : theme.comp, theme);
  const d = gridAt(fp, threshold);
  if (d.sens !== null) {
    const lab = t.gainLabel(pct(d.flagged), pct(d.sens));
    const lx = Math.min(x(d.flagged) + 10, w - textWidth(lab, 12, 600) - 4);
    g.append("text").attr("x", lx).attr("y", y(d.sens) + 18).attr("font-weight", 600).attr("fill", theme.ink)
      .attr("stroke", theme.surface).attr("stroke-width", 3).attr("paint-order", "stroke").text(lab);
  }
  if (comp) legend(g, [{ kind: "line", color: theme.model, label: mainLabel }, { kind: "line", color: theme.comp, label: "TabPFN" }], theme, 0, -16);
  hoverGrid(g, w, h, x, y, fp, "flagged", "sens", theme,
    (q) => `${t.threshold} <b>${pct(q.t, 1)}</b><br>${t.flaggedPct} ${pct(q.flagged)}<br>${t.casesDetected} ${pct(q.sens)}`, onPick);
  return svg.node();
}

// ------------------------------------------------------------------ risk zones
export function zonesChart(el, { zones }, o) {
  const { theme, t } = o;
  const width = o.width;
  const labelW = Math.min(170, Math.max(110, width * 0.26));
  const margin = { top: 30, right: 56, bottom: 12, left: labelW };
  const rowH = 30;
  const height = margin.top + 34 + 40 + rowH * zones.length + margin.bottom;
  const { svg, g, w } = frame(el, { width, height, margin, theme, title: t.zonesTitle, lang: o.lang });
  const col = { low: theme.down, mid: theme.spec, high: theme.up };
  // row 1: share of relatives in each zone (100 % stacked)
  g.append("text").attr("x", -labelW).attr("y", -10).attr("font-weight", 600).attr("fill", theme.ink).text(t.zoneShare);
  let acc = 0;
  const x = d3.scaleLinear([0, 1], [0, w]);
  for (const z of zones) {
    const x0 = x(acc), x1 = x(acc + z.share);
    g.append("rect").attr("x", x0 + (acc > 0 ? 1 : 0)).attr("y", 0).attr("width", Math.max(0, x1 - x0 - (acc > 0 ? 1 : 0) - (acc + z.share < 0.999 ? 1 : 0))).attr("height", 22)
      .attr("rx", 3).attr("fill", col[z.key]).attr("opacity", z.key === "mid" ? 0.55 : 0.9)
      .on("pointermove", (e) => showTip(e, `<b>${z.label}</b><br>${pct(z.share)} ${t.ofRelatives}<br>${t.zoneObs}: ${pct(z.obs)} (${z.events}/${z.n})`))
      .on("pointerleave", hideTip);
    const lab = pct(z.share);
    if (x1 - x0 > textWidth(lab, 12, 600) + 12)
      g.append("text").attr("x", (x0 + x1) / 2).attr("y", 15).attr("text-anchor", "middle").attr("font-weight", 600)
        .attr("fill", z.key === "mid" ? theme.ink : "#ffffff").text(lab);
    acc += z.share;
  }
  // rows: observed PTSD rate per zone, with Wilson CI
  const top = 34 + 40;
  g.append("text").attr("x", -labelW).attr("y", top - 26).attr("font-weight", 600).attr("fill", theme.ink).text(t.zoneObs);
  const xr = d3.scaleLinear([0, Math.min(1, Math.max(0.2, Math.ceil(d3.max(zones, (z) => z.ci[1]) * 10) / 10))], [0, w]);
  xr.ticks(5).forEach((v) => {
    g.append("line").attr("x1", xr(v)).attr("x2", xr(v)).attr("y1", top - 4).attr("y2", top + rowH * zones.length).attr("stroke", theme.grid);
    if (v > 0) g.append("text").attr("x", xr(v)).attr("y", top - 10).attr("text-anchor", "middle").attr("fill", theme.ink3).attr("font-size", 11).text(`${Math.round(v * 100)} %`);
  });
  zones.forEach((z, i) => {
    const yy = top + i * rowH + rowH / 2;
    g.append("text").attr("x", -12).attr("y", yy + 4).attr("text-anchor", "end").attr("fill", theme.ink).text(z.label);
    g.append("path").attr("fill", col[z.key]).attr("opacity", z.key === "mid" ? 0.55 : 0.9).attr("d", () => {
      const L = Math.max(2, xr(z.obs)), y0 = yy - 6, hh = 12, r = Math.min(4, L / 2);
      return `M0,${y0}H${L - r}Q${L},${y0} ${L},${y0 + r}V${y0 + hh - r}Q${L},${y0 + hh} ${L - r},${y0 + hh}H0Z`;
    });
    g.append("line").attr("x1", xr(z.ci[0])).attr("x2", xr(z.ci[1])).attr("y1", yy).attr("y2", yy).attr("stroke", theme.ink).attr("stroke-width", 1.5);
    g.append("text").attr("x", xr(z.ci[1]) + 6).attr("y", yy + 4).attr("fill", theme.ink2).attr("font-size", 11.5).text(pct(z.obs));
  });
  return svg.node();
}

// ------------------------------------------------------------------ SHAP dependence (small multiples)
export function dependence(el, { profiles, labels, levelLabel }, o) {
  const { theme, t } = o;
  const width = o.width;
  const cols = width > 760 ? 3 : width > 460 ? 2 : 1;
  const gap = 28, panelW = (width - gap * (cols - 1)) / cols, panelH = 168;
  const pm = { top: 26, right: 6, bottom: 44, left: 40 };
  const rows = Math.ceil(profiles.length / cols);
  const height = rows * (panelH + 18);
  d3.select(el).selectAll("svg").remove();
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
    .attr("font-family", FONT).attr("font-size", 12).attr("fill", theme.ink).attr("role", "img").attr("aria-label", t.depTitle)
    .style("max-width", "100%").style("height", "auto");
  if (o.lang) LANG = o.lang;
  svg.append("rect").attr("width", width).attr("height", height).attr("fill", theme.surface);
  const m = d3.max(profiles.flatMap((p) => p.groups.map((gr) => Math.abs(gr.mean)))) || 0.1;
  const ydom = [-m * 1.15, m * 1.15];
  profiles.forEach((pr, i) => {
    const gx = (i % cols) * (panelW + gap), gy = Math.floor(i / cols) * (panelH + 18);
    const g = svg.append("g").attr("transform", `translate(${gx + pm.left},${gy + pm.top})`);
    const w = panelW - pm.left - pm.right, h = panelH - pm.top - pm.bottom;
    g.append("text").attr("x", -pm.left).attr("y", -10).attr("font-weight", 600).text(fit(labels[pr.name] || pr.name, panelW - 8, 12));
    const x = d3.scaleBand(pr.groups.map((_, k) => k), [0, w]).padding(0.25);
    const y = d3.scaleLinear(ydom, [h, 0]);
    y.ticks(3).forEach((v) => g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", theme.grid));
    g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", theme.axis);
    const ya = g.append("g").call(d3.axisLeft(y).ticks(3).tickSize(0).tickFormat((v) => dec(d3.format("+.1~f")(v))));
    ya.select(".domain").remove();
    ya.selectAll(".tick text").attr("fill", theme.ink3).attr("font-size", 10.5).attr("x", -4);
    const bw = Math.min(22, x.bandwidth());
    pr.groups.forEach((gr, k) => {
      const cx = x(k) + x.bandwidth() / 2;
      g.append("rect").attr("x", cx - bw / 2).attr("width", bw).attr("y", Math.min(y(0), y(gr.mean))).attr("height", Math.max(1, Math.abs(y(gr.mean) - y(0))))
        .attr("rx", 2).attr("fill", gr.mean >= 0 ? theme.up : theme.down).attr("opacity", gr.missing ? 0.45 : 0.9);
      g.append("rect").attr("x", x(k)).attr("width", x.bandwidth()).attr("y", 0).attr("height", h).attr("fill", "transparent")
        .on("pointermove", (e) => showTip(e, `<b>${labels[pr.name] || pr.name}</b><br>${levelLabel(pr.name, gr)}<br>${t.depMean} ${dec((gr.mean >= 0 ? "+" : "") + gr.mean.toFixed(3))} (odds ×${dec(Math.exp(gr.mean).toFixed(2))})<br>n = ${gr.n}`))
        .on("pointerleave", hideTip);
    });
    // x labels: thinned to avoid overlap
    const labs = pr.groups.map((gr) => levelLabel(pr.name, gr));
    const maxW = d3.max(labs, (l) => textWidth(l, 10.5)) || 0;
    const step = Math.max(1, Math.ceil((maxW + 6) / x.step()));
    const rotate = step > 1 && pr.groups.length <= 6;
    labs.forEach((l, k) => {
      if (!rotate && k % step) return;
      const tx = g.append("text").attr("x", x(k) + x.bandwidth() / 2).attr("y", h + 14).attr("text-anchor", rotate ? "end" : "middle")
        .attr("fill", theme.ink2).attr("font-size", 10.5).attr("font-style", pr.groups[k].missing ? "italic" : null)
        .text(rotate ? fit(l, 70, 10.5) : l);
      if (rotate) tx.attr("transform", `rotate(-30,${x(k) + x.bandwidth() / 2},${h + 14})`);
    });
  });
  return svg.node();
}

// ------------------------------------------------------------------ coefficient plot (logistic regression)
export function coefPlot(el, { rows }, o) {
  const { theme, t } = o;
  const width = o.width;
  const rowH = 24, labelW = Math.min(250, Math.max(130, width * 0.4));
  const margin = { top: 10, right: 60, bottom: 40, left: labelW };
  const height = margin.top + margin.bottom + rowH * rows.length;
  const { svg, g, w, h } = frame(el, { width, height, margin, theme, title: t.coefTitle, lang: o.lang });
  const m = d3.max(rows, (r) => Math.abs(r.value)) * 1.1 || 0.1;
  const x = d3.scaleLinear([-m, m], [0, w]);
  x.ticks(5).forEach((v) => g.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", 0).attr("y2", h).attr("stroke", theme.grid));
  g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h).attr("stroke", theme.axis);
  const xa = g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(4).tickFormat((v) => dec(d3.format("+.2~f")(v))));
  xa.select(".domain").attr("stroke", theme.axis);
  xa.selectAll(".tick line").attr("stroke", theme.axis);
  xa.selectAll(".tick text").attr("fill", theme.ink2).attr("font-size", 11);
  g.append("text").attr("x", w / 2).attr("y", h + 34).attr("text-anchor", "middle").attr("fill", theme.ink2).text(t.coefAxis);
  const R = g.selectAll("g.r").data(rows).join("g").attr("transform", (_, i) => `translate(0,${i * rowH})`);
  R.append("text").attr("x", -10).attr("y", rowH / 2 + 4).attr("text-anchor", "end").attr("fill", theme.ink).text((r) => fit(r.label, labelW - 14));
  R.append("line").attr("x1", x(0)).attr("x2", (r) => x(r.value)).attr("y1", rowH / 2).attr("y2", rowH / 2)
    .attr("stroke", (r) => (r.value >= 0 ? theme.up : theme.down)).attr("stroke-width", 2);
  R.append("circle").attr("cx", (r) => x(r.value)).attr("cy", rowH / 2).attr("r", 4.5)
    .attr("fill", (r) => (r.value >= 0 ? theme.up : theme.down)).attr("stroke", theme.surface).attr("stroke-width", 2);
  R.append("text").attr("x", w + 8).attr("y", rowH / 2 + 4).attr("fill", theme.ink2).attr("font-size", 11).text((r) => `×${dec(Math.exp(r.value).toFixed(2))}`);
  R.append("rect").attr("x", -labelW).attr("width", labelW + w + margin.right).attr("height", rowH).attr("fill", "transparent")
    .on("pointermove", (e, r) => showTip(e, `<b>${r.label}</b><br>${t.coefAxis}: ${dec(r.value.toFixed(3))}<br>odds ×${dec(Math.exp(r.value).toFixed(2))} ${t.perSD}`))
    .on("pointerleave", hideTip);
  return svg.node();
}
