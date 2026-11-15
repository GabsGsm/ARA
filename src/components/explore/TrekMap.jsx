// Mapa de contexto planetário com tiles do NASA Trek (projeção equiretangular = EPSG:4326 no Leaflet).
// Se o servidor do Trek não responder (fora do ar, lento ou bloqueado na rede), o mapa é trocado por um aviso
// em vez de ficar um quadro escuro vazio.
import { useState } from "react";
import L from "leaflet";
import { MapContainer, Rectangle, TileLayer } from "react-leaflet";
import { T } from "../../lib/i18n.js";

const MAX_ERRORS = 3;

export default function TrekMap({ site, layer }) {
  const [state, setState] = useState({ key: null, errors: 0, loaded: 0 });
  if (!layer || !site?.bbox) return null;
  const s0 = state.key === site.id ? state : { key: site.id, errors: 0, loaded: 0 };
  const failed = s0.errors >= MAX_ERRORS && s0.loaded === 0;
  const [w, s, e, n] = site.bbox;
  const bump = (field) => setState((prev) => {
    const base = prev.key === site.id ? prev : { key: site.id, errors: 0, loaded: 0 };
    return { ...base, [field]: base[field] + 1 };
  });

  if (failed) {
    return (
      <p className="note mt-2.5 rounded-[14px] border border-dashed border-line-2 p-3">
        {T("Mapa de contexto do NASA Mars Trek indisponível agora (o servidor de tiles não respondeu).", "NASA Mars Trek context map unavailable right now (the tile server did not respond).")}
        {" "}<a href={`https://trek.nasa.gov/mars/#v=0.1&x=${(w + e) / 2}&y=${(s + n) / 2}&z=8`} target="_blank" rel="noopener noreferrer">{T("Abrir no Mars Trek ↗", "Open in Mars Trek ↗")}</a>
      </p>
    );
  }
  return (
    <>
      <MapContainer key={site.id} crs={L.CRS.EPSG4326} center={[(s + n) / 2, (w + e) / 2]} zoom={6}
                    attributionControl={false} className="mt-2.5 h-[190px] rounded-[14px] border border-line-2 !bg-[#2a1a10]"
                    aria-label={T(`Mapa de contexto de ${site.name} (NASA Trek)`, `Context map of ${site.name} (NASA Trek)`)}>
        <TileLayer url={layer.url} maxNativeZoom={layer.max_native_zoom} maxZoom={12} noWrap
                   eventHandlers={{ tileerror: () => bump("errors"), tileload: () => bump("loaded") }} />
        <Rectangle bounds={[[s, w], [n, e]]} pathOptions={{ color: "#f2b53a", weight: 2, fillOpacity: 0.15 }} />
      </MapContainer>
      <small className="note">{layer.attribution}</small>
    </>
  );
}
