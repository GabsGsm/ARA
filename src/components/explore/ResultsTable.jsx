import { useAraData } from "../../hooks/useAraData.jsx";
import { fmt } from "../../lib/format.js";
import { T } from "../../lib/i18n.js";

export default function ResultsTable({ results, selected, onPick }) {
  const { regionName } = useAraData();
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption>{T("Melhores células da Terra para o local escolhido. Clique numa linha para ver no mapa.", "Best Earth cells for the chosen site. Click a row to see it on the map.")}</caption>
        <thead>
          <tr><th>#</th><th>{T("Célula", "Cell")}</th><th>{T("Região", "Region")}</th><th>{T("Declividade (°)", "Slope (°)")}</th><th>{T("Rugosidade (m)", "Roughness (m)")}</th><th>{T("Amplitude (m)", "Relief (m)")}</th><th>{T("Distância", "Distance")}</th></tr>
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
