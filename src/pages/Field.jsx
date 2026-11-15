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
  const watch = useRef(null), demoTimer = useRef(null), lastGeo = useRef(null), t0 = useRef(null);
  const site = data.siteById(targetId), siteVec = data.sites[targetId]?.terrain;

  useEffect(() => { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }, [notes]);

  // um fix novo: filtra precisão e saltos, soma distância só com deslocamento real
  const accept = useCallback((lat, lon, acc, t) => {
    setFix({ lat, lon, acc, t });
    if (acc > MAX_ACC) { setRejected((n) => n + 1); return; }
    setTrack((tr) => {
      const last = tr[tr.length - 1];
      if (!last) return [[lat, lon, t]];
      const d = hav(last, [lat, lon]), dt = Math.max((t - last[2]) / 1000, 0.5);
      if (d / dt > MAX_SPEED) { setRejected((n) => n + 1); return tr; }
      if (d < Math.max(acc / 2, 3)) return tr; // ruído parado
      setDist((x) => x + d);
      return [...tr, [lat, lon, t]];
    });
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
    if (!("geolocation" in navigator)) { setErr("Este navegador não oferece localização."); return; }
    if (!window.isSecureContext) { setErr("A localização exige HTTPS."); return; }
    setMode("gps"); setRunning(true); t0.current = Date.now();
    watch.current = navigator.geolocation.watchPosition(
      (p) => accept(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.timestamp),
      (e) => { setErr(e.code === 1 ? "Permissão de localização negada. Você ainda pode escolher um local no mapa ou ver a demonstração." : `GPS indisponível (${e.message}).`); stop(); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  };

  const startDemo = () => {
    stop(); setErr(null); setMode("demo"); setTrack([]); setDist(0); setRejected(0); setRunning(true); t0.current = Date.now();
    // interpola a trilha a cada ~12 m e "anda" 1 passo a cada 0,4 s (≈ 30 m/s simulados, acelerado)
    const pts = [];
    for (let i = 0; i < DEMO.length - 1; i++) {
      const n = Math.max(1, Math.round(hav(DEMO[i], DEMO[i + 1]) / 12));
      for (let k = 0; k < n; k++) pts.push([DEMO[i][0] + (DEMO[i + 1][0] - DEMO[i][0]) * k / n, DEMO[i][1] + (DEMO[i + 1][1] - DEMO[i][1]) * k / n]);
    }
    pts.push(DEMO[DEMO.length - 1]);
    let i = 0, fake = Date.now();
    demoTimer.current = setInterval(() => {
      if (i >= pts.length) { clearInterval(demoTimer.current); setRunning(false); return; }
      fake += 5000; // 12 m em 5 s = 2,4 m/s (caminhada rápida), para o filtro de velocidade
      accept(pts[i][0], pts[i][1], 6, fake);
      i++;
    }, 400);
  };

  const pause = () => {
    if (mode === "gps") { if (running) { stop(); } else startGps(); }
    if (mode === "demo") { if (running) { clearInterval(demoTimer.current); setRunning(false); } else startDemo(); }
  };
  const finish = () => { stop(); };
  const erase = () => { stop(); setTrack([]); setDist(0); setRejected(0); setFix(null); setGeo(null); setTerr(null); setMode(null); };

  const pos = fix ? [fix.lat, fix.lon] : null;
  // consulta geológica só quando o deslocamento é relevante
  useEffect(() => {
    if (!pos) return;
    if (lastGeo.current && hav(lastGeo.current, pos) < REQUERY_M) return;
    lastGeo.current = pos;
    setGeo({ loading: true });
    svc.geology(pos[0], pos[1]).then(setGeo);
  }, [pos?.[0], pos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const characterize = async () => {
    if (!pos) return;
    setTerr({ loading: true, at: pos });
    const [t, c] = await Promise.all([svc.terrain(pos[0], pos[1]), svc.climate(pos[0], pos[1])]);
    setTerr({ at: pos, t, c });
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
        <h1 id="fxTitle" className="display">Explore o seu próprio planeta</h1>
        <p className="lead">Descubra como o ambiente ao seu redor pode ajudar a compreender outros mundos.</p>
        <div className="fx-actions">
          <button type="button" className="fx-big gold" onClick={startGps}><b>Usar minha localização</b><small>GPS do aparelho, só enquanto a sessão estiver ativa</small></button>
          <button type="button" className="fx-big" onClick={() => { setMode("map"); setErr(null); }}><b>Escolher um local no mapa</b><small>Sem GPS: toque num ponto</small></button>
          <button type="button" className="fx-big" onClick={startDemo}><b>Experimentar demonstração</b><small>Percurso simulado no Vale da Morte</small></button>
        </div>
        {err && <p className="dv-warn">{err}</p>}
        <p className="note">Sua localização fica só neste aparelho e não é publicada. Precisão depende do aparelho e do céu aberto; em ambientes fechados o GPS pode errar dezenas de metros.</p>
      </section>
    );
  }

  return (
    <section className="fx-page" aria-label="Exploração de campo">
      {mode === "demo" && <p className="fx-demo">Simulação de percurso — modo demonstração<span className="fx-long"> (trilha aproximada Golden Canyon → Zabriskie Point, Vale da Morte). Não é GPS real.</span></p>}
      <div className="fx-map">
        <MapContainer center={pos ?? [36.42, -116.83]} zoom={pos ? 15 : 3} style={{ height: "100%" }} zoomControl={false}>
          <TileLayer url={ESRI} maxZoom={19} attribution="Imagens © Esri" />
          {geoLayer && <TileLayer url={MACRO} opacity={0.55} maxZoom={14} attribution="Geologia © Macrostrat" />}
          {track.length > 1 && <Polyline positions={track.map((p) => [p[0], p[1]])} pathOptions={{ color: "#f7c75a", weight: 4 }} />}
          {pos && fix.acc && <Circle center={pos} radius={fix.acc} pathOptions={{ color: "#59e0ff", weight: 1, fillOpacity: 0.12 }} />}
          {pos && <Marker position={pos} icon={me} />}
          {pos && <Rectangle bounds={core.cellBounds({ lat: pos[0], lon: pos[1] })} pathOptions={{ color: "#f2b53a", weight: 1, dashArray: "4 6", fillOpacity: 0 }} />}
          <Follow pos={pos} follow={mode !== "map"} />
          <Pick on={mode === "map"} onPick={(la, lo) => { setFix({ lat: la, lon: lo, acc: 0, t: Date.now() }); setTerr(null); }} />
        </MapContainer>
        <div className="fx-hud" role="status">
          <span>{mode === "gps" ? (running ? "● Acompanhando" : "Pausado") : mode === "demo" ? (running ? "● Simulando" : "Simulação parada") : "Local escolhido no mapa"}</span>
          {fix?.acc > 0 && <span>Precisão ± {fmt(fix.acc, 0)} m{fix.acc > MAX_ACC ? " (ignorado)" : ""}</span>}
          {mode !== "map" && <span>Distância {dist >= 1000 ? `${fmt(dist / 1000, 2)} km` : `${fmt(dist, 0)} m`}</span>}
          {mode !== "map" && <span>{track.length} pontos · {rejected} descartados · {elapsed} min</span>}
        </div>
        <div className="fx-ctrl">
          {mode !== "map" && <button type="button" onClick={pause}>{running ? "Pausar" : "Retomar"}</button>}
          {mode !== "map" && <button type="button" onClick={finish}>Finalizar</button>}
          <button type="button" onClick={erase}>Excluir sessão</button>
          <button type="button" aria-pressed={geoLayer} onClick={() => setGeoLayer((v) => !v)}>Geologia</button>
        </div>
        {mode === "map" && !pos && <p className="fx-tip">Toque no mapa para escolher um ponto.</p>}
      </div>

      <div className={`fx-sheet ${sheet ? "open" : ""}`}>
        <button type="button" className="fx-grip" onClick={() => setSheet((v) => !v)} aria-expanded={sheet}>{sheet ? "Recolher ▾" : "Ver painel científico ▴"}</button>
        <div className="fx-sheet-body">
          <h2 className="eyebrow">Você está explorando a Terra</h2>
          {!pos && <p className="note">Aguardando a primeira posição…</p>}
          {pos && <p className="m-0 text-[13px] text-ink-2">{fmt(Math.abs(pos[0]), 5)}°{pos[0] >= 0 ? "N" : "S"}, {fmt(Math.abs(pos[1]), 5)}°{pos[1] >= 0 ? "L" : "O"}</p>}

          <h3 className="fx-q">O que sabemos sobre este local?</h3>
          {geo?.loading && <p className="note">Consultando a geologia…</p>}
          {geo?.ok && geo.data && <p className="m-0 text-[13px] text-ink-2"><b>{geo.data.best.name}</b>{geo.data.best.lith ? ` — ${geo.data.best.lith}` : ""}{geo.data.best.age?.best ? ` · ${geo.data.best.age.best}` : ""}. <span className="text-muted">Mapa geológico regional (escala {geo.data.best.scale}), não coletado agora.</span></p>}
          {geo?.ok && !geo.data && <p className="note">Sem unidade geológica mapeada aqui.</p>}
          {geo && !geo.loading && !geo.ok && <p className="note">Geologia indisponível: {geo.error}</p>}

          <h3 className="fx-q">Qual ambiente planetário está sendo comparado?</h3>
          <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {data.catalog.sites.filter((s) => data.hasTerrain(s.id)).map((s) => <option key={s.id} value={s.id}>{BODY_LABEL[s.body]} · {s.name}</option>)}
          </select>
          <button type="button" className="dv-go" disabled={!pos || terr?.loading} onClick={characterize}>{terr?.loading ? "Analisando o relevo…" : "Caracterizar o relevo daqui (5 km)"}</button>
          {terr?.t && !terr.t.ok && <p className="dv-warn">Relevo indisponível: {terr.t.error}</p>}
          {m && siteVec && (
            <>
              <h3 className="fx-q">O que é semelhante? O que é diferente?</h3>
              <table className="data-table m-0">
                <tbody>{core.RANK_ATTRS.map((a) => { const meta = data.config.attributes[a]; const st = core.dimensionStatus(siteVec[a], m[a], meta.scale, data.config.thresholds);
                  return <tr key={a}><th scope="row">{meta.label}</th><td>{withUnit(m[a], meta.unit)}</td><td>alvo {withUnit(siteVec[a], meta.unit)}</td><td><StatusChip status={st.status} /></td></tr>; })}
                  <tr><th scope="row">Gravidade</th><td>9,81 m/s²</td><td>alvo {site.body === "moon" ? "1,62" : "3,72"} m/s²</td><td><StatusChip status="not_analog" /></td></tr>
                </tbody>
              </table>
              {evid && (
                <>
                  <h3 className="fx-q">Quais dados faltam?</h3>
                  <ul className="list-clean text-[13px] text-ink-2">{evid.nb.missing.map((x) => <li key={x.attr}><b>{x.attr}</b>: {x.measure}</li>)}</ul>
                </>
              )}
              <p className="note">Comparação exploratória (mesma fórmula do ARA, DEM AWS z14). <Link to={`/3d?site=${targetId}&lat=${terr.at[0].toFixed(5)}&lon=${terr.at[1].toFixed(5)}&nome=Campo`}>Abrir lado a lado em 3D →</Link></p>
            </>
          )}

          <h3 className="fx-q">Notas de campo</h3>
          <input className="field" placeholder="Título" value={note.title} onChange={(e) => setNote((n) => ({ ...n, title: e.target.value }))} />
          <textarea className="field mt-2" rows={3} placeholder="O que você observou?" value={note.text} onChange={(e) => setNote((n) => ({ ...n, text: e.target.value }))} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="dv-btn" onClick={saveNote}>Salvar nota</button>
            {notes.length > 0 && <button type="button" className="dv-btn" onClick={exportNotes}>Exportar notas (JSON)</button>}
            {notes.length > 0 && <button type="button" className="dv-btn" onClick={() => setNotes([])}>Apagar todas</button>}
          </div>
          <ul className="fx-notes">
            {notes.map((n) => <li key={n.id}><b>{n.title || "Sem título"}</b>{n.demo ? " (demonstração)" : ""}<small>{new Date(n.date).toLocaleString("pt-BR")} · {n.lat != null ? `${n.lat}°, ${n.lon}° (aprox.)` : "sem posição"}</small>{n.text && <p>{n.text}</p>}</li>)}
          </ul>
          <p className="note">As notas ficam só neste aparelho. Identificação mineral por foto comum não é feita pelo ARA.</p>
        </div>
      </div>
    </section>
  );
}
