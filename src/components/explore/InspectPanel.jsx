// Comparação dimensão por dimensão entre o local fixo e a célula da Terra selecionada.
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";
import { useStabilityText } from "../../hooks/useRanking.js";
import { BODY_LABEL, fmt, withUnit } from "../../lib/format.js";
import StatusChip from "../ui/StatusChip.jsx";
import { T } from "../../lib/i18n.js";

export default function InspectPanel({ siteId, siteVec, result, weights }) {
  const data = useAraData();
  const stabilityText = useStabilityText();
  if (!result) return <p className="note">{T("Selecione um resultado para ver a comparação.", "Select a result to see the comparison.")}</p>;

  const site = data.siteById(siteId);
  const cell = result.cell;
  const dims = core.explain({ ...data.sites[siteId], terrain: siteVec }, cell, data.config);
  const ctb = core.contributions(siteVec, cell, core.normalizeWeights(weights), data.scales);
  const isAttr = (d) => d.attr in data.config.attributes;
  const st = stabilityText(siteId, cell.id);

  return (
    <>
      <h3 className="mb-2 font-display text-[15px] font-normal tracking-wide">{site.name} → {data.cellName(cell)}</h3>
      <p className="text-[13px] text-ink-2">{core.describeCell(cell, dims, result.position)}</p>
      <div className="overflow-x-auto">
        <table className="data-table">
          <caption>{T("Dimensão por dimensão", "Dimension by dimension")}</caption>
          <thead><tr><th>{T("Dimensão", "Dimension")}</th><th>{T(BODY_LABEL[site.body])}</th><th>{T("Terra", "Earth")}</th><th>{T("Veredito", "Verdict")}</th></tr></thead>
          <tbody>
            {dims.map((d) => (
              <tr key={`${d.attr}-${d.dimension}`}>
                <th scope="row">{T(d.dimension)}</th>
                <td>{isAttr(d) ? withUnit(d.site, d.unit) : "—"}</td>
                <td>{isAttr(d) ? withUnit(d.cell, d.unit) : "—"}</td>
                <td><StatusChip status={d.status} />{d.note && <small className="mt-1 block text-muted">{d.note}</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-ink-2">
        {T(`Peso de cada atributo na diferença: declividade ${fmt(ctb.slope_mean_deg, 0)}%, rugosidade ${fmt(ctb.roughness_mean_m, 0)}%, amplitude ${fmt(ctb.relief_m, 0)}%.`, `Share of each attribute in the difference: slope ${fmt(ctb.slope_mean_deg, 0)}%, roughness ${fmt(ctb.roughness_mean_m, 0)}%, relief ${fmt(ctb.relief_m, 0)}%.`)}{st && T(` Estabilidade em 2.000 conjuntos de pesos aleatórios: ${st}.`, ` Stability across 2,000 random weight sets: ${st}.`)}
      </p>
      {!cell.context && (
        <p className="text-[13px] text-ink-2">{T("Geologia: indisponível para esta célula (células novas da expansão ainda não têm litologia mapeada — o ARA não infere mineralogia).", "Geology: unavailable for this cell (new expansion cells do not have mapped lithology yet — ARA does not infer mineralogy).")}</p>
      )}
      {cell.context && (
        <p className="text-[13px] text-ink-2">
          {T("Geologia", "Geology")} ({cell.context.geology_source}): {(cell.context.lithology ?? []).join(", ") || T("só contexto geral", "general context only")}. {T("Minerais não verificados.", "Minerals not verified.")}
        </p>
      )}
      {cell.simulated && <p className="sim-badge inline-block rounded-full border border-dashed border-warn bg-warn/10 px-3 py-1 text-[13px] font-semibold text-warn">{T("Simulação — valores recalculados com dados piorados", "Simulation — values recomputed with degraded data")}</p>}
    </>
  );
}
