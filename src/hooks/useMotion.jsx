// "Pausar animações": classe "calm" no <html>, lembrada neste navegador.
// Sem escolha salva, segue a preferência do sistema (prefers-reduced-motion).
import { createContext, useContext, useEffect, useState } from "react";

const KEY = "ara-calm";
const MotionCtx = createContext({ calm: false, toggleCalm: () => {} });

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) return saved === "1";
  } catch { /* armazenamento indisponível */ }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function MotionProvider({ children }) {
  const [calm, setCalm] = useState(initial);
  useEffect(() => {
    document.documentElement.classList.toggle("calm", calm);
    // pausa também as animações SMIL do SVG (cometa na órbita)
    document.querySelectorAll("svg.orbit").forEach((svg) => (calm ? svg.pauseAnimations?.() : svg.unpauseAnimations?.()));
  }, [calm]);
  const toggleCalm = () => setCalm((v) => {
    try { localStorage.setItem(KEY, v ? "0" : "1"); } catch { /* ignora */ }
    return !v;
  });
  return <MotionCtx.Provider value={{ calm, toggleCalm }}>{children}</MotionCtx.Provider>;
}

export const useMotion = () => useContext(MotionCtx);
