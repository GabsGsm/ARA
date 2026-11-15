import { useAraData } from "../../hooks/useAraData.jsx";
import { useStabilityText } from "../../hooks/useRanking.js";
import { fmt } from "../../lib/format.js";

export default function RankingList({ siteId, results, selected, onSelect }) {
  const { regionName } = useAraData();
  const stabilityText = useStabilityText();
  if (!results.length) return <p className="note mt-4">Sem resultados para este local/variante.</p>;
  return (
    <ol className="m-0 mt-4 grid list-none gap-2 p-0">
      {results.map((r) => {
        const c = r.cell;
        const on = c.id === selected;
        const st = stabilityText(siteId, c.id);
        return (
          <li key={c.id}>
            <button type="button" aria-pressed={on} onClick={() => onSelect(c.id)}
                    className={`grid w-full cursor-pointer grid-cols-[44px_1fr_auto_auto] items-center gap-x-3.5 gap-y-1 rounded-2xl border px-3.5 py-2.5 text-left text-ink
                      ${on ? "border-gold bg-gold/15" : "border-line-2 bg-petrol-950/45 hover:border-line"}`}>
              <span className="font-display text-base text-gold">{r.position}º</span>
              <span>
                {c.known || regionName(c.region)}
                <small className="block text-xs text-muted">{c.id} · {fmt(c.lat, 2)}°, {fmt(c.lon, 2)}°</small>
              </span>
              <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold
                ${c.known ? "border-line text-ink-2" : "border-ok/40 bg-ok/15 text-ok"}`}>
                {c.known ? "Análogo conhecido" : "Novo candidato"}
              </span>
              <span className="font-display text-base text-gold-2" title="Distância ponderada (menor = mais parecido)">{fmt(r.d, 3)}</span>
              {st && <small className="col-start-2 col-end-[-1] text-muted">{st}</small>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
