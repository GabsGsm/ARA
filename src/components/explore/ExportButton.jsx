// Baixa o resultado atual em JSON (local, pesos, variante, ranking, método e rastreio).
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";
import Pill from "../ui/Pill.jsx";

export default function ExportButton({ siteId, siteVec, objective, weights, variant, results }) {
  const data = useAraData();
  const onClick = () => {
    const out = {
      app: "ARA", exportado_utc: new Date().toISOString(), local: data.siteById(siteId), atributos_local: siteVec,
      objetivo: objective, pesos: core.normalizeWeights(weights), variante: variant,
      resultados: results.map((r) => ({ posicao: r.position, distancia: r.d, celula: r.cell,
        estabilidade: data.stability?.sites?.[siteId]?.[r.cell.id] ?? null })),
      metodo: { escalas: data.scales, limiares: data.config.thresholds, estabilidade: data.config.stability },
      dem_terra: data.grid.dem, run_ids: data.grid.run_ids,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `ARA_${siteId}_${variant}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Pill size="sm" variant="gold" arrow="↓" onClick={onClick} className="mt-3.5">Exportar resultado</Pill>;
}
