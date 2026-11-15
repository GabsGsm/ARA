// ARA — interface. Lê os JSON de data/ e usa core.js para as contas.
// Rotas por hash: #inicio, #explorar?corpo=marte|lua, #analises, #sobre
import * as core from "./core.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? "—"
  : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const withUnit = (v, u) => `${fmt(v, u === "m" && Math.abs(v) >= 100 ? 0 : 1)}${u === "°" ? "" : "\u00a0"}${esc(u)}`;
const STATUS = { analog: "Análogo", partial: "Parcial", not_analog: "Não análogo", no_data: "Sem dado" };
const BODY_PT = { mars: "Marte", moon: "Lua" };
const BODY_FROM_URL = { marte: "mars", lua: "moon", mars: "mars", moon: "moon" };

const state = { route: "inicio", body: "mars", siteId: null, objective: "default", weights: {}, variant: "base", results: [], selected: null, view: "map" };
const D = {};
let map = null, cellLayer = null, gibsLayer = null, trekMap = null;

// ---------- dados ----------
async function getJSON(path, optional = false) {
  try {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    if (optional) return null;
    throw new Error(`Não foi possível carregar ${path}`);
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

const siteById = (id) => D.catalog.sites.find((s) => s.id === id);
const regionName = (id) => D.grid.regions.find((r) => r.id === id)?.name ?? id;
const cellName = (c) => c.known || `${regionName(c.region)} · ${c.id}`;

// ---------- rotas ----------
function parseHash() {
  const [route, query] = (location.hash.replace(/^#/, "") || "inicio").split("?");
  const params = new URLSearchParams(query || "");
  return { route: ["inicio", "explorar", "analises", "sobre"].includes(route) ? route : "inicio", params };
}

function go() {
  const { route, params } = parseHash();
  state.route = route;
  const body = BODY_FROM_URL[params.get("corpo")];
  if (body && body !== state.body) { state.body = body; state.siteId = null; }
  $$("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== route; });
  $$("[data-route]").forEach((a) => (a.dataset.route === route ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("#navLinks").classList.remove("open");
  $(".nav-toggle").setAttribute("aria-expanded", "false");
  if (route === "explorar") {
    renderTabs(); renderSites(); renderAll();
    setTimeout(() => { map?.invalidateSize(); trekMap?.invalidateSize(); renderMap(); }, 50);
  }
  if (route === "analises") renderAnalyses();
  if (route === "sobre") renderAbout();
  window.scrollTo({ top: 0 });
}

// ---------- explorar: painel esquerdo ----------
const sitesOf = (body) => D.catalog.sites.filter((s) => s.body === body);

function renderTabs() {
  $$("[role=tab]").forEach((t) => {
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
      <strong>${esc(s.name)}</strong><small>${esc(s.group)}${ready ? "" : " · dados pendentes"}</small></button>`;
  }).join("") || `<p class="note">Nenhum local para este corpo ainda.</p>`;
  if (!state.siteId) {
    $("#siteFigure").innerHTML = `<p class="note">Os locais de ${esc(BODY_PT[state.body])} ainda não têm atributos. Rode <code>build_moon_sites.py</code> e <code>build_catalog.py</code>.</p>`;
    return;
  }
  renderFigure();
}

function renderFigure() {
  const s = siteById(state.siteId);
  const fig = $("#siteFigure");
  if (!s) { fig.innerHTML = ""; return; }
  const img = s.image || {};
  let box = "";
  if (img.box_px && img.frame_px) {
    const [x, y, w, h] = img.box_px, [fw, fh] = img.frame_px;
    box = `<span class="box" style="left:${(x / fw) * 100}%;top:${(y / fh) * 100}%;width:${(w / fw) * 100}%;height:${(h / fh) * 100}%"></span>`;
  }
  const t = D.sites[s.id]?.terrain;
  const alt = `${s.name}: recorte de 5 × 5 km. Declividade média ${fmt(t?.slope_mean_deg)}°, rugosidade média ${fmt(t?.roughness_mean_m)} m, amplitude ${fmt(t?.relief_m, 0)} m.`;
  const trek = D.config.planet_maps?.[s.body];
  fig.innerHTML = `<div class="frame">${img.src ? `<img src="${esc(img.src)}" alt="${esc(alt)}" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'note',textContent:'Imagem pendente'}))">` : ""}${box}</div>
    <figcaption>${esc(img.caption || "")}<br>${esc(s.why)}</figcaption>
    ${trek && s.bbox ? `<div id="trekMap" class="trek-map" role="img" aria-label="${esc(`Mapa de contexto de ${s.name} (NASA Trek)`)}"></div><small class="note">${esc(trek.attribution)}</small>` : ""}`;
  renderTrekMap(s, trek);
}

// Mapa de contexto planetário: NASA Trek WMTS (equiretangular = L.CRS.EPSG4326 no Leaflet)
function renderTrekMap(site, trek) {
  if (trekMap) { trekMap.remove(); trekMap = null; }
  if (!trek || !site.bbox || !window.L || !$("#trekMap")) return;
  const [w, s, e, n] = site.bbox;
  trekMap = L.map("trekMap", { crs: L.CRS.EPSG4326, attributionControl: false });
  L.tileLayer(trek.url, { maxNativeZoom: trek.max_native_zoom, maxZoom: 12, noWrap: true }).addTo(trekMap);
  L.rectangle([[s, w], [n, e]], { color: "#f2b53a", weight: 2, fillOpacity: 0.15 }).addTo(trekMap);
  trekMap.setView([(s + n) / 2, (w + e) / 2], 8);
}

function renderCriteria() {
  const obj = D.config.objectives;
  $("#objective").innerHTML = Object.entries(obj).map(([k, o]) => `<option value="${k}" ${k === state.objective ? "selected" : ""}>${esc(o.label)}</option>`).join("") +
    `<option value="custom" ${state.objective === "custom" ? "selected" : ""}>Personalizado</option>`;
  const w = core.normalizeWeights(state.weights);
  $("#weights").innerHTML = core.RANK_ATTRS.map((a) => {
    const meta = D.config.attributes[a];
    return `<label for="w-${a}">${esc(meta.label)} <output id="o-${a}">${Math.round(w[a] * 100)}%</output></label>
      <input type="range" id="w-${a}" data-attr="${a}" min="0" max="100" value="${Math.round(w[a] * 100)}">`;
  }).join("");
  const opts = D.sim?.variants ?? [{ id: "base", label: "Dados originais (100 m)" }];
  $("#variant").innerHTML = opts.map((v) => `<option value="${v.id}" ${v.id === state.variant ? "selected" : ""}>${esc(v.label)}</option>`).join("");
  $("#variant").disabled = !D.sim;
  $("#variantNote").textContent = D.sim
    ? "Recalcula as mesmas células com dados piorados de propósito, para mostrar quanto o ranking depende da qualidade dos dados."
    : "Dados da simulação ainda não gerados (pipeline/build_simulation.py).";
}

// ---------- explorar: cálculo e resultados ----------
function compute() {
  const siteAttrs = D.sites[state.siteId];
  if (!siteAttrs?.terrain) { state.results = []; return; }
  const vec = core.siteVector(siteAttrs, state.variant, D.sim, state.siteId);
  const cells = core.cellsForVariant(D.cells, state.variant, D.sim);
  state.results = core.rank(vec, cells, state.weights, D.scales, D.config.top_n);
  state.siteVec = vec;
  if (!state.results.some((r) => r.cell.id === state.selected)) state.selected = state.results[0]?.cell.id ?? null;
}

function stabilityOf(siteId, cellId) {
  const s = D.stability?.sites?.[siteId]?.[cellId];
  return s ? `${fmt(s.topk_pct, 0)}% das vezes no top ${D.stability.method.top_k} · ${fmt(s.top1_pct, 0)}% em 1º` : null;
}

function renderRanking() {
  $("#simBadge").hidden = state.variant === "base";
  $("#ranking").innerHTML = state.results.map((r) => {
    const c = r.cell, st = stabilityOf(state.siteId, c.id);
    return `<li><button type="button" class="cand" data-cell="${esc(c.id)}" aria-pressed="${c.id === state.selected}">
      <span class="pos">${r.position}º</span>
      <span class="name">${esc(c.known || regionName(c.region))}<small>${esc(c.id)} · ${fmt(c.lat, 2)}°, ${fmt(c.lon, 2)}°</small></span>
      <span class="badge ${c.known ? "known" : "new"}">${c.known ? "Análogo conhecido" : "Novo candidato"}</span>
      <span class="dist" title="Distância ponderada (menor = mais parecido)">${fmt(r.d, 3)}</span>
      ${st ? `<small class="stab">${esc(st)}</small>` : ""}</button></li>`;
  }).join("") || `<li class="note">Sem resultados para este local/variante.</li>`;
  const top = state.results[0];
  if (top) $("#live").textContent = `Melhor correspondência: ${cellName(top.cell)}, distância ${fmt(top.d, 3)}.`;
}

function renderTable() {
  const head = `<tr><th>#</th><th>Célula</th><th>Região</th><th>Declividade (°)</th><th>Rugosidade (m)</th><th>Amplitude (m)</th><th>Distância</th></tr>`;
  const rows = state.results.map((r) => `<tr><td>${r.position}º</td><td>${esc(r.cell.known || r.cell.id)}</td><td>${esc(regionName(r.cell.region))}</td>
    <td>${fmt(r.cell.slope_mean_deg)}</td><td>${fmt(r.cell.roughness_mean_m)}</td><td>${fmt(r.cell.relief_m, 0)}</td><td>${fmt(r.d, 3)}</td></tr>`);
  $("#tableWrap").innerHTML = `<table class="data"><caption>Melhores células da Terra para o local escolhido</caption>${head}${rows.join("")}</table>`;
}

function initMap() {
  if (!window.L) { $("#map").innerHTML = `<p class="note" style="padding:16px">Mapa indisponível sem internet — use a visualização em Tabela.</p>`; return; }
  map = L.map("map", { worldCopyJump: true }).setView([0, 0], 2);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 17, attribution: "Imagens © Esri",
  }).addTo(map);
  gibsLayer = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-06-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", {
    maxNativeZoom: 9, maxZoom: 17, opacity: 0.85, attribution: "NASA GIBS / MODIS Terra",
  });
  cellLayer = L.layerGroup().addTo(map);
  $("#gibsToggle").addEventListener("change", (e) => (e.target.checked ? gibsLayer.addTo(map) : gibsLayer.remove()));
}

function renderMap() {
  if (!map || state.route !== "explorar") return;
  cellLayer.clearLayers();
  const bounds = [];
  state.results.forEach((r) => {
    const b = core.cellBounds(r.cell);
    const on = r.cell.id === state.selected;
    L.rectangle(b, { color: on ? "#f7c75a" : "#f2b53a", weight: on ? 3 : 1.5, fillOpacity: on ? 0.3 : 0.1 })
      .bindTooltip(`${r.position}º ${cellName(r.cell)}`)
      .on("click", () => select(r.cell.id))
      .addTo(cellLayer);
    bounds.push(...b);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
}

function renderInspect() {
  const r = state.results.find((x) => x.cell.id === state.selected);
  if (!r) { $("#inspect").innerHTML = `<p class="note">Selecione um resultado para ver a comparação.</p>`; return; }
  const site = siteById(state.siteId);
  const siteAttrs = { ...D.sites[state.siteId], terrain: state.siteVec };
  const dims = core.explain(siteAttrs, r.cell, D.config);
  const ctb = core.contributions(state.siteVec, r.cell, core.normalizeWeights(state.weights), D.scales);
  const isAttr = (d) => d.attr in D.config.attributes;
  const rows = dims.map((d) => `<tr><th scope="row">${esc(d.dimension)}</th>
      <td>${isAttr(d) ? withUnit(d.site, d.unit) : "—"}</td>
      <td>${isAttr(d) ? withUnit(d.cell, d.unit) : "—"}</td>
      <td><span class="chip ${d.status}">${STATUS[d.status]}</span>${d.note ? `<small>${esc(d.note)}</small>` : ""}</td></tr>`).join("");
  const ctx = r.cell.context;
  const st = stabilityOf(state.siteId, r.cell.id);
  $("#inspect").innerHTML = `
    <h3>${esc(site.name)} → ${esc(cellName(r.cell))}</h3>
    <p class="desc">${esc(core.describeCell(r.cell, dims, r.position))}</p>
    <table class="data"><caption>Dimensão por dimensão</caption>
      <tr><th>Dimensão</th><th>${esc(BODY_PT[site.body])}</th><th>Terra</th><th>Veredito</th></tr>${rows}</table>
    <p class="desc">Peso de cada atributo na diferença: declividade ${fmt(ctb.slope_mean_deg, 0)}%, rugosidade ${fmt(ctb.roughness_mean_m, 0)}%, amplitude ${fmt(ctb.relief_m, 0)}%.
      ${st ? `Estabilidade em 2.000 conjuntos de pesos aleatórios: ${esc(st)}.` : ""}</p>
    ${ctx ? `<p class="desc">Geologia (${esc(ctx.geology_source || "")}): ${esc((ctx.lithology || []).join(", ") || "só contexto geral")}. Minerais não verificados.</p>` : ""}
    ${r.cell.simulated ? `<p class="sim-badge">Simulação — valores recalculados com dados piorados</p>` : ""}`;
}

function renderAll() {
  compute();
  renderRanking();
  if (state.view === "map") renderMap(); else renderTable();
  renderInspect();
}

function select(cellId) {
  state.selected = cellId;
  $$(".cand").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cell === cellId));
  renderMap();
  renderInspect();
}

// ---------- análises ----------
function topFor(siteId, weights, variant = "base", n = 3) {
  const vec = core.siteVector(D.sites[siteId], variant, D.sim, siteId);
  const cells = core.cellsForVariant(D.cells, variant, D.sim);
  return core.rank(vec, cells, weights, D.scales, n);
}

function renderAnalyses() {
  const sid = state.siteId || D.catalog.sites.find((s) => D.sites[s.id]?.terrain)?.id;
  if (!sid) { $("#analysesBody").innerHTML = `<p class="note">Sem locais com atributos.</p>`; return; }
  const site = siteById(sid);
  $("#anSite").textContent = `Local analisado: ${site.name} (${BODY_PT[site.body]}). Troque em Explorar.`;
  const list = (rs) => `<ol class="list-clean">${rs.map((r) => `<li>${esc(cellName(r.cell))} <small class="note">(${fmt(r.d, 3)})</small></li>`).join("")}</ol>`;

  const byObjective = Object.entries(D.config.objectives).map(([, o]) =>
    `<tr><th scope="row">${esc(o.label)}</th><td>${list(topFor(sid, o.weights))}</td></tr>`).join("");

  const variants = D.sim?.variants ?? [];
  const byVariant = variants.length
    ? `<table class="data"><tr><th>Dados</th><th>3 melhores</th></tr>${variants.map((v) => {
        const rs = topFor(sid, D.config.objectives.default.weights, v.id);
        return `<tr><th scope="row">${esc(v.label)}${v.id !== "base" ? ` <span class="chip partial">simulação</span>` : ""}</th><td>${rs.length ? list(rs) : "—"}</td></tr>`;
      }).join("")}</table>`
    : `<p class="note">Rode <code>pipeline/build_simulation.py</code> para gerar as variantes (resolução 300 m, 30% sem dados, ruído de ±5 m).</p>`;

  const stab = Object.entries(D.stability?.sites?.[sid] ?? {}).sort((a, b) => b[1].topk_pct - a[1].topk_pct || b[1].top1_pct - a[1].top1_pct).slice(0, 6);
  const a = D.config.attributes, w = D.config.objectives.default.weights, cfgS = D.config.stability;
  const src = new Map();
  D.catalog.sites.forEach((s) => (s.sources || []).forEach((x) => src.set(x.url, x.name)));

  $("#analysesBody").innerHTML = `
    <article class="card"><h2 class="eyebrow">Sensibilidade ao objetivo</h2>
      <p class="desc">O mesmo local, com pesos diferentes. Um análogo pode ser ótimo para um uso e fraco para outro.</p>
      <table class="data"><tr><th>Objetivo</th><th>3 melhores</th></tr>${byObjective}</table></article>
    <article class="card"><h2 class="eyebrow">Qualidade dos dados</h2>
      <p class="desc">O ranking recalculado com dados piores. Se ele muda muito, a conclusão depende mais dos dados do que do terreno.</p>${byVariant}</article>
    <article class="card"><h2 class="eyebrow">Estabilidade</h2>
      <p class="desc">${fmt(cfgS.draws, 0)} conjuntos de pesos aleatórios (${esc(cfgS.distribution)}, semente ${esc(cfgS.seed)}). Mede a sensibilidade aos pesos, não a probabilidade de ser um análogo verdadeiro.</p>
      ${stab.length ? `<table class="data"><tr><th>Célula</th><th>% em 1º</th><th>% no top ${cfgS.top_k}</th></tr>${stab.map(([cid, v]) => {
        const c = D.cells.find((x) => x.id === cid);
        return `<tr><td>${esc(c ? cellName(c) : cid)}</td><td>${fmt(v.top1_pct, 1)}</td><td>${fmt(v.topk_pct, 1)}</td></tr>`;
      }).join("")}</table>` : `<p class="note">Rode <code>pipeline/stability.py</code>.</p>`}</article>
    <article class="card"><h2 class="eyebrow">Como o ranking é calculado</h2>
      <p class="desc">Cada local e cada célula da Terra é uma janela de 5 × 5 km a 100 m/pixel. Atributos: declividade média, rugosidade média (desvio-padrão local em janela 3 × 3) e amplitude (máximo − mínimo).</p>
      <p class="formula">d = √( Σ wᵢ · ((localᵢ − célulaᵢ) / escalaᵢ)² )</p>
      <p class="desc">Escalas: ${Object.values(a).map((x) => `${x.scale}${x.unit === "°" ? "" : " "}${x.unit}`).join(", ")}. Pesos padrão: ${Object.values(w).map((x) => fmt(x, 2)).join(" / ")}.
        Uma dimensão é <strong>análoga</strong> quando |local − célula| / escala ≤ ${fmt(D.config.thresholds.good, 2)}, <strong>parcial</strong> até ${fmt(D.config.thresholds.weak, 2)} e <strong>não análoga</strong> acima disso.</p></article>
    <article class="card"><h2 class="eyebrow">Onde a analogia sempre falha</h2>
      <ul class="list-clean">${D.config.earth_limits.map((l) => `<li><strong>${esc(l.dimension)}:</strong> ${esc(l.text)}</li>`).join("")}</ul></article>
    <article class="card"><h2 class="eyebrow">Fontes</h2>
      <ul class="list-clean">${[...src].map(([u, n]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join("")}
        <li>DEM da Terra: ${esc(D.grid.dem)}</li><li>Execuções do pipeline: ${esc((D.grid.run_ids || []).join(", "))}</li></ul></article>`;
}

// ---------- sobre ----------
function renderAbout() {
  $("#aboutBody").innerHTML = `
    <article class="card"><h2 class="eyebrow">O que é</h2>
      <p class="desc">O ARA compara locais fixos de exploração em Marte (setores da cratera Jezero) e na Lua (regiões candidatas do Artemis III) com uma grade de células de 5 × 5 km da Terra. Ele mostra o que torna cada lugar análogo, o que não torna e onde faltam dados — não existe relação de 1 para 1.</p></article>
    <article class="card"><h2 class="eyebrow">Como ler um resultado</h2>
      <ul class="list-clean"><li><span class="chip analog">Análogo</span> diferença pequena naquela dimensão</li>
        <li><span class="chip partial">Parcial</span> diferença moderada</li><li><span class="chip not_analog">Não análogo</span> diferença grande ou impossível na Terra</li>
        <li><span class="chip no_data">Sem dado</span> a dimensão ainda não foi medida</li></ul></article>
    <article class="card"><h2 class="eyebrow">Limitações</h2>
      <p class="desc">Três estatísticas não descrevem orientação das encostas, drenagem nem textura em várias escalas. Pesos e escalas não foram calibrados por especialistas. Os DEMs da Terra e dos planetas vêm de instrumentos diferentes. Litologia mapeada não é mineralogia verificada.</p></article>
    <article class="card"><h2 class="eyebrow">Equipe e uso de IA</h2>
      <p class="desc">Preencher antes da entrega: integrantes, papéis, link do repositório e onde ferramentas de IA foram usadas.</p></article>`;
}

// ---------- exportação ----------
function exportResult() {
  const out = {
    app: "ARA", exportado_utc: new Date().toISOString(), local: siteById(state.siteId), atributos_local: state.siteVec,
    objetivo: state.objective, pesos: core.normalizeWeights(state.weights), variante: state.variant,
    resultados: state.results.map((r) => ({ posicao: r.position, distancia: r.d, celula: r.cell, estabilidade: D.stability?.sites?.[state.siteId]?.[r.cell.id] ?? null })),
    metodo: { escalas: D.scales, limiares: D.config.thresholds, estabilidade: D.config.stability },
    dem_terra: D.grid.dem, run_ids: D.grid.run_ids,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: `ARA_${state.siteId}_${state.variant}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- eventos ----------
function setBody(body) {
  if (body === state.body) return;
  state.body = body; state.siteId = null;
  history.replaceState(null, "", `#explorar?corpo=${body === "mars" ? "marte" : "lua"}`);
  renderTabs(); renderSites(); renderAll();
}

function bind() {
  window.addEventListener("hashchange", go);
  $(".nav-toggle").addEventListener("click", (e) => {
    const open = $("#navLinks").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });
  const closeMenu = () => { $("#navLinks").classList.remove("open"); $(".nav-toggle").setAttribute("aria-expanded", "false"); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".nav")) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  $$("[role=tab]").forEach((t) => t.addEventListener("click", () => setBody(t.dataset.body)));
  $(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    setBody(state.body === "moon" ? "mars" : "moon");
    $(`#tab-${state.body}`).focus();
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
  $$("[data-view-mode]").forEach((b) => b.addEventListener("click", () => {
    state.view = b.dataset.viewMode;
    $$("[data-view-mode]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    $("#mapWrap").hidden = state.view !== "map"; $("#tableWrap").hidden = state.view !== "table";
    if (state.view === "map") { map?.invalidateSize(); renderMap(); } else renderTable();
  }));
  $("#btnExport").addEventListener("click", exportResult);
  $("#btnContrast").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("hc");
    e.currentTarget.setAttribute("aria-pressed", on);
  });
}

load().then(() => {
  initMap(); bind(); renderCriteria(); go();
}).catch((e) => {
  $("#conteudo").insertAdjacentHTML("afterbegin", `<p class="error" role="alert">${esc(e.message)}. Rode <code>python tools/dev.py</code> na raiz do projeto.</p>`);
});
