// Visualizador em tela cheia: zoom (roda, pinça, botões) e arraste para explorar uma imagem.
// Mantém a sobreposição (ex.: o quadrado da célula de 5 km) presa à imagem enquanto amplia.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ImageViewer({ src, alt, caption, overlay, onClose }) {
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const box = useRef(null);
  const drag = useRef(null);
  const pinch = useRef(null);
  const closeBtn = useRef(null);

  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const k = Math.min(12, Math.max(1, v.k * factor));
      const r = box.current.getBoundingClientRect();
      const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
      const ox = px - r.left - r.width / 2, oy = py - r.top - r.height / 2;
      const f = k / v.k;
      return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x: ox - (ox - v.x) * f, y: oy - (oy - v.y) * f };
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomAt(1.4);
      if (e.key === "-") zoomAt(1 / 1.4);
      if (e.key === "0") setView({ k: 1, x: 0, y: 0 });
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, zoomAt]);

  const onWheel = (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); };
  useEffect(() => {
    const el = box.current;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const pts = useRef(new Map());
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); pts.current.set(e.pointerId, [e.clientX, e.clientY]); drag.current = [e.clientX, e.clientY]; };
  const move = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch.current) zoomAt(d / pinch.current, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch.current = d;
      return;
    }
    if (!drag.current) return;
    const dx = e.clientX - drag.current[0], dy = e.clientY - drag.current[1];
    drag.current = [e.clientX, e.clientY];
    setView((v) => (v.k === 1 ? v : { ...v, x: v.x + dx, y: v.y + dy }));
  };
  const up = (e) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = null; if (!pts.current.size) drag.current = null; };

  // portal no <body>: a animação de entrada da página usa transform, que prenderia o position: fixed
  return createPortal(
    <div className="ex-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="ex-viewer-bar">
        <p className="m-0 min-w-0 flex-1 truncate text-[13px] text-ink-2">{caption}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="Diminuir">−</button>
          <span className="min-w-14 text-center font-mono text-[13px] text-gold-2">{Math.round(view.k * 100)}%</span>
          <button type="button" onClick={() => zoomAt(1.4)} aria-label="Ampliar">+</button>
          <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })}>Ajustar</button>
          <button type="button" ref={closeBtn} onClick={onClose} aria-label="Fechar">✕</button>
        </div>
      </div>
      <div ref={box} className={`ex-viewer-stage ${view.k > 1 ? "grab" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
           onDoubleClick={(e) => zoomAt(view.k > 2.5 ? 1 / view.k : 2, e.clientX, e.clientY)}>
        <div className="ex-viewer-img" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <img src={src} alt={alt} draggable={false} />
          {overlay && <span className="ex-viewer-box" style={overlay} />}
        </div>
      </div>
      <p className="ex-viewer-help">Roda do mouse ou pinça para ampliar · arraste para mover · duplo clique aproxima · Esc fecha</p>
    </div>,
    document.body,
  );
}
