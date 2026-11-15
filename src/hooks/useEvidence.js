// Evidências pré-processadas das células da Terra (pipeline/build_evidence.py). Opcional: se o arquivo
// não existir, as telas mostram "dado indisponível" em vez de quebrar.
import { useEffect, useState } from "react";
import { dataUrl } from "../lib/format.js";

let cache = null;

export function useEvidence() {
  const [state, setState] = useState(cache ?? { status: "loading" });
  useEffect(() => {
    if (cache) return;
    let alive = true;
    Promise.all([
      fetch(dataUrl("data/evidence/earth_cells.json")).then((r) => (r.ok ? r.json() : null)),
      fetch(dataUrl("data/evidence/manifest.json")).then((r) => (r.ok ? r.json() : null)),
    ]).then(([cells, manifest]) => {
      cache = cells ? { status: "ready", ...cells, manifest } : { status: "missing" };
      if (alive) setState(cache);
    }).catch(() => { cache = { status: "missing" }; if (alive) setState(cache); });
    return () => { alive = false; };
  }, []);
  return state;
}

/** Junta os blocos de evidência de uma célula no formato que o motor espera. */
export function cellExtra(ev, cellId) {
  const c = ev?.cells?.[cellId];
  if (!c) return null;
  const climate = c.climate_key ? ev.climate?.[c.climate_key] : null;
  const geo = c.geology ? { ...c.geology, ref: ev.geology_sources?.[c.geology.source_id] ?? null } : null;
  return { landcover: c.landcover ?? null, soil: c.soil ?? null, water: c.water ?? null, geology: geo, climate };
}
