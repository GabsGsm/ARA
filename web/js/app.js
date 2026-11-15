// ARA — interface. Lê os JSON de data/ e usa core.js para as contas.
import * as core from "./core.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
const STATUS = { analog: "Analogous", partial: "Partial", not_analog: "Not analogous", no_data: "No data" };

const state = { body: "mars", siteId: null, objective: "default", weights: {}, variant: "base", results: [], selected: null, view: "map" };
const D = {};
let map = null, cellLayer = null, gibsLayer = null;

async function getJSON(path, optional = false) {
  try {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    if (optional) return null;
    throw new Error(`Could not load ${path}`);
  }
}

async function load() {
  [D.config, D.catalog, D.sites, D.grid] = await Promise.all(
    ["data/config.json", "data/catalog.json", "data/planet_sites.json", "data/earth_grid.json"].map((p) => getJSON(p)));
  [D.stability, D.sim] = await Promise.all([getJSON("data/stability.json", true), getJSON("data/simulation.json", true)]);
  D.cells = core.unpackGrid(D.grid);
  D.scales = core.scalesFrom(D.config);
  state.weights = { ...D.config.objectives.default.weights };
}

// ---------- painel esquerdo ----------
function sitesOf(body) { return D.catalog.sites.filter((s) => s.body === body); }

function renderTabs() {
  document.querySelectorAll("[role=tab]").forEach((t) => {
    const on = t.dataset.body === state.body;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
  });
}

function renderSites() {
  const list = sitesOf(state.body);
  if (!state.siteId || !list.some((s) => s.id === state.siteId && D.sites[s.id]?.terrain)) {
    state.siteId = list.find((s) => D.sites[s.id]?.terrain)?.id ?? null;
  }
  $("#siteList").innerHTML = list.map((s) => {
    const ready = !!D.sites[s.id]?.terrain;
    return `<button type="button" role="radio" class="site" data-site="${esc(s.id)}" aria-checked="${s.id === state.siteId}" ${ready ? "" : "disabled"}>
      <strong>${esc(s.name)}</strong><small>${esc(s.group)}${ready ? "" : " · data pending"}</small></button>`;
  }).join("") || `<p class="note">No sites for this body yet.</p>`;
  renderFigure();
}

function renderFigure() {
  const s = D.catalog.sites.find((x) => x.id === state.siteId);
  const fig = $("#siteFigure");
  if (!s) { fig.innerHTML = ""; return; }
  const img = s.image || {};
  let box = "";
  if (img.box_px && img.frame_px) {
    const [x, y, w, h] = img.box_px, [fw, fh] = img.frame_px;
    box = `<span class="box" style="left:${(x / fw) * 100}%;top:${(y / fh) * 100}%;width:${(w / fw) * 100}%;height:${(h / fh) * 100}%"></span>`;
  }
  const t = D.sites[s.id]?.terrain;
  const alt = `${s.name}: 5 × 5 km site. Mean slope ${fmt(t?.slope_mean_deg)}°, mean roughness ${fmt(t?.roughness_mean_m)} m, relief ${fmt(t?.relief_m, 0)} m.`;
  const trek = D.config.planet_maps?.[s.body];
  fig.innerHTML = `<div class="frame">${img.src ? `<img src="${esc(img.src)}" alt="${esc(alt)}" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'note',textContent:'Image pending'}))">` : ""}${box}</div>
    <figcaption>${esc(img.caption || "")}<br>${esc(s.why)}</figcaption>
    ${trek && s.bbox ? `<div id="trekMap" class="trek-map" role="img" aria-label="${esc(`Context map of ${s.name} from NASA Trek`)}"></div><small class="note">${esc(trek.attribution)}</small>` : ""}`;
  renderTrekMap(s, trek);
}

// Mapa de contexto planetário: NASA Trek WMTS (equiretangular = L.CRS.EPSG4326 no Leaflet)
let trekMap = null;
function renderTrekMap(site, trek) {
  if (trekMap) { trekMap.remove(); trekMap = null; }
  if (!trek || !site.bbox || !window.L || !$("#trekMap")) return;
  const [w, s, e, n] = site.bbox;
  trekMap = L.map("trekMap", { crs: L.CRS.EPSG4326, attributionControl: false, zoomControl: true });
  L.tileLayer(trek.url, { maxNativeZoom: trek.max_native_zoom, maxZoom: 12, noWrap: true }).addTo(trekMap);
  L.rectangle([[s, w], [n, e]], { color: "#ffd3ad", weight: 2, fillOpacity: 0.15 }).addTo(trekMap);
  trekMap.setView([(s + n) / 2, (w + e) / 2], 8);
}

function renderCriteria() {
  const obj = D.config.objectives;
  $("#objective").innerHTML = Object.entries(obj).map(([k, o]) => `<option value="${k}" ${k === state.objective ? "selected" : ""}>${esc(o.label)}</option>`).join("") +
    `<option value="custom" ${state.objective === "custom" ? "selected" : ""}>Custom</option>`;
  const w = core.normalizeWeights(state.weights);
  $("#weights").innerHTML = core.RANK_ATTRS.map((a) => {
    const meta = D.config.attributes[a];
    return `<label for="w-${a}">${esc(meta.label)} <output id="o-${a}">${Math.round(w[a] * 100)}%</output></label>
      <input type="range" id="w-${a}" data-attr="${a}" min="0" max="100" value="${Math.round(w[a] * 100)}">`;
  }).join("");
  const opts = D.sim?.variants ?? [{ id: "base", label: "Original data (100 m)" }];
  $("#variant").innerHTML = opts.map((v) => `<option value="${v.id}" ${v.id === state.variant ? "selected" : ""}>${esc(v.label)}</option>`).join("");
  $("#variant").disabled = !D.sim;
  $("#variantNote").textContent = D.sim ? "Recomputes the same cells with degraded data, to show how much the ranking depends on data quality."
    : "Simulation data not generated yet (pipeline/build_simulation.py).";
}

// ---------- cálculo e resultados ----------
function compute() {
  const siteAttrs = D.sites[state.siteId];
  if (!siteAttrs?.terrain) { state.results = []; return; }
  const vec = core.siteVector(siteAttrs, state.variant, D.sim, state.siteId);
  const cells = core.cellsForVariant(D.cells, state.variant, D.sim);
  state.results = core.rank(vec, cells, state.weights, D.scales, D.config.top_n);
  state.siteVec = vec;
  if (!state.results.some((r) => r.cell.id === state.selected)) state.selected = state.results[0]?.cell.id ?? null;
}

function stabilityOf(cellId) {
  const s = D.stability?.sites?.[state.siteId]?.[cellId];
  return s ? `${fmt(s.topk_pct, 0)}% in top ${D.stability.method.top_k}` : null;
}

function renderRanking() {
  $("#simBadge").hidden = state.variant === "base";
  const items = state.results.map((r) => {
    const c = r.cell, st = stabilityOf(c.id);
    return `<li><button type="button" class="cand" data-cell="${esc(c.id)}" aria-pressed="${c.id === state.selected}">
      <span class="pos">#${r.position}</span>
      <span class="name">${esc(c.known || regionName(c.region))}<small>${esc(c.id)} · ${fmt(c.lat, 2)}°, ${fmt(c.lon, 2)}°</small></span>
      <span class="badge ${c.known ? "known" : "new"}">${c.known ? "Known analog" : "New candidate"}</span>
      <span class="dist" title="Weighted distance (lower = more similar)">${fmt(r.d, 3)}</span>
      ${st ? `<small class="stab">${esc(st)}</small>` : ""}</button></li>`;
  });
  $("#ranking").innerHTML = items.join("") || `<li class="note">No results for this site/variant.</li>`;
  const top = state.results[0];
  if (top) $("#live").textContent = `Top match: ${top.cell.known || top.cell.id}, distance ${fmt(top.d, 3)}.`;
}

function regionName(id) { return D.grid.regions.find((r) => r.id === id)?.name ?? id; }

function renderTable() {
  const head = `<tr><th>#</th><th>Cell</th><th>Region</th><th>Slope (°)</th><th>Roughness (m)</th><th>Relief (m)</th><th>Distance</th></tr>`;
  const rows = state.results.map((r) => `<tr><td>${r.position}</td><td>${esc(r.cell.known || r.cell.id)}</td><td>${esc(regionName(r.cell.region))}</td>
    <td>${fmt(r.cell.slope_mean_deg)}</td><td>${fmt(r.cell.roughness_mean_m)}</td><td>${fmt(r.cell.relief_m, 0)}</td><td>${fmt(r.d, 3)}</td></tr>`);
  $("#tableWrap").innerHTML = `<table class="data"><caption>Top Earth cells for the selected site</caption>${head}${rows.join("")}</table>`;
}

function initMap() {
  if (!window.L) { $("#map").innerHTML = `<p class="note">Map unavailable offline — use the Table view.</p>`; return; }
  map = L.map("map", { worldCopyJump: true }).setView([0, 0], 2);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 17, attribution: "Imagery © Esri",
  }).addTo(map);
  gibsLayer = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-06-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", {
    maxNativeZoom: 9, maxZoom: 17, opacity: 0.85, attribution: "NASA GIBS / MODIS Terra",
  });
  cellLayer = L.layerGroup().addTo(map);
  $("#gibsToggle").addEventListener("change", (e) => (e.target.checked ? gibsLayer.addTo(map) : gibsLayer.remove()));
}

function renderMap() {
  if (!map) return;
  cellLayer.clearLayers();
  const bounds = [];
  state.results.forEach((r) => {
    const b = core.cellBounds(r.cell);
    const on = r.cell.id === state.selected;
    L.rectangle(b, { color: on ? "#ffd3ad" : "#e7a172", weight: on ? 3 : 1.5, fillOpacity: on ? 0.25 : 0.1 })
      .bindTooltip(`#${r.position} ${r.cell.known || r.cell.id}`)
      .on("click", () => select(r.cell.id))
      .addTo(cellLayer);
    bounds.push(...b);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
}

function renderInspect() {
  const r = state.results.find((x) => x.cell.id === state.selected);
  if (!r) { $("#inspect").innerHTML = `<p class="note">Select a result to see the comparison.</p>`; return; }
  const site = D.catalog.sites.find((s) => s.id === state.siteId);
  const siteAttrs = { ...D.sites[state.siteId], terrain: state.siteVec };
  const dims = core.explain(siteAttrs, r.cell, D.config);
  const ctb = core.contributions(state.siteVec, r.cell, core.normalizeWeights(state.weights), D.scales);
  const rows = dims.map((d) => `<tr><th scope="row">${esc(d.dimension)}</th>
      <td>${d.attr in D.config.attributes ? `${fmt(d.site)} ${esc(d.unit)}` : "—"}</td>
      <td>${d.attr in D.config.attributes ? `${fmt(d.cell)} ${esc(d.unit)}` : "—"}</td>
      <td><span class="chip ${d.status}">${STATUS[d.status]}</span>${d.note ? `<small>${esc(d.note)}</small>` : ""}</td></tr>`).join("");
  const ctx = r.cell.context;
  $("#inspect").innerHTML = `
    <h3>${esc(site.name)} → ${esc(r.cell.known || r.cell.id)}</h3>
    <p class="desc">${esc(core.describeCell(r.cell, dims, r.position))}</p>
    <table class="data"><caption>Dimension by dimension</caption>
      <tr><th>Dimension</th><th>${esc(site.body === "moon" ? "Moon" : "Mars")}</th><th>Earth</th><th>Verdict</th></tr>${rows}</table>
    <p class="desc">Share of the difference: slope ${fmt(ctb.slope_mean_deg, 0)}%, roughness ${fmt(ctb.roughness_mean_m, 0)}%, relief ${fmt(ctb.relief_m, 0)}%.
      ${stabilityOf(r.cell.id) ? `Stability across 2,000 random weight sets: ${esc(stabilityOf(r.cell.id))}.` : ""}</p>
    ${ctx ? `<p class="desc">Geology (${esc(ctx.geology_source || "")}): ${esc((ctx.lithology || []).join(", ") || "general context only")}. Minerals not verified.</p>` : ""}
    ${r.cell.simulated ? `<p class="sim-badge">Simulation — values recomputed from degraded data</p>` : ""}`;
}

function renderAll() {
  compute();
  renderRanking();
  if (state.view === "map") renderMap(); else renderTable();
  renderInspect();
}

function select(cellId) {
  state.selected = cellId;
  document.querySelectorAll(".cand").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cell === cellId));
  renderMap();
  renderInspect();
}

// ---------- metodologia e exportação ----------
function renderMethod() {
  const a = D.config.attributes, w = D.config.objectives.default.weights;
  const src = new Map();
  D.catalog.sites.forEach((s) => (s.sources || []).forEach((x) => src.set(x.url, x.name)));
  $("#methodBody").innerHTML = `
    <p>Each site and Earth cell is a 5 × 5 km window resampled to 100 m/pixel. ARA computes mean slope, mean roughness (local standard deviation in a 3 × 3 window) and relief (max − min).</p>
    <p><code>d = √( Σ wᵢ · ((siteᵢ − cellᵢ) / scaleᵢ)² )</code> with scales ${Object.values(a).map((x) => `${x.scale} ${x.unit}`).join(", ")} and default weights ${Object.values(w).join(" / ")}.</p>
    <p>Stability: ${esc(D.config.stability.draws)} random weight vectors (${esc(D.config.stability.distribution)}, seed ${esc(D.config.stability.seed)}). It measures sensitivity to weights, not the probability of a true analog.</p>
    <p>A dimension is <em>analogous</em> when |site − cell| / scale ≤ ${D.config.thresholds.good}, <em>partial</em> up to ${D.config.thresholds.weak}, otherwise <em>not analogous</em>.</p>
    <h3>Sources</h3><ul>${[...src].map(([u, n]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join("")}
      <li>Earth DEM: ${esc(D.grid.dem)}</li><li>Pipeline runs: ${esc((D.grid.run_ids || []).join(", "))}</li></ul>`;
}

function exportResult() {
  const site = D.catalog.sites.find((s) => s.id === state.siteId);
  const out = {
    app: "ARA", exported_utc: new Date().toISOString(), site, site_attributes: state.siteVec,
    objective: state.objective, weights: core.normalizeWeights(state.weights), variant: state.variant,
    results: state.results.map((r) => ({ position: r.position, distance: r.d, cell: r.cell, stability: D.stability?.sites?.[state.siteId]?.[r.cell.id] ?? null })),
    method: { scales: D.scales, thresholds: D.config.thresholds, stability: D.config.stability },
    earth_dem: D.grid.dem, run_ids: D.grid.run_ids,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: `ARA_${state.siteId}_${state.variant}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- eventos ----------
function bind() {
  document.querySelectorAll("[role=tab]").forEach((t) => t.addEventListener("click", () => {
    state.body = t.dataset.body; renderTabs(); renderSites(); renderAll();
  }));
  $(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    state.body = state.body === "moon" ? "mars" : "moon";
    renderTabs(); renderSites(); renderAll(); $(`#tab-${state.body}`).focus();
  });
  $("#siteList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-site]");
    if (!b || b.disabled) return;
    state.siteId = b.dataset.site; renderSites(); renderAll();
  });
  $("#objective").addEventListener("change", (e) => {
    state.objective = e.target.value;
    if (state.objective !== "custom") state.weights = { ...D.config.objectives[state.objective].weights };
    renderCriteria(); renderAll();
  });
  $("#weights").addEventListener("input", (e) => {
    const a = e.target.dataset.attr; if (!a) return;
    state.weights[a] = Number(e.target.value); state.objective = "custom";
    $("#objective").value = "custom";
    const w = core.normalizeWeights(state.weights);
    core.RANK_ATTRS.forEach((k) => { $(`#o-${k}`).textContent = `${Math.round(w[k] * 100)}%`; });
    renderAll();
  });
  $("#variant").addEventListener("change", (e) => { state.variant = e.target.value; renderAll(); });
  $("#ranking").addEventListener("click", (e) => { const b = e.target.closest("[data-cell]"); if (b) select(b.dataset.cell); });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    state.view = b.dataset.view;
    document.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    $("#mapWrap").hidden = state.view !== "map"; $("#tableWrap").hidden = state.view !== "table";
    if (state.view === "map") { map?.invalidateSize(); renderMap(); } else renderTable();
  }));
  $("#btnMethod").addEventListener("click", () => $("#methodDialog").showModal());
  $("#btnExport").addEventListener("click", exportResult);
  $("#btnContrast").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("hc");
    e.currentTarget.setAttribute("aria-pressed", on);
  });
}

load().then(() => {
  initMap(); bind(); renderTabs(); renderSites(); renderCriteria(); renderMethod(); renderAll();
}).catch((e) => {
  $("#main").insertAdjacentHTML("afterbegin", `<p class="error" role="alert">${esc(e.message)}. Run the pipeline and copy data/ into web/data/.</p>`);
});
