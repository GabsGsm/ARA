// Analog Robustness Map: posição de cada candidato quando mudam os pesos (objetivos do ARA) e a qualidade
// dos dados (variantes simuladas). Só cenários definidos — nada de "confiança" inventada.
import { useMemo } from "react";
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";
import { T } from "../../lib/i18n.js";

export default function RobustnessMatrix({ siteId, top = 6 }) {
  const data = useAraData();
  const rows = useMemo(() => {
    const site = data.sites[siteId];
    if (!site?.terrain) return null;
    const variants = data.sim?.variants ?? [{ id: "base", label: T("Dados originais", "Original data") }];
    const scenarios = [];
    for (const [ok, o] of Object.entries(data.config.objectives)) {
      for (const v of variants) scenarios.push({ id: `${ok}|${v.id}`, objective: T(o.label), variant: T(v.label), weights: o.weights, vid: v.id, n: core.cellsForVariant(data.cells, v.id, data.sim).length });
    }
    const base = core.rank(site.terrain, data.cells, data.config.objectives.default.weights, data.scales, top);
    const pos = scenarios.map((sc) => {
      const vec = core.siteVector(site, sc.vid, data.sim, siteId);
      const cells = core.cellsForVariant(data.cells, sc.vid, data.sim);
      const r = core.rank(vec, cells, sc.weights, data.scales, cells.length);
      return Object.fromEntries(r.map((x) => [x.cell.id, x.position]));
    });
    return { scenarios, list: base.map((b) => ({ cell: b.cell, positions: pos.map((p) => p[b.cell.id] ?? null) })) };
  }, [data, siteId, top]);
  if (!rows) return <p className="note">{T("Sem atributos para este local.", "No attributes for this site.")}</p>;
  const { scenarios, list } = rows;
  const simN = Math.min(...scenarios.map((s) => s.n));
  const inTop = (p) => p != null && p <= 10;
  return (
    <div>
      <p className="desc mt-0">
        {T(`${scenarios.length} cenários: ${Object.keys(data.config.objectives).length} objetivos (pesos) × ${scenarios.length / Object.keys(data.config.objectives).length} versões dos dados. Cada célula mostra a posição do candidato naquele cenário; o número de células comparadas aparece em cada coluna ("de N"): os dados originais usam as ${data.cells.length} células, mas as versões simuladas existem só para ${simN} delas (as regiões novas da expansão ficam de fora). Por isso, compare colunas do mesmo tipo de dado. Dourado = top 10.`,
          `${scenarios.length} scenarios: ${Object.keys(data.config.objectives).length} objectives (weights) × ${scenarios.length / Object.keys(data.config.objectives).length} data versions. Each cell shows the candidate's position under that scenario; the number of compared cells is in each column ("of N"): original data uses all ${data.cells.length} cells, but simulated versions exist for only ${simN} of them (the new expansion regions are not included). Compare columns of the same data type. Gold = top 10.`)}
      </p>
      <div className="overflow-x-auto">
        <table className="data-table ev-robust">
          <thead>
            <tr><th>{T("Candidato", "Candidate")}</th>{scenarios.map((s) => <th key={s.id} title={`${s.objective} · ${s.variant}`}><span>{s.objective.split(" ")[0]}</span><small>{s.variant.replace(/\(.*\)/, "").trim()}</small><small className="opacity-70">{T(`de ${s.n}`, `of ${s.n}`)}</small></th>)}<th>{T("No top 10 (cenários com dados)", "In top 10 (scenarios with data)")}</th></tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const n = r.positions.filter(inTop).length;
              const elig = r.positions.filter((p) => p != null).length, missing = scenarios.length - elig;
              return (
                <tr key={r.cell.id}>
                  <th scope="row">{data.cellName(r.cell)}</th>
                  {r.positions.map((p, i) => <td key={i} className={inTop(p) ? "in" : p == null ? "na" : ""}>{p == null ? "—" : `${p}º`}</td>)}
                  <td><b>{n}/{elig}</b>{missing > 0 && <small className="block text-muted">{T(`${missing} de ${scenarios.length} cenários sem dados`, `${missing} of ${scenarios.length} scenarios without data`)}</small>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">{T("“—” = a célula não entra naquela versão simulada. A estabilidade a pesos aleatórios (2.000 sorteios) continua em Análises.", "“—” = the cell is not part of that simulated version. Stability under random weights (2,000 draws) is in Analyses.")}</p>
    </div>
  );
}
