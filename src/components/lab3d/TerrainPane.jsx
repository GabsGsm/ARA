// Uma vista 3D (um TerrainView) com carregamento, rótulo do corpo e leitura do cursor.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import TerrainView from "../../lib/terrain3d/TerrainView.js";
import { loadScene } from "../../lib/terrain3d/data.js";
import { fmt } from "../../lib/format.js";

const BODY_TAG = { mars: "Marte", moon: "Lua", earth: "Terra" };

const TerrainPane = forwardRef(function TerrainPane({ sceneId, side, settings, onCamera, onPick, onSite, onLoaded, onWalk, onJump, onWalkLock, onUser }, ref) {
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

  useEffect(() => {
    if (!sceneId) return;
    let alive = true;
    setStatus("loading");
    loadScene(sceneId).then((s) => {
      if (!alive) return;
      view.current.setScene(s);
      setScene(s);
      setStatus("ready");
      onLoaded?.(side, s);
    }).catch((e) => { console.error(e); alive && setStatus("error"); });
    return () => { alive = false; };
  }, [sceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // configurações visuais
  useEffect(() => {
    const v = view.current;
    if (!v || !settings) return;
    v.setExaggeration(settings.exag);
    v.setLayer(settings.layer);
    v.setContours(settings.contours, settings.step);
  }, [settings?.exag, settings?.layer, settings?.contours, settings?.step, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    view.current?.setFlags({ labels: settings.labels, path: settings.path, cell: settings.cell });
  }, [settings?.labels, settings?.path, settings?.cell, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = scene?.meta;
  return (
    <div className={`t3-pane t3-${meta?.body ?? "none"}`}>
      <div ref={box} className="t3-canvas" />
      <div className="t3-tag">
        <span className="t3-body">{BODY_TAG[meta?.body] ?? ""}</span>
        <strong>{meta?.name ?? "…"}</strong>
        {meta && <small>{fmt(meta.size_m / 1000, 0)} × {fmt(meta.size_m / 1000, 0)} km · relevo {fmt(meta.height.native_res_m, 0)} m{meta.color ? ` · imagem ${fmt(meta.color.native_res_m, 0)} m` : " · sem imagem: luz e sombra calculadas"}</small>}
      </div>
      {status === "loading" && <div className="t3-loading" role="status"><span className="t3-spinner" />Carregando relevo real…</div>}
      {status === "error" && <div className="t3-loading" role="alert">Não consegui carregar esta cena. Rode <code>python pipeline/build_terrain3d.py</code>.</div>}
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
