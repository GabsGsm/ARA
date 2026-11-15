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
  dims.push({ dimension: "Surface temperature", attr: "thermal", status: "no_data", diff: null,
              note: siteAttrs?.thermal ? "Planet value available; Earth value not yet computed" : "Not computed yet" });
  dims.push({ dimension: "Mineralogy", attr: "mineralogy", status: "no_data", diff: null,
              note: cell.context?.lithology?.length
                ? `Earth: mapped lithology (${cell.context.lithology.join(", ")}); minerals not verified`
                : "Earth mineralogy not verified" });
  config.earth_limits.forEach((l) => dims.push({ dimension: l.dimension, attr: "limit", status: "not_analog", diff: null, note: l.text }));
  return dims;
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

const STATUS_WORD = { analog: "analogous", partial: "partially analogous", not_analog: "not analogous", no_data: "no data" };

export function describeCell(cell, dims, position) {
  const parts = dims.filter((d) => ["slope_mean_deg", "roughness_mean_m", "relief_m"].includes(d.attr))
    .map((d) => `${d.dimension.toLowerCase()} ${d.cell?.toFixed(1)} ${d.unit} (${STATUS_WORD[d.status]})`);
  const name = cell.known ? `${cell.known}, known analog` : "new candidate";
  return `#${position}: cell ${cell.id}, ${name}, at ${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°. ${parts.join("; ")}.`;
}

export function cellBounds(cell, halfKm = 2.5) {
  const dLat = halfKm / 111.32;
  const dLon = dLat / Math.max(Math.cos((cell.lat * Math.PI) / 180), 1e-6);
  return [[cell.lat - dLat, cell.lon - dLon], [cell.lat + dLat, cell.lon + dLon]];
}
