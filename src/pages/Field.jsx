// Field Explorer — exploração de campo pelo celular (GPS) ou por demonstração.
// Privacidade: a localização só é acompanhada durante a sessão ativa, fica neste aparelho
// (localStorage) e nunca é enviada a servidores; os serviços de dados recebem só o ponto consultado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Circle, MapContainer, Marker, Polyline, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import * as core from "../lib/core.js";
import { useAraData } from "../hooks/useAraData.jsx";
import { BODY_LABEL, fmt, withUnit } from "../lib/format.js";
import * as svc from "../lib/services/earthData.js";
import { evidenceFor, nextBest } from "../lib/evidence/engine.js";
import StatusChip from "../components/ui/StatusChip.jsx";
import { T } from "../lib/i18n.js";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MACRO = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const NOTES_KEY = "ara-field-notes";
const MAX_ACC = 50;     // m — fixes piores que isso não entram no percurso
const MAX_SPEED = 8;    // m/s — saltos acima disso são tratados como erro de GPS
const REQUERY_M = 400;  // só reconsulta a geologia depois de andar isso

// Trilha aproximada do Golden Canyon → Zabriskie Point (Vale da Morte, EUA), em coordenadas reais,
// usada SOMENTE no modo demonstração.
const DEMO = [
  [36.42069, -116.84657], [36.41994, -116.84430], [36.41911, -116.84205], [36.41842, -116.83981], [36.41722, -116.83804],
  [36.41575, -116.83652], [36.41428, -116.83487], [36.41283, -116.83289], [36.41210, -116.83063], [36.41306, -116.82838],
  [36.41452, -116.82652], [36.41608, -116.82471], [36.41752, -116.82268], [36.41878, -116.82041], [36.41975, -116.81792],
  [36.42016, -116.81505], [36.42019, -116.81226], [36.42020, -116.81002],
];

const hav = (a, b) => {
  const R = 6371008, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const me = L.divIcon({ className: "fx-me", html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] });

function Follow({ pos, follow }) {
  const map = useMap();
  useEffect(() => { if (pos && follow) map.setView(pos, Math.max(map.getZoom(), 14), { animate: true }); }, [pos, follow, map]);
  return null;
}
function Pick({ on, onPick }) { useMapEvents({ click: (e) => on && onPick(e.latlng.lat, e.latlng.lng) }); return null; }

export default function Field() {
  const data = useAraData();
  const [mode, setMode] = useState(null);            // null | gps | map | demo
  const [running, setRunning] = useState(false);
  const [fix, setFix] = useState(null);              // { lat, lon, acc, t }
  const [track, setTrack] = useState([]);            // pontos aceitos [lat, lon]
  const [dist, setDist] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [err, setErr] = useState(null);
  const [geo, setGeo] = useState(null);
  const [terr, setTerr] = useState(null);
  const [targetId, setTargetId] = useState("jezero_01");
  const [geoLayer, setGeoLayer] = useState(false);
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]"); } catch { return []; } });
  const [note, setNote] = useState({ title: "", text: "" });
  const [sheet, setSheet] = useState(true);
  const geoReq = useRef(0), terrReq = useRef(0);
  const watch = useRef(null), demoTimer = useRef(null), lastGeo = useRef(null), t0 = useRef(null);
  const site = data.siteById(targetId), siteVec = data.sites[targetId]?.terrain;

  const [notesErr, setNotesErr] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); setNotesErr(false); }
    catch { setNotesErr(true); } // armazenamento bloqueado ou cheio: o app continua, só avisa
  }, [notes]);

  // um fix novo: filtra precisão e saltos, soma distância só com deslocamento real
  const [lowAcc, setLowAcc] = useState(null);   // precisão do último fix rejeitado (aviso)
  const lastOk = useRef(null);
  const accept = useCallback((lat, lon, acc, t) => {
    // fixes rejeitados (precisão ruim ou salto impossível) não movem o mapa nem disparam consultas
    if (acc > MAX_ACC) { setRejected((n) => n + 1); setLowAcc(acc); return; }
    const last = lastOk.current;
    if (last) {
      const d = hav(last, [lat, lon]), dt = Math.max((t - last[2]) / 1000, 0.5);
      if (d / dt > MAX_SPEED) { setRejected((n) => n + 1); return; }
      if (d < Math.max(acc / 2, 3)) { setFix({ lat, lon, acc, t }); setLowAcc(null); return; } // parado: atualiza só a leitura
      setDist((x) => x + d);
    }
    lastOk.current = [lat, lon, t];
    setLowAcc(null);
    setFix({ lat, lon, acc, t });
    setTrack((tr) => [...tr, [lat, lon, t]]);
  }, []);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    clearInterval(demoTimer.current);
    setRunning(false);
  }, []);
  useEffect(() => stop, [stop]);

  const startGps = () => {
    setErr(null);
    if (!("geolocation" in navigator)) { setErr(T("Este navegador não oferece localização.", "This browser does not provide location.")); return; }
    if (!window.isSecureContext) { setErr(T("A localização exige HTTPS.", "Location requires HTTPS.")); return; }
    setMode("gps"); setRunning(true); if (t0.current == null || mode !== "gps") t0.current = Date.now();
    watch.current = navigator.geolocation.watchPosition(
      (p) => accept(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.timestamp),
      (e) => { setErr(e.code === 1 ? T("Permissão de localização negada. Você ainda pode escolher um local no mapa ou ver a demonstração.", "Location permission denied. You can still pick a place on the map or watch the demonstration.") : T(`GPS indisponível (${e.message}).`, `GPS unavailable (${e.message}).`)); stop(); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  };

  const demo = useRef(null);  // { pts, i, fake } — permite pausar e retomar do mesmo ponto
  const runDemo = () => {
    setRunning(true);
    clearInterval(demoTimer.current);
    demoTimer.current = setInterval(() => {
      const D = demo.current;
      if (!D || D.i >= D.pts.length) { clearInterval(demoTimer.current); setRunning(false); return; }
      D.fake += 5000; // 12 m em 5 s = 2,4 m/s (caminhada rápida), para o filtro de velocidade
      accept(D.pts[D.i][0], D.pts[D.i][1], 6, D.fake);
      D.i++;
    }, 400);
  };
  const startDemo = () => {
    stop(); setErr(null); setMode("demo"); setTrack([]); setDist(0); setRejected(0); setFix(null); lastOk.current = null; t0.current = Date.now();
    // interpola a trilha a cada ~12 m e "anda" 1 passo a cada 0,4 s (≈ 30 m/s simulados, acelerado)
    const pts = [];
    for (let i = 0; i < DEMO.length - 1; i++) {
      const n = Math.max(1, Math.round(hav(DEMO[i], DEMO[i + 1]) / 12));
      for (let k = 0; k < n; k++) pts.push([DEMO[i][0] + (DEMO[i + 1][0] - DEMO[i][0]) * k / n, DEMO[i][1] + (DEMO[i + 1][1] - DEMO[i][1]) * k / n]);
    }
    pts.push(DEMO[DEMO.length - 1]);
    demo.current = { pts, i: 0, fake: Date.now() };
    runDemo();
  };

  const pause = () => {
    if (mode === "gps") { if (running) { stop(); } else startGps(); }
    if (mode === "demo") { if (running) { clearInterval(demoTimer.current); setRunning(false); } else if (demo.current && demo.current.i < demo.current.pts.length) runDemo(); else startDemo(); }
  };
  const finish = () => { stop(); };
  const erase = () => { stop(); setTrack([]); setDist(0); setRejected(0); setFix(null); setGeo(null); setTerr(null); setMode(null); lastGeo.current = null; lastOk.current = null; demo.current = null; t0.current = null; setLowAcc(null); geoReq.current++; terrReq.current++; };

  const pos = fix ? [fix.lat, fix.lon] : null;
  // consulta geológica só quando o deslocamento é relevante
  useEffect(() => {
    if (!pos) return;
    if (lastGeo.current && hav(lastGeo.current, pos) < REQUERY_M) return;
    lastGeo.current = pos;
    setGeo({ loading: true });
    const id = ++geoReq.current, at = pos;  // resposta de um ponto antigo não sobrescreve a do ponto atual
    svc.geology(at[0], at[1]).then((r) => { if (id === geoReq.current) setGeo({ ...r, at }); });
  }, [pos?.[0], pos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // a caracterização vale para o ponto em que foi feita: se a posição andar mais de 100 m, ela é descartada
  useEffect(() => {
    if (pos && terr?.at && hav(terr.at, pos) > 100) { setTerr(null); terrReq.current++; }
  }, [pos?.[0], pos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const characterize = async () => {
    if (!pos) return;
    const id = ++terrReq.current, at = pos;
    setTerr({ loading: true, at });
    const [t, c] = await Promise.all([svc.terrain(at[0], at[1]), svc.climate(at[0], at[1])]);
    if (id === terrReq.current) setTerr({ at, t, c });
  };

  const m = terr?.t?.ok ? terr.t.data.metrics : null;
  const evid = useMemo(() => {
    if (!m || !siteVec) return null;
    const list = evidenceFor({ siteVec, cell: m, extra: { geology: geo?.ok ? geo.data?.best : null, climate: terr?.c?.ok ? terr.c.data : null }, body: site.body, purpose: "treinamento", data });
    return { list, nb: nextBest(list, "treinamento") };
  }, [m, siteVec, geo, terr, site, data]);

  const saveNote = () => {
    if (!note.title.trim() && !note.text.trim()) return;
    setNotes((n) => [{ id: Date.now(), ...note, lat: pos ? +pos[0].toFixed(4) : null, lon: pos ? +pos[1].toFixed(4) : null, date: new Date().toISOString(),
      sources: ["Macrostrat", m ? "AWS Terrain Tiles" : null].filter(Boolean), demo: mode === "demo" }, ...n]);
    setNote({ title: "", text: "" });
  };
  const exportNotes = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ app: "ARA Field Notes", exported: new Date().toISOString(), notes }, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "ARA_field_notes.json" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const elapsed = t0.current ? Math.round((Date.now() - t0.current) / 60000) : 0;

  if (!mode) {
    return (
      <section className="fx-start" aria-labelledby="fxTitle">
        <h1 id="fxTitle" className="display">{T("Explore o seu próprio planeta", "Explore your own planet")}</h1>
        <p className="lead">{T("Descubra como o ambiente ao seu redor pode ajudar a compreender outros mundos.", "Discover how the environment around you can help us understand other worlds.")}</p>
        <div className="fx-actions">
          <button type="button" className="fx-big gold" onClick={startGps}><b>{T("Usar minha localização", "Use my location")}</b><small>{T("GPS do aparelho, só enquanto a sessão estiver ativa", "Device GPS, only while the session is active")}</small></button>
          <button type="button" className="fx-big" onClick={() => { setMode("map"); setErr(null); }}><b>{T("Escolher um local no mapa", "Pick a place on the map")}</b><small>{T("Sem GPS: toque num ponto", "No GPS: tap a point")}</small></button>
          <button type="button" className="fx-big" onClick={startDemo}><b>{T("Experimentar demonstração", "Try the demonstration")}</b><small>{T("Percurso simulado no Vale da Morte", "Simulated walk in Death Valley")}</small></button>
        </div>
        {err && <p className="dv-warn">{err}</p>}
        <p className="note">{T("Sua localização fica só neste aparelho e não é publicada. Precisão depende do aparelho e do céu aberto; em ambientes fechados o GPS pode errar dezenas de metros.", "Your location stays on this device only and is never published. Accuracy depends on the device and open sky; indoors GPS can be off by tens of metres.")}</p>
      </section>
    );
  }

  return (
    <section className="fx-page" aria-label={T("Exploração de campo", "Field exploration")}>
      {mode === "demo" && <p className="fx-demo">{T("Simulação de percurso — modo demonstração", "Simulated walk — demonstration mode")}<span className="fx-long">{T(" (trilha aproximada Golden Canyon → Zabriskie Point, Vale da Morte). Não é GPS real.", " (approximate Golden Canyon → Zabriskie Point trail, Death Valley). Not real GPS.")}</span></p>}
      <div className="fx-map">
        <MapContainer center={pos ?? [36.42, -116.83]} zoom={pos ? 15 : 3} style={{ height: "100%" }} zoomControl={false}>
          <TileLayer url={ESRI} maxZoom={19} attribution={T("Imagens © Esri", "Imagery © Esri")} />
          {geoLayer && <TileLayer url={MACRO} opacity={0.55} maxZoom={14} attribution={T("Geologia © Macrostrat", "Geology © Macrostrat")} />}
          {track.length > 1 && <Polyline positions={track.map((p) => [p[0], p[1]])} pathOptions={{ color: "#f7c75a", weight: 4 }} />}
          {pos && fix.acc && <Circle center={pos} radius={fix.acc} pathOptions={{ color: "#59e0ff", weight: 1, fillOpacity: 0.12 }} />}
          {pos && <Marker position={pos} icon={me} />}
          {pos && <Rectangle bounds={core.cellBounds({ lat: pos[0], lon: pos[1] })} pathOptions={{ color: "#f2b53a", weight: 1, dashArray: "4 6", fillOpacity: 0 }} />}
          <Follow pos={pos} follow={mode !== "map"} />
          <Pick on={mode === "map"} onPick={(la, lo) => { setFix({ lat: la, lon: lo, acc: 0, t: Date.now() }); setTerr(null); terrReq.current++; }} />
        </MapContainer>
        <div className="fx-hud" role="status">
          <span>{mode === "gps" ? (running ? T("● Acompanhando", "● Tracking") : T("Pausado", "Paused")) : mode === "demo" ? (running ? T("● Simulando", "● Simulating") : T("Simulação parada", "Simulation stopped")) : T("Local escolhido no mapa", "Place picked on the map")}</span>
          {fix?.acc > 0 && <span>{T("Precisão", "Accuracy")} ± {fmt(fix.acc, 0)} m{fix.acc > MAX_ACC ? T(" (ignorado)", " (ignored)") : ""}</span>}
          {lowAcc != null && <span className="text-warn">{T(`GPS impreciso agora (± ${fmt(lowAcc, 0)} m): ponto ignorado`, `Imprecise GPS right now (± ${fmt(lowAcc, 0)} m): point ignored`)}</span>}
          {mode !== "map" && <span>{T("Distância", "Distance")} {dist >= 1000 ? `${fmt(dist / 1000, 2)} km` : `${fmt(dist, 0)} m`}</span>}
          {mode !== "map" && <span>{track.length} {T("pontos", "points")} · {rejected} {T("descartados", "discarded")} · {elapsed} min</span>}
        </div>
        <div className="fx-ctrl">
          {mode !== "map" && <button type="button" onClick={pause}>{running ? T("Pausar", "Pause") : T("Retomar", "Resume")}</button>}
          {mode !== "map" && <button type="button" onClick={finish}>{T("Finalizar", "Finish")}</button>}
          <button type="button" onClick={erase}>{T("Excluir sessão", "Delete session")}</button>
          <button type="button" aria-pressed={geoLayer} onClick={() => setGeoLayer((v) => !v)}>{T("Geologia", "Geology")}</button>
        </div>
        {mode === "map" && !pos && <p className="fx-tip">{T("Toque no mapa para escolher um ponto.", "Tap the map to pick a point.")}</p>}
      </div>

      <div className={`fx-sheet ${sheet ? "open" : ""}`}>
        <button type="button" className="fx-grip" onClick={() => setSheet((v) => !v)} aria-expanded={sheet}>{sheet ? T("Recolher ▾", "Collapse ▾") : T("Ver painel científico ▴", "Show science panel ▴")}</button>
        <div className="fx-sheet-body">
          <h2 className="eyebrow">{T("Você está explorando a Terra", "You are exploring Earth")}</h2>
          {!pos && <p className="note">{T("Aguardando a primeira posição…", "Waiting for the first position…")}</p>}
          {pos && <p className="m-0 text-[13px] text-ink-2">{fmt(Math.abs(pos[0]), 5)}°{pos[0] >= 0 ? "N" : "S"}, {fmt(Math.abs(pos[1]), 5)}°{pos[1] >= 0 ? T("L", "E") : T("O", "W")}</p>}

          <h3 className="fx-q">{T("O que sabemos sobre este local?", "What do we know about this place?")}</h3>
          {geo?.loading && <p className="note">{T("Consultando a geologia…", "Looking up the geology…")}</p>}
          {geo?.ok && geo.data && <p className="m-0 text-[13px] text-ink-2"><b>{geo.data.best.name}</b>{geo.data.best.lith ? ` — ${geo.data.best.lith}` : ""}{geo.data.best.age?.best ? ` · ${geo.data.best.age.best}` : ""}. <span className="text-muted">{T(`Mapa geológico regional (escala ${geo.data.best.scale}), não coletado agora.`, `Regional geological map (scale ${geo.data.best.scale}), not collected now.`)}</span></p>}
          {geo?.ok && !geo.data && <p className="note">{T("Sem unidade geológica mapeada aqui.", "No geological unit mapped here.")}</p>}
          {geo && !geo.loading && !geo.ok && <p className="note">{T("Geologia indisponível", "Geology unavailable")}: {geo.error}</p>}

          <h3 className="fx-q">{T("Qual ambiente planetário está sendo comparado?", "Which planetary environment is being compared?")}</h3>
          <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {data.catalog.sites.filter((s) => data.hasTerrain(s.id)).map((s) => <option key={s.id} value={s.id}>{T(BODY_LABEL[s.body])} · {s.name}</option>)}
          </select>
          <button type="button" className="dv-go" disabled={!pos || terr?.loading} onClick={characterize}>{terr?.loading ? T("Analisando o relevo…", "Analysing the relief…") : T("Caracterizar o relevo daqui (5 km)", "Characterise the relief here (5 km)")}</button>
          {terr?.t && !terr.t.ok && <p className="dv-warn">{T("Relevo indisponível", "Relief unavailable")}: {terr.t.error}</p>}
          {m && siteVec && (
            <>
              <h3 className="fx-q">{T("O que é semelhante? O que é diferente?", "What is similar? What is different?")}</h3>
              <table className="data-table m-0">
                <tbody>{core.RANK_ATTRS.map((a) => { const meta = data.config.attributes[a]; const st = core.dimensionStatus(siteVec[a], m[a], meta.scale, data.config.thresholds);
                  return <tr key={a}><th scope="row">{T(meta.label)}</th><td>{withUnit(m[a], meta.unit)}</td><td>{T("alvo", "target")} {withUnit(siteVec[a], meta.unit)}</td><td><StatusChip status={st.status} /></td></tr>; })}
                  <tr><th scope="row">{T("Gravidade")}</th><td>{fmt(9.81, 2)} m/s²</td><td>{T("alvo", "target")} {fmt(site.body === "moon" ? 1.62 : 3.72, 2)} m/s²</td><td><StatusChip status="not_analog" /></td></tr>
                </tbody>
              </table>
              {evid && (
                <>
                  <h3 className="fx-q">{T("Quais dados faltam?", "What data is missing?")}</h3>
                  <ul className="list-clean text-[13px] text-ink-2">{evid.nb.missing.map((x) => <li key={x.attr}><b>{x.attr}</b>: {x.measure}</li>)}</ul>
                </>
              )}
              <p className="note">{T("Comparação exploratória (mesma fórmula do ARA, DEM AWS z14).", "Exploratory comparison (same formula as ARA, AWS z14 DEM).")} <Link to={`/3d?site=${targetId}&lat=${terr.at[0].toFixed(5)}&lon=${terr.at[1].toFixed(5)}&nome=Campo`}>{T("Abrir lado a lado em 3D →", "Open side by side in 3D →")}</Link></p>
            </>
          )}

          <h3 className="fx-q">{T("Notas de campo", "Field notes")}</h3>
          <input className="field" placeholder={T("Título", "Title")} value={note.title} onChange={(e) => setNote((n) => ({ ...n, title: e.target.value }))} />
          <textarea className="field mt-2" rows={3} placeholder={T("O que você observou?", "What did you observe?")} value={note.text} onChange={(e) => setNote((n) => ({ ...n, text: e.target.value }))} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="dv-btn" onClick={saveNote}>{T("Salvar nota", "Save note")}</button>
            {notes.length > 0 && <button type="button" className="dv-btn" onClick={exportNotes}>{T("Exportar notas (JSON)", "Export notes (JSON)")}</button>}
            {notes.length > 0 && <button type="button" className="dv-btn" onClick={() => setNotes([])}>{T("Apagar todas", "Delete all")}</button>}
          </div>
          {notesErr && <p className="note text-warn">{T("Não foi possível salvar as notas neste navegador (armazenamento bloqueado ou cheio). Exporte antes de sair.", "Notes could not be saved in this browser (storage blocked or full). Export them before leaving.")}</p>}
            <ul className="fx-notes">
            {notes.map((n) => <li key={n.id}><b>{n.title || T("Sem título", "Untitled")}</b>{n.demo ? T(" (demonstração)", " (demonstration)") : ""}<small>{new Date(n.date).toLocaleString(T("pt-BR", "en-US"))} · {n.lat != null ? `${n.lat}°, ${n.lon}° (${T("aprox.", "approx.")})` : T("sem posição", "no position")}</small>{n.text && <p>{n.text}</p>}</li>)}
          </ul>
          <p className="note">{T("As notas ficam só neste aparelho. Identificação mineral por foto comum não é feita pelo ARA.", "Notes stay on this device only. ARA does not identify minerals from ordinary photos.")}</p>
        </div>
      </div>
    </section>
  );
}
