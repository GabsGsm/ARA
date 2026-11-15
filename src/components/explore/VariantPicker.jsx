// Simulação de qualidade dos dados: escolhe a variante (resolução menor, lacunas, ruído).
import { useAraData } from "../../hooks/useAraData.jsx";
import { useTr } from "../../hooks/useSettings.jsx";

export default function VariantPicker({ value, onChange }) {
  const data = useAraData(), { sim } = data;
  const n = value && value !== "base" && sim ? data.cells.filter((c) => sim.earth?.[c.id]?.[value]).length : null;
  const tr = useTr();
  const options = sim?.variants ?? [{ id: "base", label: "Dados originais (100 m)" }];
  return (
    <>
      <label htmlFor="variant" className="mb-1.5 mt-2.5 block text-[13px] text-muted">{tr("Simular dados piores")}</label>
      <select id="variant" className="field" value={value} disabled={!sim} onChange={(e) => onChange(e.target.value)}>
        {options.map((v) => <option key={v.id} value={v.id}>{tr(v.label)}</option>)}
      </select>
      <p className="note">
        {sim
          ? (n != null
            ? tr(`Cenário simulado: só ${n} das ${data.cells.length} células têm dados piorados de propósito, e o ranking compara apenas essas (as regiões novas da expansão ficam de fora). Compare com cuidado: muda a qualidade do dado e também o conjunto de candidatos.`, `Simulated scenario: only ${n} of the ${data.cells.length} cells have deliberately degraded data, and the ranking compares only those (the new expansion regions are not included). Compare with care: both data quality and the candidate set change.`)
            : tr("Escolha uma versão com dados piorados de propósito para ver quanto o ranking depende da qualidade dos dados.", "Pick a version with deliberately degraded data to see how much the ranking depends on data quality."))
          : tr("Dados da simulação ainda não gerados (pipeline/build_simulation.py).", "Simulation data not generated yet (pipeline/build_simulation.py).")}
      </p>
    </>
  );
}
