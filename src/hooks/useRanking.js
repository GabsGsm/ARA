// Ranking do local escolhido contra a grade da Terra (recalcula só quando algo muda).
import { useMemo } from "react";
import * as core from "../lib/core.js";
import { useAraData } from "./useAraData.jsx";
import { useSettings } from "./useSettings.jsx";

export function useRanking(siteId, weights, variant = "base", topN) {
  const data = useAraData();
  return useMemo(() => {
    if (data.status !== "ready" || !siteId || !weights || !data.sites[siteId]?.terrain) {
      return { siteVec: null, results: [] };
    }
    const siteVec = core.siteVector(data.sites[siteId], variant, data.sim, siteId);
    const cells = core.cellsForVariant(data.cells, variant, data.sim);
    const results = core.rank(siteVec, cells, weights, data.scales, topN ?? data.config.top_n);
    return { siteVec, results };
  }, [data, siteId, weights, variant, topN]);
}

/** Texto de estabilidade de uma célula para um local, ou null. */
export function useStabilityText() {
  const { lang } = useSettings();
  const data = useAraData();
  return (siteId, cellId) => {
    const s = data.stability?.sites?.[siteId]?.[cellId];
    if (!s) return /^(holuhraun|mauna_kea|erg_chebbi)_/.test(cellId) ? (lang === "en" ? "new expansion cell · robustness not computed yet" : "célula nova da expansão · robustez ainda não calculada") : null;
    const pct = (v) => Math.round(v).toLocaleString("pt-BR");
    return lang === "en" ? `top ${data.stability.method.top_k} in ${pct(s.topk_pct)}% of draws · #1 in ${pct(s.top1_pct)}%` : `${pct(s.topk_pct)}% das vezes no top ${data.stability.method.top_k} · ${pct(s.top1_pct)}% em 1º`;
  };
}
