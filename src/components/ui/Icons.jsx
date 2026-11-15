// Ícones de traço simples no estilo da página inicial (herdam a cor do texto).
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round", "aria-hidden": true };

export const MountainIcon = ({ className = "h-6 w-8" }) => (
  <svg viewBox="0 0 32 24" className={className} {...base}><path d="M2 22 L11 8 L17 16 L21 11 L30 22 Z" /><path d="M8 13 l3-5 3 4" /></svg>
);
export const LayersIcon = ({ className = "h-7 w-8" }) => (
  <svg viewBox="0 0 32 28" className={className} {...base}><path d="M16 3 L29 9 L16 15 L3 9 Z M3 14 L16 20 L29 14 M3 19 L16 25 L29 19" /></svg>
);
export const TargetIcon = ({ className = "h-7 w-7" }) => (
  <svg viewBox="0 0 28 28" className={className} {...base}><circle cx="14" cy="14" r="11" /><circle cx="14" cy="14" r="4" /><path d="M8 14h12M14 8v12" /></svg>
);
export const MoonIcon = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true"><path d="M15 3a9 9 0 1 0 6 15 7 7 0 1 1-6-15z" fill="currentColor" /></svg>
);
export const Sparkle = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 30 30" className={className} aria-hidden="true"><path d="M15 0l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="#f7c75a" /></svg>
);
