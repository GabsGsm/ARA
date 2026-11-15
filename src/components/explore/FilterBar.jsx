// Barra de filtros do Explorar: corpo, local fixo, objetivo e (num painel que abre) pesos + qualidade dos dados.
import { useEffect, useRef, useState } from "react";
import Segmented from "../ui/Segmented.jsx";
import CriteriaPanel from "./CriteriaPanel.jsx";
import VariantPicker from "./VariantPicker.jsx";
import { useAraData } from "../../hooks/useAraData.jsx";
import { useTr } from "../../hooks/useSettings.jsx";

const BODIES = [{ value: "mars", label: "Marte" }, { value: "moon", label: "Lua" }];

export default function FilterBar({ ex, onBody }) {
  const data = useAraData();
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const panel = useRef(null);
  const list = data.sitesOf(ex.body);
  const changed = ex.objective === "custom" || ex.variant !== "base";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e) => { if (!panel.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onClick); };
  }, [open]);

  return (
    <div className="card ex-filters" ref={panel}>
      <div className="ex-step">
        <span className="ex-num" aria-hidden="true">1</span>
        <div className="min-w-0">
          <span className="ex-label">{tr("Local fixo")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented asTabs label="Corpo celeste" options={BODIES} value={ex.body} onChange={onBody} className="ex-bodies" />
            <select aria-label={tr("Local fixo")} className="field ex-select" value={ex.siteId ?? ""} onChange={(e) => ex.setSiteId(e.target.value)}>
              {list.map((s) => (
                <option key={s.id} value={s.id} disabled={!data.hasTerrain(s.id)}>
                  {s.name} — {s.group}{data.hasTerrain(s.id) ? "" : ` ${tr("(dados pendentes)")}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="ex-step">
        <span className="ex-num" aria-hidden="true">2</span>
        <div className="min-w-0">
          <label className="ex-label" htmlFor="ex-objective">{tr("Para que serve o análogo?")}</label>
          <select id="ex-objective" className="field ex-select" value={ex.objective} onChange={(e) => ex.setObjective(e.target.value)}>
            {Object.entries(data.config.objectives).map(([k, o]) => <option key={k} value={k}>{tr(o.label)}</option>)}
            <option value="custom">{tr("Personalizado")}</option>
          </select>
        </div>
      </div>
      <div className="ex-step">
        <span className="ex-num" aria-hidden="true">3</span>
        <div className="min-w-0">
          <span className="ex-label">{tr("Pesos e qualidade dos dados")}</span>
          <button type="button" className={`ex-tune ${changed ? "on" : ""}`} aria-expanded={open} aria-controls="ex-tune-panel" onClick={() => setOpen((v) => !v)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h10M17 6h4M3 12h4M11 12h10M3 18h12M19 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="15" cy="6" r="2" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="9" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            {tr("Ajustar pesos e qualidade")}{changed ? tr(" ·  alterado", " · changed") : ""}
          </button>
        </div>
      </div>
      {open && (
        <div id="ex-tune-panel" className="ex-tune-panel card" role="region" aria-label={tr("Pesos e qualidade dos dados")}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="eyebrow">{tr("Pesos das medidas")}</h3>
              <p className="note mt-0">{tr("Objetivo atual", "Current objective")}: {ex.objective === "custom" ? tr("Personalizado") : tr(data.config.objectives[ex.objective]?.label)}. {tr("Mexer num peso muda para Personalizado.", "Changing a weight switches to Custom.")}</p>
              <CriteriaPanel hideObjective objective={ex.objective} onObjective={ex.setObjective} weights={ex.weights} onWeight={ex.setWeight} />
            </div>
            <div>
              <h3 className="eyebrow">{tr("Qualidade dos dados")}</h3>
              <VariantPicker value={ex.variant} onChange={ex.setVariant} />
            </div>
          </div>
          <button type="button" className="ex-close" onClick={() => setOpen(false)}>{tr("Fechar")}</button>
        </div>
      )}
    </div>
  );
}
