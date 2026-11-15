// Top candidatos (ranking): posição, nome, célula e coordenadas, selo conhecido/novo, distância e estabilidade.
import { useAraData } from "../../hooks/useAraData.jsx";
import { useStabilityText } from "../../hooks/useRanking.js";
import { fmt } from "../../lib/format.js";
import { useTr } from "../../hooks/useSettings.jsx";

export default function RankingList({ siteId, results, selected, onSelect }) {
  const { regionName } = useAraData();
  const stabilityText = useStabilityText();
  const tr = useTr();
  if (!results.length) return <p className="note mt-4">{tr("Sem resultados para este local/variante.")}</p>;
  return (
    <ol className="ex-rank">
      {results.map((r) => {
        const c = r.cell;
        const on = c.id === selected;
        const st = stabilityText(siteId, c.id);
        return (
          <li key={c.id}>
            <button type="button" aria-pressed={on} onClick={() => onSelect(c.id)} className={on ? "on" : ""}>
              <span className="ex-pos">{r.position}º</span>
              <span className="min-w-0">
                <b className="block truncate">{c.known || regionName(c.region)}</b>
                <small className="block truncate">{c.id} · {fmt(c.lat, 2)}°, {fmt(c.lon, 2)}°</small>
                {st && <small className="block truncate text-gold-3/80" title={tr("Estabilidade em 2.000 conjuntos de pesos aleatórios", "Stability across 2,000 random weight sets")}>{st}</small>}
              </span>
              <span className={`ex-badge ${c.known ? "" : "new"}`}>{c.known ? tr("Análogo conhecido") : tr("Novo candidato")}</span>
              <span className="ex-score" title={tr("Distância ponderada (menor = mais parecido)", "Weighted distance (lower = more similar)")}>{fmt(r.d, 3)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
