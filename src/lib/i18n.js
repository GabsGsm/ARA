// Idioma atual para código fora dos componentes (motor de evidências, fontes, notas geradas).
// O SettingsProvider chama setLang antes de desenhar; ao trocar o idioma o App redesenha as páginas,
// então tudo que usa T() sai no idioma novo.
import { DICT } from "./i18n-dict.js";
import { DATA_DICT, PATTERNS } from "./i18n-data.js";

/** Inglês de um texto em português: dicionário de interface, dicionário de dados ou padrão. */
export function lookup(pt) {
  if (typeof pt !== "string") return pt;
  const d = DICT[pt] ?? DATA_DICT[pt];
  if (d) return d;
  for (const [re, fn] of PATTERNS) { const m = pt.match(re); if (m) return fn(m); }
  return pt;
}

let LANG = "pt";
export const setLang = (l) => { LANG = l === "en" ? "en" : "pt"; };
export const getLang = () => LANG;
/** T("português", "English") — sem a versão em inglês, procura no dicionário; senão mantém o português. */
export const T = (pt, en) => (LANG === "en" ? (en ?? lookup(pt)) : pt);
/** Resolve [pt, en] ou { pt, en } ou string. */
export const L = (v) => (Array.isArray(v) ? T(v[0], v[1]) : v && typeof v === "object" && "pt" in v ? T(v.pt, v.en) : typeof v === "string" ? T(v) : v);
/** Número no formato do idioma. */
export const locale = () => (LANG === "en" ? "en-US" : "pt-BR");

const KEEP = new Set(["id", "file", "src", "url", "doi", "product", "product_id", "body", "kind", "region", "status", "type", "unit", "source_id", "known", "attr"]);
/** Cópia de um JSON com os textos traduzidos (em português devolve o próprio objeto). */
export function localizeData(o, key) {
  if (LANG !== "en" || o == null) return o;
  if (typeof o === "string") return KEEP.has(key) ? o : lookup(o);
  if (Array.isArray(o)) return o.map((v) => localizeData(v, key));
  if (typeof o === "object" && !(ArrayBuffer.isView(o))) {
    const out = {};
    for (const k of Object.keys(o)) out[k] = localizeData(o[k], k);
    return out;
  }
  return o;
}
