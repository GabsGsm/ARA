// ARA — lógica pura (sem DOM). Usada pelo app e pelos testes em Node.
// Distância igual ao Protótipo 1: d = sqrt( sum_i w_i * ((a_i - b_i) / s_i)^2 ).

export const RANK_ATTRS = ["slope_mean_deg", "roughness_mean_m", "relief_m"];

export function unpackGrid(grid) {
  const cols = grid.columns;
  return grid.rows.map((row) => {
    const cell = {};
    cols.forEach((c, i) => { cell[c] = row[i]; });
    cell.known = grid.known_analogs?.[cell.id] ?? null;
    cell.context = grid.context?.[cell.id] ?? null;
    return cell;
  });
}

export function normalizeWeights(weights, attrs = RANK_ATTRS) {
  const total = attrs.reduce((s, a) => s + Math.max(0, Number(weights[a]) || 0), 0);
  const out = {};
  attrs.forEach((a) => { out[a] = total > 0 ? Math.max(0, Number(weights[a]) || 0) / total : 1 / attrs.length; });
  return out;
}

export function scalesFrom(config, attrs = RANK_ATTRS) {
  const s = {};
  attrs.forEach((a) => { s[a] = config.attributes[a].scale; });
  return s;
}

export function terms(site, cell, weights, scales, attrs = RANK_ATTRS) {
  return attrs.map((a) => {
    const diff = (site[a] - cell[a]) / scales[a];
    return { attr: a, weighted: weights[a] * diff * diff, norm: Math.abs(diff) };
  });
}

export function distance(site, cell, weights, scales, attrs = RANK_ATTRS) {
  return Math.sqrt(terms(site, cell, weights, scales, attrs).reduce((s, t) => s + t.weighted, 0));
}

export function contributions(site, cell, weights, scales, attrs = RANK_ATTRS) {
  const t = terms(site, cell, weights, scales, attrs);
  const sum = t.reduce((s, x) => s + x.weighted, 0);
  const out = {};
  t.forEach((x) => { out[x.attr] = sum > 0 ? (x.weighted / sum) * 100 : 0; });
  return out;
}

export function rank(site, cells, weights, scales, topN = 10, attrs = RANK_ATTRS) {
  const w = normalizeWeights(weights, attrs);
  return cells
    .map((c) => ({ cell: c, d: distance(site, c, w, scales, attrs) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, topN)
    .map((r, i) => ({ ...r, position: i + 1 }));
}

// Nota por dimensão: |a - b| / escala  ->  analog | partial | not_analog | no_data
export function dimensionStatus(siteVal, cellVal, scale, thresholds) {
  if (siteVal == null || cellVal == null || Number.isNaN(siteVal) || Number.isNaN(cellVal)) {
    return { status: "no_data", diff: null };
  }
  const diff = Math.abs(siteVal - cellVal) / scale;
  const status = diff <= thresholds.good ? "analog" : diff <= thresholds.weak ? "partial" : "not_analog";
  return { status, diff };
}

export function explain(siteAttrs, cell, config) {
  const dims = Object.entries(config.attributes).map(([attr, meta]) => ({
    dimension: meta.label, attr, unit: meta.unit,
    site: siteAttrs?.terrain?.[attr] ?? null, cell: cell[attr] ?? null,
    ...dimensionStatus(siteAttrs?.terrain?.[attr], cell[attr], meta.scale, config.thresholds),
  }));
  dims.push({ dimension: "Temperatura da superfície", attr: "thermal", status: "no_data", diff: null,
              note: thermalNote(siteAttrs?.thermal) });
  dims.push({ dimension: "Mineralogia", attr: "mineralogy", status: "no_data", diff: null,
              note: mineralNote(siteAttrs?.mineralogy, cell) });
  config.earth_limits.forEach((l) => dims.push({ dimension: l.dimension, attr: "limit", status: "not_analog", diff: null, note: l.text }));
  return dims;
}

function thermalNote(thermal) {
  const shown = (thermal?.display ?? []).filter((d) => d.value != null)
    .map((d) => `${d.label} ${br(d.value, d.unit === "K" ? 0 : 0)} ${d.unit}`);
  const planet = shown.length ? `Planeta: ${shown.join("; ")}.` : "Planeta: sem dado térmico.";
  return `${planet} Terra: ainda não calculada, por isso não entra no ranking.`;
}

function mineralNote(mineral, cell) {
  let planet = "Planeta: sem dado mineralógico.";
  if (mineral?.summary) planet = `Planeta: ${mineral.summary}.`;
  else if (mineral?.source === "CRISM") {
    const cls = (mineral.classes ?? []).filter(Boolean);
    planet = `Planeta (CRISM): ${br(mineral.coverage_pct, 0)}% do recorte mapeado${cls.length ? ` — ${cls.join(", ")}` : ""}.`;
  }
  const earth = cell.context?.lithology?.length
    ? `Terra: litologia mapeada (${cell.context.lithology.join(", ")}), minerais não verificados.`
    : "Terra: mineralogia não verificada.";
  return `${planet} ${earth}`;
}

export function siteVector(siteAttrs, variant, simulation, siteId) {
  if (variant && variant !== "base" && simulation?.planet?.[siteId]?.[variant]) {
    return simulation.planet[siteId][variant];
  }
  return siteAttrs.terrain;
}

export function cellsForVariant(cells, variant, simulation) {
  if (!variant || variant === "base" || !simulation) return cells;
  return cells
    .filter((c) => simulation.earth?.[c.id]?.[variant])
    .map((c) => ({ ...c, ...simulation.earth[c.id][variant], simulated: true }));
}

const br = (v, d) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const STATUS_WORD = { analog: "análogo", partial: "parcialmente análogo", not_analog: "não análogo", no_data: "sem dado" };

export function describeCell(cell, dims, position) {
  const parts = dims.filter((d) => ["slope_mean_deg", "roughness_mean_m", "relief_m"].includes(d.attr))
    .map((d) => `${d.dimension.toLowerCase()} ${br(d.cell, 1)}${d.unit === "°" ? "" : " "}${d.unit} (${STATUS_WORD[d.status]})`);
  const name = cell.known ? `${cell.known}, análogo conhecido` : "novo candidato";
  return `${position}º: célula ${cell.id}, ${name}, em ${br(cell.lat, 2)}°, ${br(cell.lon, 2)}°. ${parts.join("; ")}.`;
}

export function cellBounds(cell, halfKm = 2.5) {
  const dLat = halfKm / 111.32;
  const dLon = dLat / Math.max(Math.cos((cell.lat * Math.PI) / 180), 1e-6);
  return [[cell.lat - dLat, cell.lon - dLon], [cell.lat + dLat, cell.lon + dLon]];
}
