// Configurações do site (lembradas neste navegador): idioma, tamanho do texto, leitura facilitada,
// cores seguras para daltonismo, narração e sons. Aplicadas como classes/variáveis no <html>.
// Tradução: tr("texto em português", "English text") — os dois idiomas ficam juntos no código.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { lookup, setLang } from "../lib/i18n.js";

const KEY = "ara-settings";
const DEFAULTS = { lang: null, font: 100, dyslexia: false, colorblind: false, narration: true, sounds: true, underline: false };

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* sem armazenamento */ }
  const lang = s.lang || (navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en");
  return { ...DEFAULTS, ...s, lang };
}

const Ctx = createContext({ ...DEFAULTS, lang: "pt", set: () => {}, tr: (pt) => pt });

export function SettingsProvider({ children }) {
  const [s, setS] = useState(load);
  setLang(s.lang); // antes de desenhar os filhos: T() fora dos componentes já vê o idioma certo
  useEffect(() => {
    const h = document.documentElement;
    h.lang = s.lang === "en" ? "en" : "pt-BR";
    h.style.fontSize = `${s.font}%`;
    h.classList.toggle("easy-read", s.dyslexia);
    h.classList.toggle("cb-safe", s.colorblind);
    h.classList.toggle("links-underline", s.underline);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignora */ }
  }, [s]);
  const value = useMemo(() => ({
    ...s,
    set: (k, v) => setS((o) => ({ ...o, [k]: v })),
    reset: () => setS({ ...DEFAULTS, lang: s.lang }),
    tr: (pt, en) => (s.lang === "en" ? (en ?? lookup(pt)) : pt),
  }), [s]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
/** Atalho: const tr = useTr(); tr("Olá", "Hello"). */
export const useTr = () => useContext(Ctx).tr;
/** Escolhe o idioma de um objeto { pt, en } (ou devolve a string). */
export const pick = (lang, v) => (v && typeof v === "object" && "pt" in v ? (lang === "en" ? v.en ?? v.pt : v.pt) : v);
