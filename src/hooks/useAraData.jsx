// Carrega os JSON de data/ uma vez (useEffect) e compartilha com todas as páginas.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as core from "../lib/core.js";
import { dataUrl } from "../lib/format.js";
import { localizeData } from "../lib/i18n.js";
import { useSettings } from "./useSettings.jsx";

const REQUIRED = ["config", "catalog", "planet_sites", "earth_grid"];
const OPTIONAL = ["stability", "simulation"];

async function getJSON(name, optional) {
  try {
    const r = await fetch(dataUrl(`data/${name}.json`), { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    if (optional) return null;
    throw new Error(`data/${name}.json — não foi possível carregar / could not be loaded`);
  }
}

const AraDataContext = createContext(null);

export function AraDataProvider({ children }) {
  const [state, setState] = useState({ status: "loading", error: null, raw: null });

  useEffect(() => {
    let alive = true;
    Promise.all([
      ...REQUIRED.map((n) => getJSON(n, false)),
      ...OPTIONAL.map((n) => getJSON(n, true)),
    ])
      .then(([config, catalog, sites, grid, stability, sim]) => {
        if (alive) setState({ status: "ready", error: null, raw: { config, catalog, sites, grid, stability, sim } });
      })
      .catch((e) => alive && setState({ status: "error", error: e.message, raw: null }));
    return () => { alive = false; };
  }, []);

  const { lang } = useSettings();
  const value = useMemo(() => {
    if (state.status !== "ready") return state;
    // textos dos dados no idioma escolhido (nomes, grupos, notas, avisos)
    const { config, catalog, sites, grid, stability, sim } = Object.fromEntries(Object.entries(state.raw).map(([k, v]) => [k, localizeData(v)]));
    // as 4 referências do Protótipo 1 duplicam locais da grade: ficam fora da busca (710 células comparáveis)
    const cells = core.unpackGrid(grid).filter((c) => c.region !== "prototipo1");
    const siteById = (id) => catalog.sites.find((s) => s.id === id);
    const regionName = (id) => grid.regions.find((r) => r.id === id)?.name ?? id;
    return {
      ...state,
      config, catalog, sites, grid, stability, sim, cells,
      scales: core.scalesFrom(config),
      siteById,
      regionName,
      cellName: (c) => c.known || `${regionName(c.region)} · ${c.id}`,
      sitesOf: (body) => catalog.sites.filter((s) => s.body === body),
      hasTerrain: (id) => Boolean(sites[id]?.terrain),
    };
  }, [state, lang]);

  return <AraDataContext.Provider value={value}>{children}</AraDataContext.Provider>;
}

export function useAraData() {
  const ctx = useContext(AraDataContext);
  if (!ctx) throw new Error("useAraData precisa estar dentro de <AraDataProvider>");
  return ctx;
}
