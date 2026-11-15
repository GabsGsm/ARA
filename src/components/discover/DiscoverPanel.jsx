// ARA Anywhere — analisar um local novo da Terra contra um alvo de Marte/Lua.
// Fluxo: escolher ponto (mapa, busca, coordenadas ou análogo famoso) → janela de 5 km → alvo e objetivo →
// "Analisar este local" → relevo (AWS Terrain Tiles) + medidas do ARA → geologia (Macrostrat) → clima (NASA POWER)
// → solo (SoilGrids) → água (JRC) → evidências, comparação exploratória e ficha.
import { useMemo, useState } from "react";
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
import { FAMOUS } from "../lab3d/LiveEarthPicker.jsx";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MACRO = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const pin = L.divIcon({ className: "t3-pin", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });
const STEPS = [
  ["terrain", "Relevo e medidas do ARA (AWS Terrain Tiles)"],
  ["geology", "Unidade geológica (Macrostrat)"],
  ["climate", "Climatologia (NASA POWER)"],
  ["soil", "Solo 0–5 cm (SoilGrids)"],
  ["water", "Água superficial 1984–2021 (JRC)"],
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
  const [run, setRun] = useState(null);              // { status: {step: "wait"|"ok"|"err"|"none"}, res: {...} }
  const targets = data.catalog.sites.filter((s) => data.hasTerrain(s.id));
  const site = data.siteById(targetId);

  const pick = (lat, lon, name) => {
    const lo = ((lon + 540) % 360) - 180;
    setPoint({ lat, lon: lo, name: name || `Ponto ${lat.toFixed(4)}°, ${lo.toFixed(4)}°`, key: `${lat},${lo},${Date.now()}` });
    setLatTxt(lat.toFixed(5)); setLonTxt(lo.toFixed(5));
    setRun(null);
  };

  const search = async () => {
    if (!query.trim()) return;
    setFound({ loading: true });
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`, { headers: { "Accept-Language": "pt-BR" } });
      setFound({ list: (await r.json()).map((x) => ({ name: x.display_name, lat: +x.lat, lon: +x.lon })) });
    } catch { setFound({ error: "Busca indisponível agora — use coordenadas ou clique no mapa." }); }
  };

  // célula do catálogo que contém o ponto (para validação e para evidências pré-processadas)
  const inCatalog = useMemo(() => {
    if (!point) return null;
    return data.cells.find((c) => { const [[s, w], [n, e]] = core.cellBounds(c); return point.lat >= s && point.lat <= n && point.lon >= w && point.lon <= e; }) ?? null;
  }, [point, data.cells]);

  const analyze = async () => {
    if (!point) return;
    const status = Object.fromEntries(STEPS.map(([k]) => [k, "wait"]));
    const res = {};
    const update = () => setRun({ status: { ...status }, res: { ...res } });
    update();
    const done = (k, r) => { res[k] = r; status[k] = r.ok ? (r.data ? "ok" : "none") : "err"; update(); };
    // relevo primeiro (as medidas aparecem assim que chegam); o resto em paralelo
    const tasks = [
      svc.terrain(point.lat, point.lon).then((r) => done("terrain", r)),
      svc.geology(point.lat, point.lon).then((r) => done("geology", r)),
      svc.climate(point.lat, point.lon).then((r) => done("climate", r)),
      svc.soil(point.lat, point.lon).then((r) => done("soil", r)),
      svc.water(point.lat, point.lon).then((r) => done("water", r)),
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

  return (
    <div className="dv-grid">
      {/* ---------- painel esquerdo ---------- */}
      <aside className="card dv-left" aria-label="Escolher local">
        <h2 className="eyebrow">1 · Escolha um ponto da Terra</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar lugar (ex.: Wadi Rum)" aria-label="Buscar lugar" />
          <button type="submit" className="dv-btn">Buscar</button>
        </form>
        {found?.loading && <p className="note">Buscando…</p>}
        {found?.error && <p className="note text-warn">{found.error}</p>}
        {found?.list && (
          <ul className="dv-found">
            {found.list.map((f) => <li key={f.name}><button type="button" onClick={() => { pick(f.lat, f.lon, f.name.split(",").slice(0, 2).join(",")); setFound(null); }}>{f.name}</button></li>)}
            {!found.list.length && <li className="note">Nada encontrado.</li>}
          </ul>
        )}
        <small className="note">Busca: OpenStreetMap / Nominatim</small>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="t3-field"><span>Latitude</span><input className="field" inputMode="decimal" value={latTxt} onChange={(e) => setLatTxt(e.target.value)} /></label>
          <label className="t3-field"><span>Longitude</span><input className="field" inputMode="decimal" value={lonTxt} onChange={(e) => setLonTxt(e.target.value)} /></label>
        </div>
        <button type="button" className="dv-btn mt-2 w-full" disabled={!(Math.abs(+latTxt) <= 85 && Math.abs(+lonTxt) <= 180 && latTxt !== "" && lonTxt !== "")}
                onClick={() => pick(+latTxt, +lonTxt)}>Usar coordenadas</button>
        <select className="field mt-2" value="" aria-label="Análogos famosos" onChange={(e) => { const f = FAMOUS[+e.target.value]; if (f) pick(f.lat, f.lon, f.name); }}>
          <option value="">Ou um análogo famoso (NASA/ESA)…</option>
          {FAMOUS.map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
        </select>

        <h2 className="eyebrow mt-5">2 · Alvo e objetivo</h2>
        <label className="t3-field"><span>Alvo planetário</span>
          <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {targets.map((s) => <option key={s.id} value={s.id}>{BODY_LABEL[s.body]} · {s.name}</option>)}
          </select>
        </label>
        <label className="t3-field mt-2"><span>Objetivo (pesos)</span>
          <select className="field" value={ex.objective} onChange={(e) => ex.setObjective(e.target.value)}>
            {Object.entries(data.config.objectives).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label className="t3-field mt-2"><span>Tamanho da área</span>
          <select className="field" value="5" onChange={() => {}}>
            <option value="5">5 × 5 km (mesma do catálogo)</option>
            <option value="10" disabled>10 × 10 km — em validação</option>
          </select>
        </label>
        <button type="button" className="dv-go" disabled={!point || run?.status?.terrain === "wait"} onClick={analyze}>Analisar este local</button>
        {!point && <p className="note">Clique no mapa, busque um lugar ou digite coordenadas.</p>}
      </aside>

      {/* ---------- mapa ---------- */}
      <section className="card dv-map" aria-label="Mapa">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="eyebrow mb-0">Mapa da Terra</h2>
          <label className="t3-toggle"><input type="checkbox" checked={geoLayer} onChange={(e) => setGeoLayer(e.target.checked)} /><span />Geologia (Macrostrat)</label>
        </div>
        <div className="dv-mapbox">
          <MapContainer center={[25, -40]} zoom={2} worldCopyJump style={{ height: "100%" }}>
            <TileLayer url={ESRI} maxZoom={18} attribution="Imagens © Esri" />
            {geoLayer && <TileLayer url={MACRO} opacity={0.6} maxZoom={14} attribution="Geologia © Macrostrat (CC BY 4.0)" />}
            <Picker onPick={(la, lo) => pick(la, lo)} />
            {point && <Marker position={[point.lat, point.lon]} icon={pin} />}
            {box && <Rectangle bounds={box} pathOptions={{ color: "#f2b53a", weight: 2, fillOpacity: 0.12 }} />}
            <FlyTo point={point} />
          </MapContainer>
        </div>
        {point && (
          <p className="m-0 mt-2 text-[13px] text-ink-2">
            <b>{point.name}</b> · {fmt(Math.abs(point.lat), 4)}°{point.lat >= 0 ? "N" : "S"}, {fmt(Math.abs(point.lon), 4)}°{point.lon >= 0 ? "L" : "O"} · janela 5 × 5 km
            {inCatalog && <> · <span className="text-gold-2">dentro da célula {inCatalog.id} do catálogo</span></>}
          </p>
        )}
      </section>

      {/* ---------- resultados ---------- */}
      <section className="card dv-res" aria-label="Resultados" aria-live="polite">
        <h2 className="eyebrow">3 · Resultado</h2>
        {!run && <p className="note">Os resultados aparecem aqui, etapa por etapa, conforme cada fonte responde.</p>}
        {run && (
          <ol className="dv-steps">
            {STEPS.map(([k, label]) => (
              <li key={k} className={run.status[k]}>
                <span aria-hidden="true">{run.status[k] === "wait" ? "◌" : run.status[k] === "ok" ? "✓" : run.status[k] === "none" ? "∅" : "✕"}</span>
                {label}
                <small>{run.status[k] === "wait" ? "buscando…" : run.status[k] === "ok" ? "ok" : run.status[k] === "none" ? "sem dado neste ponto" : run.res[k]?.error}</small>
              </li>
            ))}
          </ol>
        )}
        {ocean && <p className="dv-warn">Este ponto parece estar no mar: o relevo veio plano em 0 m. Escolha um ponto em terra.</p>}
        {m && !ocean && siteVec && (
          <>
            <table className="data-table">
              <thead><tr><th>Medida</th><th>{site.name}</th><th>Este ponto</th><th /></tr></thead>
              <tbody>
                {core.RANK_ATTRS.map((a) => {
                  const meta = data.config.attributes[a];
                  const st = core.dimensionStatus(siteVec[a], m[a], meta.scale, data.config.thresholds);
                  return <tr key={a}><th scope="row">{meta.label}</th><td>{withUnit(siteVec[a], meta.unit)}</td><td>{withUnit(m[a], meta.unit)}</td><td><StatusChip status={st.status} /></td></tr>;
                })}
              </tbody>
            </table>
            <div className="dv-score">
              <div><small>Distância ARA</small><b>{fmt(dist, 3)}</b></div>
              <p>Entraria em <b>{position}º</b> entre as {data.cells.length} células do catálogo para {site.name}. <span className="text-warn">Comparação exploratória:</span> resolução (tiles z14) e processamento diferentes do catálogo (z12) podem limitar a equivalência — o ponto não é misturado ao ranking oficial.</p>
            </div>
            {inCatalog && (
              <p className="note">Validação: a célula {inCatalog.id} do catálogo tem declividade {fmt(inCatalog.slope_mean_deg, 1)}°, rugosidade {fmt(inCatalog.roughness_mean_m, 1)} m e amplitude {fmt(inCatalog.relief_m, 0)} m (centro e fonte podem diferir levemente do ponto escolhido).</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link className="dv-btn" to={`/3d?site=${targetId}&lat=${point.lat.toFixed(5)}&lon=${point.lon.toFixed(5)}&nome=${encodeURIComponent(point.name)}`}>Ver lado a lado em 3D →</Link>
            </div>
          </>
        )}
        {terr && !terr.ok && <p className="dv-warn">Relevo indisponível: {terr.error}. Sem relevo não há comparação — tente de novo ou outro ponto.</p>}
      </section>

      {/* ---------- contexto + evidências ---------- */}
      {run && (
        <section className="card dv-ctx" aria-label="Contexto do local">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="eyebrow">Geologia (Macrostrat)</h3>
              {live.geology?.ok && live.geology.data ? (
                <div className="text-[13px] text-ink-2">
                  <b className="text-ink">{live.geology.data.best.name}</b>
                  {live.geology.data.best.lith && <p className="m-0 mt-1">Litologia: {live.geology.data.best.lith}</p>}
                  {live.geology.data.best.age?.best && <p className="m-0">Idade: {live.geology.data.best.age.best}{live.geology.data.best.age.b_ma ? ` (${fmt(live.geology.data.best.age.t_ma, 1)}–${fmt(live.geology.data.best.age.b_ma, 1)} Ma)` : ""}</p>}
                  {live.geology.data.best.descrip && <p className="m-0 mt-1">{live.geology.data.best.descrip.slice(0, 320)}{live.geology.data.best.descrip.length > 320 ? "…" : ""}</p>}
                  <p className="note m-0 mt-1">Escala do mapa: {live.geology.data.best.scale}. {live.geology.data.best.ref?.name && <>Fonte: {live.geology.data.best.ref.url ? <a href={live.geology.data.best.ref.url} target="_blank" rel="noopener noreferrer">{live.geology.data.best.ref.name}</a> : live.geology.data.best.ref.name}{live.geology.data.best.ref.year ? ` (${live.geology.data.best.ref.year})` : ""}.</>} Litologia mapeada, não identificação mineral.</p>
                  {live.geology.data.all.length > 1 && <p className="note m-0">Outras {live.geology.data.all.length - 1} unidades em escalas menos detalhadas.</p>}
                </div>
              ) : <p className="note">{live.geology?.ok === false ? `Indisponível: ${live.geology.error}` : live.geology ? "Sem unidade mapeada pelo Macrostrat aqui." : "Buscando…"}</p>}
            </div>
            <div>
              <h3 className="eyebrow">Clima ao longo do ano (NASA POWER)</h3>
              {live.climate?.ok && live.climate.data ? <ClimateCalendar climate={live.climate.data} /> : <p className="note">{live.climate?.ok === false ? `Indisponível: ${live.climate.error}` : live.climate ? "Sem dado." : "Buscando…"}</p>}
            </div>
          </div>
          {candidate && !ocean && (
            <>
              <h3 className="eyebrow mt-5">Evidências além do relevo</h3>
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
