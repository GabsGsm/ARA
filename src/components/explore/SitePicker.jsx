import Segmented from "../ui/Segmented.jsx";
import { useAraData } from "../../hooks/useAraData.jsx";
import { T } from "../../lib/i18n.js";

const BODIES = [{ value: "mars", label: "Marte" }, { value: "moon", label: "Lua" }];

export default function SitePicker({ body, onBody, siteId, onSite }) {
  const data = useAraData();
  const list = data.sitesOf(body);
  return (
    <>
      <Segmented asTabs label={T("Corpo celeste", "Celestial body")} options={BODIES} value={body} onChange={onBody} className="mb-3" />
      <div role="radiogroup" aria-label={T("Locais", "Sites")} className="grid gap-2">
        {list.length === 0 && <p className="note">{T("Nenhum local para este corpo ainda.", "No sites for this body yet.")}</p>}
        {list.map((s) => {
          const ready = data.hasTerrain(s.id);
          const on = s.id === siteId;
          return (
            <button key={s.id} type="button" role="radio" aria-checked={on} disabled={!ready} onClick={() => onSite(s.id)}
                    className={`cursor-pointer rounded-[14px] border px-3.5 py-2.5 text-left text-ink transition disabled:cursor-not-allowed disabled:opacity-50
                      ${on ? "border-gold bg-gold/15" : "border-line-2 bg-petrol-950/45 hover:border-line"}`}>
              <strong className="font-semibold">{s.name}</strong>
              <small className="block text-xs text-muted">{s.group}{ready ? "" : T(" · dados pendentes", " · data pending")}</small>
            </button>
          );
        })}
      </div>
    </>
  );
}
