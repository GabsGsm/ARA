// Simulação de qualidade dos dados: escolhe a variante (resolução menor, lacunas, ruído).
import { useAraData } from "../../hooks/useAraData.jsx";

export default function VariantPicker({ value, onChange }) {
  const { sim } = useAraData();
  const options = sim?.variants ?? [{ id: "base", label: "Dados originais (100 m)" }];
  return (
    <>
      <label htmlFor="variant" className="mb-1.5 mt-2.5 block text-[13px] text-muted">Simular dados piores</label>
      <select id="variant" className="field" value={value} disabled={!sim} onChange={(e) => onChange(e.target.value)}>
        {options.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
      <p className="note">
        {sim
          ? "Recalcula as mesmas células com dados piorados de propósito, para mostrar quanto o ranking depende da qualidade dos dados."
          : "Dados da simulação ainda não gerados (pipeline/build_simulation.py)."}
      </p>
    </>
  );
}
