// Grupo de opções em pílula (abas Marte/Lua, Mapa/Tabela).
// role="tablist" para abas; senão vira grupo de botões com aria-pressed.
import { useTr } from "../../hooks/useSettings.jsx";

export default function Segmented({ options, value, onChange, label, asTabs = false, className = "" }) {
  const tr = useTr();
  const onKey = (e) => {
    if (!asTabs || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    e.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role={asTabs ? "tablist" : "group"} aria-label={tr(label)} onKeyDown={onKey}
         className={`flex gap-1.5 rounded-full border border-line p-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" data-value={o.value}
                  {...(asTabs ? { role: "tab", "aria-selected": on, tabIndex: on ? 0 : -1 } : { "aria-pressed": on })}
                  onClick={() => onChange(o.value)}
                  className={`flex-1 cursor-pointer rounded-full px-3.5 py-2 font-display text-xs uppercase tracking-[0.12em] transition
                    ${on ? "bg-gold text-petrol-950" : "text-ink-2 hover:bg-white/5"}`}>
            {typeof o.label === "string" ? tr(o.label) : o.label}
          </button>
        );
      })}
    </div>
  );
}
