// Analog Robustness Map: posição de cada candidato quando mudam os pesos (objetivos do ARA) e a qualidade
// dos dados (variantes simuladas). Só cenários definidos — nada de "confiança" inventada.
import { useMemo } from "react";
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";

export default function RobustnessMatrix({ siteId, top = 6 }) {
  const data = useAraData();
  const rows = useMemo(() => {
    const site = data.sites[siteId];
    if (!site?.terrain) return null;
    const variants = data.sim?.variants ?? [{ id: "base", label: "Dados originais" }];
    const scenarios = [];
    for (const [ok, o] of Object.entries(data.config.objectives)) {
      for (const v of variants) scenarios.push({ id: `${ok}|${v.id}`, objective: o.label, variant: v.label, weights: o.weights, vid: v.id });
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
  if (!rows) return <p className="note">Sem atributos para este local.</p>;
  const { scenarios, list } = rows;
  const inTop = (p) => p != null && p <= 10;
  return (
    <div>
      <p className="desc mt-0">
        {scenarios.length} cenários: {Object.keys(data.config.objectives).length} objetivos (pesos) × {scenarios.length / Object.keys(data.config.objectives).length} versões dos dados.
        Cada célula mostra a posição do candidato no ranking das {data.cells.length} células naquele cenário. Dourado = top 10.
      </p>
      <div className="overflow-x-auto">
        <table className="data-table ev-robust">
          <thead>
            <tr><th>Candidato</th>{scenarios.map((s) => <th key={s.id} title={`${s.objective} · ${s.variant}`}><span>{s.objective.split(" ")[0]}</span><small>{s.variant.replace(/\(.*\)/, "").trim()}</small></th>)}<th>No top 10</th></tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const n = r.positions.filter(inTop).length;
              return (
                <tr key={r.cell.id}>
                  <th scope="row">{data.cellName(r.cell)}</th>
                  {r.positions.map((p, i) => <td key={i} className={inTop(p) ? "in" : p == null ? "na" : ""}>{p == null ? "—" : `${p}º`}</td>)}
                  <td><b>{n}/{scenarios.length}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">“—” = a célula não entra naquela versão simulada. A estabilidade a pesos aleatórios (2.000 sorteios) continua em Análises.</p>
    </div>
  );
}
