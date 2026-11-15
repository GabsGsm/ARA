// Testar qualquer lugar da Terra, ao vivo, no navegador.
// Baixa os Terrain Tiles (AWS, Terrarium) e o Esri World Imagery do ponto escolhido, monta uma cena
// de 10 × 10 km igual às do pipeline e calcula as mesmas três medidas do ARA a 100 m na célula de 5 km.
import { BODIES } from "./data.js";
import { T } from "../i18n.js";

const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ESRI = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const R_EARTH = 6371008;

async function tileImage(url) {
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error(`tile ${r.status}`);
  return createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
}

/** Mosaico Web Mercator de uma área; devolve uma função de amostragem bilinear (lon, lat) -> canais. */
async function mosaic(urlFn, z, lonMin, lonMax, latMin, latMax, onProgress) {
  const n = 2 ** z;
  const tx = (lon) => ((lon + 180) / 360) * n;
  const ty = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n; };
  const x0 = Math.floor(tx(lonMin)), x1 = Math.floor(tx(lonMax)), y0 = Math.floor(ty(latMax)), y1 = Math.floor(ty(latMin));
  const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256;
  const cv = new OffscreenCanvas(W, H), ctx = cv.getContext("2d", { willReadFrequently: true });
  const jobs = [];
  let done = 0;
  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    jobs.push(tileImage(urlFn(z, x, y)).then((im) => { ctx.drawImage(im, (x - x0) * 256, (y - y0) * 256); onProgress?.(++done / total); }));
  }
  await Promise.all(jobs);
  const px = ctx.getImageData(0, 0, W, H).data;
  return (lon, lat, out) => {
    const fx = (tx(lon) - x0) * 256 - 0.5, fy = (ty(lat) - y0) * 256 - 0.5;
    const ix = Math.max(0, Math.min(W - 2, Math.floor(fx))), iy = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const ax = fx - ix, ay = fy - iy;
    for (let c = 0; c < 3; c++) {
      const i = (iy * W + ix) * 4 + c;
      out[c] = (px[i] * (1 - ax) + px[i + 4] * ax) * (1 - ay) + (px[i + W * 4] * (1 - ax) + px[i + W * 4 + 4] * ax) * ay;
    }
    return out;
  };
}

/** Grade azimutal equidistante esférica (n × n, linha 0 = norte), como no pipeline. */
function grid(lat0, lon0, size, n) {
  const la0 = (lat0 * Math.PI) / 180, lo0 = (lon0 * Math.PI) / 180, step = size / n;
  const lat = new Float64Array(n * n), lon = new Float64Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = (c + 0.5) * step - size / 2, y = size / 2 - (r + 0.5) * step;
    const rho = Math.hypot(x, y), k = rho / R_EARTH;
    let la = la0, lo = lo0;
    if (rho > 1e-9) {
      la = Math.asin(Math.cos(k) * Math.sin(la0) + (y * Math.sin(k) * Math.cos(la0)) / rho);
      lo = lo0 + Math.atan2(x * Math.sin(k), rho * Math.cos(la0) * Math.cos(k) - y * Math.sin(la0) * Math.sin(k));
    }
    lat[r * n + c] = (la * 180) / Math.PI; lon[r * n + c] = (lo * 180) / Math.PI;
  }
  return { lat, lon };
}

/** As três medidas do ARA (iguais a pipeline/build_terrain3d.py: média em blocos de ~100 m na célula central). */
export function araMetrics(heights, n, res, innerFrac = 0.5) {
  const a = Math.round((n * (1 - innerFrac)) / 2), b = Math.round((n * (1 + innerFrac)) / 2);
  const k = Math.max(1, Math.round(100 / res)), m = Math.floor((b - a) / k);
  const w = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    let s = 0;
    for (let di = 0; di < k; di++) for (let dj = 0; dj < k; dj++) s += heights[(a + i * k + di) * n + (a + j * k + dj)];
    w[i * m + j] = s / (k * k);
  }
  const r = res * k;
  let slope = 0, rough = 0, lo = Infinity, hi = -Infinity;
  const at = (i, j) => w[Math.max(0, Math.min(m - 1, i)) * m + Math.max(0, Math.min(m - 1, j))];
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const gx = (j === 0 ? at(i, 1) - at(i, 0) : j === m - 1 ? at(i, j) - at(i, j - 1) : (at(i, j + 1) - at(i, j - 1)) / 2) / r;
    const gy = (i === 0 ? at(1, j) - at(0, j) : i === m - 1 ? at(i, j) - at(i - 1, j) : (at(i + 1, j) - at(i - 1, j)) / 2) / r;
    slope += (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    let s1 = 0, s2 = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const v = at(i + di, j + dj); s1 += v; s2 += v * v; }
    rough += Math.sqrt(Math.max(0, s2 / 9 - (s1 / 9) ** 2));
    const v = w[i * m + j]; if (v < lo) lo = v; if (v > hi) hi = v;
  }
  return { slope_mean_deg: slope / (m * m), roughness_mean_m: rough / (m * m), relief_m: hi - lo, res_m: r };
}

/** Monta a cena (mesmo formato de loadScene) para (lat, lon). onProgress(texto, 0..1). */
export async function buildLiveScene(lat, lon, name, onProgress) {
  const size = 10000, n = 512, nc = 1024;
  const dLat = (size * 0.75) / 111320, dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
  const z = Math.abs(lat) > 70 ? 12 : 14;
  onProgress?.(T("Baixando relevo (AWS Terrain Tiles)…", "Downloading relief (AWS Terrain Tiles)…"), 0);
  const dem = await mosaic(TERRARIUM, z, lon - dLon, lon + dLon, lat - dLat, lat + dLat, (f) => onProgress?.(T("Baixando relevo (AWS Terrain Tiles)…", "Downloading relief (AWS Terrain Tiles)…"), f * 0.5));
  const g = grid(lat, lon, size, n);
  const heights = new Float32Array(n * n), o = [0, 0, 0];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n * n; i++) {
    dem(g.lon[i], g.lat[i], o);
    const h = o[0] * 256 + o[1] + o[2] / 256 - 32768;
    heights[i] = h; if (h < min) min = h; if (h > max) max = h;
  }
  onProgress?.(T("Baixando imagem de satélite (Esri)…", "Downloading satellite imagery (Esri)…"), 0.5);
  let color = null;
  try {
    const img = await mosaic(ESRI, z + 1, lon - dLon, lon + dLon, lat - dLat, lat + dLat, (f) => onProgress?.(T("Baixando imagem de satélite (Esri)…", "Downloading satellite imagery (Esri)…"), 0.5 + f * 0.45));
    const gc = grid(lat, lon, size, nc);
    const cv = new OffscreenCanvas(nc, nc), ctx = cv.getContext("2d");
    const out = ctx.createImageData(nc, nc);
    for (let r = 0; r < nc; r++) for (let c = 0; c < nc; c++) {
      const src = (nc - 1 - r) * nc + c; // linha de baixo primeiro (mesma orientação das cenas do pipeline)
      img(gc.lon[src], gc.lat[src], o);
      const i = (r * nc + c) * 4;
      out.data[i] = o[0]; out.data[i + 1] = o[1]; out.data[i + 2] = o[2]; out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    color = await createImageBitmap(cv);
  } catch { /* sem imagem: a cena fica só com o relevo */ }
  onProgress?.(T("Calculando as medidas do ARA…", "Computing the ARA measures…"), 0.97);
  const res = size / n;
  const stats = araMetrics(heights, n, res);
  const meta = {
    id: `live_${lat.toFixed(4)}_${lon.toFixed(4)}`, body: "earth", name, group: T("Teste ao vivo", "Live test"), lat, lon, size_m: size, cell_m: 5000, kind: "live",
    height: { n, min, max, res_m: res, native_res_m: Math.round((40075016 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z)), valid_pct: 100 },
    color: color ? { n: nc, native_res_m: Math.round((40075016 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** (z + 1))) } : null,
    stats_inner: { at_100m: stats }, pois: [],
    sources: [
      { name: "Terrain Tiles (SRTM/NED/ETOPO)", by: "AWS Open Data · Mapzen", url: "https://registry.opendata.aws/terrain-tiles/" },
      { name: "World Imagery", by: "Esri, Maxar, Earthstar Geographics", url: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" },
    ],
  };
  onProgress?.(T("Pronto", "Done"), 1);
  return { meta, heights, n, color, minerals: null, body: BODIES.earth };
}
