// ARA Missão — planeje e dirija um rover sobre o relevo real de Marte, da Lua ou da Terra.
// 1) escolha local, veículo e hora; 2) marque A e B; 3) o planejador traça a rota mais segura somando
// inclinação, solo (THEMIS em Marte, SoilGrids na Terra, regolito na Lua) e sombra; 4) dirija com WASD/setas
// seguindo (ou não) a linha; 5) o simulador cobra energia, patinagem, atolamento, tombamento e desgaste das rodas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TerrainView from "../lib/terrain3d/TerrainView.js";
import { BODIES, heightAt, loadIndex, loadScene, slopeGrid, uvToLatLon } from "../lib/terrain3d/data.js";
import { buildLiveScene } from "../lib/terrain3d/liveEarth.js";
import { SEASON, fmtHour, shadowMask, sunPosition } from "../lib/terrain3d/sun.js";
import { END_TEXT, ROVERS, SOURCES, critAngle, softFromTI, startState, step, tiSampler } from "../lib/mission/rover.js";
import { describeRoute, hazardGrid, planRover, routeEnergy } from "../lib/mission/planner.js";
import LiveEarthPicker from "../components/lab3d/LiveEarthPicker.jsx";
import { dataUrl, fmt } from "../lib/format.js";
import "../assets/css/lab3d.css";
import "../assets/css/mission.css";

const WARPS = [1, 10, 60, 300, 1000];
const fmtDur = (s) => (s < 60 ? `${fmt(s, 0)} s` : s < 3600 ? `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, "0")} s` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`);
// distância de um ponto à polilinha (em unidades u, v)
function segDist(pts, p) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], du = b.u - a.u, dv = b.v - a.v, L2 = du * du + dv * dv || 1e-12;
    const t = Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / L2));
    best = Math.min(best, Math.hypot(a.u + t * du - p.u, a.v + t * dv - p.v));
  }
  return pts.length === 1 ? Math.hypot(pts[0].u - p.u, pts[0].v - p.v) : best;
}
const SOIL_LABEL = (s) => (s > 0.7 ? "areia / material fino" : s > 0.4 ? "solo misto" : "solo firme / rocha");

function Bar({ label, value, max = 100, warn, bad, unit = "%", text }) {
  const f = Math.max(0, Math.min(1, value / max));
  const cls = bad != null && value >= bad ? "bad" : warn != null && value >= warn ? "warn" : "";
  return (
    <div className={`ms-bar ${cls}`}>
      <span>{label}<b>{text ?? `${fmt(value, 0)}${unit}`}</b></span>
      <i><em style={{ width: `${f * 100}%` }} /></i>
    </div>
  );
}

export default function Mission() {
  const box = useRef(null), view = useRef(null);
  const [index, setIndex] = useState([]);
  const [params] = useSearchParams();
  const askRover = ROVERS[params.get("rover")] ? params.get("rover") : null;
  const [sceneId, setSceneId] = useState(params.get("site") || (askRover === "lrv" ? "haworth_01" : "jezero_hirise_pouso"));
  const [scene, setScene] = useState(null);
  const [live, setLive] = useState({ busy: false, progress: null, error: null });
  const [roverKey, setRoverKey] = useState(askRover ?? "perseverance");
  const [hour, setHour] = useState(10);
  const [pts, setPts] = useState({});           // { a, b }
  const [route, setRoute] = useState(null);
  const [straight, setStraight] = useState(null);
  const [phase, setPhase] = useState("plan");   // plan | drive | end
  const [hud, setHud] = useState(null);
  const [warp, setWarp] = useState(60);
  const [layer, setLayer] = useState("imagem");
  const [themis, setThemis] = useState(null);
  const [soilCells, setSoilCells] = useState(null);
  const [showSrc, setShowSrc] = useState(false);
  const sim = useRef(null);
  const warpRef = useRef(warp);
  warpRef.current = warp;

  const spec = ROVERS[roverKey];
  const body = scene?.meta.body;
  const g = scene?.body.g ?? 3.721;

  // ---- dados de apoio: índice de cenas, THEMIS (inércia térmica) e solos SoilGrids das células da Terra
  useEffect(() => {
    loadIndex().then((ix) => setIndex(ix.scenes.filter((s) => s.kind !== "overview")));
    fetch(dataUrl("data/minerals/jezero.json")).then((r) => (r.ok ? r.json() : null)).then((d) => setThemis(d?.themis ?? null)).catch(() => {});
    fetch(dataUrl("data/evidence/earth_cells.json")).then((r) => (r.ok ? r.json() : null)).then((d) => setSoilCells(d?.cells ?? null)).catch(() => {});
  }, []);

  // ---- vista 3D
  useEffect(() => {
    view.current = new TerrainView(box.current, { onPick: (p) => cbPick.current?.(p) });
    view.current.setFlags({ labels: true, path: false, cell: false });
    return () => view.current?.dispose();
  }, []);
  const show = (s) => { view.current.setScene(s); view.current.setExaggeration(1); setScene(s); };
  useEffect(() => {
    if (!sceneId) return;
    let alive = true;
    setScene(null); setPts({}); setRoute(null); setStraight(null); setPhase("plan");
    loadScene(sceneId).then((s) => alive && show(s)).catch(console.error);
    return () => { alive = false; };
  }, [sceneId]);
  const testLive = async (lat, lon, name) => {
    setLive({ busy: true, error: null, progress: { f: 0, text: "Começando…" } });
    try {
      const sc = await buildLiveScene(lat, lon, name, (text, f) => setLive((l) => ({ ...l, progress: { text, f } })));
      setSceneId(null); setPts({}); setRoute(null); setStraight(null); setPhase("plan");
      show(sc); setLive({ busy: false, progress: null, error: null });
    } catch {
      setLive({ busy: false, progress: null, error: "Não consegui baixar os dados desse ponto. Tente outro." });
    }
  };

  // veículo compatível com o corpo
  useEffect(() => {
    if (!body) return;
    if (body === "moon" && ROVERS[roverKey].body !== "moon") setRoverKey("lrv");
    if (body === "mars" && ROVERS[roverKey].body !== "mars") setRoverKey("perseverance");
  }, [body]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- solo: fofura 0..1 por ponto, com a fonte declarada
  const soil = useMemo(() => {
    if (!scene) return null;
    const b = scene.meta.body;
    if (b === "mars") {
      const ti = tiSampler(themis);
      const N = 48, grid = new Float32Array(N * N);
      let any = false, tiSum = 0, tiN = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const ll = uvToLatLon(scene, (x + 0.5) / N, (y + 0.5) / N), t = ti?.(ll.lat, ll.lon);
        grid[y * N + x] = t == null ? 0.45 : softFromTI(t);
        if (t != null) { any = true; tiSum += t; tiN++; }
      }
      return { at: (u, v) => grid[Math.min(N - 1, Math.floor(v * N)) * N + Math.min(N - 1, Math.floor(u * N))],
        source: any ? `Inércia térmica THEMIS (Huang 2026, ~1 km): média ${fmt(tiSum / tiN, 0)} J m⁻² K⁻¹ s⁻½ nesta cena` : "Sem cobertura THEMIS nesta cena: solo assumido como misto", mean: any ? softFromTI(tiSum / tiN) : 0.45 };
    }
    if (b === "moon") return { at: () => 0.55, source: "Regolito lunar solto (sem mapa de solo na escala da cena): valor fixo", mean: 0.55 };
    const c = soilCells?.[scene.meta.id]?.soil?.properties;
    if (c?.sand) {
      const s = Math.max(0, Math.min(1, (c.sand.mean - 25) / 60)) * (1 - 0.6 * Math.min(1, (c.cfvo?.mean ?? 0) / 60));
      return { at: () => s, source: `SoilGrids 0–5 cm (média da célula): ${fmt(c.sand.mean, 0)}% areia, ${fmt(c.cfvo?.mean ?? 0, 0)}% fragmentos grossos — previsão de modelo`, mean: s };
    }
    return { at: () => 0.3, source: "Sem dado de solo para este ponto: solo assumido firme", mean: 0.3 };
  }, [scene, themis, soilCells]);

  // ---- Sol e sombra na hora escolhida (sombras calculadas no próprio relevo)
  const sun = useMemo(() => {
    if (!scene) return null;
    const b = scene.meta.body;
    return sunPosition(scene.meta.lat, b, SEASON[b].def, hour);
  }, [scene, hour]);
  const lit = useMemo(() => {
    if (!scene || !sun) return null;
    if (sun.elevation <= 0) return new Float32Array(scene.n * scene.n);
    return shadowMask(scene.heights, scene.n, scene.meta.size_m / scene.n, sun.azimuth, sun.elevation).mask;
  }, [scene, sun]);
  useEffect(() => {
    const v = view.current;
    if (!v || !scene || !sun) return;
    v.setSun(sun.azimuth, sun.elevation);
    if (lit) v.setShadowMask(lit);
  }, [scene, sun, lit]);

  // ---- mapa de risco (camada): verde seguro · amarelo atenção · laranja difícil · vermelho proibido
  useEffect(() => {
    const v = view.current;
    if (!v || !scene || !soil) return;
    if (layer !== "risco") { v.setLayer(layer === "inclinacao" ? "declividade" : "imagem"); return; }
    const n = scene.n, slope = slopeGrid(scene), out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, s = soil.at((x + 0.5) / n, (y + 0.5) / n), lim = Math.min(spec.maxSlope, critAngle(s) - 3);
      const r = slope[i] / lim;
      let k = r > 1 ? 0 : r > 0.7 ? 1 : r > 0.4 || s > 0.7 ? 2 : 3;
      if (spec.solarW && lit && lit[i] < 0.5) k = Math.min(k, 1);
      out[i] = k;
    }
    v.setOpsMask(out); v.setLayer("operacoes");
  }, [layer, scene, soil, spec, lit]);

  // ---- veículo na cena
  useEffect(() => {
    const v = view.current;
    if (!v || !scene) return;
    const at = pts.a ?? { u: 0.5, v: 0.5 };
    v.setVehicle({ key: roverKey, length: spec.len, u: at.u, v: at.v, heading: 0 });
  }, [scene, roverKey, pts.a]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- escolher A e B
  const cbPick = useRef(null);
  cbPick.current = (p) => {
    if (phase !== "plan") return;
    setRoute(null); setStraight(null);
    setPts((cur) => (!cur.a || cur.b ? { a: p } : { ...cur, b: p }));
  };

  // ---- planejar
  const grid = useMemo(() => (scene && soil ? hazardGrid(scene, 128, soil.at, lit) : null), [scene, soil, lit]);
  useEffect(() => {
    const v = view.current;
    if (!v || !scene) return;
    if (!pts.a) { v.setRoutes([]); return; }
    if (!pts.b) { v.setRoutes([{ pts: [pts.a], label: "A" }]); return; }
    const t = setTimeout(() => {
      const r = planRover(grid, pts.a, pts.b, spec);
      // linha reta, para comparar
      const N = grid.N, cells = [], steps = Math.ceil(Math.hypot(pts.b.u - pts.a.u, pts.b.v - pts.a.v) * N * 2);
      for (let i = 0; i <= steps; i++) {
        const u = pts.a.u + ((pts.b.u - pts.a.u) * i) / steps, w = pts.a.v + ((pts.b.v - pts.a.v) * i) / steps;
        const c = Math.min(N - 1, Math.floor(w * N)) * N + Math.min(N - 1, Math.floor(u * N));
        if (cells[cells.length - 1] !== c) cells.push(c);
      }
      const st = describeRoute(grid, cells, spec);
      if (r) r.energy = routeEnergy(r, spec, g);
      setRoute(r ?? { blocked: true }); setStraight(st);
      v.setRoutes([
        ...(r ? [{ pts: r.pts, color: 0xffd166, label: "A" }] : [{ pts: [pts.a], label: "A" }]),
        { pts: [pts.b], label: "B", color: 0x59e0ff },
      ]);
    }, 20);
    return () => clearTimeout(t);
  }, [pts, grid, spec, scene, g]);

  // ---- dirigir
  const start = () => {
    const v = view.current;
    if (!v || !pts.a || !scene) return;
    const nxt = route?.pts?.[Math.min(3, (route?.pts?.length ?? 1) - 1)] ?? pts.b;
    const heading = nxt ? Math.atan2(nxt.u - pts.a.u, -(nxt.v - pts.a.v)) : 0;
    setLayer("imagem");
    // a rota começa no centro da célula da grade: liga A exatamente ao primeiro ponto
    if (route?.pts) route.pts = [{ ...route.pts[0], u: pts.a.u, v: pts.a.v }, ...route.pts.slice(1)];
    sim.current = { st: startState(spec, { ...pts.a, heading }), acc: 0, hour0: hour };
    v.setDriver((input, dt) => {
      const S = sim.current;
      if (!S) return null;
      const W = warpRef.current, sdt = dt * W;
      const body2 = scene.body;
      const hNow = S.hour0 + (S.st.t / (body2.day_h * 3600)) * 24;
      const sp = sunPosition(scene.meta.lat, scene.meta.body, SEASON[scene.meta.body].def, ((hNow % 24) + 24) % 24);
      const env = { scene, soft: soil.at, sunElev: sp.elevation,
        sunlit: (u, w) => sp.elevation > 0 && (!lit || lit[Math.min(scene.n - 1, Math.floor(w * scene.n)) * scene.n + Math.min(scene.n - 1, Math.floor(u * scene.n))] > 0.5) };
      const thr = input.brake ? 0 : Math.max(-1, Math.min(1, input.throttle));
      // sub-passos para estabilidade em acelerações de tempo altas
      const n = Math.max(1, Math.ceil(sdt / 5));
      for (let i = 0; i < n; i++) S.st = step(S.st, spec, { throttle: thr, steer: input.steer * (W > 60 ? 60 / W : 1) }, sdt / n, env);
      if (pts.b && S.st.status === "ok" && Math.hypot(S.st.u - pts.b.u, S.st.v - pts.b.v) * scene.meta.size_m < Math.max(12, spec.len * 4)) S.st = { ...S.st, status: "chegou" };
      S.acc += dt;
      if (S.acc > 0.12 || S.st.status !== "ok") {
        S.acc = 0;
        const off = route?.pts ? segDist(route.pts, S.st) * scene.meta.size_m : null;
        setHud({ ...S.st, hour: ((hNow % 24) + 24) % 24, sunElev: sp.elevation, inSun: env.sunlit(S.st.u, S.st.v), soft: soil.at(S.st.u, S.st.v),
          toB: pts.b ? Math.hypot(S.st.u - pts.b.u, S.st.v - pts.b.v) * scene.meta.size_m : null, off });
        if (S.st.status !== "ok") { setPhase("end"); }
        v.setRoutes([
          ...(route?.pts ? [{ pts: route.pts, color: 0xffd166 }] : []),
          ...(pts.b ? [{ pts: [pts.b], label: "B", color: 0x59e0ff }] : []),
          ...(S.st.track.length > 1 ? [{ pts: [...S.st.track, { u: S.st.u, v: S.st.v }], color: 0x7dffb0 }] : []),
        ]);
      }
      return S.st.status === "ok" || S.st.status === "chegou" ? S.st : { ...S.st };
    });
    v._vehYaw = 0;
    v.setMode("drive");
    setPhase("drive");
    setHud({ ...sim.current.st });
    box.current?.focus();
  };
  const stopDrive = useCallback(() => {
    const v = view.current;
    v?.setDriver(null);
    v?.setMode("orbit");
    v?.resetView();
  }, []);
  useEffect(() => { if (phase === "end") view.current?.setDriver((_, __) => sim.current?.st ?? null); }, [phase]);
  const replan = () => { stopDrive(); sim.current = null; setHud(null); setPhase("plan"); setPts((p) => ({ ...p })); };
  const retry = () => { stopDrive(); start(); };
  useEffect(() => () => stopDrive(), [stopDrive]);

  const groups = useMemo(() => ({
    mars: index.filter((s) => s.body === "mars"), moon: index.filter((s) => s.body === "moon"), earth: index.filter((s) => s.body === "earth"),
  }), [index]);
  const vehiclesHere = Object.entries(ROVERS).filter(([, r]) => !body || body === "earth" || r.body === body);
  const end = hud && hud.status !== "ok" ? END_TEXT[hud.status] : null;
  const pctB = hud ? (hud.battery / spec.batteryWh) * 100 : 100;

  return (
    <section aria-labelledby="msTitle" className="t3-page">
      <h1 id="msTitle" className="sr-only">Missão: planejar e dirigir um rover sobre relevo real</h1>
      <div className="t3-stage single">
        <div className="t3-pane">
          <div ref={box} className="t3-canvas" tabIndex={0} aria-label="Visão 3D do terreno. No modo direção use W A S D ou as setas; C troca a câmera; espaço freia." />
          {!scene && <div className="t3-loading" role="status"><span className="t3-spinner" />Carregando relevo real…</div>}
        </div>

        {/* ---------- painel de planejamento ---------- */}
        {phase === "plan" && (
          <aside className="t3-panel t3-left" aria-label="Planejamento da missão">
            <div className="t3-scroll">
              <h2 className="t3-h">1 · Local</h2>
              <select className="t3-select" value={sceneId ?? ""} onChange={(e) => setSceneId(e.target.value)} aria-label="Local da missão">
                {!sceneId && <option value="">{scene?.meta.name ?? "Ponto da Terra ao vivo"}</option>}
                <optgroup label="Marte">{groups.mars.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                <optgroup label="Lua">{groups.moon.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                <optgroup label="Terra (análogos)">{groups.earth.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
              </select>
              <details className="ms-live">
                <summary>Ou qualquer lugar da Terra, ao vivo</summary>
                <LiveEarthPicker busy={live.busy} progress={live.progress} error={live.error} onTest={testLive} active={!sceneId} onClear={() => setSceneId("jezero_hirise_pouso")} />
              </details>

              <h2 className="t3-h">2 · Veículo</h2>
              <select className="t3-select" value={roverKey} onChange={(e) => setRoverKey(e.target.value)} aria-label="Veículo">
                {vehiclesHere.map(([k, r]) => <option key={k} value={k}>{r.name}</option>)}
              </select>
              <p className="t3-note">{fmt(spec.mass, 0)} kg · até {fmt(spec.vmax * 3.6, spec.vmax < 1 ? 2 : 1)} km/h · sobe até {spec.maxSlope}° · {spec.rtgW ? `gerador nuclear ${spec.rtgW} W` : spec.solarW ? `painel solar ${spec.solarW} W de pico` : "bateria não recarregável"} · bateria {fmt(spec.batteryWh / 1000, 1)} kWh{body === "earth" ? " · na Terra o peso é 1 g: o ensaio pesa mais que a missão" : ""}</p>

              <h2 className="t3-h">3 · Hora local e solo</h2>
              <label className="t3-range"><span>Hora solar <b>{fmtHour(hour)}</b></span>
                <input type="range" min="0" max="24" step="0.25" value={hour} onChange={(e) => setHour(Number(e.target.value))} /></label>
              <p className="t3-note">Sol a {fmt(sun?.elevation ?? 0, 1)}° de altura. {spec.solarW ? "Rover solar: sombra = sem recarga." : "Sombra também esfria o veículo e esconde o terreno das câmeras."}</p>
              <p className="t3-note"><b>Solo:</b> {soil?.source}. Atola a partir de ~{fmt(critAngle(soil?.mean ?? 0.4), 0)}° de subida.</p>
              <div className="t3-seg ms-seg" role="radiogroup" aria-label="Camada">
                {[["imagem", "Imagem"], ["inclinacao", "Inclinação"], ["risco", "Mapa de risco"]].map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={layer === k} onClick={() => setLayer(k)}>{l}</button>
                ))}
              </div>
              {layer === "risco" && <div className="t3-legend"><span style={{ "--c": "#33c780" }}>seguro</span><span style={{ "--c": "#f9d64d" }}>atenção / sombra</span><span style={{ "--c": "#f58033" }}>difícil / areia</span><span style={{ "--c": "#bf262e" }}>proibido</span></div>}

              <h2 className="t3-h">4 · Rota A → B</h2>
              <p className="t3-note">{!pts.a ? "Clique no terreno para marcar a partida (A)." : !pts.b ? "Agora clique no destino (B)." : "Rota calculada. Clique de novo para recomeçar."}</p>
              {route?.blocked && <p className="ms-alert">Não existe caminho seguro entre A e B para este veículo: toda saída passa do limite de inclinação ou do ângulo em que o solo atola.</p>}
              {route?.pts && (
                <table className="ms-plan">
                  <thead><tr><th /><th>Rota ARA</th><th>Linha reta</th></tr></thead>
                  <tbody>
                    <tr><th>Distância</th><td>{fmt(route.len, 0)} m</td><td>{fmt(straight?.len, 0)} m</td></tr>
                    <tr><th>Mais íngreme</th><td>{fmt(route.maxSlope, 1)}°</td><td className={straight?.maxSlope > spec.maxSlope ? "bad" : ""}>{fmt(straight?.maxSlope, 1)}°</td></tr>
                    <tr><th>Patinagem máx.</th><td>{fmt(route.maxSlip * 100, 0)}%</td><td className={straight?.maxSlip > 0.6 ? "bad" : ""}>{fmt((straight?.maxSlip ?? 0) * 100, 0)}%</td></tr>
                    <tr><th>Em areia</th><td>{fmt(route.softFrac * 100, 0)}%</td><td>{fmt((straight?.softFrac ?? 0) * 100, 0)}%</td></tr>
                    <tr><th>Na sombra</th><td>{fmt(route.shadeFrac * 100, 0)}%</td><td>{fmt((straight?.shadeFrac ?? 0) * 100, 0)}%</td></tr>
                    <tr><th>Tempo dirigindo</th><td>{fmtDur(route.time)}</td><td>{straight?.maxSlip >= 0.99 ? "atola" : fmtDur(straight?.time ?? 0)}</td></tr>
                    <tr><th>Energia líquida</th><td>{fmt(route.energy, 0)} Wh</td><td>—</td></tr>
                  </tbody>
                </table>
              )}
              <div className="t3-btns">
                <button type="button" className="gold" disabled={!pts.a} onClick={start}>{pts.b ? "Iniciar missão" : "Dirigir livre a partir de A"}</button>
              </div>
              <p className="t3-note">Dirija com <b>W A S D</b> ou <b>setas</b> · <b>espaço</b> freia · <b>C</b> troca a câmera. A linha dourada é a rota planejada; a verde, o caminho que você fez.</p>

              <button type="button" className="ms-src-btn" onClick={() => setShowSrc((x) => !x)} aria-expanded={showSrc}>Como o simulador funciona e fontes</button>
              {showSrc && (
                <div className="ms-src">
                  <p className="t3-note">Energia: P = m·g·v·(Crr·cosθ + senθ)/η, com Crr de 0,08 (firme) a 0,20 (areia), mais consumo fixo; recarga pelo gerador nuclear ou pelo painel quando há Sol no ponto. Patinagem cresce com a subida e chega a 100% no ângulo crítico do solo (17° em areia solta, ~28° em solo coeso). Patinagem alta enterra as rodas. Inclinação acima de 45° tomba. Blocos ásperos maiores que a altura livre gastam as rodas. Consumo fixo e eficiência são suposições de ordem de grandeza; o relevo do DEM não mostra pedras menores que o pixel.</p>
                  <ul className="ms-srclist">{SOURCES.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.text} ↗</a></li>)}</ul>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ---------- telemetria ---------- */}
        {phase !== "plan" && hud && (
          <aside className="ms-hud" aria-label="Telemetria" aria-live="off">
            <div className="ms-hud-top">
              <b>{spec.name}</b><span>{scene?.meta.name}</span>
            </div>
            <Bar label="Bateria" value={pctB} warn={-1} bad={101} text={`${fmt(pctB, 0)}% · ${hud.power ? `${hud.power.in - hud.power.out >= 0 ? "+" : ""}${fmt(hud.power.in - hud.power.out, 0)} W` : ""}`} />
            <Bar label="Patinagem" value={hud.slip * 100} warn={30} bad={60} />
            <Bar label="Rodas enterradas" value={hud.sink * 100} warn={25} bad={60} />
            <Bar label="Desgaste das rodas" value={hud.wheel} warn={40} bad={75} />
            <dl className="ms-tele">
              <div><dt>Velocidade</dt><dd>{fmt(Math.abs(hud.speed) * 100, 1)} cm/s</dd></div>
              <div><dt>Arfagem / rolagem</dt><dd className={Math.max(Math.abs(hud.pitch), Math.abs(hud.roll)) > 30 ? "bad" : ""}>{fmt(hud.pitch, 0)}° / {fmt(hud.roll, 0)}°</dd></div>
              <div><dt>Solo aqui</dt><dd>{SOIL_LABEL(hud.soft ?? 0.3)}</dd></div>
              <div><dt>Sol</dt><dd className={!hud.inSun && spec.solarW ? "bad" : ""}>{hud.inSun ? `ao Sol (${fmt(hud.sunElev, 0)}°)` : hud.sunElev > 0 ? "na sombra" : "noite"}</dd></div>
              <div><dt>Distância</dt><dd>{fmt(hud.dist, 0)} m</dd></div>
              <div><dt>Até B</dt><dd>{hud.toB == null ? "—" : `${fmt(hud.toB, 0)} m`}</dd></div>
              <div><dt>Fora da rota</dt><dd className={hud.off > 40 ? "warn" : ""}>{hud.off == null ? "—" : `${fmt(hud.off, 0)} m`}</dd></div>
              <div><dt>Tempo de missão</dt><dd>{fmtDur(hud.t)} · {fmtHour(hud.hour ?? hour)}</dd></div>
            </dl>
            {!hud.inSun && spec.solarW > 0 && <p className="ms-alert">Na sombra: os painéis não carregam. Não pare aqui.</p>}
            {hud.slip > 0.6 && <p className="ms-alert">Patinando muito: pare, dê ré e suba em ângulo menor.</p>}
            <label className="t3-range"><span>Aceleração do tempo <b>×{warp}</b></span>
              <input type="range" min="0" max={WARPS.length - 1} step="1" value={WARPS.indexOf(warp)} onChange={(e) => setWarp(WARPS[Number(e.target.value)])} /></label>
            {scene?.meta.body === "moon" && <p className="t3-note">Luz ambiente realçada para enxergar o chão no modo direção; sombras e energia seguem o Sol real.</p>}
            <p className="t3-note">O relógio conta o tempo real da missão; acelere para não esperar {fmt(spec.vmax * 100, 1)} cm/s.</p>
            <div className="t3-btns"><button type="button" onClick={replan}>Voltar ao planejamento</button></div>
          </aside>
        )}

        {phase === "end" && end && (
          <div className={`ms-end ${hud.status === "chegou" ? "ok" : ""}`} role="alertdialog" aria-labelledby="msEnd">
            <h2 id="msEnd">{end.title}</h2>
            <p>{end.text}</p>
            <table className="ms-plan">
              <thead><tr><th /><th>Planejado</th><th>Você</th></tr></thead>
              <tbody>
                <tr><th>Distância</th><td>{route?.len ? `${fmt(route.len, 0)} m` : "—"}</td><td>{fmt(hud.dist, 0)} m</td></tr>
                <tr><th>Tempo</th><td>{route?.time ? fmtDur(route.time) : "—"}</td><td>{fmtDur(hud.t)}</td></tr>
                <tr><th>Energia líquida</th><td>{route?.energy != null ? `${fmt(route.energy, 0)} Wh` : "—"}</td><td>{fmt(spec.batteryWh - hud.battery, 0)} Wh</td></tr>
                <tr><th>Desgaste das rodas</th><td>—</td><td>{fmt(hud.wheel, 0)}%</td></tr>
              </tbody>
            </table>
            <div className="t3-btns"><button type="button" className="gold" onClick={retry}>Tentar de novo</button><button type="button" onClick={replan}>Replanejar</button></div>
          </div>
        )}

        <div className="t3-top">
          <div className="t3-crumb"><span>Missão</span><i>›</i><b>{scene ? `${BODIES[scene.meta.body].label} · ${scene.meta.name}` : "…"}</b></div>
          {phase === "drive" && <div className="ms-keys" aria-hidden="true"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> dirigir · <kbd>C</kbd> câmera · <kbd>espaço</kbd> freio</div>}
        </div>
        <p className="ms-foot">Simulação educativa com dados reais de relevo, solo e Sol — não é o software de operação da NASA. <Link to="/veiculos">Ficha dos veículos</Link></p>
      </div>
    </section>
  );
}
