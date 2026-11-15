// Objetivo (conjunto de pesos pronto) + controles de peso por atributo.
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";

import { useTr } from "../../hooks/useSettings.jsx";

export default function CriteriaPanel({ objective, onObjective, weights, onWeight, hideObjective = false }) {
  const tr = useTr();
  const { config } = useAraData();
  const w = core.normalizeWeights(weights ?? {});
  return (
    <>
      {!hideObjective && (
        <>
          <label htmlFor="objective" className="mb-1.5 mt-2.5 block text-[13px] text-muted">{tr("Objetivo")}</label>
          <select id="objective" className="field" value={objective} onChange={(e) => onObjective(e.target.value)}>
            {Object.entries(config.objectives).map(([k, o]) => <option key={k} value={k}>{tr(o.label)}</option>)}
            <option value="custom">Personalizado</option>
          </select>
        </>
      )}
      {core.RANK_ATTRS.map((a) => (
        <div key={a}>
          <label htmlFor={`w-${a}`} className="mb-1 mt-3 flex justify-between text-[13px] text-muted">
            {tr(config.attributes[a].label)}
            <output htmlFor={`w-${a}`} className="font-semibold text-gold-2">{Math.round(w[a] * 100)}%</output>
          </label>
          <input id={`w-${a}`} type="range" min="0" max="100" value={Math.round(w[a] * 100)}
                 onChange={(e) => onWeight(a, Number(e.target.value))} className="w-full accent-gold" />
        </div>
      ))}
    </>
  );
}
