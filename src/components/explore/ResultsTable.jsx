import { useAraData } from "../../hooks/useAraData.jsx";
import { fmt } from "../../lib/format.js";

export default function ResultsTable({ results, selected, onPick }) {
  const { regionName } = useAraData();
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption>Melhores células da Terra para o local escolhido. Clique numa linha para ver no mapa.</caption>
        <thead>
          <tr><th>#</th><th>Célula</th><th>Região</th><th>Declividade (°)</th><th>Rugosidade (m)</th><th>Amplitude (m)</th><th>Distância</th></tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.cell.id} tabIndex={0} aria-selected={r.cell.id === selected}
                onClick={() => onPick(r.cell.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.cell.id); } }}
                className={`cursor-pointer hover:bg-gold/10 ${r.cell.id === selected ? "bg-gold/15" : ""}`}>
              <td>{r.position}º</td><td>{r.cell.known || r.cell.id}</td><td>{regionName(r.cell.region)}</td>
              <td>{fmt(r.cell.slope_mean_deg)}</td><td>{fmt(r.cell.roughness_mean_m)}</td><td>{fmt(r.cell.relief_m, 0)}</td><td>{fmt(r.d, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
