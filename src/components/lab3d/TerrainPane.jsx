// Uma vista 3D (um TerrainView) com carregamento, rótulo do corpo, leitura do cursor
// e controles de toque para a caminhada no celular.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import TerrainView from "../../lib/terrain3d/TerrainView.js";
import { loadScene } from "../../lib/terrain3d/data.js";
import { fmt } from "../../lib/format.js";

const BODY_TAG = { mars: "Marte", moon: "Lua", earth: "Terra" };
const coarse = () => window.matchMedia?.("(pointer: coarse)").matches;

function TouchControls({ view }) {
  const knob = useRef(null);
  const joy = useRef(null);
  const look = useRef(null);
  const [run, setRun] = useState(false);
  const onJoy = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (e.clientX - cx) / (r.width / 2), y = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    knob.current.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
    view()?.touchMove(x, y);
  };
  const endJoy = () => { knob.current.style.transform = ""; view()?.touchMove(0, 0); joy.current = null; };
  return (
    <div className="t3-touch">
      <div className="t3-joy" onPointerDown={(e) => { joy.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); onJoy(e); }}
           onPointerMove={(e) => joy.current === e.pointerId && onJoy(e)} onPointerUp={endJoy} onPointerCancel={endJoy} aria-label="Andar">
        <span ref={knob} />
      </div>
      <div className="t3-lookpad" aria-label="Olhar em volta"
           onPointerDown={(e) => { look.current = [e.clientX, e.clientY, e.pointerId]; e.currentTarget.setPointerCapture(e.pointerId); }}
           onPointerMove={(e) => { if (!look.current || look.current[2] !== e.pointerId) return; view()?.touchLook(e.clientX - look.current[0], e.clientY - look.current[1]); look.current = [e.clientX, e.clientY, e.pointerId]; }}
           onPointerUp={() => { look.current = null; }} onPointerCancel={() => { look.current = null; }} />
      <div className="t3-touch-btns">
        <button type="button" onClick={() => view()?.jump()}>Pular</button>
        <button type="button" aria-pressed={run} onClick={() => { setRun((v) => { view()?.setRun(!v); return !v; }); }}>Correr</button>
      </div>
    </div>
  );
}

const TerrainPane = forwardRef(function TerrainPane({ sceneId, sceneData, side, settings, walking, onCamera, onPick, onSite, onLoaded, onWalk, onJump, onWalkLock, onUser }, ref) {
  const box = useRef(null);
  const view = useRef(null);
  const [scene, setScene] = useState(null);
  const [status, setStatus] = useState("loading");
  const [hover, setHover] = useState(null);
  const cbs = useRef({});
  cbs.current = { onCamera, onPick, onSite, onWalk, onJump, onWalkLock, onUser };

  useImperativeHandle(ref, () => ({
    get view() { return view.current; },
    get scene() { return scene; },
  }), [scene]);

  useEffect(() => {
    view.current = new TerrainView(box.current, {
      onHover: setHover,
      onCamera: (s, fromFly) => cbs.current.onCamera?.(side, s, fromFly),
      onPick: (p) => cbs.current.onPick?.(side, p),
      onSite: (id) => cbs.current.onSite?.(id),
      onWalk: (p) => cbs.current.onWalk?.(side, p),
      onJump: (h) => cbs.current.onJump?.(side, h),
      onWalkLock: (on) => cbs.current.onWalkLock?.(on),
      onUser: () => cbs.current.onUser?.(),
    });
    return () => view.current?.dispose();
  }, [side]);

  const show = (s) => { view.current.setScene(s); setScene(s); setStatus("ready"); onLoaded?.(side, s); };

  useEffect(() => {
    if (sceneData) { show(sceneData); return undefined; }
    if (!sceneId) return undefined;
    let alive = true;
    setStatus("loading");
    loadScene(sceneId).then((s) => { if (alive) show(s); })
      .catch((e) => { console.error(e); if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, [sceneId, sceneData]); // eslint-disable-line react-hooks/exhaustive-deps

  // configurações visuais
  useEffect(() => {
    const v = view.current;
    if (!v || !settings) return;
    v.setExaggeration(settings.exag);
    v.setLayer(settings.layer);
    v.setContours(settings.contours, settings.step);
    v.setMinerals(Boolean(settings.minerals));
  }, [settings?.exag, settings?.layer, settings?.contours, settings?.step, settings?.minerals, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    view.current?.setFlags({ labels: settings.labels, path: settings.path, cell: settings.cell });
  }, [settings?.labels, settings?.path, settings?.cell, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = scene?.meta;
  return (
    <div className={`t3-pane t3-${meta?.body ?? "none"}`}>
      <div ref={box} className="t3-canvas" />
      <div className="t3-tag">
        <span className="t3-body">{BODY_TAG[meta?.body] ?? ""}{meta?.kind === "live" ? " · teste ao vivo" : ""}</span>
        <strong>{meta?.name ?? "…"}</strong>
        {meta && <small>{fmt(meta.size_m / 1000, meta.size_m < 5000 ? 1 : 0)} × {fmt(meta.size_m / 1000, meta.size_m < 5000 ? 1 : 0)} km · relevo {fmt(meta.height.native_res_m, meta.height.native_res_m < 5 ? 1 : 0)} m{meta.color ? ` · imagem ${fmt(meta.color.native_res_m, meta.color.native_res_m < 2 ? 2 : 0)} m` : " · sem imagem: luz e sombra calculadas"}</small>}
      </div>
      {status === "loading" && <div className="t3-loading" role="status"><span className="t3-spinner" />Carregando relevo real…</div>}
      {status === "error" && <div className="t3-loading" role="alert">Não consegui carregar esta cena. Rode <code>python pipeline/build_terrain3d.py</code>.</div>}
      {walking && coarse() && <TouchControls view={() => view.current} />}
      <div className="t3-readout" aria-live="off">
        {hover ? (
          <>
            <span>LAT <b>{fmt(Math.abs(hover.lat), 4)}°{hover.lat >= 0 ? "N" : "S"}</b></span>
            <span>LON <b>{fmt(Math.abs(hover.lon), 4)}°{hover.lon >= 0 ? "L" : "O"}</b></span>
            <span>ELEV <b>{fmt(hover.h, 0)} m</b></span>
            <span>DECLIV. <b>{fmt(hover.slope, 1)}°</b></span>
          </>
        ) : <span className="opacity-70">Aponte no relevo para ler os dados · arraste para girar · roda ou pinça para zoom · botão direito ou dois dedos para mover</span>}
      </div>
    </div>
  );
});

export default TerrainPane;
