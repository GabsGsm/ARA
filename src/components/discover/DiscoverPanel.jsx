// ARA Anywhere — analisar um local novo da Terra contra um alvo de Marte/Lua.
// Fluxo: escolher ponto (mapa, busca, coordenadas ou análogo famoso) → janela de 5 km → alvo e objetivo →
// "Analisar este local" → relevo (AWS Terrain Tiles) + medidas do ARA → geologia (Macrostrat) → clima (NASA POWER)
// → solo (SoilGrids) → água (JRC) → evidências, comparação exploratória e ficha.
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";
import { useExplorer } from "../../hooks/useExplorer.jsx";
import { cellExtra, useEvidence } from "../../hooks/useEvidence.js";
import { BODY_LABEL, fmt, withUnit } from "../../lib/format.js";
import * as svc from "../../lib/services/earthData.js";
import StatusChip from "../ui/StatusChip.jsx";
import EvidencePanel from "../evidence/EvidencePanel.jsx";
import ClimateCalendar from "./ClimateCalendar.jsx";
import { famous } from "../lab3d/LiveEarthPicker.jsx";
import { T } from "../../lib/i18n.js";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MACRO = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const pin = L.divIcon({ className: "t3-pin", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });
const STEPS = () => [
  ["terrain", T("Relevo e medidas do ARA (AWS Terrain Tiles)", "Relief and ARA measures (AWS Terrain Tiles)")],
  ["geology", T("Unidade geológica (Macrostrat)", "Geological unit (Macrostrat)")],
  ["climate", T("Climatologia (NASA POWER)", "Climatology (NASA POWER)")],
  ["soil", T("Solo 0–5 cm (SoilGrids)", "Soil 0–5 cm (SoilGrids)")],
  ["water", T("Água superficial 1984–2021 (JRC)", "Surface water 1984–2021 (JRC)")],
];

function Picker({ onPick }) { useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) }); return null; }
function FlyTo({ point }) {
  const map = useMap();
  if (point && map._araLast !== point.key) { map._araLast = point.key; map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 11), { duration: 1.2 }); }
  return null;
}

export default function DiscoverPanel() {
  const data = useAraData();
  const ex = useExplorer();
  const evidence = useEvidence();
  const [point, setPoint] = useState(null);           // { lat, lon, name, key }
  const [latTxt, setLatTxt] = useState(""), [lonTxt, setLonTxt] = useState("");
  const [query, setQuery] = useState(""), [found, setFound] = useState(null);
  const [geoLayer, setGeoLayer] = useState(false);
  const [targetId, setTargetId] = useState(ex.siteId ?? "jezero_01");
  const [run, setRun] = useState(null);              // { status: {step: "wait"|"ok"|"err"|"none"}, res: {...}, at }
  const runId = useRef(0);                            // cada análise tem um número; respostas de análises antigas são descartadas
  const targets = data.catalog.sites.filter((s) => data.hasTerrain(s.id));
  const site = data.siteById(targetId);

  const pick = (lat, lon, name) => {
    const lo = ((lon + 540) % 360) - 180;
    setPoint({ lat, lon: lo, name: name || `${T("Ponto", "Point")} ${lat.toFixed(4)}°, ${lo.toFixed(4)}°`, key: `${lat},${lo},${Date.now()}` });
    setLatTxt(lat.toFixed(5)); setLonTxt(lo.toFixed(5));
    runId.current++; setRun(null);
  };

  const searchId = useRef(0);   // só a busca mais recente preenche a lista
  const search = async () => {
    const q = query.trim();
    if (!q) return;
    const id = ++searchId.current;
    setFound({ loading: true, q });
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": T("pt-BR", "en") } });
      const list = (await r.json()).map((x) => ({ name: x.display_name, lat: +x.lat, lon: +x.lon }));
      if (id === searchId.current) setFound({ list, q });
    } catch { if (id === searchId.current) setFound({ error: T("Busca indisponível agora — use coordenadas ou clique no mapa.", "Search unavailable right now — use coordinates or click the map.") }); }
  };

  // célula do catálogo que contém o ponto (para validação e para evidências pré-processadas)
  const inCatalog = useMemo(() => {
    if (!point) return null;
    return data.cells.find((c) => { const [[s, w], [n, e]] = core.cellBounds(c); return point.lat >= s && point.lat <= n && point.lon >= w && point.lon <= e; }) ?? null;
  }, [point, data.cells]);

  const analyze = async () => {
    if (!point) return;
    // no celular os resultados ficam abaixo do mapa: leva a pessoa até eles
    requestAnimationFrame(() => document.querySelector(".dv-res")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const id = ++runId.current, at = { lat: point.lat, lon: point.lon };
    const status = Object.fromEntries(STEPS().map(([k]) => [k, "wait"]));
    const res = {};
    const update = () => { if (id === runId.current) setRun({ status: { ...status }, res: { ...res }, at }); };
    update();
    const done = (k, r) => { if (id !== runId.current) return; res[k] = r; status[k] = r.ok ? (r.data ? "ok" : "none") : "err"; update(); };
    // relevo primeiro (as medidas aparecem assim que chegam); o resto em paralelo
    const tasks = [
      svc.terrain(at.lat, at.lon).then((r) => done("terrain", r)),
      svc.geology(at.lat, at.lon).then((r) => done("geology", r)),
      svc.climate(at.lat, at.lon).then((r) => done("climate", r)),
      svc.soil(at.lat, at.lon).then((r) => done("soil", r)),
      svc.water(at.lat, at.lon).then((r) => done("water", r)),
    ];
    await Promise.allSettled(tasks);
  };

  const terr = run?.res.terrain;
  const m = terr?.ok ? terr.data.metrics : null;
  const ocean = terr?.ok && terr.data.ocean;
  const siteVec = data.sites[targetId]?.terrain;
  const w = core.normalizeWeights(ex.weights ?? data.config.objectives.default.weights);
  const dist = m && siteVec && !ocean ? core.distance(siteVec, m, w, data.scales) : null;
  const position = dist != null ? data.cells.filter((c) => core.distance(siteVec, c, w, data.scales) < dist).length + 1 : null;
  const candidate = point && m ? { ...m, id: `custom_${point.lat.toFixed(4)}_${point.lon.toFixed(4)}`, name: point.name, lat: point.lat, lon: point.lon, origin: "custom" } : null;
  const live = run?.res ?? {};
  const pre = inCatalog ? cellExtra(evidence, inCatalog.id) : null;
  const extra = {
    geology: live.geology?.ok ? live.geology.data?.best ?? null : null,
    climate: live.climate?.ok && live.climate.data ? live.climate.data : null,
    soil: live.soil?.ok ? live.soil.data : null,
    water: live.water?.ok ? live.water.data : null,
    landcover: pre?.landcover ?? null,
  };
  const sourcesMeta = Object.values(live).filter(Boolean).map((r) => r.meta);
  const box = point ? core.cellBounds(point) : null;

  // aceita vírgula ou ponto decimal ("36,42" ou "36.42")
  const toNum = (v) => (String(v).trim() === "" ? NaN : Number(String(v).trim().replace(",", ".")));
  const numLat = toNum(latTxt), numLon = toNum(lonTxt);
  const coordsOk = Number.isFinite(numLat) && Number.isFinite(numLon) && Math.abs(numLat) <= 85 && Math.abs(numLon) <= 180;
  return (
    <div className="dv-grid">
      {/* ---------- painel esquerdo ---------- */}
      <aside className="card dv-left" aria-label={T("Escolher local", "Choose a place")}>
        <h2 className="eyebrow">{T("1 · Escolha um ponto da Terra", "1 · Pick a point on Earth")}</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={T("Buscar lugar (ex.: Wadi Rum)", "Search a place (e.g. Wadi Rum)")} aria-label={T("Buscar lugar", "Search a place")} />
          <button type="submit" className="dv-btn">{T("Buscar", "Search")}</button>
        </form>
        {found?.loading && <p className="note">{T("Buscando…", "Searching…")}</p>}
        {found?.error && <p className="note text-warn">{found.error}</p>}
        {found?.list && (
          <ul className="dv-found">
            {found.list.map((f) => <li key={f.name}><button type="button" onClick={() => { pick(f.lat, f.lon, f.name.split(",").slice(0, 2).join(",")); setFound(null); }}>{f.name}</button></li>)}
            {!found.list.length && <li className="note">{T("Nada encontrado.", "Nothing found.")}</li>}
          </ul>
        )}
        <small className="note">{T("Busca", "Search")}: OpenStreetMap / Nominatim</small>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="t3-field"><span>Latitude</span><input className="field" inputMode="decimal" value={latTxt} onChange={(e) => setLatTxt(e.target.value)} /></label>
          <label className="t3-field"><span>Longitude</span><input className="field" inputMode="decimal" value={lonTxt} onChange={(e) => setLonTxt(e.target.value)} /></label>
        </div>
        <button type="button" className="dv-btn mt-2 w-full" disabled={!coordsOk}
                onClick={() => pick(numLat, numLon)}>{T("Usar coordenadas", "Use coordinates")}</button>
        <select className="field mt-2" value="" aria-label={T("Análogos famosos", "Famous analogs")} onChange={(e) => { const f = famous()[+e.target.value]; if (f) pick(f.lat, f.lon, f.name); }}>
          <option value="">{T("Ou um análogo famoso (NASA/ESA)…", "Or a famous analog (NASA/ESA)…")}</option>
          {famous().map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
        </select>

        <h2 className="eyebrow mt-5">{T("2 · Alvo e objetivo", "2 · Target and objective")}</h2>
        <label className="t3-field"><span>{T("Alvo planetário", "Planetary target")}</span>
          <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {targets.map((s) => <option key={s.id} value={s.id}>{T(BODY_LABEL[s.body])} · {T(s.name)}</option>)}
          </select>
        </label>
        <label className="t3-field mt-2"><span>{T("Objetivo (pesos)", "Objective (weights)")}</span>
          <select className="field" value={ex.objective} onChange={(e) => ex.setObjective(e.target.value)}>
            {Object.entries(data.config.objectives).map(([k, o]) => <option key={k} value={k}>{T(o.label)}</option>)}
            <option value="custom">{T("Personalizado")}</option>
          </select>
        </label>
        <p className="t3-field mt-2"><span>{T("Tamanho da área", "Area size")}</span>
          <b className="text-[13px]">{T("5 × 5 km (tamanho fixo nesta versão, o mesmo do catálogo)", "5 × 5 km (fixed size in this version, same as the catalogue)")}</b>
        </p>
        <button type="button" className="dv-go" disabled={!point || run?.status?.terrain === "wait"} onClick={analyze}>{T("Analisar este local", "Analyse this place")}</button>
        {!point && <p className="note">{T("Clique no mapa, busque um lugar ou digite coordenadas.", "Click the map, search a place or type coordinates.")}</p>}
      </aside>

      {/* ---------- mapa ---------- */}
      <section className="card dv-map" aria-label={T("Mapa", "Map")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="eyebrow mb-0">{T("Mapa da Terra", "Earth map")}</h2>
          <label className="t3-toggle"><input type="checkbox" checked={geoLayer} onChange={(e) => setGeoLayer(e.target.checked)} /><span />{T("Geologia (Macrostrat)", "Geology (Macrostrat)")}</label>
        </div>
        <div className="dv-mapbox">
          <MapContainer center={[25, -40]} zoom={2} worldCopyJump style={{ height: "100%" }}>
            <TileLayer url={ESRI} maxZoom={18} attribution={T("Imagens © Esri", "Imagery © Esri")} />
            {geoLayer && <TileLayer url={MACRO} opacity={0.6} maxZoom={14} attribution={T("Geologia © Macrostrat (CC BY 4.0)", "Geology © Macrostrat (CC BY 4.0)")} />}
            <Picker onPick={(la, lo) => pick(la, lo)} />
            {point && <Marker position={[point.lat, point.lon]} icon={pin} />}
            {box && <Rectangle bounds={box} pathOptions={{ color: "#f2b53a", weight: 2, fillOpacity: 0.12 }} />}
            <FlyTo point={point} />
          </MapContainer>
        </div>
        {point && (
          <p className="m-0 mt-2 text-[13px] text-ink-2">
            <b>{point.name}</b> · {fmt(Math.abs(point.lat), 4)}°{point.lat >= 0 ? "N" : "S"}, {fmt(Math.abs(point.lon), 4)}°{point.lon >= 0 ? T("L", "E") : T("O", "W")} · {T("janela 5 × 5 km", "5 × 5 km window")}
            {inCatalog && <> · <span className="text-gold-2">{T(`dentro da célula ${inCatalog.id} do catálogo`, `inside catalogue cell ${inCatalog.id}`)}</span></>}
          </p>
        )}
        {point && <button type="button" className="dv-go dv-go-map" disabled={run?.status?.terrain === "wait"} onClick={analyze}>{T("Analisar este local", "Analyse this place")}</button>}
      </section>

      {/* ---------- resultados ---------- */}
      <section className="card dv-res" aria-label={T("Resultados", "Results")} aria-live="polite">
        <h2 className="eyebrow">{T("3 · Resultado", "3 · Result")}</h2>
        {!run && <p className="note">{T("Os resultados aparecem aqui, etapa por etapa, conforme cada fonte responde.", "Results appear here step by step as each source responds.")}</p>}
        {run && (
          <>
          <p className="note m-0 mb-2">{T("Analisado em", "Analysed at")} {fmt(Math.abs(run.at.lat), 4)}°{run.at.lat >= 0 ? "N" : "S"}, {fmt(Math.abs(run.at.lon), 4)}°{run.at.lon >= 0 ? T("L", "E") : T("O", "W")}</p>
          <ol className="dv-steps">
            {STEPS().map(([k, label]) => (
              <li key={k} className={run.status[k]}>
                <span aria-hidden="true">{run.status[k] === "wait" ? "◌" : run.status[k] === "ok" ? "✓" : run.status[k] === "none" ? "∅" : "✕"}</span>
                {label}
                <small>{run.status[k] === "wait" ? T("buscando…", "fetching…") : run.status[k] === "ok" ? "ok" : run.status[k] === "none" ? T("sem dado neste ponto", "no data at this point") : run.res[k]?.error}</small>
              </li>
            ))}
          </ol>
          </>
        )}
        {ocean && <p className="dv-warn">{T("Este ponto parece estar no mar: o relevo veio plano em 0 m. Escolha um ponto em terra.", "This point seems to be at sea: the relief came back flat at 0 m. Pick a point on land.")}</p>}
        {m && !ocean && siteVec && (
          <>
            <table className="data-table">
              <thead><tr><th>{T("Medida", "Measure")}</th><th>{T(site.name)}</th><th>{T("Este ponto", "This point")}</th><th /></tr></thead>
              <tbody>
                {core.RANK_ATTRS.map((a) => {
                  const meta = data.config.attributes[a];
                  const st = core.dimensionStatus(siteVec[a], m[a], meta.scale, data.config.thresholds);
                  return <tr key={a}><th scope="row">{T(meta.label)}</th><td>{withUnit(siteVec[a], meta.unit)}</td><td>{withUnit(m[a], meta.unit)}</td><td><StatusChip status={st.status} /></td></tr>;
                })}
              </tbody>
            </table>
            <div className="dv-score">
              <div><small>{T("Distância ARA")}</small><b>{fmt(dist, 3)}</b></div>
              <p>{T("Entraria em", "It would rank")} <b>{position}º</b> {T(`entre as ${data.cells.length} células do catálogo para ${T(site.name)}.`, `among the ${data.cells.length} catalogue cells for ${T(site.name)}.`)} <span className="text-warn">{T("Comparação exploratória:", "Exploratory comparison:")}</span> {T("resolução (tiles z14) e processamento diferentes do catálogo (z12) podem limitar a equivalência — o ponto não é misturado ao ranking oficial.", "a resolution (z14 tiles) and processing different from the catalogue (z12) may limit equivalence — the point is not mixed into the official ranking.")}</p>
            </div>
            {inCatalog && (
              <p className="note">{T(`Validação: a célula ${inCatalog.id} do catálogo tem declividade ${fmt(inCatalog.slope_mean_deg, 1)}°, rugosidade ${fmt(inCatalog.roughness_mean_m, 1)} m e amplitude ${fmt(inCatalog.relief_m, 0)} m (centro e fonte podem diferir levemente do ponto escolhido).`, `Check: catalogue cell ${inCatalog.id} has slope ${fmt(inCatalog.slope_mean_deg, 1)}°, roughness ${fmt(inCatalog.roughness_mean_m, 1)} m and relief ${fmt(inCatalog.relief_m, 0)} m (its centre and source may differ slightly from the chosen point).`)}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link className="dv-btn" to={`/3d?site=${targetId}&lat=${point.lat.toFixed(5)}&lon=${point.lon.toFixed(5)}&nome=${encodeURIComponent(point.name)}`}>{T("Ver lado a lado em 3D →", "See side by side in 3D →")}</Link>
            </div>
          </>
        )}
        {terr && !terr.ok && <p className="dv-warn">{T("Relevo indisponível", "Relief unavailable")}: {terr.error}. {T("Sem relevo não há comparação — tente de novo ou outro ponto.", "Without relief there is no comparison — try again or another point.")}</p>}
      </section>

      {/* ---------- contexto + evidências ---------- */}
      {run && (
        <section className="card dv-ctx" aria-label={T("Contexto do local", "Site context")}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="eyebrow">{T("Geologia (Macrostrat)", "Geology (Macrostrat)")}</h3>
              {live.geology?.ok && live.geology.data ? (
                <div className="text-[13px] text-ink-2">
                  <b className="text-ink">{live.geology.data.best.name}</b>
                  {live.geology.data.best.lith && <p className="m-0 mt-1">{T("Litologia", "Lithology")}: {live.geology.data.best.lith}</p>}
                  {live.geology.data.best.age?.best && <p className="m-0">{T("Idade", "Age")}: {live.geology.data.best.age.best}{live.geology.data.best.age.b_ma ? ` (${fmt(live.geology.data.best.age.t_ma, 1)}–${fmt(live.geology.data.best.age.b_ma, 1)} Ma)` : ""}</p>}
                  {live.geology.data.best.descrip && <p className="m-0 mt-1">{live.geology.data.best.descrip.slice(0, 320)}{live.geology.data.best.descrip.length > 320 ? "…" : ""}</p>}
                  <p className="note m-0 mt-1">{T("Escala do mapa", "Map scale")}: {live.geology.data.best.scale}. {live.geology.data.best.ref?.name && <>{T("Fonte", "Source")}: {live.geology.data.best.ref.url ? <a href={live.geology.data.best.ref.url} target="_blank" rel="noopener noreferrer">{live.geology.data.best.ref.name}</a> : live.geology.data.best.ref.name}{live.geology.data.best.ref.year ? ` (${live.geology.data.best.ref.year})` : ""}.</>} {T("Litologia mapeada, não identificação mineral.", "Mapped lithology, not a mineral identification.")}</p>
                  {live.geology.data.all.length > 1 && <p className="note m-0">{T(`Outras ${live.geology.data.all.length - 1} unidades em escalas menos detalhadas.`, `${live.geology.data.all.length - 1} other units at less detailed scales.`)}</p>}
                </div>
              ) : <p className="note">{live.geology?.ok === false ? `${T("Indisponível", "Unavailable")}: ${live.geology.error}` : live.geology ? T("Sem unidade mapeada pelo Macrostrat aqui.", "No unit mapped by Macrostrat here.") : T("Buscando…", "Fetching…")}</p>}
            </div>
            <div>
              <h3 className="eyebrow">{T("Clima ao longo do ano (NASA POWER)", "Climate through the year (NASA POWER)")}</h3>
              {live.climate?.ok && live.climate.data ? <ClimateCalendar climate={live.climate.data} /> : <p className="note">{live.climate?.ok === false ? `${T("Indisponível", "Unavailable")}: ${live.climate.error}` : live.climate ? T("Sem dado.", "No data.") : T("Buscando…", "Fetching…")}</p>}
            </div>
          </div>
          {candidate && !ocean && (
            <>
              <h3 className="eyebrow mt-5">{T("Evidências além do relevo", "Evidence beyond relief")}</h3>
              <EvidencePanel candidate={candidate} site={site} siteAttrs={data.sites[targetId]} siteVec={siteVec} extra={extra} data={data}
                             objective={ex.objective} weights={ex.weights} distance={dist} rankInfo={{ exploratory_position: position, of: data.cells.length }}
                             exploratory sourcesMeta={sourcesMeta} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
