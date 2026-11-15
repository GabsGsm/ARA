import { useAraData } from "../../hooks/useAraData.jsx";
import { fmt } from "../../lib/format.js";

export default function ResultsTable({ results }) {
  const { regionName } = useAraData();
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption>Melhores células da Terra para o local escolhido</caption>
        <thead>
          <tr><th>#</th><th>Célula</th><th>Região</th><th>Declividade (°)</th><th>Rugosidade (m)</th><th>Amplitude (m)</th><th>Distância</th></tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.cell.id}>
              <td>{r.position}º</td><td>{r.cell.known || r.cell.id}</td><td>{regionName(r.cell.region)}</td>
              <td>{fmt(r.cell.slope_mean_deg)}</td><td>{fmt(r.cell.roughness_mean_m)}</td><td>{fmt(r.cell.relief_m, 0)}</td><td>{fmt(r.d, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
