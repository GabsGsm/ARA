// Laboratório 3D — o sítio em Marte/Lua e o análogo na Terra lado a lado, em relevo real,
// na mesma escala, com câmeras sincronizadas, Sol físico, camadas científicas, perfil,
// tour guiado e caminhada com a gravidade de cada corpo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TerrainPane from "../components/lab3d/TerrainPane.jsx";
import ProfileChart from "../components/lab3d/ProfileChart.jsx";
import GlobeIntro from "../components/lab3d/GlobeIntro.jsx";
import LiveEarthPicker from "../components/lab3d/LiveEarthPicker.jsx";
import { useMotion } from "../hooks/useMotion.jsx";
import { buildLiveScene } from "../lib/terrain3d/liveEarth.js";
import StatusChip from "../components/ui/StatusChip.jsx";
import { useAraData } from "../hooks/useAraData.jsx";
import * as core from "../lib/core.js";
import { fmt, withUnit } from "../lib/format.js";
import { BODIES, loadIndex, profile as makeProfile } from "../lib/terrain3d/data.js";
import { SEASON, daylight, fmtHour, nowHour, shadowMask, sunPosition } from "../lib/terrain3d/sun.js";

const LAYERS = [
  { value: "imagem", label: "Imagem" },
  { value: "declividade", label: "Declividade" },
  { value: "altitude", label: "Altitude" },
  { value: "relevo", label: "Só relevo" },
];
const NAV = [{ value: "orbit", label: "Órbita" }, { value: "walk", label: "Caminhar" }, { value: "tour", label: "Tour guiado" }];
const ATTRS = core.RANK_ATTRS;

const TOUR = [
  { cam: { p: [0, 0.46, 0.6], t: [0, -0.02, 0.04] }, layer: "imagem", title: "Visão geral",
    text: (L, R) => `Duas janelas de 10 × 10 km na mesma escala. O quadrado dourado é a célula de 5 km comparada pelo ARA. ${L} à esquerda${R ? `, ${R} à direita` : ""}.` },
  { cam: { p: [0, 1.25, 0.002], t: [0, 0, 0] }, layer: "declividade", title: "Onde um rover passa",
    text: () => "Vista de cima colorida pela declividade: verde até 5° (fácil), amarelo até 15° (limite de rovers como o Perseverance), laranja e vermelho acima disso." },
  { cam: { p: [-0.52, 0.11, 0.42], t: [0.05, -0.02, -0.05] }, layer: "imagem", title: "Rasante",
    text: () => "Voo baixo para sentir a rugosidade — o desvio-padrão local da altitude, uma das três medidas do ARA." },
  { cam: { p: [0.62, 0.28, -0.46], t: [0, 0, 0] }, layer: "altitude", title: "Amplitude do relevo",
    text: (L, R, s) => `Cores por altitude. A diferença entre o ponto mais alto e o mais baixo da célula é a amplitude: ${s}.` },
  { cam: { p: [0, 0.46, 0.6], t: [0, -0.02, 0.04] }, layer: "imagem", title: "Agora é com você",
    text: () => "Arraste para girar, use a roda para aproximar, clique em dois pontos para traçar um perfil ou entre no modo Caminhar." },
];

function Seg({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="t3-seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, children }) {
  return (
    <label className="t3-toggle"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span />{children}</label>
  );
}

export default function Lab3D() {
  const data = useAraData();
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const siteId = params.get("site") || "jezero_01";
  const [analogId, setAnalogId] = useState(params.get("analog"));
  // a URL pode abrir o laboratório já configurado (?layer=declividade&hour=7.5&exag=3&curvas=1&nav=tour)
  const [settings, setSettings] = useState(() => ({
    exag: Number(params.get("exag")) || 2, layer: LAYERS.some((l) => l.value === params.get("layer")) ? params.get("layer") : "imagem",
    contours: params.get("curvas") === "1", step: Number(params.get("passo")) || 50, labels: true, path: true, cell: true,
    minerals: params.get("minerais") === "1",
  }));
  const [sync, setSync] = useState(true);
  const [nav, setNav] = useState(() => (NAV.some((n) => n.value === params.get("nav")) ? params.get("nav") : "orbit"));
  const [hour, setHour] = useState(() => (params.has("hour") ? Number(params.get("hour")) : 10.5));
  const [season, setSeason] = useState({ mars: SEASON.mars.def, moon: SEASON.moon.def, earth: SEASON.earth.def });
  const [scenes, setScenes] = useState({});
  const [lit, setLit] = useState({});
  const [tool, setTool] = useState(null);           // "profile"
  const [pts, setPts] = useState([]);
  const [tourStep, setTourStep] = useState(-1);
  const [walkInfo, setWalkInfo] = useState(null);
  const [jump, setJump] = useState(null);
  const [locked, setLocked] = useState(false);
  const [panels, setPanels] = useState({ left: true, right: true });
  const [showSources, setShowSources] = useState(false);
  const [intro, setIntro] = useState(null);         // { id, body, lat, lon, name } enquanto o globo anima
  const [live, setLive] = useState({ scene: null, busy: false, progress: { f: 0, text: "" }, error: null });
  const { calm } = useMotion();
  const left = useRef(null), right = useRef(null);

  useEffect(() => { loadIndex().then(setIndex).catch((e) => setErr(e.message)); }, []);

  const byId = useMemo(() => Object.fromEntries((index?.scenes ?? []).map((s) => [s.id, s])), [index]);
  const site = byId[siteId];
  const isOverview = site?.kind === "overview";
  const planetBody = site?.body ?? "mars";

  // ranking do sítio contra as células da Terra que têm cena 3D
  const ranking = useMemo(() => {
    if (data.status !== "ready" || !data.sites[siteId]?.terrain) return [];
    // posição real entre todas as células da grade; a lista mostra só as que têm cena 3D
    const all = core.rank(data.sites[siteId].terrain, data.cells, data.config.objectives.default.weights, data.scales, data.cells.length);
    return all.filter((r) => byId[r.cell.id]).slice(0, 12);
  }, [data, siteId, byId]);

  useEffect(() => {
    if (!ranking.length) return;
    if (!analogId || !ranking.some((r) => r.cell.id === analogId)) setAnalogId(ranking[0].cell.id);
  }, [ranking]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWalk = site?.kind === "walk";
  const twin = !isOverview && !isWalk && (live.scene || (analogId && byId[analogId]));
  const asked = params.get("analog");
  const missing3d = asked && index && !byId[asked] ? (data.cells?.find((c) => c.id === asked) ? data.cellName(data.cells.find((c) => c.id === asked)) : asked) : null;

  const setSite = (id) => {
    const p = { site: id };
    setParams(p, { replace: true });
    setAnalogId(null);
    if (nav === "walk") setNav("orbit");
    setPts([]); setTool(null);
    left.current?.view?.resetView(); right.current?.view?.resetView();
  };

  // ---- descida a partir do globo (Marte/Lua), uma vez por sítio
  const introFor = useRef(null);
  useEffect(() => {
    if (!site || site.body === "earth" || calm || params.get("intro") === "0" || introFor.current === site.id) return;
    introFor.current = site.id;
    setIntro({ id: site.id, body: site.body, lat: site.lat, lon: site.lon, name: site.name });
  }, [site, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  const endIntro = () => { setIntro(null); left.current?.view?.descend(); right.current?.view?.descend(); };

  // ---- cena HiRISE: abre direto caminhando no local de pouso
  useEffect(() => { if (isWalk) { setNav("walk"); setSettings((s) => ({ ...s, exag: 1 })); } }, [isWalk, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- testar um lugar qualquer da Terra
  const testLive = async (lat, lon, name) => {
    setLive((l) => ({ ...l, busy: true, error: null, progress: { f: 0, text: "Começando…" } }));
    try {
      const sc = await buildLiveScene(lat, lon, name, (text, f) => setLive((l) => ({ ...l, progress: { text, f } })));
      setLive({ scene: sc, busy: false, progress: { f: 1, text: "" }, error: null });
    } catch (e) {
      console.error(e);
      setLive((l) => ({ ...l, busy: false, error: "Não consegui baixar os dados desse ponto (sem rede ou fora da cobertura). Tente outro." }));
    }
  };

  // ---- ponto vindo do modo Descobrir do Explorar (?lat=&lon=&nome=)
  const askedLive = useRef(false);
  useEffect(() => {
    const la = Number(params.get("lat")), lo = Number(params.get("lon"));
    if (askedLive.current || !params.has("lat") || !Number.isFinite(la) || !Number.isFinite(lo)) return;
    askedLive.current = true;
    testLive(la, lo, params.get("nome") || `Ponto ${la.toFixed(3)}°, ${lo.toFixed(3)}°`);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sincronização de câmeras
  const onCamera = useCallback((side, s) => {
    if (!sync) return;
    const other = side === "left" ? right.current : left.current;
    other?.view?.setCamState(s);
  }, [sync]);

  // ---- Sol
  const sunFor = useCallback((s) => {
    if (!s) return null;
    const b = s.meta.body;
    return { ...sunPosition(s.meta.lat, b, season[b], hour), day: daylight(s.meta.lat, b, season[b]) };
  }, [hour, season]);

  useEffect(() => {
    const t = setTimeout(() => {
      for (const [side, ref] of [["left", left], ["right", right]]) {
        const s = scenes[side];
        if (!s || !ref.current?.view) continue;
        const sp = sunFor(s);
        ref.current.view.setSun(sp.azimuth, sp.elevation);
        const { mask, lit: f } = shadowMask(s.heights, s.n, s.meta.size_m / s.n, sp.azimuth, sp.elevation);
        ref.current.view.setShadowMask(mask);
        setLit((l) => ({ ...l, [side]: f }));
      }
    }, 60);
    return () => clearTimeout(t);
  }, [scenes, sunFor]);

  const onLoaded = useCallback((side, s) => setScenes((m) => ({ ...m, [side]: s })), []);

  // ---- perfil
  const onPick = useCallback((side, p) => {
    if (tool !== "profile") return;
    setPts((cur) => (cur.length >= 2 ? [p] : [...cur, p]));
  }, [tool]);
  useEffect(() => {
    const [a, b] = pts.length === 2 ? pts : [null, null];
    left.current?.view?.setProfile(a, b);
    right.current?.view?.setProfile(a, b);
  }, [pts, scenes]);
  const profiles = useMemo(() => {
    if (pts.length !== 2) return [];
    return [["left", scenes.left], ["right", twin ? scenes.right : null]].map(([side, s]) =>
      s ? { side, name: s.meta.name, ...makeProfile(s, pts[0], pts[1]) } : null);
  }, [pts, scenes, twin]);

  // ---- navegação: órbita / caminhar / tour
  const tourTimer = useRef(null);
  const stopTour = () => { clearTimeout(tourTimer.current); setTourStep(-1); left.current?.view?.cancelFly(); right.current?.view?.cancelFly(); };
  useEffect(() => {
    const walk = nav === "walk";
    const start = isWalk ? scenes.left?.meta?.pois?.find((q) => q.kind === "landing") : null;
    left.current?.view?.setMode(walk ? "walk" : "orbit", start);
    right.current?.view?.setMode("orbit");
    if (nav === "tour") setTourStep(0); else stopTour();
    if (!walk) { setWalkInfo(null); setJump(null); }
  }, [nav, scenes.left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tourStep < 0) return;
    const st = TOUR[tourStep];
    setSettings((s) => ({ ...s, layer: st.layer }));
    left.current?.view?.flyTo(st.cam, 2600);
    right.current?.view?.flyTo(st.cam, 2600);
  }, [tourStep, scenes.left, scenes.right]);

  const onUser = useCallback(() => { if (nav === "tour") { stopTour(); setNav("orbit"); } }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p role="alert" className="m-5 rounded-2xl border border-bad bg-bad/10 px-4 py-3">{err}</p>;
  if (!index) return <p className="note p-8" role="status">Carregando cenas 3D…</p>;

  const L = scenes.left?.meta, R = twin ? scenes.right?.meta : null;
  const sunL = sunFor(scenes.left), sunR = twin ? sunFor(scenes.right) : null;
  const ORDER = { mars: 0, moon: 1 }, KIND = { walk: 0, overview: 1, site: 2 };
  const planets = index.scenes.filter((s) => s.body !== "earth")
    .sort((a, b) => ORDER[a.body] - ORDER[b.body] || KIND[a.kind] - KIND[b.kind] || a.name.localeCompare(b.name));
  const earthScenes = index.scenes.filter((s) => s.body === "earth");
  const siteVec = data.sites?.[siteId]?.terrain;
  const liveStats = live.scene?.meta.stats_inner.at_100m;
  const cell = liveStats ? { ...liveStats, id: live.scene.meta.id } : data.cells?.find((c) => c.id === analogId);
  const dims = siteVec && cell ? ATTRS.map((a) => ({
    attr: a, meta: data.config.attributes[a], site: siteVec[a], cell: cell[a],
    ...core.dimensionStatus(siteVec[a], cell[a], data.config.attributes[a].scale, data.config.thresholds),
  })) : [];
  let rk = ranking.find((r) => r.cell.id === analogId);
  if (liveStats && siteVec && data.status === "ready") {
    const w = core.normalizeWeights(data.config.objectives.default.weights);
    const d = core.distance(siteVec, liveStats, w, data.scales);
    const better = data.cells.filter((c) => core.distance(siteVec, c, w, data.scales) < d).length;
    rk = { d, position: better + 1, live: true };
  }
  const gB = BODIES[planetBody], jumpH = (g) => (2.5 * 2.5) / (2 * g);
  const tour = tourStep >= 0 ? TOUR[tourStep] : null;
  const reliefTxt = [L && `${L.name} ${fmt(L.stats_inner?.at_100m?.relief_m ?? 0, 0)} m`, R && `${R.name} ${fmt(R.stats_inner?.at_100m?.relief_m ?? 0, 0)} m`].filter(Boolean).join(" · ");
  const ss = SEASON[planetBody];

  const download = () => {
    const a = left.current?.view?.snapshot(), b = twin ? right.current?.view?.snapshot() : null;
    const imgs = [a, b].filter(Boolean).map((src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; }));
    Promise.all(imgs).then((list) => {
      const w = list.reduce((s, i) => s + i.width, 0), h = Math.max(...list.map((i) => i.height));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h + 40;
      const g = cv.getContext("2d"); g.fillStyle = "#041c28"; g.fillRect(0, 0, w, h + 40);
      let x = 0; list.forEach((i) => { g.drawImage(i, x, 0); x += i.width; });
      g.fillStyle = "#f2b53a"; g.font = "16px Michroma, sans-serif";
      g.fillText(`ARA · ${L?.name ?? ""}${R ? `  ⇄  ${R.name}` : ""} · relevo real, mesma escala`, 14, h + 26);
      const link = document.createElement("a"); link.download = `ARA_3D_${siteId}${R ? `_${analogId}` : ""}.png`; link.href = cv.toDataURL("image/png"); link.click();
    });
  };

  return (
    <section aria-labelledby="labTitle" className="t3-page">
      <h1 id="labTitle" className="sr-only">Laboratório 3D</h1>
      <div className={`t3-stage ${twin ? "twin" : "single"}`}>
        <TerrainPane ref={left} side="left" sceneId={siteId} settings={settings} onCamera={onCamera} onPick={onPick}
                     onSite={setSite} onLoaded={onLoaded} onUser={onUser} walking={nav === "walk"}
                     onWalk={(_, p) => setWalkInfo(p)} onJump={(_, h) => setJump(h)} onWalkLock={setLocked} />
        {twin && (
          <TerrainPane ref={right} side="right" sceneId={live.scene ? null : analogId} sceneData={live.scene} settings={settings}
                       onCamera={onCamera} onPick={onPick} onLoaded={onLoaded} onUser={onUser} />
        )}
        {twin && <div className="t3-divider" aria-hidden="true"><span>⇄</span></div>}
        {intro && <GlobeIntro key={intro.id} {...intro} slow={params.get("intro") === "lento"} onDone={endIntro} />}

        {/* ---------- barra superior ---------- */}
        <div className="t3-top">
          <div className="t3-crumb">
            <span>{BODIES[planetBody].label}</span><i>›</i><b>{site?.name}</b>
            {twin && <><i className="t3-vs">⇄</i><span>Terra</span><i>›</i><b>{live.scene ? live.scene.meta.name : byId[analogId]?.name}</b></>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Seg label="Navegação" options={NAV} value={nav} onChange={setNav} />
            {twin && <Toggle on={sync} onChange={setSync}>Câmeras juntas</Toggle>}
          </div>
        </div>

        {/* ---------- painel esquerdo ---------- */}
        <aside className={`t3-panel t3-left ${panels.left ? "" : "closed"}`} aria-label="Locais e comparação">
          <button type="button" className="t3-collapse" onClick={() => setPanels((p) => ({ ...p, left: !p.left }))}
                  aria-label={panels.left ? "Recolher painel" : "Abrir painel"}>{panels.left ? "‹" : "›"}</button>
          <div className="t3-scroll">
            <h2 className="t3-h">Sítio planetário</h2>
            <div className="t3-list" role="radiogroup" aria-label="Sítio">
              {planets.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={s.id === siteId} onClick={() => setSite(s.id)}>
                  <span className={`t3-dot ${s.body}`} />
                  <span><b>{s.name}</b><small>{BODIES[s.body].label} · {s.kind === "overview" ? `visão geral ${fmt(s.size_m / 1000, 0)} km` : s.kind === "walk" ? "caminhada em alta resolução" : s.group}</small></span>
                </button>
              ))}
            </div>

            {!isOverview && (
              <>
                <h2 className="t3-h">Análogo na Terra</h2>
                {missing3d && <p className="t3-note mb-2">“{missing3d}” ainda não tem cena 3D. Mostrando o melhor análogo que tem relevo 3D gerado.</p>}
                <div className="t3-list" role="radiogroup" aria-label="Análogo">
                  {ranking.map((r) => (
                    <button key={r.cell.id} type="button" role="radio" aria-checked={!live.scene && r.cell.id === analogId} onClick={() => { setLive((l) => ({ ...l, scene: null })); setAnalogId(r.cell.id); }}>
                      <span className="t3-rank">{r.position}º</span>
                      <span><b>{byId[r.cell.id]?.name ?? r.cell.id}</b><small>distância {fmt(r.d, 3)} · {r.position}º de {data.cells.length} células{r.position === 1 ? " · o melhor" : ""}</small></span>
                    </button>
                  ))}
                  {!ranking.length && earthScenes.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={s.id === analogId} onClick={() => setAnalogId(s.id)}>
                      <span className="t3-dot earth" /><span><b>{s.name}</b></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {!isOverview && !isWalk && (
              <>
                <h2 className="t3-h">Testar qualquer lugar da Terra</h2>
                <LiveEarthPicker busy={live.busy} progress={live.progress} error={live.error} onTest={testLive}
                                 active={Boolean(live.scene)} onClear={() => setLive((l) => ({ ...l, scene: null }))} />
              </>
            )}

            {dims.length > 0 && (
              <>
                <h2 className="t3-h">{live.scene ? "Este ponto seria análogo?" : "Por que é análogo"}</h2>
                <table className="t3-table">
                  <thead><tr><th>Medida</th><th>{BODIES[planetBody].label}</th><th>Terra</th><th /></tr></thead>
                  <tbody>
                    {dims.map((d) => (
                      <tr key={d.attr}>
                        <td>{d.meta.label}</td><td>{withUnit(d.site, d.meta.unit)}</td><td>{withUnit(d.cell, d.meta.unit)}</td>
                        <td><StatusChip status={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rk && <p className="t3-note">Distância ARA {fmt(rk.d, 3)} — {rk.live ? `entraria em ${rk.position}º lugar` : `${rk.position}º lugar`} entre {data.cells.length} células da Terra. Calculado a 100 m, como no ranking.</p>}
                {L?.stats_inner?.at_100m && R?.stats_inner?.at_100m && (
                  <p className="t3-note">Conferência no 3D (recalculado nesta cena, 100 m): declividade {fmt(L.stats_inner.at_100m.slope_mean_deg, 1)}° × {fmt(R.stats_inner.at_100m.slope_mean_deg, 1)}°,
                    amplitude {fmt(L.stats_inner.at_100m.relief_m, 0)} × {fmt(R.stats_inner.at_100m.relief_m, 0)} m.</p>
                )}
                <p className="t3-note">Não reproduzível na Terra: gravidade ({fmt(gB.g, 2)} vs 9,81 m/s²), atmosfera e radiação.</p>
              </>
            )}
            {isWalk && <p className="t3-note mt-4">Relevo HiRISE de 1 m e imagem de 25 cm em volta do pouso do Perseverance. Ande pelo terreno com a gravidade de Marte; o trajeto do rover está marcado em branco.</p>}
            {isOverview && <p className="t3-note mt-4">Clique num quadrado dourado no relevo para abrir aquele sítio lado a lado com o melhor análogo da Terra.</p>}
          </div>
        </aside>

        {/* ---------- painel direito ---------- */}
        <aside className={`t3-panel t3-right ${panels.right ? "" : "closed"}`} aria-label="Camadas, Sol e ferramentas">
          <button type="button" className="t3-collapse" onClick={() => setPanels((p) => ({ ...p, right: !p.right }))}
                  aria-label={panels.right ? "Recolher painel" : "Abrir painel"}>{panels.right ? "›" : "‹"}</button>
          <div className="t3-scroll">
            <h2 className="t3-h">Camada</h2>
            <Seg label="Camada" options={LAYERS} value={settings.layer} onChange={(v) => setSettings((s) => ({ ...s, layer: v }))} />
            {settings.layer === "declividade" && (
              <div className="t3-legend">
                <span style={{ "--c": "#2a9e73" }}>&lt;5° fácil</span><span style={{ "--c": "#f9d64d" }}>15° limite rover</span>
                <span style={{ "--c": "#f58033" }}>25°</span><span style={{ "--c": "#cc262e" }}>35°+ íngreme</span>
              </div>
            )}
            {settings.layer === "altitude" && L && <p className="t3-note">{fmt(L.height.min, 0)} a {fmt(L.height.max, 0)} m{R ? ` · Terra ${fmt(R.height.min, 0)} a ${fmt(R.height.max, 0)} m` : ""}</p>}
            <div className="t3-toggles">
              <Toggle on={settings.contours} onChange={(v) => setSettings((s) => ({ ...s, contours: v }))}>Curvas de nível</Toggle>
              {settings.contours && (
                <select className="t3-select" value={settings.step} aria-label="Intervalo das curvas"
                        onChange={(e) => setSettings((s) => ({ ...s, step: Number(e.target.value) }))}>
                  {[10, 25, 50, 100, 250].map((v) => <option key={v} value={v}>a cada {v} m</option>)}
                </select>
              )}
              <Toggle on={settings.cell} onChange={(v) => setSettings((s) => ({ ...s, cell: v }))}>Célula de 5 km</Toggle>
              <Toggle on={settings.labels} onChange={(v) => setSettings((s) => ({ ...s, labels: v }))}>Rótulos</Toggle>
              {planetBody === "mars" && <Toggle on={settings.path} onChange={(v) => setSettings((s) => ({ ...s, path: v }))}>Trajeto do Perseverance</Toggle>}
              {L?.minerals && <Toggle on={settings.minerals} onChange={(v) => setSettings((s) => ({ ...s, minerals: v, layer: v ? "imagem" : s.layer }))}>Minerais (CRISM)</Toggle>}
            </div>
            {settings.minerals && L?.minerals && (
              <div className="t3-minlegend">
                {L.minerals.classes.map((c) => (
                  <span key={c.value} style={{ "--c": `rgb(${c.color.join(",")})` }}>{c.name}<b>{fmt(c.pct, 1)}%</b></span>
                ))}
                <p className="t3-note">{fmt(L.minerals.coverage_pct, 0)}% desta cena tem mapa mineral (borda oeste de Jezero). {L.minerals.note} Valantinas et al. 2026.</p>
              </div>
            )}
            <label className="t3-range">
              <span>Exagero vertical <b>{fmt(settings.exag, 1)}×</b></span>
              <input type="range" min="1" max="6" step="0.5" value={settings.exag} onChange={(e) => setSettings((s) => ({ ...s, exag: Number(e.target.value) }))} />
            </label>

            <h2 className="t3-h">Sol e sombras</h2>
            <label className="t3-range">
              <span>Hora solar local <b>{fmtHour(hour)}</b></span>
              <input type="range" min="0" max="24" step="0.05" value={hour} onChange={(e) => setHour(Number(e.target.value))} />
            </label>
            <label className="t3-range">
              <span>{ss.label} <b>{ss.fmt(season[planetBody])}</b></span>
              <input type="range" min={ss.min} max={ss.max} step={ss.step} value={season[planetBody]}
                     onChange={(e) => setSeason((m) => ({ ...m, [planetBody]: Number(e.target.value) }))} />
            </label>
            {twin && (
              <label className="t3-range">
                <span>Terra: {SEASON.earth.label.toLowerCase()} <b>{SEASON.earth.fmt(season.earth)}</b></span>
                <input type="range" min={1} max={365} step={1} value={season.earth} onChange={(e) => setSeason((m) => ({ ...m, earth: Number(e.target.value) }))} />
              </label>
            )}
            <div className="t3-btns">
              <button type="button" onClick={() => scenes.left && setHour(nowHour(scenes.left.meta.body, scenes.left.meta.lon))}>Agora</button>
              <button type="button" onClick={() => setHour(12)}>Meio-dia</button>
              <button type="button" onClick={() => setHour(sunL?.day?.rise ? sunL.day.rise + 0.4 : 7)}>Sol baixo</button>
            </div>
            <dl className="t3-sun">
              {[["left", L, sunL], ["right", R, sunR]].filter(([, m]) => m).map(([side, m, sp]) => (
                <div key={side}>
                  <dt>{BODIES[m.body].label}</dt>
                  <dd>Sol a <b>{fmt(sp.elevation, 1)}°</b> de altura, azimute {fmt(sp.azimuth, 0)}°</dd>
                  <dd>{sp.day.polarDay ? "Sol não se põe nesta época" : sp.day.polarNight ? "Noite polar: Sol abaixo do horizonte" : `Dia claro ${fmtHour(sp.day.rise)}–${fmtHour(sp.day.set)}`}</dd>
                  <dd>Área ao sol (sombras calculadas no relevo real): <b>{lit[side] == null ? "…" : `${fmt(lit[side] * 100, 0)}%`}</b></dd>
                </div>
              ))}
            </dl>
            {planetBody === "moon" && L && <p className="t3-note">A {fmt(Math.abs(L.lat), 1)}°S o Sol nunca sobe mais que {fmt(90 - Math.abs(L.lat) + 1.54, 1)}° (90° − latitude + 1,54° de inclinação do eixo lunar). Por isso as sombras são quilométricas, há crateras em sombra permanente e a Artemis III mira as bordas mais iluminadas.</p>}

            <h2 className="t3-h">Ferramentas</h2>
            <div className="t3-btns">
              <button type="button" aria-pressed={tool === "profile"} onClick={() => { setTool((t) => (t === "profile" ? null : "profile")); setPts([]); }}>Perfil A→B</button>
              <button type="button" onClick={download}>Salvar imagem</button>
              <button type="button" onClick={() => { left.current?.view?.resetView(); right.current?.view?.resetView(); }}>Recentrar</button>
              <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>Fontes dos dados</button>
            </div>
            {tool === "profile" && <p className="t3-note">{pts.length === 0 ? "Clique no ponto A do relevo." : pts.length === 1 ? "Agora clique no ponto B." : "Perfil traçado nas duas cenas. Clique de novo para recomeçar."}</p>}
            {showSources && (
              <ul className="t3-sources">
                {[L, R].filter(Boolean).flatMap((m) => m.sources.map((s) => ({ ...s, scene: m.name }))).map((s, i) => (
                  <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><small>{s.by} · usado em {s.scene}</small></li>
                ))}
              </ul>
            )}
            <p className="t3-note mt-4"><Link to="/explorar">← Voltar ao ranking (Explorar)</Link></p>
          </div>
        </aside>

        {/* ---------- tour / caminhada / perfil ---------- */}
        {tour && (
          <div className="t3-caption card" role="status">
            <div className="flex items-center justify-between gap-3">
              <h3 className="eyebrow mb-0">Tour · {tourStep + 1}/{TOUR.length} · {tour.title}</h3>
              <button type="button" className="t3-x" onClick={() => setNav("orbit")} aria-label="Sair do tour">×</button>
            </div>
            <p className="m-0 text-[14px]">{tour.text(L?.name ?? "", R?.name, reliefTxt)}</p>
            <div className="t3-btns mt-2">
              <button type="button" disabled={tourStep === 0} onClick={() => setTourStep((s) => s - 1)}>← Anterior</button>
              {tourStep < TOUR.length - 1
                ? <button type="button" className="gold" onClick={() => setTourStep((s) => s + 1)}>Próximo →</button>
                : <button type="button" className="gold" onClick={() => setNav("orbit")}>Explorar livre</button>}
            </div>
          </div>
        )}
        {nav === "walk" && (
          <div className="t3-walk card">
            {!locked
              ? <p className="m-0"><b>Modo caminhada em {BODIES[planetBody].label}.</b> Clique no relevo da esquerda para começar. <kbd>W A S D</kbd> anda, <kbd>Shift</kbd> corre, <kbd>Espaço</kbd> pula, <kbd>Esc</kbd> solta o mouse.</p>
              : <p className="m-0">Andando · <kbd>Esc</kbd> para soltar o mouse</p>}
            {walkInfo && <p className="m-0 mt-1 text-[13px]">Altitude {fmt(walkInfo.h, 0)} m · declividade sob os pés {fmt(walkInfo.slope, 1)}°</p>}
            <p className="m-0 mt-1 text-[13px]">
              Mesmo impulso de pulo (2,5 m/s): <b>{fmt(jumpH(gB.g), 2)} m em {gB.label}</b> · {fmt(jumpH(9.807), 2)} m na Terra
              {jump != null && <> · seu último pulo: <b>{fmt(jump, 2)} m</b></>}
            </p>
          </div>
        )}
        {profiles.length > 0 && <ProfileChart profiles={profiles} onClose={() => { setPts([]); setTool(null); }} />}
      </div>
    </section>
  );
}
