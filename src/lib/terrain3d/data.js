// Carrega as cenas 3D geradas por pipeline/build_terrain3d.py (data/terrain/).
// O relevo vem em PNG RGB com 16 bits divididos em R (byte alto) e G (byte baixo).
import { dataUrl } from "../format.js";
import { T, localizeData } from "../i18n.js";

const cache = new Map();

export const BODIES = {
  mars: { get label() { return T("Marte", "Mars"); }, radius: 3396190, g: 3.721, day_h: 24.66, sky: ["#d7a477", "#8a5a3c"], fog: "#c99a72", ambient: 0.32, ambientColor: "#f0c9a0", sunColor: "#fff1dc", sunI: 2.6 },
  moon: { get label() { return T("Lua", "Moon"); }, radius: 1737400, g: 1.62, day_h: 708.7, sky: ["#000000", "#05070a"], fog: "#000000", ambient: 0.08, ambientColor: "#9fb0c8", sunColor: "#ffffff", sunI: 3.2 },
  earth: { get label() { return T("Terra", "Earth"); }, radius: 6371008, g: 9.807, day_h: 24, sky: ["#8fb7dc", "#d9e7f2"], fog: "#c7d9e8", ambient: 0.45, ambientColor: "#cfe2ff", sunColor: "#fff6e6", sunI: 2.4 },
};

export async function loadIndex() {
  const r = await fetch(dataUrl("data/terrain/index.json"), { cache: "no-cache" });
  if (!r.ok) throw new Error("data/terrain/index.json — rode/run pipeline/build_terrain3d.py");
  return localizeData(await r.json());
}

async function loadImage(url, opts) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return createImageBitmap(await r.blob(), opts);
}

/** Cena completa: metadados + alturas (Float32Array em metros) + imagem (ImageBitmap ou null). */
export function loadScene(id) {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const base = dataUrl(`data/terrain/${id}`);
    const meta = await (await fetch(`${base}.json`, { cache: "no-cache" })).json();
    // nome e grupo da cena seguem o idioma escolhido (a cena fica em cache)
    for (const k of ["name", "group"]) {
      if (typeof meta[k] !== "string") continue;
      const pt = meta[k];
      Object.defineProperty(meta, k, { get: () => T(pt), enumerable: true, configurable: true });
    }
    const hm = await loadImage(dataUrl(`data/terrain/${meta.height.file}`), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const n = hm.width;
    const cv = new OffscreenCanvas(n, n);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(hm, 0, 0);
    const px = ctx.getImageData(0, 0, n, n).data;
    const heights = new Float32Array(n * n);
    const { min, max } = meta.height;
    const k = (max - min) / 65535;
    for (let i = 0; i < n * n; i++) heights[i] = min + (px[i * 4] * 256 + px[i * 4 + 1]) * k;
    const color = meta.color ? await loadImage(dataUrl(`data/terrain/${meta.color.file}`), { imageOrientation: "flipY" }).catch(() => null) : null;
    const minerals = meta.minerals ? await loadImage(dataUrl(`data/terrain/${meta.minerals.file}`), { imageOrientation: "flipY", premultiplyAlpha: "none" }).catch(() => null) : null;
    return { meta, heights, n, color, minerals, body: BODIES[meta.body] };
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}

/** Altura bilinear em (u, v) 0..1 (u leste, v sul). */
export function heightAt(scene, u, v) {
  const { heights, n } = scene;
  const x = Math.min(Math.max(u * n - 0.5, 0), n - 1.001);
  const y = Math.min(Math.max(v * n - 0.5, 0), n - 1.001);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const i = y0 * n + x0;
  const a = heights[i], b = heights[i + 1], c = heights[i + n], d = heights[i + n + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Declividade (graus) em (u, v), por diferenças centrais. */
export function slopeAt(scene, u, v) {
  const { n, meta } = scene;
  const e = 1 / n, res = meta.size_m / n;
  const dx = (heightAt(scene, u + e, v) - heightAt(scene, u - e, v)) / (2 * res);
  const dy = (heightAt(scene, u, v + e) - heightAt(scene, u, v - e)) / (2 * res);
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
}

/** Declividade por pixel (graus) — usada pela camada de trafegabilidade. */
export function slopeGrid(scene) {
  if (scene._slope) return scene._slope;
  const { heights, n, meta } = scene;
  const res = meta.size_m / n;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const xl = Math.max(x - 1, 0), xr = Math.min(x + 1, n - 1), yu = Math.max(y - 1, 0), yd = Math.min(y + 1, n - 1);
      const dx = (heights[y * n + xr] - heights[y * n + xl]) / ((xr - xl) * res);
      const dy = (heights[yd * n + x] - heights[yu * n + x]) / ((yd - yu) * res);
      out[y * n + x] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
    }
  }
  scene._slope = out;
  return out;
}

/** (u, v) -> lat/lon pela inversa da projeção azimutal equidistante esférica centrada no sítio. */
export function uvToLatLon(scene, u, v) {
  const { meta, body } = scene;
  const x = (u - 0.5) * meta.size_m, y = (0.5 - v) * meta.size_m;
  const R = body.radius, rho = Math.hypot(x, y), c = rho / R;
  const la0 = (meta.lat * Math.PI) / 180, lo0 = (meta.lon * Math.PI) / 180;
  if (rho < 1e-9) return { lat: meta.lat, lon: meta.lon };
  const lat = Math.asin(Math.cos(c) * Math.sin(la0) + (y * Math.sin(c) * Math.cos(la0)) / rho);
  const lon = lo0 + Math.atan2(x * Math.sin(c), rho * Math.cos(la0) * Math.cos(c) - y * Math.sin(la0) * Math.sin(c));
  let lonDeg = (lon * 180) / Math.PI;
  lonDeg = ((lonDeg + 540) % 360) - 180;
  return { lat: (lat * 180) / Math.PI, lon: lonDeg };
}

/** Perfil de elevação entre dois pontos (u, v). */
export function profile(scene, a, b, samples = 160) {
  const pts = [];
  const len = Math.hypot(b.u - a.u, b.v - a.v) * scene.meta.size_m;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = a.u + (b.u - a.u) * t, v = a.v + (b.v - a.v) * t;
    pts.push({ d: len * t, h: heightAt(scene, u, v) });
  }
  let up = 0, down = 0, maxSlope = 0;
  for (let i = 1; i < pts.length; i++) {
    const dh = pts[i].h - pts[i - 1].h;
    if (dh > 0) up += dh; else down -= dh;
    maxSlope = Math.max(maxSlope, (Math.atan(Math.abs(dh) / (len / samples)) * 180) / Math.PI);
  }
  return { pts, len, up, down, maxSlope };
}
