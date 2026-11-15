// Laboratório 3D — o sítio em Marte/Lua e o análogo na Terra lado a lado, em relevo real,
// na mesma escala, com câmeras sincronizadas, Sol físico, camadas científicas, perfil,
// tour guiado e caminhada com a gravidade de cada corpo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTr } from "../hooks/useSettings.jsx";
import TerrainPane from "../components/lab3d/TerrainPane.jsx";
import ProfileChart from "../components/lab3d/ProfileChart.jsx";
import TwinTraversePanel from "../components/lab3d/TwinTraversePanel.jsx";
import { MODES as TRAV, coarseGrid, earthInSky, findTwin, gradeProfile, metabolic, plan, profileDistance, sunFraction } from "../lib/terrain3d/traverse.js";
import GlobeIntro from "../components/lab3d/GlobeIntro.jsx";
import LiveEarthPicker from "../components/lab3d/LiveEarthPicker.jsx";
import { useMotion } from "../hooks/useMotion.jsx";
import { buildLiveScene } from "../lib/terrain3d/liveEarth.js";
import StatusChip from "../components/ui/StatusChip.jsx";
import { useAraData } from "../hooks/useAraData.jsx";
import * as core from "../lib/core.js";
import { fmt, withUnit } from "../lib/format.js";
import { BODIES, heightAt, loadIndex, profile as makeProfile, slopeGrid } from "../lib/terrain3d/data.js";
import { SEASON, daylight, fmtHour, nowHour, shadowMask, sunPosition } from "../lib/terrain3d/sun.js";
import { T } from "../lib/i18n.js";

const LAYERS = [
  { value: "imagem", label: "Imagem" },
  { value: "declividade", label: "Declividade" },
  { value: "altitude", label: "Altitude" },
  { value: "relevo", label: "Só relevo" },
];
// veículos que podem ser colocados na cena, em escala real (comprimento em metros)
const VEHICLES = {
  mars: [["perseverance", "Perseverance", 3.0], ["curiosity", "Curiosity", 3.0], ["mer", "Spirit / Opportunity", 1.6], ["sojourner", ["Sojourner (simplificado)", "Sojourner (simplified)"], 0.65], ["ingenuity", "Ingenuity", 1.2], ["astronaut", ["Astronauta", "Astronaut"], 0.9]],
  moon: [["lrv", ["Carro lunar Apollo (simplificado)", "Apollo lunar rover (simplified)"], 3.1], ["lunar_module", ["Módulo Lunar Apollo", "Apollo Lunar Module"], 9.4], ["astronaut", ["Astronauta", "Astronaut"], 0.9]],
};
const NAV = [{ value: "orbit", label: "Órbita" }, { value: "walk", label: "Caminhar" }, { value: "tour", label: "Tour guiado" }];
const ATTRS = core.RANK_ATTRS;

const TOUR = [
  { cam: { p: [0, 0.46, 0.6], t: [0, -0.02, 0.04] }, layer: "imagem", title: () => T("Visão geral", "Overview"),
    text: (L, R) => T(`Duas janelas de 10 × 10 km na mesma escala. O quadrado dourado é a célula de 5 km comparada pelo ARA. ${L} à esquerda${R ? `, ${R} à direita` : ""}.`, `Two 10 × 10 km windows at the same scale. The gold square is the 5 km cell ARA compares. ${L} on the left${R ? `, ${R} on the right` : ""}.`) },
  { cam: { p: [0, 1.25, 0.002], t: [0, 0, 0] }, layer: "declividade", title: () => T("Onde um rover passa", "Where a rover can go"),
    text: () => T("Vista de cima colorida pela declividade: verde até 5° (fácil), amarelo até 15° (limite de rovers como o Perseverance), laranja e vermelho acima disso.", "Top view coloured by slope: green up to 5° (easy), yellow up to 15° (limit for rovers like Perseverance), orange and red above that.") },
  { cam: { p: [-0.52, 0.11, 0.42], t: [0.05, -0.02, -0.05] }, layer: "imagem", title: () => T("Rasante", "Low pass"),
    text: () => T("Voo baixo para sentir a rugosidade — o desvio-padrão local da altitude, uma das três medidas do ARA.", "A low flight to feel the roughness — the local standard deviation of altitude, one of ARA's three measures.") },
  { cam: { p: [0.62, 0.28, -0.46], t: [0, 0, 0] }, layer: "altitude", title: () => T("Amplitude do relevo", "Relief"),
    text: (L, R, s) => T(`Cores por altitude. A diferença entre o ponto mais alto e o mais baixo da célula é a amplitude: ${s}.`, `Colours by altitude. The difference between the highest and lowest point of the cell is the relief: ${s}.`) },
  { cam: { p: [0, 0.46, 0.6], t: [0, -0.02, 0.04] }, layer: "imagem", title: () => T("Agora é com você", "Your turn"),
    text: () => T("Arraste para girar, use a roda para aproximar, clique em dois pontos para traçar um perfil ou entre no modo Caminhar.", "Drag to rotate, scroll to zoom, click two points to draw a profile, or switch to Walk mode.") },
];

function Seg({ options, value, onChange, label }) {
  const tr = useTr();
  return (
    <div role="group" aria-label={tr(label)} className="t3-seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{tr(o.label)}</button>
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
  const tr = useTr();
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const siteId = params.get("site") || "jezero_01";
  const [analogId, setAnalogId] = useState(params.get("analog"));
  // a URL pode abrir o laboratório já configurado (?layer=declividade&hour=7.5&exag=3&curvas=1&nav=tour)
  const [settings, setSettings] = useState(() => ({
    exag: Number(params.get("exag")) || 2, layer: [...LAYERS.map((l) => l.value), "operacoes"].includes(params.get("layer")) ? params.get("layer") : "imagem",
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
  const [lib, setLib] = useState({ lat: 0, lon: 0 });   // libração (ponto sub-Terra) para a Lua
  const [ops, setOps] = useState({});
  const [vehicle, setVehicle] = useState("");
  const [travMode, setTravMode] = useState("eva");
  const [trav, setTrav] = useState(null);
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
    setLive((l) => ({ ...l, busy: true, error: null, progress: { f: 0, text: T("Começando…", "Starting…") } }));
    try {
      const sc = await buildLiveScene(lat, lon, name, (text, f) => setLive((l) => ({ ...l, progress: { text, f } })));
      setLive({ scene: sc, busy: false, progress: { f: 1, text: "" }, error: null });
    } catch (e) {
      console.error(e);
      setLive((l) => ({ ...l, busy: false, error: T("Não consegui baixar os dados desse ponto (sem rede ou fora da cobertura). Tente outro.", "Could not download data for this point (no network or outside coverage). Try another.") }));
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
        const res = s.meta.size_m / s.n;
        const { mask, lit: f } = shadowMask(s.heights, s.n, res, sp.azimuth, sp.elevation);
        ref.current.view.setShadowMask(mask);
        setLit((l) => ({ ...l, [side]: f }));
        // Janela operacional (critérios Artemis III): sol + Terra visível + declividade < 10° para pouso
        const slope = slopeGrid(s);
        const opsArr = new Float32Array(s.n * s.n);
        let earthFrac = null, all3 = 0, earthMask = null;
        if (s.meta.body === "moon") {
          const e = earthInSky(s.meta.lat, s.meta.lon, lib.lat, lib.lon);
          const r = shadowMask(s.heights, s.n, res, e.azimuth, e.elevation);
          earthMask = r.mask; earthFrac = r.lit;
        }
        for (let i = 0; i < opsArr.length; i++) {
          const v = (mask[i] > 0.5 ? 1 : 0) + (slope[i] < 10 ? 1 : 0) + (earthMask ? (earthMask[i] > 0.5 ? 1 : 0) : 1);
          opsArr[i] = v; if (v === 3) all3++;
        }
        ref.current.view.setOpsMask(opsArr);
        ref.current.view._earthMask = earthMask;
        setOps((o) => ({ ...o, [side]: { earth: earthFrac, all: all3 / opsArr.length, earthSky: s.meta.body === "moon" ? earthInSky(s.meta.lat, s.meta.lon, lib.lat, lib.lon) : null } }));
      }
    }, 60);
    return () => clearTimeout(t);
  }, [scenes, sunFor, lib]);

  const onLoaded = useCallback((side, s) => setScenes((m) => ({ ...m, [side]: s })), []);

  // ---- perfil
  const onPick = useCallback((side, p) => {
    if (tool === "travessia") {
      if (side !== "left") return;
      setTrav((t) => (!t || t.b ? { a: p } : { ...t, b: p }));
      return;
    }
    if (tool !== "profile") return;
    setPts((cur) => (cur.length >= 2 ? [p] : [...cur, p]));
  }, [tool]);

  // ---- Travessia gêmea: rota com os limites da missão no planeta e o trecho de perfil mais parecido no análogo
  useEffect(() => {
    const L0 = scenes.left;
    if (!trav?.a || !L0) { left.current?.view?.setRoutes([]); right.current?.view?.setRoutes([]); return; }
    if (!trav.b) { left.current?.view?.setRoutes([{ pts: [trav.a], label: "A" }]); return; }
    if (trav.result) return;
    const m = TRAV[travMode];
    const t = setTimeout(() => {
      const gL = coarseGrid(L0, 128);
      const route = plan(gL, trav.a, trav.b, m.maxSlope);
      if (!route) { setTrav((x) => ({ ...x, result: { status: T(`Não há caminho entre A e B sem passar de ${m.maxSlope}° de declividade. Tente outros pontos ou outro modo.`, `There is no path between A and B without exceeding ${m.maxSlope}° of slope. Try other points or another mode.`) } })); return; }
      route.cell = gL.res;
      left.current?.view?.setRoutes([{ pts: route.pts, color: 0xffd166, label: "A" }]);
      const R0 = twin ? scenes.right : null;
      let twinRoute = null, fidelity = null;
      const chord = Math.hypot(trav.b.u - trav.a.u, trav.b.v - trav.a.v) * L0.meta.size_m;
      if (R0) {
        const gR = coarseGrid(R0, 128);
        twinRoute = findTwin(gR, route, chord, m.maxSlope);
        if (twinRoute) { fidelity = profileDistance(gradeProfile(route), gradeProfile(twinRoute)); right.current?.view?.setRoutes([{ pts: twinRoute.pts, color: 0x59e0ff, label: "A" }]); }
      }
      const gP = L0.body.g;
      const kcal = travMode === "eva" ? { planet: metabolic(route, gP), earth: metabolic(twinRoute ?? route, 9.807) } : null;
      const sunF = { planet: sunFraction(route, L0, left.current?.view?.getShadowMask()), earth: twinRoute ? sunFraction(twinRoute, R0, right.current?.view?.getShadowMask()) : null };
      const em = left.current?.view?._earthMask;
      const earthVis = em ? route.pts.reduce((s2, q) => s2 + (em[Math.min(L0.n - 1, Math.floor(q.v * L0.n)) * L0.n + Math.min(L0.n - 1, Math.floor(q.u * L0.n))] > 0.5 ? 1 : 0), 0) / route.pts.length : null;
      setTrav((x) => ({ ...x, result: { route, twin: twinRoute, fidelity, kcal, sun: sunF, earthVis, gPlanet: gP, planetName: L0.meta.name,
        earthName: R0?.meta.name, profA: gradeProfile(route), profB: twinRoute ? gradeProfile(twinRoute) : null } }));
    }, 30);
    return () => clearTimeout(t);
  }, [trav, travMode, scenes, twin]); // eslint-disable-line react-hooks/exhaustive-deps

  // trocar de sítio (inclusive pelo link) zera ferramentas, travessia e veículo
  useEffect(() => { setTrav(null); setTool(null); setVehicle(params.get("veiculo") || (isWalk ? "perseverance" : "")); setPts([]); }, [siteId, isWalk]);

  // ---- veículo em escala real
  useEffect(() => {
    const v = left.current?.view, L0 = scenes.left;
    if (!v || !L0) return;
    const spec = (VEHICLES[L0.meta.body] ?? []).find(([k]) => k === vehicle);
    if (!spec) { v.setVehicle(null); return; }
    const land = L0.meta.pois?.find((q) => q.kind === "landing");
    v.setVehicle({ key: spec[0], length: spec[2], u: land ? land.u + 0.004 : 0.5, v: land ? land.v + 0.004 : 0.5, heading: 35 });
  }, [vehicle, scenes.left]);
  const goToVehicle = () => {
    const v = left.current?.view, L0 = scenes.left, req = v?._vehReq;
    if (!v || !req) return;
    const S = L0.meta.size_m, e = settings.exag, hy = (heightAt(L0, req.u, req.v) - (L0.meta.height.min + L0.meta.height.max) / 2) / S;
    const d = (req.length * 4) / S;
    v.flyTo({ p: [req.u - 0.5 + d * 0.6, hy + d * 0.55, req.v - 0.5 + d], t: [req.u - 0.5, hy, req.v - 0.5] }, 2600);
    void e;
  };
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
      <h1 id="labTitle" className="sr-only">{T("Laboratório 3D", "3D Lab")}</h1>
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
            {twin && <Toggle on={sync} onChange={setSync}>{tr("Câmeras juntas")}</Toggle>}
          </div>
        </div>

        {/* ---------- painel esquerdo ---------- */}
        <aside className={`t3-panel t3-left ${panels.left ? "" : "closed"}`} aria-label={T("Locais e comparação", "Sites and comparison")}>
          <button type="button" className="t3-collapse" onClick={() => setPanels((p) => ({ ...p, left: !p.left }))}
                  aria-label={panels.left ? T("Recolher painel", "Collapse panel") : T("Abrir painel", "Open panel")}>{panels.left ? "‹" : "›"}</button>
          <div className="t3-scroll">
            <h2 className="t3-h">{tr("Sítio planetário")}</h2>
            <div className="t3-list" role="radiogroup" aria-label={T("Sítio", "Site")}>
              {planets.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={s.id === siteId} onClick={() => setSite(s.id)}>
                  <span className={`t3-dot ${s.body}`} />
                  <span><b>{s.name}</b><small>{BODIES[s.body].label} · {s.kind === "overview" ? T(`visão geral ${fmt(s.size_m / 1000, 0)} km`, `${fmt(s.size_m / 1000, 0)} km overview`) : s.kind === "walk" ? T("caminhada em alta resolução", "high-resolution walk") : s.group}</small></span>
                </button>
              ))}
            </div>

            {!isOverview && (
              <>
                <h2 className="t3-h">{tr("Análogo na Terra")}</h2>
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
                <h2 className="t3-h">{tr("Testar qualquer lugar da Terra")}</h2>
                <LiveEarthPicker busy={live.busy} progress={live.progress} error={live.error} onTest={testLive}
                                 active={Boolean(live.scene)} onClear={() => setLive((l) => ({ ...l, scene: null }))} />
              </>
            )}

            {dims.length > 0 && (
              <>
                <h2 className="t3-h">{tr(live.scene ? "Este ponto seria análogo?" : "Por que é análogo")}</h2>
                <table className="t3-table">
                  <thead><tr><th>{T("Medida")}</th><th>{BODIES[planetBody].label}</th><th>{T("Terra")}</th><th /></tr></thead>
                  <tbody>
                    {dims.map((d) => (
                      <tr key={d.attr}>
                        <td>{T(d.meta.label)}</td><td>{withUnit(d.site, d.meta.unit)}</td><td>{withUnit(d.cell, d.meta.unit)}</td>
                        <td><StatusChip status={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rk && <p className="t3-note">{T("Distância ARA")} {fmt(rk.d, 3)} — {rk.live ? T(`entraria em ${rk.position}º lugar`, `would rank #${rk.position}`) : T(`${rk.position}º lugar`, `#${rk.position}`)} {T(`entre ${data.cells.length} células da Terra. Calculado a 100 m, como no ranking.`, `among ${data.cells.length} Earth cells. Computed at 100 m, as in the ranking.`)}</p>}
                {L?.stats_inner?.at_100m && R?.stats_inner?.at_100m && (
                  <p className="t3-note">{T("Conferência no 3D (recalculado nesta cena, 100 m): declividade", "3D cross-check (recomputed in this scene, 100 m): slope")} {fmt(L.stats_inner.at_100m.slope_mean_deg, 1)}° × {fmt(R.stats_inner.at_100m.slope_mean_deg, 1)}°,
                    {T("amplitude", "relief")} {fmt(L.stats_inner.at_100m.relief_m, 0)} × {fmt(R.stats_inner.at_100m.relief_m, 0)} m.</p>
                )}
                <p className="t3-note">{T(`Não reproduzível na Terra: gravidade (${fmt(gB.g, 2)} vs 9,81 m/s²), atmosfera e radiação.`, `Not reproducible on Earth: gravity (${fmt(gB.g, 2)} vs 9.81 m/s²), atmosphere and radiation.`)}</p>
              </>
            )}
            {isWalk && <p className="t3-note mt-4">{T("Relevo HiRISE de 1 m e imagem de 25 cm em volta do pouso do Perseverance. Ande pelo terreno com a gravidade de Marte; o trajeto do rover está marcado em branco.", "1 m HiRISE relief and 25 cm imagery around the Perseverance landing site. Walk the terrain with Martian gravity; the rover traverse is marked in white.")}</p>}
            {isOverview && <p className="t3-note mt-4">{T("Clique num quadrado dourado no relevo para abrir aquele sítio lado a lado com o melhor análogo da Terra.", "Click a gold square on the relief to open that site side by side with its best Earth analog.")}</p>}
          </div>
        </aside>

        {/* ---------- painel direito ---------- */}
        <aside className={`t3-panel t3-right ${panels.right ? "" : "closed"}`} aria-label={T("Camadas, Sol e ferramentas", "Layers, Sun and tools")}>
          <button type="button" className="t3-collapse" onClick={() => setPanels((p) => ({ ...p, right: !p.right }))}
                  aria-label={panels.right ? T("Recolher painel", "Collapse panel") : T("Abrir painel", "Open panel")}>{panels.right ? "›" : "‹"}</button>
          <div className="t3-scroll">
            <h2 className="t3-h">{tr("Camada")}</h2>
            <Seg label="Camada" options={planetBody === "moon" ? [...LAYERS, { value: "operacoes", label: "Janela operacional" }] : LAYERS} value={settings.layer} onChange={(v) => setSettings((s) => ({ ...s, layer: v }))} />
            {settings.layer === "operacoes" && planetBody === "moon" && (
              <div className="t3-ops">
                <div className="t3-legend">
                  <span style={{ "--c": "#33c780" }}>{T("Sol + Terra + <10°", "Sun + Earth + <10°")}</span><span style={{ "--c": "#f9d64d" }}>{T("2 de 3", "2 of 3")}</span>
                  <span style={{ "--c": "#f58033" }}>{T("1 de 3", "1 of 3")}</span><span style={{ "--c": "#bf262e" }}>{T("nenhum")}</span>
                </div>
                <p className="t3-note">{T("Critérios da Artemis III: luz do Sol, Terra acima do horizonte para comunicação direta e declividade < 10° para pouso. Agora:", "Artemis III criteria: sunlight, Earth above the horizon for direct communication and slope < 10° for landing. Now:")} <b>{ops.left?.all == null ? "…" : `${fmt(ops.left.all * 100, 1)}%`}</b> {T("da cena atende aos três; Terra visível em", "of the scene meets all three; Earth visible over")} {ops.left?.earth == null ? "…" : `${fmt(ops.left.earth * 100, 0)}%`}{ops.left?.earthSky ? T(` (Terra a ${fmt(ops.left.earthSky.elevation, 1)}° de altura, azimute ${fmt(ops.left.earthSky.azimuth, 0)}°)`, ` (Earth ${fmt(ops.left.earthSky.elevation, 1)}° high, azimuth ${fmt(ops.left.earthSky.azimuth, 0)}°)`) : ""}.</p>
                <label className="t3-range"><span>{tr("Libração em latitude")} <b>{fmt(lib.lat, 1)}°</b></span>
                  <input type="range" min="-6.7" max="6.7" step="0.1" value={lib.lat} onChange={(e) => setLib((l) => ({ ...l, lat: Number(e.target.value) }))} /></label>
                <label className="t3-range"><span>{tr("Libração em longitude")} <b>{fmt(lib.lon, 1)}°</b></span>
                  <input type="range" min="-7.9" max="7.9" step="0.1" value={lib.lon} onChange={(e) => setLib((l) => ({ ...l, lon: Number(e.target.value) }))} /></label>
                <p className="t3-note">{T("A libração muda a posição da Terra no céu lunar ao longo do mês: perto do polo sul ela sobe e desce alguns graus, e o relevo pode escondê-la — é por isso que a comunicação direta entra na escolha do local.", "Libration moves Earth across the lunar sky over the month: near the south pole it rises and sets by a few degrees and the terrain can hide it — that is why direct communication matters when choosing a site.")}</p>
              </div>
            )}
            {settings.layer === "declividade" && (
              <div className="t3-legend">
                <span style={{ "--c": "#2a9e73" }}>{T("<5° fácil", "<5° easy")}</span><span style={{ "--c": "#f9d64d" }}>{T("15° limite rover", "15° rover limit")}</span>
                <span style={{ "--c": "#f58033" }}>25°</span><span style={{ "--c": "#cc262e" }}>{T("35°+ íngreme", "35°+ steep")}</span>
              </div>
            )}
            {settings.layer === "altitude" && L && <p className="t3-note">{fmt(L.height.min, 0)} {T("a", "to")} {fmt(L.height.max, 0)} m{R ? ` · ${T("Terra")} ${fmt(R.height.min, 0)} ${T("a", "to")} ${fmt(R.height.max, 0)} m` : ""}</p>}
            <div className="t3-toggles">
              <Toggle on={settings.contours} onChange={(v) => setSettings((s) => ({ ...s, contours: v }))}>{tr("Curvas de nível")}</Toggle>
              {settings.contours && (
                <select className="t3-select" value={settings.step} aria-label="Intervalo das curvas"
                        onChange={(e) => setSettings((s) => ({ ...s, step: Number(e.target.value) }))}>
                  {[10, 25, 50, 100, 250].map((v) => <option key={v} value={v}>a cada {v} m</option>)}
                </select>
              )}
              <Toggle on={settings.cell} onChange={(v) => setSettings((s) => ({ ...s, cell: v }))}>{tr("Célula de 5 km")}</Toggle>
              <Toggle on={settings.labels} onChange={(v) => setSettings((s) => ({ ...s, labels: v }))}>{tr("Rótulos")}</Toggle>
              {planetBody === "mars" && <Toggle on={settings.path} onChange={(v) => setSettings((s) => ({ ...s, path: v }))}>{tr("Trajeto do Perseverance")}</Toggle>}
              {L?.minerals && <Toggle on={settings.minerals} onChange={(v) => setSettings((s) => ({ ...s, minerals: v, layer: v ? "imagem" : s.layer }))}>{tr("Minerais (CRISM)")}</Toggle>}
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
              <span>{tr("Exagero vertical")} <b>{fmt(settings.exag, 1)}×</b></span>
              <input type="range" min="1" max="6" step="0.5" value={settings.exag} onChange={(e) => setSettings((s) => ({ ...s, exag: Number(e.target.value) }))} />
            </label>

            <h2 className="t3-h">{tr("Sol e sombras")}</h2>
            <label className="t3-range">
              <span>{tr("Hora solar local")} <b>{fmtHour(hour)}</b></span>
              <input type="range" min="0" max="24" step="0.05" value={hour} onChange={(e) => setHour(Number(e.target.value))} />
            </label>
            <label className="t3-range">
              <span>{ss.label} <b>{ss.fmt(season[planetBody])}</b></span>
              <input type="range" min={ss.min} max={ss.max} step={ss.step} value={season[planetBody]}
                     onChange={(e) => setSeason((m) => ({ ...m, [planetBody]: Number(e.target.value) }))} />
            </label>
            {twin && (
              <label className="t3-range">
                <span>{T("Terra")}: {SEASON.earth.label.toLowerCase()} <b>{SEASON.earth.fmt(season.earth)}</b></span>
                <input type="range" min={1} max={365} step={1} value={season.earth} onChange={(e) => setSeason((m) => ({ ...m, earth: Number(e.target.value) }))} />
              </label>
            )}
            <div className="t3-btns">
              <button type="button" onClick={() => scenes.left && setHour(nowHour(scenes.left.meta.body, scenes.left.meta.lon))}>{tr("Agora")}</button>
              <button type="button" onClick={() => setHour(12)}>{tr("Meio-dia")}</button>
              <button type="button" onClick={() => setHour(sunL?.day?.rise ? sunL.day.rise + 0.4 : 7)}>{tr("Sol baixo")}</button>
            </div>
            <dl className="t3-sun">
              {[["left", L, sunL], ["right", R, sunR]].filter(([, m]) => m).map(([side, m, sp]) => (
                <div key={side}>
                  <dt>{BODIES[m.body].label}</dt>
                  <dd>{T("Sol a", "Sun at")} <b>{fmt(sp.elevation, 1)}°</b> {T("de altura, azimute", "elevation, azimuth")} {fmt(sp.azimuth, 0)}°</dd>
                  <dd>{sp.day.polarDay ? T("Sol não se põe nesta época", "The Sun does not set at this time of year") : sp.day.polarNight ? T("Noite polar: Sol abaixo do horizonte", "Polar night: Sun below the horizon") : `${T("Dia claro", "Daylight")} ${fmtHour(sp.day.rise)}–${fmtHour(sp.day.set)}`}</dd>
                  <dd>{T("Área ao sol (sombras calculadas no relevo real): ")}<b>{lit[side] == null ? "…" : `${fmt(lit[side] * 100, 0)}%`}</b></dd>
                </div>
              ))}
            </dl>
            {planetBody === "moon" && L && <p className="t3-note">{T(`A ${fmt(Math.abs(L.lat), 1)}°S o Sol nunca sobe mais que ${fmt(90 - Math.abs(L.lat) + 1.54, 1)}° (90° − latitude + 1,54° de inclinação do eixo lunar). Por isso as sombras são quilométricas, há crateras em sombra permanente e a Artemis III mira as bordas mais iluminadas.`, `At ${fmt(Math.abs(L.lat), 1)}°S the Sun never rises more than ${fmt(90 - Math.abs(L.lat) + 1.54, 1)}° (90° − latitude + the 1.54° tilt of the lunar axis). That is why shadows are kilometres long, some craters are in permanent shadow and Artemis III aims for the best-lit rims.`)}</p>}

            {VEHICLES[planetBody] && !isOverview && (
              <>
                <h2 className="t3-h">{tr("Veículo em escala real")}</h2>
                <select className="t3-select" value={vehicle} aria-label={T("Veículo na cena", "Vehicle in the scene")} onChange={(e) => setVehicle(e.target.value)}>
                  <option value="">{tr("Nenhum")}</option>
                  {VEHICLES[planetBody].map(([k, label, len]) => <option key={k} value={k}>{Array.isArray(label) ? T(...label) : label} · {fmt(len, len < 2 ? 2 : 1)} m</option>)}
                </select>
                {vehicle && <div className="t3-btns"><button type="button" onClick={goToVehicle}>{tr("Ir até o veículo")}</button><Link to="/veiculos" className="t3-linkbtn">{tr("Ficha dos veículos")}</Link></div>}
                {vehicle && <p className="t3-note">{T("Modelos 3D oficiais da NASA (domínio público) carregados de science.nasa.gov; Sojourner e carro lunar são simplificados com as dimensões reais.", "Official NASA 3D models (public domain) loaded from science.nasa.gov; Sojourner and the lunar rover are simplified with their real dimensions.")}</p>}
              </>
            )}

            <h2 className="t3-h">{tr("Ferramentas")}</h2>
            <div className="t3-btns">
              <button type="button" aria-pressed={tool === "profile"} onClick={() => { setTool((t) => (t === "profile" ? null : "profile")); setPts([]); setTrav(null); }}>{tr("Perfil A→B")}</button>
              {!isOverview && <button type="button" className="gold" aria-pressed={tool === "travessia"} onClick={() => { setTool((t) => (t === "travessia" ? null : "travessia")); setTrav(null); setPts([]); }}>{tr("Travessia gêmea")}</button>}
              <button type="button" onClick={download}>{tr("Salvar imagem")}</button>
              <button type="button" onClick={() => { left.current?.view?.resetView(); right.current?.view?.resetView(); }}>{tr("Recentrar")}</button>
              <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>{tr("Fontes dos dados")}</button>
            </div>
            {tool === "travessia" && (
              <div className="mt-2">
                <select className="t3-select" value={travMode} aria-label={T("Modo da travessia", "Traverse mode")} onChange={(e) => { setTravMode(e.target.value); setTrav((t) => (t?.b ? { a: t.a, b: t.b } : t)); }}>
                  {Object.entries(TRAV).map(([k, m]) => <option key={k} value={k}>{T(m.label)} · {T("até", "up to")} {m.maxSlope}°</option>)}
                </select>
                <p className="t3-note">{!trav?.a ? T("Clique no ponto de partida da missão (relevo da esquerda).", "Click the mission start point (left terrain).") : !trav.b ? T("Agora clique no destino.", "Now click the destination.") : T("Rota planejada. Clique de novo para recomeçar.", "Route planned. Click again to start over.")} {T("O ARA traça a rota de menor custo respeitando o limite de declividade e procura no análogo da Terra o trecho com as mesmas subidas e descidas, para ensaiar exatamente o que a equipe vai enfrentar.", "ARA plots the least-cost route within the slope limit and searches the Earth analog for the stretch with the same climbs and descents, so the team can rehearse exactly what it will face.")}</p>
              </div>
            )}
            {tool === "profile" && <p className="t3-note">{pts.length === 0 ? T("Clique no ponto A do relevo.", "Click point A on the terrain.") : pts.length === 1 ? T("Agora clique no ponto B.", "Now click point B.") : T("Perfil traçado nas duas cenas. Clique de novo para recomeçar.", "Profile drawn on both scenes. Click again to start over.")}</p>}
            {showSources && (
              <ul className="t3-sources">
                {[L, R].filter(Boolean).flatMap((m) => m.sources.map((s) => ({ ...s, scene: m.name }))).map((s, i) => (
                  <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><small>{s.by} · {T("usado em", "used in")} {s.scene}</small></li>
                ))}
              </ul>
            )}
            <p className="t3-note mt-4"><Link to="/explorar">{tr("← Voltar ao ranking (Explorar)")}</Link></p>
          </div>
        </aside>

        {/* ---------- tour / caminhada / perfil ---------- */}
        {tour && (
          <div className="t3-caption card" role="status">
            <div className="flex items-center justify-between gap-3">
              <h3 className="eyebrow mb-0">Tour · {tourStep + 1}/{TOUR.length} · {typeof tour.title === "function" ? tour.title() : tour.title}</h3>
              <button type="button" className="t3-x" onClick={() => setNav("orbit")} aria-label={T("Sair do tour", "Leave the tour")}>×</button>
            </div>
            <p className="m-0 text-[14px]">{tour.text(L?.name ?? "", R?.name, reliefTxt)}</p>
            <div className="t3-btns mt-2">
              <button type="button" disabled={tourStep === 0} onClick={() => setTourStep((s) => s - 1)}>{tr("← Anterior")}</button>
              {tourStep < TOUR.length - 1
                ? <button type="button" className="gold" onClick={() => setTourStep((s) => s + 1)}>{tr("Próximo →")}</button>
                : <button type="button" className="gold" onClick={() => setNav("orbit")}>{tr("Explorar livre")}</button>}
            </div>
          </div>
        )}
        {nav === "walk" && (
          <div className="t3-walk card">
            {!locked
              ? <p className="m-0"><b>{T("Modo caminhada em", "Walk mode on")} {BODIES[planetBody].label}.</b> {T("Clique no relevo da esquerda para começar.")} <kbd>W A S D</kbd> {T("anda", "walk")}, <kbd>Shift</kbd> {T("corre", "run")}, <kbd>{T("Espaço", "Space")}</kbd> {T("pula", "jump")}, <kbd>Esc</kbd> {T("solta o mouse.", "releases the mouse.")}</p>
              : <p className="m-0">{T("Andando", "Walking")} · <kbd>Esc</kbd> {T("para soltar o mouse", "to release the mouse")}</p>}
            {walkInfo && <p className="m-0 mt-1 text-[13px]">{T("Altitude", "Altitude")} {fmt(walkInfo.h, 0)} m · {T("declividade sob os pés", "slope underfoot")} {fmt(walkInfo.slope, 1)}°</p>}
            <p className="m-0 mt-1 text-[13px]">
              {T("Mesmo impulso de pulo (2,5 m/s):", "Same jump impulse (2.5 m/s):")} <b>{fmt(jumpH(gB.g), 2)} m {T("em", "on")} {gB.label}</b> · {fmt(jumpH(9.807), 2)} m {T("na Terra", "on Earth")}
              {jump != null && <> · {T("seu último pulo", "your last jump")}: <b>{fmt(jump, 2)} m</b></>}
            </p>
          </div>
        )}
        {tool === "travessia" && trav?.result && <TwinTraversePanel result={trav.result} mode={travMode} onClose={() => { setTrav(null); setTool(null); }} />}
        {profiles.length > 0 && <ProfileChart profiles={profiles} onClose={() => { setPts([]); setTool(null); }} />}
      </div>
    </section>
  );
}
