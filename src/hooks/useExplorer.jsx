// Estado do Explorar (corpo, local, objetivo, pesos, variante, seleção).
// Fica num contexto para sobreviver à troca de página (Explorar -> Análises -> Explorar).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAraData } from "./useAraData.jsx";
import * as core from "../lib/core.js";

const ExplorerContext = createContext(null);

export function ExplorerProvider({ children }) {
  const data = useAraData();
  const [body, setBodyState] = useState("mars");
  const [siteId, setSiteId] = useState(null);
  const [objective, setObjectiveState] = useState("default");
  const [weights, setWeights] = useState(null);
  const [variant, setVariant] = useState("base");
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState("map");

  // pesos iniciais quando os dados chegam
  useEffect(() => {
    if (data.status === "ready" && !weights) setWeights({ ...data.config.objectives.default.weights });
  }, [data, weights]);

  // garante um local válido para o corpo escolhido
  useEffect(() => {
    if (data.status !== "ready") return;
    const list = data.sitesOf(body).filter((s) => data.hasTerrain(s.id));
    if (!list.some((s) => s.id === siteId)) setSiteId(list[0]?.id ?? null);
  }, [data, body, siteId]);

  const setBody = useCallback((b) => { setBodyState(b); setSelected(null); }, []);

  const setObjective = useCallback((key) => {
    setObjectiveState(key);
    if (key !== "custom" && data.status === "ready") setWeights({ ...data.config.objectives[key].weights });
  }, [data]);

  // value em % (0–100). Os pesos ficam sempre na escala 0–1 com soma 1: o atributo movido recebe value/100 e
  // os outros dividem o restante na proporção que já tinham (se ambos forem 0, dividem igualmente).
  const setWeight = useCallback((attr, value) => {
    setWeights((w) => {
      const cur = core.normalizeWeights(w ?? {});
      const v = Math.min(1, Math.max(0, Number(value) / 100));
      const others = core.RANK_ATTRS.filter((a) => a !== attr);
      const rest = others.reduce((s, a) => s + cur[a], 0);
      const out = { ...w, [attr]: v };
      for (const a of others) out[a] = rest > 0 ? (cur[a] / rest) * (1 - v) : (1 - v) / others.length;
      return out;
    });
    setObjectiveState("custom");
  }, []);

  const value = useMemo(() => ({
    body, setBody, siteId, setSiteId, objective, setObjective, weights, setWeight,
    variant, setVariant, selected, setSelected, viewMode, setViewMode,
  }), [body, setBody, siteId, objective, setObjective, weights, setWeight, variant, selected, viewMode]);

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer() {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorer precisa estar dentro de <ExplorerProvider>");
  return ctx;
}
