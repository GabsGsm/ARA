// Planeta girando em 360° (lib/globe.js) a partir de uma textura equiretangular.
// Com "Pausar animações" ligado, desenha o planeta parado.
import { useEffect, useRef } from "react";
import { Globe } from "../../lib/globe.js";
import { useMotion } from "../../hooks/useMotion.jsx";

export default function GlobeCanvas({ texture, light = "-0.5,-0.4", period = 90, dark = 0.82 }) {
  const ref = useRef(null);
  const globe = useRef(null);
  const { calm } = useMotion();

  useEffect(() => {
    globe.current = new Globe(ref.current);
    return () => globe.current?.destroy();
  }, [texture, light, period, dark]);

  useEffect(() => {
    let raf = 0, timer = 0;
    const g = () => globe.current;
    if (calm) {
      const still = () => { g()?.draw(0, true); if (!g()?.ready) timer = setTimeout(still, 150); };
      still();
    } else {
      const loop = (t) => { if (!document.hidden) g()?.draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [calm, texture]);

  return <canvas ref={ref} className="globe" data-tex={texture} data-light={light} data-period={period} data-dark={dark} />;
}
