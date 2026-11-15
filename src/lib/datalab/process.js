// Laboratório de dados — operações de processamento sobre o relevo real (DEM) e a imagem de uma cena.
// Tudo determinístico (semente fixa) para que a mesma escolha gere sempre o mesmo resultado.
// Resolução (média em blocos), ruído gaussiano, lacunas (manchas sem dado), suavização, Sobel, textura e declividade.

const RAD = Math.PI / 180;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** Recorta a janela central (frac do lado) — a célula de 5 km numa cena de 10 km. */
export function crop(heights, n, frac = 0.5) {
  const a = Math.round((n * (1 - frac)) / 2), m = Math.round(n * frac), out = new Float32Array(m * m);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) out[y * m + x] = heights[(a + y) * n + a + x];
  return { h: out, n: m };
}

/**
 * Pipeline: { res (m), noise (m), gaps (0..1), smooth (px) } aplicado a h (n×n, resolução r0).
 * Tudo acontece na grade do "sensor" (pixel = res): média em blocos → filtro → ruído → lacunas.
 * Devolve a grade grossa (para as medidas, na resolução certa) e uma versão ampliada (bilinear) para exibir.
 */
export function processDEM(h, n, r0, opt) {
  const k = Math.max(1, Math.round((opt.res || r0) / r0)), m = Math.ceil(n / k);
  let c = new Float32Array(m * m);
  for (let by = 0; by < m; by++) for (let bx = 0; bx < m; bx++) {
    let s = 0, q = 0;
    for (let y = by * k; y < Math.min(n, by * k + k); y++) for (let x = bx * k; x < Math.min(n, bx * k + k); x++) { s += h[y * n + x]; q++; }
    c[by * m + bx] = s / q;
  }
  const sr = Math.round(opt.smooth || 0);
  if (sr > 0) for (let pass = 0; pass < 2; pass++) c = boxBlur(c, m, sr);
  if (opt.noise > 0) { const r = rng(1234); for (let i = 0; i < c.length; i++) c[i] += gauss(r) * opt.noise; }
  const cvalid = new Uint8Array(m * m).fill(1);
  if (opt.gaps > 0) {
    const r = rng(99), target = opt.gaps * m * m;
    let holes = 0, guard = 0;
    while (holes < target && guard++ < 4000) {
      const cx = r() * m, cy = r() * m, rad = Math.max(0.8, m * (0.02 + r() * 0.07));
      for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(m, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(m, cx + rad); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < rad * rad && cvalid[y * m + x]) { cvalid[y * m + x] = 0; holes++; }
      }
    }
    for (let i = 0; i < c.length; i++) if (!cvalid[i]) c[i] = NaN;
  }
  // ampliação para exibir: bilinear entre centros de bloco; lacuna = vizinho mais próximo
  const out = new Float32Array(n * n), valid = new Uint8Array(n * n);
  const g = (x, y) => c[Math.max(0, Math.min(m - 1, y)) * m + Math.max(0, Math.min(m - 1, x))];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, bx = Math.min(m - 1, Math.floor(x / k)), by = Math.min(m - 1, Math.floor(y / k));
    if (!cvalid[by * m + bx]) { out[i] = NaN; continue; }
    valid[i] = 1;
    if (k === 1) { out[i] = c[by * m + bx]; continue; }
    const fx = (x + 0.5) / k - 0.5, fy = (y + 0.5) / k - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const v = [g(x0, y0), g(x0 + 1, y0), g(x0, y0 + 1), g(x0 + 1, y0 + 1)];
    if (v.some(Number.isNaN)) { out[i] = c[by * m + bx]; continue; }
    out[i] = (v[0] * (1 - ax) + v[1] * ax) * (1 - ay) + (v[2] * (1 - ax) + v[3] * ax) * ay;
  }
  return { h: out, n, valid, k, res: r0 * k, coarse: c, m };
}

function boxBlur(a, n, r) {
  const t = new Float32Array(n * n), o = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, c = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < n) { s += a[y * n + xx]; c++; } } t[y * n + x] = s / c;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, c = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < n) { s += t[yy * n + x]; c++; } } o[y * n + x] = s / c;
  }
  return o;
}

const at = (h, n, x, y) => h[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))];

/** Declividade (graus) e componentes do gradiente pelo método de Horn (1981). */
export function slopeMap(h, n, res) {
  const s = new Float32Array(n * n), gx = new Float32Array(n * n), gy = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = at(h, n, x - 1, y - 1), b = at(h, n, x, y - 1), c = at(h, n, x + 1, y - 1), d = at(h, n, x - 1, y), f = at(h, n, x + 1, y),
      g = at(h, n, x - 1, y + 1), hh = at(h, n, x, y + 1), i = at(h, n, x + 1, y + 1);
    const dx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * res), dy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * res);
    const j = y * n + x;
    gx[j] = dx; gy[j] = dy; s[j] = Math.atan(Math.hypot(dx, dy)) / RAD;
  }
  return { s, gx, gy };
}

/** Relevo sombreado (luz do noroeste, 45°). */
export function hillshade(h, n, res, az = 315, el = 45) {
  const { gx, gy } = slopeMap(h, n, res), out = new Float32Array(n * n);
  const zen = (90 - el) * RAD, azr = ((360 - az + 90) % 360) * RAD;
  for (let i = 0; i < n * n; i++) {
    const sl = Math.atan(Math.hypot(gx[i], gy[i])), asp = Math.atan2(gy[i], -gx[i]);
    out[i] = Math.max(0, Math.cos(zen) * Math.cos(sl) + Math.sin(zen) * Math.sin(sl) * Math.cos(azr - asp));
  }
  return out;
}

/** Magnitude de Sobel sobre o próprio DEM (bordas = quebras de relevo: bordas de cratera, cristas, escarpas). */
export function sobel(h, n) {
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gx = -at(h, n, x - 1, y - 1) - 2 * at(h, n, x - 1, y) - at(h, n, x - 1, y + 1) + at(h, n, x + 1, y - 1) + 2 * at(h, n, x + 1, y) + at(h, n, x + 1, y + 1);
    const gy = -at(h, n, x - 1, y - 1) - 2 * at(h, n, x, y - 1) - at(h, n, x + 1, y - 1) + at(h, n, x - 1, y + 1) + 2 * at(h, n, x, y + 1) + at(h, n, x + 1, y + 1);
    out[y * n + x] = Math.hypot(gx, gy);
  }
  return out;
}

/** Textura: desvio-padrão local numa janela (2w+1)² — a "rugosidade" vista pixel a pixel. */
export function texture(h, n, w = 2) {
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, s2 = 0, c = 0;
    for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) { const v = at(h, n, x + dx, y + dy); if (!Number.isNaN(v)) { s += v; s2 += v * v; c++; } }
    out[y * n + x] = c > 2 ? Math.sqrt(Math.max(0, s2 / c - (s / c) ** 2)) : NaN;
  }
  return out;
}

/**
 * As três medidas do ARA sobre o DEM processado, ignorando lacunas.
 * Igual ao pipeline: média em blocos de 100 m (ou do próprio pixel, se o dado for mais grosso que 100 m).
 */
export function metrics(h, n, res) {
  const k = Math.max(1, Math.round(100 / res)), m = Math.floor(n / k), r = res * k;
  const w = new Float64Array(m * m).fill(NaN);
  let validBlocks = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    let s = 0, c = 0;
    for (let di = 0; di < k; di++) for (let dj = 0; dj < k; dj++) { const v = h[(i * k + di) * n + j * k + dj]; if (!Number.isNaN(v)) { s += v; c++; } }
    if (c >= (k * k) / 2) { w[i * m + j] = s / c; validBlocks++; }
  }
  const get = (i, j) => (i < 0 || j < 0 || i >= m || j >= m ? NaN : w[i * m + j]);
  let slope = 0, ns = 0, rough = 0, nr = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const v = get(i, j); if (Number.isNaN(v)) continue;
    if (v < lo) lo = v; if (v > hi) hi = v;
    const l = get(i, j - 1), rr = get(i, j + 1), u = get(i - 1, j), d = get(i + 1, j);
    const gx = !Number.isNaN(l) && !Number.isNaN(rr) ? (rr - l) / (2 * r) : !Number.isNaN(rr) ? (rr - v) / r : !Number.isNaN(l) ? (v - l) / r : NaN;
    const gy = !Number.isNaN(u) && !Number.isNaN(d) ? (d - u) / (2 * r) : !Number.isNaN(d) ? (d - v) / r : !Number.isNaN(u) ? (v - u) / r : NaN;
    if (!Number.isNaN(gx) && !Number.isNaN(gy)) { slope += Math.atan(Math.hypot(gx, gy)) / RAD; ns++; }
    let s1 = 0, s2 = 0, c = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const q = get(i + di, j + dj); if (!Number.isNaN(q)) { s1 += q; s2 += q * q; c++; } }
    if (c >= 5) { rough += Math.sqrt(Math.max(0, s2 / c - (s1 / c) ** 2)); nr++; }
  }
  return { slope_mean_deg: ns ? slope / ns : NaN, roughness_mean_m: nr ? rough / nr : NaN, relief_m: hi - lo, res_m: r, coverage: validBlocks / (m * m) };
}

/** Perfil de alturas ao longo da linha do meio (para sonificação e descrição). */
export function midProfile(h, n, samples = 64) {
  const y = Math.floor(n / 2), out = [];
  for (let i = 0; i < samples; i++) out.push(h[y * n + Math.min(n - 1, Math.floor((i / (samples - 1)) * (n - 1)))]);
  return out;
}

/** Pinta um campo escalar num ImageData (paleta: cinza, ou cor por rampa). Lacunas em xadrez. */
export function paint(ctx, field, n, { lo, hi, ramp = "gray", valid } = {}) {
  const img = ctx.createImageData(n, n), d = img.data;
  if (lo == null || hi == null) {
    lo = Infinity; hi = -Infinity;
    for (const v of field) if (!Number.isNaN(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const R = RAMPS[ramp];
  for (let i = 0; i < n * n; i++) {
    const v = field[i], o = i * 4;
    if (Number.isNaN(v) || (valid && !valid[i])) {
      const x = i % n, y = (i / n) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 70 : 40;
      d[o] = c; d[o + 1] = c; d[o + 2] = c + 10; d[o + 3] = 255; continue;
    }
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
    const [r, g, b] = R(t);
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
const lerp = (a, b, t) => a + (b - a) * t;
const RAMPS = {
  gray: (t) => [t * 255, t * 255, t * 255],
  heat: (t) => [lerp(20, 255, Math.min(1, t * 1.6)), lerp(30, 220, Math.max(0, t - 0.35) / 0.65), lerp(60, 120, Math.max(0, t - 0.7) / 0.3)],
  slope: (t) => (t < 0.33 ? [lerp(40, 120, t * 3), lerp(140, 200, t * 3), 110] : t < 0.66 ? [lerp(120, 250, (t - 0.33) * 3), lerp(200, 200, 0), lerp(110, 60, (t - 0.33) * 3)] : [lerp(250, 200, (t - 0.66) * 3), lerp(200, 40, (t - 0.66) * 3), 50]),
  edge: (t) => [lerp(5, 255, Math.sqrt(t)), lerp(15, 210, Math.sqrt(t)), lerp(25, 90, Math.sqrt(t))],
};
