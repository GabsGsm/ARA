// ARA Missão — planeje e dirija um rover sobre o relevo real de Marte, da Lua ou da Terra.
// Esquerda: configurar (local, veículo, hora, camadas, proteção planetária). Direita: rota passo a passo
// (A, B, estratégias) com o botão de iniciar sempre visível. Durante a direção: telemetria; no fim: relatório.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TerrainView from "../lib/terrain3d/TerrainView.js";
import { BODIES, heightAt, loadIndex, loadScene, slopeGrid, uvToLatLon } from "../lib/terrain3d/data.js";
import { buildLiveScene } from "../lib/terrain3d/liveEarth.js";
import { SEASON, fmtHour, shadowMask, sunPosition } from "../lib/terrain3d/sun.js";
import { ROVERS, SOURCES, critAngle, softFromTI, startState, steerForWarp, step, tiSampler, withinTargetRadius, effectiveWarp } from "../lib/mission/rover.js";
import { STRATEGIES, describeRoute, hazardGrid, obstacleLimit, planRover, routeEnergy } from "../lib/mission/planner.js";
import { ROCK_SOURCES, clearRockCache, rockAbundance, rocksNear, setRockCorridor } from "../lib/mission/rocks.js";
import { PP_SOURCES, at, consequences, loadMemory, permanentShadow, rasterTracks, rasterZones, saveMemory, sceneMemory, scienceFromMinerals } from "../lib/mission/pristine.js";
import LiveEarthPicker from "../components/lab3d/LiveEarthPicker.jsx";
import VehiclePicker from "../components/mission/VehiclePicker.jsx";
import { localize, byKey } from "../lib/vehicles.js";
import { useSettings } from "../hooks/useSettings.jsx";
import { beep, speak } from "../lib/a11y/sense.js";
import { dataUrl, fmt } from "../lib/format.js";
import "../assets/css/lab3d.css";
import "../assets/css/mission.css";

const WARPS = [1, 10, 60, 300, 1000];
const NG = 256; // grade das camadas de proteção
const fmtDur = (s) => (s < 60 ? `${fmt(s, 0)} s` : s < 3600 ? `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, "0")} s` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`);
const BODY_EN = { Marte: "Mars", Lua: "Moon", Terra: "Earth" };
const END = {
  tombou: [["O rover tombou", "The rover tipped over"], ["A inclinação passou do limite estático do veículo. Na missão real, o planejamento evita qualquer trecho perto desse limite: ninguém desvira um rover em Marte.", "The tilt exceeded the vehicle's static limit. Real planning avoids anything near that limit: nobody can right a rover on Mars."]],
  atolou: [["Você atolou", "You got stuck"], ["A patinagem alta enterrou as rodas — foi assim que o Spirit ficou preso em areia fofa em 2009. Em solo fino, suba em ângulo menor ou contorne.", "High slip buried the wheels — that is how Spirit got stuck in soft sand in 2009. On fine soil, climb at a lower angle or go around."]],
  sem_energia: [["Energia esgotada", "Out of energy"], ["O consumo passou do que a fonte repõe. Rovers solares precisam de Sol nos painéis; o LRV das Apollo nem recarregava.", "Consumption exceeded what the source supplies. Solar rovers need sunlight on their panels; the Apollo LRV could not recharge at all."]],
  rodas: [["Rodas danificadas", "Wheels damaged"], ["Muitas pedras e degraus. Depois de 2013 a equipe do Curiosity passou a planejar rotas que evitam rocha pontiaguda.", "Too many rocks and ledges. Since 2013 the Curiosity team plans routes that avoid sharp rocks."]],
  chegou: [["Você cumpriu sua missão!", "Mission accomplished!"], ["Você chegou ao destino. Veja abaixo como foi em relação ao planejado e o que a travessia deixou no terreno.", "You reached the target. See how it went against the plan and what the traverse left on the ground."]],
};
function segDist(pts, p) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], du = b.u - a.u, dv = b.v - a.v, L2 = du * du + dv * dv || 1e-12;
    const t = Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / L2));
    best = Math.min(best, Math.hypot(a.u + t * du - p.u, a.v + t * dv - p.v));
  }
  return pts.length === 1 ? Math.hypot(pts[0].u - p.u, pts[0].v - p.v) : best;
}
const coarse = () => window.matchMedia?.("(pointer: coarse)").matches;

function Bar({ label, value, warn, bad, text }) {
  const f = Math.max(0, Math.min(1, value / 100));
  const cls = bad != null && value >= bad ? "bad" : warn != null && value >= warn ? "warn" : "";
  return (
    <div className={`ms-bar ${cls}`}>
      <span>{label}<b>{text ?? `${fmt(value, 0)}%`}</b></span>
      <i><em style={{ width: `${f * 100}%` }} /></i>
    </div>
  );
}

function Joystick({ view }) {
  const knob = useRef(null), id = useRef(null);
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (e.clientX - cx) / (r.width / 2), y = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    knob.current.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
    view()?.touchMove(x, y);
  };
  const end = () => { knob.current.style.transform = ""; view()?.touchMove(0, 0); id.current = null; };
  return (
    <div className="ms-joy t3-joy" onPointerDown={(e) => { id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
         onPointerMove={(e) => id.current === e.pointerId && move(e)} onPointerUp={end} onPointerCancel={end}><span ref={knob} /></div>
  );
}

export default function Mission() {
  const { tr, lang, sounds, narration } = useSettings();
  const box = useRef(null), view = useRef(null);
  const [params] = useSearchParams();
  const askRover = ROVERS[params.get("rover")] ? params.get("rover") : null;
  const [index, setIndex] = useState([]);
  const [sceneId, setSceneId] = useState(params.get("site") || (askRover === "lrv" ? "haworth_01" : "jezero_hirise_pouso"));
  const [scene, setScene] = useState(null);
  const [live, setLive] = useState({ busy: false, progress: null, error: null });
  const [roverKey, setRoverKey] = useState(askRover ?? "perseverance");
  const [hour, setHour] = useState(10);
  const [pts, setPts] = useState({});
  const [pickMode, setPickMode] = useState(null);         // a | b | zona | null
  const [pickWarn, setPickWarn] = useState(null);
  const [routes, setRoutes] = useState(null);             // { rapida, segura, pristina, straight }
  const [strategy, setStrategy] = useState("segura");
  const [phase, setPhase] = useState("plan");             // plan | drive | end
  const [hud, setHud] = useState(null);
  const [warp, setWarp] = useState(60);
  const [layer, setLayer] = useState("imagem");
  const [themis, setThemis] = useState(null);
  const [soilCells, setSoilCells] = useState(null);
  const [panels, setPanels] = useState({ left: true, right: true });
  const [buffer, setBuffer] = useState(5);
  const [mem, setMem] = useState(loadMemory);
  const [psr, setPsr] = useState(null);
  const [report, setReport] = useState(null);
  const [showReport, setShowReport] = useState(true);
  const [srcOpen, setSrcOpen] = useState(false);
  const [picker, setPicker] = useState(() => { try { return !sessionStorage.getItem("ara-picked"); } catch { return true; } });
  const sim = useRef(null);
  const warpRef = useRef(warp); warpRef.current = warp;

  const spec = ROVERS[roverKey];
  const body = scene?.meta.body;
  const g = scene?.body.g ?? 3.721;
  const S = scene?.meta.size_m ?? 1;
  const sceneKey = scene?.meta.id ?? "live";
  const smem = sceneMemory(mem, sceneKey);

  // ---- dados de apoio
  useEffect(() => {
    loadIndex().then((ix) => setIndex(ix.scenes.filter((s) => s.kind !== "overview"))).catch(() => setLoadErr("index"));
    fetch(dataUrl("data/minerals/jezero.json")).then((r) => (r.ok ? r.json() : null)).then((d) => setThemis(d?.themis ?? null)).catch(() => {});
    fetch(dataUrl("data/evidence/earth_cells.json")).then((r) => (r.ok ? r.json() : null)).then((d) => setSoilCells(d?.cells ?? null)).catch(() => {});
  }, []);

  // ---- vista 3D
  const cbPick = useRef(null);
  useEffect(() => {
    view.current = new TerrainView(box.current, { onPick: (p) => cbPick.current?.(p) });
    view.current.setFlags({ labels: true, path: false, cell: false });
    return () => view.current?.dispose();
  }, []);
  const show = (s) => {
    const v = view.current;
    v.setScene(s); v.setExaggeration(1);
    v.cancelFly(); v.resetView();            // câmera sempre volta à vista inicial: zoom e arraste funcionam de cara
    clearRockCache();
    setScene(s); setPts({}); setRoutes(null); setPhase("plan"); setReport(null); setPickMode("a");
  };
  const [loadErr, setLoadErr] = useState(null);
  const [loadTry, setLoadTry] = useState(0);
  useEffect(() => {
    if (!sceneId) return;
    let alive = true;
    setScene(null); setLoadErr(null);
    loadScene(sceneId).then((s) => alive && show(s)).catch((e) => { console.error(e); if (alive) setLoadErr(navigator.onLine === false ? "offline" : "scene"); });
    return () => { alive = false; };
  }, [sceneId, loadTry]); // eslint-disable-line react-hooks/exhaustive-deps
  const testLive = async (lat, lon, name) => {
    setLive({ busy: true, error: null, progress: { f: 0, text: "…" } });
    try {
      const sc = await buildLiveScene(lat, lon, name, (text, f) => setLive((l) => ({ ...l, progress: { text, f } })));
      setSceneId(null); show(sc); setLive({ busy: false, progress: null, error: null });
    } catch {
      setLive({ busy: false, progress: null, error: tr("Não consegui baixar os dados desse ponto. Tente outro.", "Could not download data for this point. Try another.") });
    }
  };
  useEffect(() => {
    if (!body) return;
    if (body === "moon" && ROVERS[roverKey].body !== "moon") setRoverKey("lrv");
    if (body === "mars" && ROVERS[roverKey].body !== "mars") setRoverKey("perseverance");
  }, [body]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- solo e rochas: fonte declarada
  const ground = useMemo(() => {
    if (!scene) return null;
    const b = scene.meta.body, N = 48;
    const soft = new Float32Array(N * N), rock = new Float32Array(N * N);
    let src, rockSrc, mean = 0;
    const slope = slopeGrid(scene), n = scene.n;
    if (b === "mars") {
      const ti = tiSampler(themis);
      let tiSum = 0, tiN = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const ll = uvToLatLon(scene, (x + 0.5) / N, (y + 0.5) / N), t = ti?.(ll.lat, ll.lon);
        soft[y * N + x] = t == null ? 0.45 : softFromTI(t);
        rock[y * N + x] = rockAbundance("mars", { ti: t });
        if (t != null) { tiSum += t; tiN++; }
      }
      src = tiN ? tr(`Inércia térmica THEMIS (~1 km): média ${fmt(tiSum / tiN, 0)} J m⁻² K⁻¹ s⁻½`, `THEMIS thermal inertia (~1 km): mean ${fmt(tiSum / tiN, 0)} J m⁻² K⁻¹ s⁻½`) : tr("Sem THEMIS nesta cena: solo misto assumido", "No THEMIS here: mixed soil assumed");
      rockSrc = tr("modelo Golombek & Rapp com abundância estimada pela inércia térmica (1–12%)", "Golombek & Rapp model, abundance estimated from thermal inertia (1–12%)");
    } else if (b === "moon") {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        soft[y * N + x] = 0.55;
        rock[y * N + x] = rockAbundance("moon", { slope: slope[Math.floor(((y + 0.5) / N) * n) * n + Math.floor(((x + 0.5) / N) * n)] });
      }
      src = tr("Regolito lunar solto (valor fixo)", "Loose lunar regolith (fixed value)");
      rockSrc = tr("pouca rocha exposta (Diviner), mais nas encostas íngremes", "little exposed rock (Diviner), more on steep slopes");
    } else {
      const c = soilCells?.[scene.meta.id]?.soil?.properties;
      const s = c?.sand ? Math.max(0, Math.min(1, (c.sand.mean - 25) / 60)) * (1 - 0.6 * Math.min(1, (c.cfvo?.mean ?? 0) / 60)) : 0.3;
      const k = rockAbundance("earth", { cfvo: c?.cfvo?.mean });
      soft.fill(s); rock.fill(k);
      src = c?.sand ? tr(`SoilGrids 0–5 cm: ${fmt(c.sand.mean, 0)}% areia, ${fmt(c.cfvo?.mean ?? 0, 0)}% fragmentos grossos (modelo)`, `SoilGrids 0–5 cm: ${fmt(c.sand.mean, 0)}% sand, ${fmt(c.cfvo?.mean ?? 0, 0)}% coarse fragments (model)`) : tr("Sem dado de solo: firme assumido", "No soil data: firm assumed");
      rockSrc = tr("fragmentos grossos do SoilGrids como indicador", "SoilGrids coarse fragments as a proxy");
    }
    for (const v of soft) mean += v / soft.length;
    const idx = (u, v) => Math.min(N - 1, Math.max(0, Math.floor(v * N))) * N + Math.min(N - 1, Math.max(0, Math.floor(u * N)));
    return { softAt: (u, v) => soft[idx(u, v)], kAt: (u, v) => rock[idx(u, v)], src, rockSrc, mean, kMean: rock.reduce((a, b2) => a + b2, 0) / rock.length };
  }, [scene, themis, soilCells, tr]);

  // ---- Sol e sombra
  const sun = useMemo(() => (scene ? sunPosition(scene.meta.lat, scene.meta.body, SEASON[scene.meta.body].def, hour) : null), [scene, hour]);
  const lit = useMemo(() => {
    if (!scene || !sun) return null;
    if (sun.elevation <= 0) return new Float32Array(scene.n * scene.n);
    return shadowMask(scene.heights, scene.n, scene.meta.size_m / scene.n, sun.azimuth, sun.elevation).mask;
  }, [scene, sun]);
  useEffect(() => { const v = view.current; if (v && scene && sun) { v.setSun(sun.azimuth, sun.elevation); if (lit) v.setShadowMask(lit); } }, [scene, sun, lit]);

  // ---- proteção planetária: zonas científicas, sombra permanente, memória
  const sciMin = useMemo(() => (scene ? scienceFromMinerals(scene, NG) : null), [scene]);
  useEffect(() => {
    setPsr(null);
    if (!scene || scene.meta.body !== "moon") return undefined;
    const t = setTimeout(() => setPsr(permanentShadow(scene, NG)), 50);
    return () => clearTimeout(t);
  }, [scene]);
  const zonesGrid = useMemo(() => rasterZones(smem.zones, S, NG), [smem.zones, S]);
  const sci = useMemo(() => {
    const out = new Uint8Array(NG * NG);
    for (let i = 0; i < out.length; i++) out[i] = (sciMin?.[i] || psr?.[i] || zonesGrid[i]) ? 1 : 0;
    return out;
  }, [sciMin, psr, zonesGrid]);
  const oldGrid = useMemo(() => rasterTracks(smem.missions.map((m) => m.track), S, NG, spec.width / 2 + buffer), [smem.missions, S, spec.width, buffer]);
  const sciCount = useMemo(() => sci.reduce((a, b2) => a + b2, 0), [sci]);

  // ---- camadas
  useEffect(() => {
    const v = view.current;
    if (!v || !scene || !ground) return;
    if (layer === "imagem" || layer === "inclinacao") { v.setLayer(layer === "inclinacao" ? "declividade" : "imagem"); return; }
    const n = scene.n, out = new Float32Array(n * n);
    if (layer === "risco") {
      const slope = slopeGrid(scene);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x, u = (x + 0.5) / n, w = (y + 0.5) / n, s = ground.softAt(u, w), lim = Math.min(spec.maxSlope, critAngle(s) - 3);
        const r = slope[i] / lim;
        let k = r > 1 ? 0 : r > 0.7 ? 1 : r > 0.4 || s > 0.7 ? 2 : 3;
        if (spec.solarW && lit && lit[i] < 0.5) k = Math.min(k, 1);
        out[i] = k;
      }
      v.setOpsMask(out); v.setLayer("operacoes");
    } else {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const u = (x + 0.5) / n, w = (y + 0.5) / n, s = at(sci, NG, u, w), o = at(oldGrid, NG, u, w);
        out[y * n + x] = s && o ? 4 : psr && at(psr, NG, u, w) ? 3 : s ? 2 : o ? 1 : 0;
      }
      v.setOpsMask(out); v.setLayer("protecao");
    }
  }, [layer, scene, ground, spec, lit, sci, oldGrid, psr]);

  // ---- veículo e pedras
  useEffect(() => {
    const v = view.current;
    if (!v || !scene) return;
    const a = pts.a ?? { u: 0.5, v: 0.5 };
    v.setVehicle({ key: roverKey, length: spec.len, u: a.u, v: a.v, heading: 0 });
  }, [scene, roverKey, pts.a]); // eslint-disable-line react-hooks/exhaustive-deps
  const kWorld = useCallback((x, z) => ground?.kAt(x / S + 0.5, z / S + 0.5) ?? 0.03, [ground, S]);
  useEffect(() => {
    if (!scene || !ground) return;
    view.current?.setRockField(kWorld, body === "moon" ? 0x8d8c88 : body === "earth" ? 0x8a7866 : 0x6e4c3c);
  }, [scene, ground, kWorld, body]);

  // ---- escolher veículo: confirma e a câmera voa até ele no terreno
  const focusVehicle = (vehicleSpec = spec) => {
    const v = view.current;
    if (!v || !scene) return;
    const a = pts.a ?? { u: 0.5, v: 0.5 };
    v.focusOnVehicle({ u: a.u, v: a.v, length: vehicleSpec.len }, 2200);
  };
  const confirmVehicle = (k) => {
    setRoverKey(k); setPicker(false);
    try { sessionStorage.setItem("ara-picked", "1"); } catch { /* ignora */ }
    setTimeout(() => focusVehicle(ROVERS[k]), 400);
  };

  // ---- clique no terreno
  cbPick.current = (p) => {
    if (phase !== "plan" || !pickMode) return;
    if (pickMode === "zona") {
      const m = { ...mem, [sceneKey]: { ...smem, zones: [...smem.zones, { u: p.u, v: p.v, r: Math.max(60, S * 0.02) }] } };
      setMem(m); saveMemory(m); return;
    }
    if (pickMode === "a") { setPts({ a: p }); setRoutes(null); setPickMode("b"); }
    else {
      // destino colado na partida não é uma rota: pede outro ponto (evita contas com distância zero)
      const minM = Math.max(10, spec.len * 4);
      if (pts.a && Math.hypot(p.u - pts.a.u, p.v - pts.a.v) * S < minM) { setPickWarn(tr(`O destino precisa ficar a pelo menos ${Math.round(minM)} m da partida.`, `The destination must be at least ${Math.round(minM)} m from the start.`)); return; }
      setPickWarn(null); setPts((c) => ({ ...c, b: p })); setPickMode(null);
    }
  };

  // ---- planejar: três estratégias + linha reta
  const grid = useMemo(() => (scene && ground ? hazardGrid(scene, 128, ground.softAt, lit, {
    kAt: ground.kAt, sciAt: (u, v) => at(sci, NG, u, v), disturbedAt: (u, v) => at(oldGrid, NG, u, v),
  }) : null), [scene, ground, lit, sci, oldGrid]);
  useEffect(() => {
    if (!grid || !pts.a || !pts.b) { setRoutes(null); return undefined; }
    const t = setTimeout(() => {
      const out = {};
      for (const st of STRATEGIES) {
        const r = planRover(grid, pts.a, pts.b, spec, st.w);
        if (r) { r.energy = routeEnergy(r, spec, g); r.pts = [{ ...r.pts[0], u: pts.a.u, v: pts.a.v }, ...r.pts.slice(1)]; }
        out[st.id] = r;
      }
      const N = grid.N, cells = [], steps = Math.max(1, Math.ceil(Math.hypot(pts.b.u - pts.a.u, pts.b.v - pts.a.v) * N * 2));
      for (let i = 0; i <= steps; i++) {
        const u = pts.a.u + ((pts.b.u - pts.a.u) * i) / steps, w = pts.a.v + ((pts.b.v - pts.a.v) * i) / steps;
        const c = Math.min(N - 1, Math.floor(w * N)) * N + Math.min(N - 1, Math.floor(u * N));
        if (cells[cells.length - 1] !== c) cells.push(c);
      }
      out.straight = describeRoute(grid, cells, spec);
      setRoutes(out);
    }, 20);
    return () => clearTimeout(t);
  }, [grid, pts, spec, g]);
  const chosen = routes?.[strategy] ?? null;
  useEffect(() => {
    const v = view.current;
    if (!v || !scene || phase !== "plan") return;
    const list = [];
    if (routes) for (const st of STRATEGIES) if (routes[st.id] && st.id !== strategy) list.push({ pts: routes[st.id].pts, color: 0x8899aa });
    if (chosen) list.push({ pts: chosen.pts, color: 0xffd166, corridorWidth: spec.width + 2 });
    if (pts.a) list.push({ pts: [pts.a], label: "A", color: 0xffd166 });
    if (pts.b) list.push({ pts: [pts.b], label: "B", color: 0x59e0ff });
    v.setRoutes(list);
  }, [routes, strategy, chosen, pts, phase, scene, spec]);

  // ---- missão rápida: A e B escolhidos pelo ARA
  const quick = () => {
    if (!grid || !scene) return;
    const land = scene.meta.pois?.find((q) => q.kind === "landing");
    const a = land ? { u: land.u + 0.01, v: land.v + 0.01 } : { u: 0.5, v: 0.5 };
    const d = Math.min(0.28, (spec.vmax > 1 ? 2500 : 450) / S);
    for (let k = 0; k < 12; k++) {
      const ang = (k * 30 + 20) * (Math.PI / 180), b = { u: Math.min(0.95, Math.max(0.05, a.u + Math.cos(ang) * d)), v: Math.min(0.95, Math.max(0.05, a.v + Math.sin(ang) * d)) };
      const r = planRover(grid, a, b, spec, STRATEGIES[1].w);
      if (r && r.len < d * S * 1.8) {
        setPts({ a: { ...a, ...uvToLatLon(scene, a.u, a.v) }, b: { ...b, ...uvToLatLon(scene, b.u, b.v) } });
        setPickMode(null); setStrategy("segura"); return;
      }
    }
    setPts({ a: { ...a, ...uvToLatLon(scene, a.u, a.v) } }); setPickMode("b");
  };

  // ---- dirigir
  const finishRef = useRef(null);
  const start = () => {
    const v = view.current;
    if (!v || !pts.a || !scene) return;
    const route = chosen;
    const nxt = route?.pts?.[Math.min(3, route.pts.length - 1)] ?? pts.b;
    const heading = nxt ? Math.atan2(nxt.u - pts.a.u, -(nxt.v - pts.a.v)) : 0;
    setLayer("imagem");
    // a rota dourada passa entre as pedras (corredor livre); fora dela vale o campo estatístico
    const lane = route?.pts ? [...route.pts, ...(pts.b ? [pts.b] : [])] : null;
    setRockCorridor(lane ? lane.map((q) => ({ x: (q.u - 0.5) * S, z: (q.v - 0.5) * S })) : null, spec.width / 2 + 3, spec.wheelR * 0.6);
    v._rockAt = null;
    const hits = new Set();
    const arrivalRadius = Math.max(2, spec.len * 1.25);
    const startTargetDistance = pts.b ? Math.hypot(pts.a.u - pts.b.u, pts.a.v - pts.b.v) * S : Infinity;
    sim.current = { st: startState(spec, { ...pts.a, heading }), acc: 0, hour0: hour, route, lastBlock: 0, arrivalRadius, startTargetDistance };
    v.setDriver((input, dt) => {
      const M = sim.current;
      if (!M) return null;
      if (M.st.status !== "ok") return M.st;
      const W = effectiveWarp(warpRef.current, spec.vmax), sdt = dt * W;
      const hNow = M.hour0 + (M.st.t / (scene.body.day_h * 3600)) * 24;
      const sp = sunPosition(scene.meta.lat, scene.meta.body, SEASON[scene.meta.body].def, ((hNow % 24) + 24) % 24);
      const env = { scene, soft: ground.softAt, sunElev: sp.elevation, hits,
        rocks: (x, z, r) => rocksNear(x, z, r, kWorld),
        sunlit: (u, w) => sp.elevation > 0 && (!lit || lit[Math.min(scene.n - 1, Math.floor(w * scene.n)) * scene.n + Math.min(scene.n - 1, Math.floor(u * scene.n))] > 0.5) };
      const thr = input.brake ? 0 : Math.max(-1, Math.min(1, input.throttle));
      const maxStep = spec.vmax > 1 ? (spec.len * 0.4) / spec.vmax : 5;
      const nsub = Math.max(1, Math.ceil(sdt / maxStep));
      for (let i = 0; i < nsub; i++) {
        const previous = M.st;
        M.st = step(M.st, spec, { throttle: thr, steer: steerForWarp(input.steer, W, spec.vmax > 1 ? 0.6 : 0.1) }, sdt / nsub, env);
        if (pts.b && M.startTargetDistance > M.arrivalRadius && M.st.status === "ok" &&
            withinTargetRadius(previous, M.st, pts.b, M.arrivalRadius, S)) {
          M.st = { ...M.st, status: "chegou" };
        }
      }
      if (M.st.blocked && performance.now() - M.lastBlock > 1500) { M.lastBlock = performance.now(); if (sounds) beep(330, 160); }
      M.acc += dt;
      if (M.acc > 0.12 || M.st.status !== "ok") {
        M.acc = 0;
        const off = route?.pts ? segDist(route.pts, M.st) * S : null;
        const nowMs = performance.now();
        setHud({ ...M.st, hour: ((hNow % 24) + 24) % 24, sunElev: sp.elevation, inSun: env.sunlit(M.st.u, M.st.v), soft: ground.softAt(M.st.u, M.st.v),
          toB: pts.b ? Math.hypot(M.st.u - pts.b.u, M.st.v - pts.b.v) * S : null, off });
        // redesenhar linhas e rótulos é caro: a trilha é atualizada no máximo 1 vez por segundo
        if (M.st.status !== "ok" || nowMs - (M.lastRoutes ?? 0) > 1000) { M.lastRoutes = nowMs; v.setRoutes([
          ...(route?.pts ? [{ pts: route.pts, color: 0xffd166, corridorWidth: spec.width + 2 }] : []),
          ...(pts.b ? [{ pts: [pts.b], label: "B", color: 0x59e0ff }] : []),
          ...(M.st.track.length > 1 ? [{ pts: [...M.st.track, { u: M.st.u, v: M.st.v }], color: 0x7dffb0 }] : []),
        ]); }
        if (M.st.status !== "ok") finishRef.current?.(M.st);
      }
      return M.st;
    });
    v._vehYaw = 0;
    v.setMode("drive");
    setPanels({ left: false, right: true });
    setPhase("drive"); setReport(null); setShowReport(true);
    setHud({ ...sim.current.st });
    box.current?.focus();
  };
  finishRef.current = (st) => {
    const track = [...st.track, { u: st.u, v: st.v }];
    const cons = consequences(track, S, NG, sci, oldGrid, spec.width + 2 * buffer);
    if (st.dist > 3) {
      const m = { ...mem, [sceneKey]: { ...smem, missions: [...smem.missions, { t: Date.now(), rover: roverKey, status: st.status, dist: st.dist,
        track: track.filter((_, i) => i % 2 === 0 || i === track.length - 1).map((q) => ({ u: +q.u.toFixed(5), v: +q.v.toFixed(5) })) }] } };
      setMem(m); saveMemory(m);
    }
    setReport({ st, cons, route: sim.current?.route });
    setPhase("end"); setShowReport(true);
    if (sounds) beep(st.status === "chegou" ? 880 : 220, 260);
    if (narration) speak(tr(...END[st.status][0]), lang);
  };
  // atalho só de desenvolvimento para testar o relatório
  if (import.meta.env.DEV) window.__araState = () => sim.current && { st: sim.current.st, route: sim.current.route?.pts, b: pts.b, S, phase };
  if (import.meta.env.DEV) window.__araFinish = (status = "chegou") => sim.current && finishRef.current?.({ ...sim.current.st, status, dist: Math.max(10, sim.current.st.dist) });
  const stopDrive = useCallback(() => {
    const v = view.current;
    v?.setDriver(null);
    v?.setMode("orbit");
    v?.resetView();
  }, []);
  const selectOtherVehicle = () => {
    stopDrive();
    sim.current = null;
    setHud(null); setReport(null); setPhase("plan"); setPicker(true);
    setPanels({ left: true, right: true });
  };
  const replan = () => { setRockCorridor(null); stopDrive(); sim.current = null; setHud(null); setReport(null); setPhase("plan"); setPanels({ left: true, right: true }); setPts((p) => ({ ...p })); };
  const retry = () => { stopDrive(); start(); };
  useEffect(() => () => stopDrive(), [stopDrive]);

  const groups = useMemo(() => ({ mars: index.filter((s) => s.body === "mars"), moon: index.filter((s) => s.body === "moon"), earth: index.filter((s) => s.body === "earth") }), [index]);
  const vehiclesHere = Object.entries(ROVERS).filter(([, r]) => !body || body === "earth" || r.body === body);
  const pctB = hud ? (hud.battery / spec.batteryWh) * 100 : 100;
  const SOIL = (s) => (s > 0.7 ? tr("areia / material fino", "sand / fine material") : s > 0.4 ? tr("solo misto", "mixed soil") : tr("solo firme / rocha", "firm soil / rock"));
  const stratLabel = (id) => tr(...STRATEGIES.find((s) => s.id === id).label);
  const clearMemory = () => { const m = { ...mem }; delete m[sceneKey]; setMem(m); saveMemory(m); };
  const canStart = Boolean(pts.a) && phase === "plan";
  const bodyLabel = scene ? BODIES[scene.meta.body].label : "";

  return (
    <section aria-labelledby="msTitle" className="t3-page">
      <h1 id="msTitle" className="sr-only">{tr("Missão: planejar e dirigir um rover sobre relevo real", "Mission: plan and drive a rover on real terrain")}</h1>
      <div className={`t3-stage single ${pickMode ? "ms-picking" : ""}`}>
        <div className="t3-pane">
          <div ref={box} className="t3-canvas" tabIndex={0} aria-label={tr("Visão 3D do terreno. No modo direção use W A S D ou as setas; C troca a câmera; espaço freia.", "3D terrain view. In drive mode use W A S D or arrow keys; C switches camera; space brakes.")} />
          {!scene && !loadErr && <div className="t3-loading" role="status"><span className="t3-spinner" />{tr("Carregando relevo real…", "Loading real terrain…")}</div>}
          {!scene && loadErr && (
            <div className="t3-loading" role="alert">
              <span>{loadErr === "offline" ? tr("Sem conexão: não foi possível baixar o relevo.", "No connection: the terrain could not be downloaded.") : tr("Não foi possível carregar o relevo deste local.", "Could not load the terrain for this site.")}</span>
              <button type="button" className="ms-quick" onClick={() => setLoadTry((n) => n + 1)}>{tr("Tentar de novo", "Try again")}</button>
            </div>
          )}
        </div>

        {/* ---------- esquerda: configurar ---------- */}
        {phase === "plan" && (
          <aside className={`t3-panel t3-left ${panels.left ? "" : "closed"}`} aria-label={tr("Configurar missão", "Mission setup")}>
            <button type="button" className="t3-collapse" onClick={() => setPanels((p) => ({ ...p, left: !p.left }))} aria-label={panels.left ? tr("Recolher", "Collapse") : tr("Abrir", "Open")}>{panels.left ? "‹" : "›"}</button>
            <div className="t3-scroll">
              <h2 className="t3-h">{tr("Local", "Site")}</h2>
              <select className="t3-select" value={sceneId ?? ""} onChange={(e) => setSceneId(e.target.value)} aria-label={tr("Local da missão", "Mission site")}>
                {!sceneId && <option value="">{scene?.meta.name ?? tr("Ponto da Terra ao vivo", "Live Earth point")}</option>}
                <optgroup label={tr("Marte", "Mars")}>{groups.mars.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                <optgroup label={tr("Lua", "Moon")}>{groups.moon.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                <optgroup label={tr("Terra (análogos)", "Earth (analogs)")}>{groups.earth.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
              </select>
              <details className="ms-live">
                <summary>{tr("Ou qualquer lugar da Terra, ao vivo", "Or anywhere on Earth, live")}</summary>
                <LiveEarthPicker busy={live.busy} progress={live.progress} error={live.error} onTest={testLive} active={!sceneId} onClear={() => setSceneId("jezero_hirise_pouso")} />
              </details>

              <h2 className="t3-h">{tr("Veículo", "Vehicle")}</h2>
              <button type="button" className="ms-veh" onClick={() => setPicker(true)}>
                <b>{localize(byKey(roverKey) ?? { key: roverKey, name: spec.name }, lang).name}</b>
                <span>{tr("Trocar veículo", "Change vehicle")} ›</span>
              </button>
              <p className="t3-note">{fmt(spec.mass, 0)} kg · {fmt(spec.vmax * 3.6, spec.vmax < 1 ? 2 : 1)} km/h · {tr("sobe até", "climbs up to")} {spec.maxSlope}° · {tr("passa pedras de até", "clears rocks up to")} {fmt(obstacleLimit(spec) * 100, 0)} cm · {spec.rtgW ? `MMRTG ${spec.rtgW} W` : spec.solarW ? tr(`painel solar ${spec.solarW} W`, `solar panel ${spec.solarW} W`) : tr("bateria não recarregável", "non-rechargeable battery")} · {fmt(spec.batteryWh / 1000, 1)} kWh</p>

              <h2 className="t3-h">{tr("Hora, solo e rochas", "Time, soil and rocks")}</h2>
              <label className="t3-range"><span>{tr("Hora solar", "Solar time")} <b>{fmtHour(hour)}</b></span>
                <input type="range" min="0" max="24" step="0.25" value={hour} onChange={(e) => setHour(Number(e.target.value))} /></label>
              <p className="t3-note">{tr("Sol a", "Sun at")} {fmt(sun?.elevation ?? 0, 1)}°. {spec.solarW ? tr("Rover solar: sombra = sem recarga.", "Solar rover: shade = no charging.") : tr("A sombra esfria o veículo e esconde o chão das câmeras.", "Shade chills the vehicle and hides the ground from the cameras.")}</p>
              <p className="t3-note"><b>{tr("Solo", "Soil")}:</b> {ground?.src}. {tr("Atola a partir de", "Gets stuck from")} ~{fmt(critAngle(ground?.mean ?? 0.4), 0)}°.</p>
              <p className="t3-note"><b>{tr("Rochas", "Rocks")}:</b> {ground?.rockSrc}. {tr("Cobertura média", "Mean cover")} {fmt((ground?.kMean ?? 0) * 100, 1)}%.</p>

              <h2 className="t3-h">{tr("Camada", "Layer")}</h2>
              <div className="ms-seg ms-seg4" role="radiogroup" aria-label={tr("Camada", "Layer")}>
                {[["imagem", tr("Imagem", "Image")], ["inclinacao", tr("Inclinação", "Slope")], ["risco", tr("Risco", "Risk")], ["protecao", tr("Proteção", "Protection")]].map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={layer === k} onClick={() => setLayer(k)}>{l}</button>
                ))}
              </div>
              {layer === "risco" && <div className="t3-legend"><span style={{ "--c": "#33c780" }}>{tr("seguro", "safe")}</span><span style={{ "--c": "#f9d64d" }}>{tr("atenção / sombra", "caution / shade")}</span><span style={{ "--c": "#f58033" }}>{tr("difícil / areia", "hard / sand")}</span><span style={{ "--c": "#bf262e" }}>{tr("proibido", "forbidden")}</span></div>}
              {layer === "protecao" && <div className="t3-legend"><span style={{ "--c": "#c759f2" }}>{tr("zona científica", "science zone")}</span><span style={{ "--c": "#40d9ff" }}>{tr("gelo / sombra permanente", "ice / permanent shadow")}</span><span style={{ "--c": "#5a99ff" }}>{tr("trilha antiga", "old track")}</span><span style={{ "--c": "#f2333f" }}>{tr("ciência já perturbada", "science already disturbed")}</span></div>}

              <h2 className="t3-h">{tr("Proteção planetária", "Planetary protection")}</h2>
              <p className="t3-note">{sciMin ? tr("Zonas científicas: unidades CRISM de alteração aquosa (filossilicatos, olivina + carbonato).", "Science zones: CRISM aqueous-alteration units (phyllosilicates, olivine + carbonate).") : psr ? tr("Zonas científicas: regiões em sombra permanente, onde o gelo guarda voláteis e retém contaminantes.", "Science zones: permanently shadowed regions, where ice holds volatiles and traps contaminants.") : tr("Sem mapa científico para esta cena: marque as zonas que a equipe quer preservar.", "No science map for this scene: mark the zones your team wants to preserve.")} {sciCount ? `${fmt((sciCount / (NG * NG)) * 100, 1)}% ${tr("da cena", "of the scene")}.` : ""}</p>
              <div className="t3-btns"><button type="button" aria-pressed={pickMode === "zona"} onClick={() => { setPickMode((m) => (m === "zona" ? null : "zona")); setLayer("protecao"); }}>{pickMode === "zona" ? tr("Clique no mapa…", "Click the map…") : tr("Marcar zona protegida", "Mark protected zone")}</button></div>
              <label className="t3-range"><span>{tr("Faixa perturbada além das rodas", "Disturbed band beyond the wheels")} <b>{buffer} m</b></span>
                <input type="range" min="0" max="25" step="1" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} /></label>
              <p className="t3-note">{tr("Parâmetro de cenário: poeira levantada, partículas e biocarga que saem do veículo. Não há valor oficial único.", "Scenario parameter: dust, particles and bioburden shed by the vehicle. There is no single official value.")}</p>
              <p className="t3-note"><b>{tr("Memória da exploração", "Exploration memory")}:</b> {smem.missions.length} {tr("travessias salvas aqui", "traverses saved here")}{smem.zones.length ? ` · ${smem.zones.length} ${tr("zonas marcadas", "marked zones")}` : ""}. {smem.missions.length || smem.zones.length ? <button type="button" className="ms-link" onClick={clearMemory}>{tr("apagar", "clear")}</button> : null}</p>

              <button type="button" className="ms-src-btn" onClick={() => setSrcOpen((x) => !x)} aria-expanded={srcOpen}>{tr("Como o simulador funciona e fontes", "How the simulator works and sources")}</button>
              {srcOpen && (
                <div className="ms-src">
                  <p className="t3-note">{tr("Energia: P = m·g·v·(Crr·cosθ + senθ)/η + consumo fixo; recarga por gerador ou painel ao Sol. Patinagem cresce com a subida e chega a 100% no ângulo crítico do solo. Pedras menores que o pixel vêm do modelo de Golombek & Rapp: as maiores que a roda bloqueiam, as médias gastam as rodas. Consumo fixo e eficiência são estimativas de ordem de grandeza.", "Energy: P = m·g·v·(Crr·cosθ + sinθ)/η + fixed load; recharge by generator or sunlit panel. Slip grows with the climb and reaches 100% at the soil's critical angle. Sub-pixel rocks come from the Golombek & Rapp model: rocks taller than the wheel block, medium ones wear the wheels. Fixed load and efficiency are order-of-magnitude estimates.")}</p>
                  <ul className="ms-srclist">{[...SOURCES, ...ROCK_SOURCES, ...PP_SOURCES].map((s) => <li key={s.id + s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{tr(s.text, s.en)} ↗</a></li>)}</ul>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ---------- direita: rota passo a passo ---------- */}
        {phase === "plan" && (
          <aside className={`t3-panel t3-right ${panels.right ? "" : "closed"}`} aria-label={tr("Rota", "Route")}>
            <button type="button" className="t3-collapse" onClick={() => setPanels((p) => ({ ...p, right: !p.right }))} aria-label={panels.right ? tr("Recolher", "Collapse") : tr("Abrir", "Open")}>{panels.right ? "›" : "‹"}</button>
            <div className="t3-scroll ms-route">
              <h2 className="t3-h">{tr("Rota", "Route")}</h2>
              <button type="button" className="ms-quick" onClick={quick} disabled={!grid}>⚡ {tr("Missão rápida — o ARA escolhe A e B", "Quick mission — ARA picks A and B")}</button>
              <ol className="ms-steps">
                <li className={pts.a ? "done" : pickMode === "a" ? "now" : ""}>
                  <button type="button" aria-pressed={pickMode === "a"} onClick={() => setPickMode("a")}>
                    <span>A</span><b>{tr("Partida", "Start")}</b><small>{pts.a ? `${fmt(pts.a.lat, 4)}°, ${fmt(pts.a.lon, 4)}°` : pickMode === "a" ? tr("clique no mapa", "click the map") : tr("escolher no mapa", "pick on map")}</small>
                  </button>
                </li>
                <li className={pts.b ? "done" : pickMode === "b" ? "now" : ""}>
                  <button type="button" aria-pressed={pickMode === "b"} disabled={!pts.a} onClick={() => setPickMode("b")}>
                    <span>B</span><b>{tr("Destino", "Target")}</b><small>{pts.b ? `${fmt(Math.hypot(pts.b.u - pts.a.u, pts.b.v - pts.a.v) * S, 0)} m ${tr("em linha reta", "straight line")}` : pickMode === "b" ? tr("clique no mapa", "click the map") : tr("escolher no mapa", "pick on map")}</small>
                  </button>
                </li>
              </ol>
              {pickWarn && <p className="ms-hint" role="alert" style={{ color: "var(--color-warn)" }}>{pickWarn}</p>}
              {pickMode && pickMode !== "zona" && <p className="ms-hint">{tr("Arraste para girar e role para aproximar; um clique curto marca o ponto.", "Drag to rotate and scroll to zoom; a short click sets the point.")}</p>}

              {routes && (
                <>
                  <h3 className="ms-sub">{tr("Compare as estratégias", "Compare strategies")}</h3>
                  <div className="ms-strats" role="radiogroup" aria-label={tr("Estratégia", "Strategy")}>
                    {STRATEGIES.map((st) => {
                      const r = routes[st.id];
                      return (
                        <button key={st.id} type="button" role="radio" aria-checked={strategy === st.id} disabled={!r} onClick={() => setStrategy(st.id)} title={tr(...st.desc)}>
                          <b>{tr(...st.label)}</b>
                          {r ? (
                            <span className="ms-kv">
                              <i>{fmt(r.len, 0)} m</i><i>{fmtDur(r.time)}</i><i>{fmt(r.energy, 0)} Wh</i>
                              <i>{tr("patina", "slip")} {fmt(r.maxSlip * 100, 0)}%</i><i>{tr("sombra", "shade")} {fmt(r.shadeFrac * 100, 0)}%</i><i>{tr("pedras", "rocks")} {fmt(r.rockRisk, 1)}</i>
                              <i className={r.sciLen > 0 ? "bad" : ""}>{tr("ciência", "science")} {fmt(r.sciLen, 0)} m</i><i>{tr("chão novo", "new ground")} {fmt(r.newArea, 0)} m²</i>
                            </span>
                          ) : <small>{tr("sem caminho seguro", "no safe path")}</small>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="t3-note">{tr("A faixa dourada mostra a largura do rover mais uma margem de segurança. A rota evita áreas com maior densidade estimada de pedras; a distribuição visível é um modelo estatístico, não um mapa de cada pedra observada.", "The gold band shows the rover's width plus a safety margin. The route avoids areas with higher estimated rock density; visible rocks are a statistical model, not a map of individually observed rocks.")}</p>
                  <p className="t3-note">{tr("Linha reta", "Straight line")}: {fmt(routes.straight.len, 0)} m · {tr("máx.", "max")} {fmt(routes.straight.maxSlope, 1)}° · {tr("patinagem", "slip")} {fmt(routes.straight.maxSlip * 100, 0)}%{routes.straight.maxSlip >= 0.99 ? ` — ${tr("atolaria", "would get stuck")}` : ""}. {tr("“Pedras” = número esperado de pedras maiores que a roda no caminho.", "“Rocks” = expected number of rocks taller than the wheel on the path.")}</p>
                  {!chosen && <p className="ms-alert">{tr("Esta estratégia não encontrou caminho seguro. Escolha outra ou outro destino.", "This strategy found no safe path. Pick another one or another target.")}</p>}
                </>
              )}
              <div className="ms-sticky">
                <button type="button" className="ms-go" disabled={!canStart} onClick={start}>▶ {pts.b ? tr("Iniciar missão", "Start mission") : tr("Dirigir livre a partir de A", "Free drive from A")}</button>
                <small>{tr("W A S D ou setas · C câmera · espaço freia", "W A S D or arrows · C camera · space brakes")}</small>
              </div>
            </div>
          </aside>
        )}

        {/* ---------- ferramentas do mapa ---------- */}
        {phase === "plan" && (
          <div className="ms-tools" role="toolbar" aria-label={tr("Mapa", "Map")}>
            <button type="button" onClick={() => view.current?.zoomBy(0.7)} aria-label={tr("Aproximar", "Zoom in")}>＋</button>
            <button type="button" onClick={() => view.current?.zoomBy(1.4)} aria-label={tr("Afastar", "Zoom out")}>－</button>
            <button type="button" onClick={() => view.current?.resetView()}>{tr("Recentrar", "Recenter")}</button>
            <button type="button" onClick={() => setPanels((p) => (p.left || p.right ? { left: false, right: false } : { left: true, right: true }))}>{panels.left || panels.right ? tr("Esconder painéis", "Hide panels") : tr("Mostrar painéis", "Show panels")}</button>
            {canStart && !panels.right && <button type="button" className="gold" onClick={start}>▶ {tr("Iniciar", "Start")}</button>}
          </div>
        )}

        {/* ---------- telemetria ---------- */}
        {phase !== "plan" && hud && (
          <aside className="ms-hud" aria-label={tr("Telemetria", "Telemetry")}>
            <div className="ms-hud-top"><b>{spec.name}</b><span>{scene?.meta.name} · {chosen ? stratLabel(strategy) : tr("direção livre", "free drive")}</span></div>
            <Bar label={tr("Bateria", "Battery")} value={pctB} text={`${fmt(pctB, 0)}% · ${hud.power ? `${hud.power.in - hud.power.out >= 0 ? "+" : ""}${fmt(hud.power.in - hud.power.out, 0)} W` : ""}`} />
            <Bar label={tr("Patinagem", "Slip")} value={hud.slip * 100} warn={30} bad={60} />
            <Bar label={tr("Rodas enterradas", "Wheels sunk")} value={hud.sink * 100} warn={25} bad={60} />
            <Bar label={tr("Desgaste das rodas", "Wheel wear")} value={hud.wheel} warn={40} bad={75} />
            <dl className="ms-tele">
              <div><dt>{tr("Velocidade", "Speed")}</dt><dd>{fmt(Math.abs(hud.speed) * 100, 1)} cm/s</dd></div>
              <div><dt>{tr("Arfagem / rolagem", "Pitch / roll")}</dt><dd className={Math.max(Math.abs(hud.pitch), Math.abs(hud.roll)) > 30 ? "bad" : ""}>{fmt(hud.pitch, 0)}° / {fmt(hud.roll, 0)}°</dd></div>
              <div><dt>{tr("Solo aqui", "Soil here")}</dt><dd>{SOIL(hud.soft ?? 0.3)}</dd></div>
              <div><dt>{tr("Sol", "Sun")}</dt><dd className={!hud.inSun && spec.solarW ? "bad" : ""}>{hud.inSun ? `${tr("ao Sol", "sunlit")} (${fmt(hud.sunElev, 0)}°)` : hud.sunElev > 0 ? tr("na sombra", "in shade") : tr("noite", "night")}</dd></div>
              <div><dt>{tr("Distância", "Distance")}</dt><dd>{fmt(hud.dist, 0)} m</dd></div>
              <div><dt>{tr("Até B", "To B")}</dt><dd>{hud.toB == null ? "—" : `${fmt(hud.toB, 0)} m`}</dd></div>
              <div><dt>{tr("Fora da rota", "Off route")}</dt><dd className={hud.off > 40 ? "warn" : ""}>{hud.off == null ? "—" : `${fmt(hud.off, 0)} m`}</dd></div>
              <div><dt>{tr("Tempo de missão", "Mission time")}</dt><dd>{fmtDur(hud.t)}</dd></div>
            </dl>
            {hud.blocked && <p className="ms-alert">{tr(`Pedra de ${fmt(hud.blocked.h * 100, 0)} cm à frente — maior do que o veículo passa. Dê ré e contorne.`, `A ${fmt(hud.blocked.h * 100, 0)} cm rock ahead — taller than the vehicle can clear. Back up and go around.`)}</p>}
            {hud.off != null && hud.off > spec.width / 2 + 3 && <p className="ms-alert">{tr("Fora do corredor da rota: aqui as pedras não foram desviadas pelo planejamento. Volte para a linha dourada.", "Outside the route corridor: rocks here were not avoided by the plan. Get back on the gold line.")}</p>}
            {!hud.inSun && spec.solarW > 0 && <p className="ms-alert">{tr("Na sombra: os painéis não carregam. Não pare aqui.", "In shade: panels are not charging. Do not stop here.")}</p>}
            {hud.slip > 0.6 && <p className="ms-alert">{tr("Patinando muito: pare, dê ré e suba em ângulo menor.", "Slipping hard: stop, back up and climb at a lower angle.")}</p>}
            {at(sci, NG, hud.u, hud.v) ? <p className="ms-alert pp">{tr("Você está numa zona científica protegida.", "You are inside a protected science zone.")}</p> : null}
            <label className="t3-range"><span>{tr("Aceleração do tempo", "Time warp")} <b>×{warp}</b>{effectiveWarp(warp, spec.vmax) < warp && <small className="block opacity-75">{tr(`efetiva ×${Math.round(effectiveWarp(warp, spec.vmax))} para manter o controle`, `effective ×${Math.round(effectiveWarp(warp, spec.vmax))} to keep control`)}</small>}</span>
              <input type="range" min="0" max={WARPS.length - 1} step="1" value={WARPS.indexOf(warp)} onChange={(e) => setWarp(WARPS[Number(e.target.value)])} /></label>
            {body === "moon" && <p className="t3-note">{tr("Luz ambiente realçada para enxergar o chão; sombras e energia seguem o Sol real.", "Ambient light boosted so you can see the ground; shadows and energy follow the real Sun.")}</p>}
            <div className="t3-btns">
              {phase === "end" && !showReport && <button type="button" className="gold" onClick={() => setShowReport(true)}>{tr("Ver relatório", "Show report")}</button>}
              <button type="button" onClick={selectOtherVehicle}>{tr("Escolher outro veículo", "Choose another vehicle")}</button>
              <button type="button" onClick={replan}>{tr("Voltar ao planejamento", "Back to planning")}</button>
            </div>
          </aside>
        )}
        {phase === "drive" && coarse() && <Joystick view={() => view.current} />}

        {/* ---------- relatório ---------- */}
        {phase === "end" && report && showReport && (
          <div className={`ms-end ${report.st.status === "chegou" ? "ok" : ""}`} role="dialog" aria-labelledby="msEnd">
            <button type="button" className="t3-x ms-endx" onClick={() => setShowReport(false)} aria-label={tr("Fechar", "Close")}>×</button>
            <p className="ms-badge">{report.st.status === "chegou" ? "🏁" : "⚠"} {report.st.status === "chegou" ? tr("Missão cumprida", "Mission complete") : tr("Missão interrompida", "Mission aborted")}</p>
            <h2 id="msEnd">{tr(...END[report.st.status][0])}</h2>
            <p>{tr(...END[report.st.status][1])}</p>
            <table className="ms-plan">
              <thead><tr><th /><th>{tr("Planejado", "Planned")}</th><th>{tr("Você", "You")}</th></tr></thead>
              <tbody>
                <tr><th>{tr("Distância", "Distance")}</th><td>{report.route ? `${fmt(report.route.len, 0)} m` : "—"}</td><td>{fmt(report.st.dist, 0)} m</td></tr>
                <tr><th>{tr("Tempo", "Time")}</th><td>{report.route ? fmtDur(report.route.time) : "—"}</td><td>{fmtDur(report.st.t)}</td></tr>
                <tr><th>{tr("Energia líquida", "Net energy")}</th><td>{report.route ? `${fmt(report.route.energy, 0)} Wh` : "—"}</td><td>{fmt(spec.batteryWh - report.st.battery, 0)} Wh</td></tr>
                <tr><th>{tr("Desgaste das rodas", "Wheel wear")}</th><td>—</td><td>{fmt(report.st.wheel, 0)}% · {report.st.rocksClimbed ?? 0} {tr("pedras", "rocks")}</td></tr>
                <tr><th>{tr("Zona científica", "Science zone")}</th><td>{report.route ? `${fmt(report.route.sciLen, 0)} m` : "—"}</td><td className={report.cons.sciLen > 0 ? "bad" : ""}>{fmt(report.cons.sciLen, 0)} m</td></tr>
                <tr><th>{tr("Chão novo perturbado", "New ground disturbed")}</th><td>{report.route ? `${fmt(report.route.newArea, 0)} m²` : "—"}</td><td>{fmt(report.cons.newArea, 0)} m²</td></tr>
                <tr><th>{tr("Trilhas reaproveitadas", "Tracks reused")}</th><td>{report.route ? `${fmt(report.route.reuseFrac * 100, 0)}%` : "—"}</td><td>{fmt(report.cons.reuse * 100, 0)}%</td></tr>
              </tbody>
            </table>
            <p className="t3-note">{tr("A travessia foi salva na memória da exploração deste local: a próxima missão a vê na camada Proteção e pode reaproveitar a trilha.", "The traverse was saved in this site's exploration memory: the next mission sees it in the Protection layer and can reuse the track.")}</p>
            <div className="t3-btns"><button type="button" className="gold" onClick={retry}>{tr("Tentar de novo", "Try again")}</button><button type="button" onClick={replan}>{tr("Nova rota", "New route")}</button><button type="button" onClick={selectOtherVehicle}>{tr("Escolher outro veículo", "Choose another vehicle")}</button><button type="button" onClick={() => setShowReport(false)}>{tr("Ver o terreno", "View terrain")}</button></div>
          </div>
        )}

        {picker && phase === "plan" && (
          <VehiclePicker options={vehiclesHere} value={roverKey} onConfirm={confirmVehicle}
                         onClose={() => { setPicker(false); try { sessionStorage.setItem("ara-picked", "1"); } catch { /* ignora */ } }} />
        )}

        <div className="t3-top">
          <div className="t3-crumb"><span>{tr("Missão", "Mission")}</span><i>›</i><b>{scene ? `${tr(bodyLabel, BODY_EN[bodyLabel])} · ${scene.meta.name}` : "…"}</b></div>
          {phase === "drive" && <div className="ms-keys" aria-hidden="true"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {tr("dirigir", "drive")} · <kbd>C</kbd> {tr("câmera", "camera")} · <kbd>{tr("espaço", "space")}</kbd> {tr("freio", "brake")}</div>}
          {phase === "plan" && pickMode && <div className="ms-keys">{pickMode === "zona" ? tr("Clique onde fica a zona a proteger", "Click where the zone to protect is") : pickMode === "a" ? tr("Clique no mapa para marcar a partida (A)", "Click the map to set the start (A)") : tr("Clique no mapa para marcar o destino (B)", "Click the map to set the target (B)")}</div>}
        </div>
        <p className="ms-foot">{tr("Simulação educativa com dados reais de relevo, solo, rochas e Sol — não é o software de operação da NASA.", "Educational simulation with real terrain, soil, rock and Sun data — not NASA operations software.")} <Link to="/veiculos">{tr("Ficha dos veículos", "Vehicle sheets")}</Link></p>
      </div>
    </section>
  );
}
