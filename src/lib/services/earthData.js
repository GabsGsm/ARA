// Serviços de dados da Terra usados ao vivo pelo navegador (todos públicos, sem chave, com CORS liberado).
// Cada função devolve { ok, data | error, meta } — meta traz origem, resolução, período e ressalvas,
// para o motor de evidências e a ficha (Analog Passport).
import { fromArrayBuffer, fromUrl } from "geotiff";
import { araMetrics, buildLiveScene } from "../terrain3d/liveEarth.js";

const HALF_KM = 2.5;
const cellBox = (lat, lon, half = HALF_KM) => {
  const dLat = half / 111.32, dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  return { w: lon - dLon, s: lat - dLat, e: lon + dLon, n: lat + dLat };
};

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label}: sem resposta em ${ms / 1000} s`)), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); }
}

async function getJSON(url, label, ms = 30000) {
  const r = await withTimeout(fetch(url), ms, label);
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  return r.json();
}

export const SOURCES = {
  terrain: { id: "terrain_tiles", name: "AWS Terrain Tiles (Mapzen/Terrarium)", url: "https://registry.opendata.aws/terrain-tiles/", origin: "derived",
    caveats: ["O zoom do tile não é a resolução nativa do DEM: a fonte varia por região (SRTM ~30 m, NED ~10 m nos EUA, ETOPO1 no oceano).",
      "Mesma fórmula do ARA (100 m na célula de 5 km); o catálogo usou tiles z12 e esta análise usa z14 — diferenças pequenas são esperadas."] },
  geology: { id: "macrostrat", name: "Macrostrat — unidades geológicas mapeadas (API v2)", url: "https://macrostrat.org", origin: "contextual",
    caveats: ["Litologia mapeada em escala regional; não é identificação mineral.", "Unidade no ponto escolhido; a célula pode cruzar várias unidades."] },
  climate: { id: "power", name: "NASA POWER — climatologia (MERRA-2 / CERES)", url: "https://power.larc.nasa.gov/", origin: "contextual",
    caveats: ["Média de longo prazo num pixel de ~0,5°: contexto regional, não medição atual nem da célula."] },
  soil: { id: "soilgrids", name: "ISRIC SoilGrids 2.0 (0–5 cm)", url: "https://isric.org/explore/soilgrids/", origin: "model_estimate",
    caveats: ["Predição de modelo, não amostra de campo; q05–q95 é a faixa de incerteza do modelo.", "Desertos extremos e afloramentos rochosos têm poucas amostras de treino.",
      "Não converter em tração, afundamento ou capacidade de suporte sem ensaio."] },
  water: { id: "jrc_gsw", name: "JRC Global Surface Water v1.4 (1984–2021)", url: "https://global-surface-water.appspot.com/", origin: "observed",
    caveats: ["Água detectada pelo Landsat entre 1984 e 2021; não cobre depois de 2021 nem umidade do solo."] },
  landcover: { id: "worldcover", name: "ESA WorldCover 2021 (10 m)", url: "https://esa-worldcover.org/en/data-access", origin: "observed",
    caveats: ["Classificação de imagens Sentinel; não mede mineral nem propriedade mecânica."] },
};

/** Relevo + as três medidas do ARA (mesma função do laboratório 3D), mais a cena 3D pronta. */
export async function terrain(lat, lon, onProgress) {
  try {
    const scene = await withTimeout(buildLiveScene(lat, lon, `Ponto ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`, onProgress), 90000, "Relevo");
    const m = scene.meta.stats_inner.at_100m;
    const h = scene.heights;
    let lo = Infinity, hi = -Infinity, flat = 0;
    for (let i = 0; i < h.length; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; if (h[i] <= 0.5 && h[i] >= -0.5) flat++; }
    const oceanLike = flat / h.length > 0.6 && hi - lo < 5;
    return { ok: true, data: { metrics: m, scene, ocean: oceanLike, elevation: { min: lo, max: hi } },
      meta: { ...SOURCES.terrain, resolution_m: scene.meta.height.native_res_m, method: `Grade azimutal 10 km, 512 px; métricas a ${Math.round(m.res_m)} m na célula de 5 km` } };
  } catch (e) {
    return { ok: false, error: e.message, meta: SOURCES.terrain };
  }
}

/** Unidade geológica (todas as escalas devolvidas pelo Macrostrat, a mais detalhada primeiro). */
export async function geology(lat, lon) {
  try {
    const d = await getJSON(`https://macrostrat.org/api/v2/geologic_units/map?lat=${lat.toFixed(5)}&lng=${lon.toFixed(5)}`, "Macrostrat");
    const units = d?.success?.data ?? [];
    if (!units.length) return { ok: true, data: null, meta: SOURCES.geology };
    const order = { large: 0, medium: 1, small: 2, tiny: 3 };
    units.sort((a, b) => (order[a.scale] ?? 9) - (order[b.scale] ?? 9));
    const ids = [...new Set(units.map((u) => u.source_id).filter(Boolean))].join(",");
    let refs = {};
    try {
      const s = await getJSON(`https://macrostrat.org/api/v2/defs/sources?source_id=${ids}`, "Macrostrat fontes", 15000);
      refs = Object.fromEntries((s?.success?.data ?? []).map((r) => [r.source_id, r]));
    } catch { /* referências são opcionais */ }
    const pick = (u) => ({
      name: u.name, strat_name: u.strat_name || null, lith: u.lith || null, descrip: u.descrip || null, scale: u.scale,
      age: { top: u.t_int_name, bottom: u.b_int_name, best: u.best_int_name, t_ma: u.t_age, b_ma: u.b_age },
      ref: refs[u.source_id] ? { name: refs[u.source_id].name, title: refs[u.source_id].ref_title, authors: refs[u.source_id].authors,
        year: refs[u.source_id].ref_year, url: refs[u.source_id].url, scale: refs[u.source_id].scale } : null,
    });
    return { ok: true, data: { best: pick(units[0]), all: units.map(pick) }, meta: SOURCES.geology };
  } catch (e) {
    return { ok: false, error: e.message, meta: SOURCES.geology };
  }
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Climatologia mensal do NASA POWER. */
export async function climate(lat, lon) {
  try {
    const d = await getJSON(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`, "NASA POWER", 40000);
    const p = d?.properties?.parameter;
    if (!p) return { ok: true, data: null, meta: SOURCES.climate };
    const params = Object.fromEntries(Object.entries(p).map(([k, s]) => [k, { annual: s.ANN, monthly: MONTHS.map((m) => s[m]) }]));
    const units = Object.fromEntries(Object.entries(d.parameters ?? {}).map(([k, v]) => [k, v.units]));
    const m = /\(([^)]+)\)/.exec(d.header?.range ?? "");
    const period = m ? m[1].replace(" - ", "–") : (d.header?.range ?? "climatologia de longo prazo");
    return { ok: true, data: { params, units, period, sources: d.header?.sources ?? [] }, meta: { ...SOURCES.climate, period } };
  } catch (e) {
    return { ok: false, error: e.message, meta: SOURCES.climate };
  }
}

const SOIL_PROPS = { sand: [0.1, "%", "Areia"], silt: [0.1, "%", "Silte"], clay: [0.1, "%", "Argila"], cfvo: [0.1, "% vol", "Fragmentos grossos"], bdod: [0.01, "g/cm³", "Densidade aparente"] };
/** SoilGrids (WCS) na célula de 5 km: média e quantis 5% / 95% a 0–5 cm. */
export async function soil(lat, lon) {
  const b = cellBox(lat, lon);
  const url = (prop, stat) => `https://maps.isric.org/mapserv?map=/map/${prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${prop}_0-5cm_${stat}&FORMAT=image/tiff&SUBSET=long(${b.w.toFixed(4)},${b.e.toFixed(4)})&SUBSET=lat(${b.s.toFixed(4)},${b.n.toFixed(4)})&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326`;
  const read = async (prop, stat) => {
    const r = await withTimeout(fetch(url(prop, stat)), 40000, "SoilGrids");
    if (!r.ok) throw new Error(`SoilGrids HTTP ${r.status}`);
    const tif = await fromArrayBuffer(await r.arrayBuffer());
    const [band] = await (await tif.getImage()).readRasters();
    let s = 0, n = 0;
    for (const v of band) if (v > 0 && v < 32767) { s += v; n++; }
    return { mean: n ? s / n : null, valid: band.length ? n / band.length : 0 };
  };
  try {
    const out = {};
    let valid = null;
    await Promise.all(Object.entries(SOIL_PROPS).map(async ([prop, [k, unit, name]]) => {
      const [m, q05, q95] = await Promise.all([read(prop, "mean"), read(prop, "Q0.05"), read(prop, "Q0.95")]);
      if (m.mean == null) return;
      out[prop] = { name, unit, mean: +(m.mean * k).toFixed(2), q05: q05.mean == null ? null : +(q05.mean * k).toFixed(2), q95: q95.mean == null ? null : +(q95.mean * k).toFixed(2) };
      if (prop === "sand") valid = +(m.valid * 100).toFixed(1);
    }));
    if (!Object.keys(out).length) return { ok: true, data: null, meta: SOURCES.soil };
    return { ok: true, data: { depth: "0–5 cm", properties: out, valid_pct: valid }, meta: { ...SOURCES.soil, resolution_m: 250 } };
  } catch (e) {
    return { ok: false, error: e.message, meta: SOURCES.soil };
  }
}

/** Ocorrência histórica de água (JRC GSW) na célula, lendo só os blocos necessários do GeoTIFF. */
export async function water(lat, lon) {
  const lo = Math.floor(lon / 10) * 10, la = Math.ceil(lat / 10) * 10;
  const tile = `${Math.abs(lo)}${lo >= 0 ? "E" : "W"}_${Math.abs(la)}${la >= 0 ? "N" : "S"}`;
  try {
    const tif = await withTimeout(fromUrl(`https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_${tile}v1_4_2021.tif`), 30000, "JRC");
    const img = await tif.getImage();
    const [x0, y0] = [img.getOrigin()[0], img.getOrigin()[1]], [rx, ry] = img.getResolution();
    const b = cellBox(lat, lon);
    const win = [Math.floor((b.w - x0) / rx), Math.floor((b.n - y0) / ry), Math.ceil((b.e - x0) / rx), Math.ceil((b.s - y0) / ry)];
    const [band] = await withTimeout(img.readRasters({ window: win }), 45000, "JRC");
    let valid = 0, any = 0, freq = 0, max = 0;
    for (const v of band) { if (v > 100) continue; valid++; if (v > 0) any++; if (v >= 50) freq++; if (v > max) max = v; }
    if (!valid) return { ok: true, data: null, meta: SOURCES.water };
    return { ok: true, data: { any_water_pct: +(100 * any / valid).toFixed(2), frequent_water_pct: +(100 * freq / valid).toFixed(2), occurrence_max_pct: max, valid_pct: +(100 * valid / band.length).toFixed(1) },
      meta: { ...SOURCES.water, resolution_m: 30, period: "1984–2021" } };
  } catch (e) {
    return { ok: false, error: e.message, meta: SOURCES.water };
  }
}

export { araMetrics, cellBox };
