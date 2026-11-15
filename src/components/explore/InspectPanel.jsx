// Comparação dimensão por dimensão entre o local fixo e a célula da Terra selecionada.
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";
import { useStabilityText } from "../../hooks/useRanking.js";
import { BODY_LABEL, fmt, withUnit } from "../../lib/format.js";
import StatusChip from "../ui/StatusChip.jsx";

export default function InspectPanel({ siteId, siteVec, result, weights }) {
  const data = useAraData();
  const stabilityText = useStabilityText();
  if (!result) return <p className="note">Selecione um resultado para ver a comparação.</p>;

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
          <caption>Dimensão por dimensão</caption>
          <thead><tr><th>Dimensão</th><th>{BODY_LABEL[site.body]}</th><th>Terra</th><th>Veredito</th></tr></thead>
          <tbody>
            {dims.map((d) => (
              <tr key={`${d.attr}-${d.dimension}`}>
                <th scope="row">{d.dimension}</th>
                <td>{isAttr(d) ? withUnit(d.site, d.unit) : "—"}</td>
                <td>{isAttr(d) ? withUnit(d.cell, d.unit) : "—"}</td>
                <td><StatusChip status={d.status} />{d.note && <small className="mt-1 block text-muted">{d.note}</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-ink-2">
        Peso de cada atributo na diferença: declividade {fmt(ctb.slope_mean_deg, 0)}%, rugosidade {fmt(ctb.roughness_mean_m, 0)}%,
        amplitude {fmt(ctb.relief_m, 0)}%.{st && ` Estabilidade em 2.000 conjuntos de pesos aleatórios: ${st}.`}
      </p>
      {cell.context && (
        <p className="text-[13px] text-ink-2">
          Geologia ({cell.context.geology_source}): {(cell.context.lithology ?? []).join(", ") || "só contexto geral"}. Minerais não verificados.
        </p>
      )}
      {cell.simulated && <p className="sim-badge inline-block rounded-full border border-dashed border-warn bg-warn/10 px-3 py-1 text-[13px] font-semibold text-warn">Simulação — valores recalculados com dados piorados</p>}
    </>
  );
}
