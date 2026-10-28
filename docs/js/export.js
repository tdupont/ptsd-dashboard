// Figure export: redraws a chart in the light (print) theme at a fixed width,
// then downloads it as SVG (font embedded) or as a 300-dpi PNG. Also CSV for the underlying data.

import { LIGHT } from "./charts.js";

const FIG_WIDTH = 540; // px in the SVG coordinate system: 540 px = 5.6 in at 96 px/in
const DPI = 300;
let fontCss = null;

async function embeddedFontCss() {
  if (fontCss !== null) return fontCss;
  const faces = ["fonts/libre-franklin-latin-wght-normal.woff2"]; // variable font: all weights
  try {
    const parts = await Promise.all(faces.map(async (url) => {
      const buf = await (await fetch(url)).arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:'Libre Franklin';font-weight:100 900;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
    }));
    fontCss = parts.join("");
  } catch {
    fontCss = "";
  }
  return fontCss;
}

function renderOffscreen(draw) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:" + FIG_WIDTH + "px";
  document.body.appendChild(host);
  const node = draw(host, { theme: LIGHT, width: FIG_WIDTH });
  return { host, node };
}

function save(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function svgString(node) {
  const clone = node.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("[style*='cursor']").forEach((n) => n.style.removeProperty("cursor"));
  const css = await embeddedFontCss();
  if (css) {
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

export async function exportSVG(draw, name) {
  const { host, node } = renderOffscreen(draw);
  const s = await svgString(node);
  host.remove();
  save(new Blob([s], { type: "image/svg+xml" }), `${name}.svg`);
}

export async function exportPNG(draw, name) {
  const { host, node } = renderOffscreen(draw);
  const vb = node.viewBox.baseVal;
  const s = await svgString(node);
  host.remove();
  const scale = DPI / 96;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vb.width * scale);
  canvas.height = Math.round(vb.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  save(await withDpi(blob, DPI), `${name}.png`);
}

// Canvas PNGs carry no resolution; add a pHYs chunk so the file opens at 300 dpi in Word/Illustrator.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function withDpi(blob, dpi) {
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 25; // signature + IHDR (4 len + 4 type + 13 data + 4 crc)
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(src.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return new Blob([out], { type: "image/png" });
}

export async function exportCSV(rows, name) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const s = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  save(new Blob([s], { type: "text/csv" }), `${name}.csv`);
}
