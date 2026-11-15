// Formatação no idioma escolhido e rótulos compartilhados pela interface.
import { locale } from "./i18n.js";

export const fmt = (v, d = 1) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });

/** Valor com unidade: "8,3°", "12,3 m", "562 m". */
export const withUnit = (v, unit) => {
  const digits = unit === "m" && Math.abs(Number(v)) >= 100 ? 0 : 1;
  return `${fmt(v, digits)}${unit === "°" ? "" : " "}${unit ?? ""}`;
};

export const STATUS_LABEL = { analog: "Análogo", partial: "Parcial", not_analog: "Não análogo", no_data: "Sem dado" };
export const BODY_LABEL = { mars: "Marte", moon: "Lua" };
export const BODY_FROM_PARAM = { marte: "mars", lua: "moon", mars: "mars", moon: "moon" };
export const PARAM_FROM_BODY = { mars: "marte", moon: "lua" };

/** Caminho de um arquivo de dados relativo à página (funciona em / e em /ARA/). */
export const dataUrl = (path) => (path.startsWith("http") ? path : `./${path.replace(/^\.?\//, "")}`);
