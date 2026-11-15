// Mapa de contexto planetário com tiles do NASA Trek (projeção equiretangular = EPSG:4326 no Leaflet).
import L from "leaflet";
import { MapContainer, Rectangle, TileLayer } from "react-leaflet";

export default function TrekMap({ site, layer }) {
  if (!layer || !site?.bbox) return null;
  const [w, s, e, n] = site.bbox;
  return (
    <>
      <MapContainer key={site.id} crs={L.CRS.EPSG4326} center={[(s + n) / 2, (w + e) / 2]} zoom={8}
                    attributionControl={false} className="mt-2.5 h-[190px] rounded-[14px] border border-line-2"
                    aria-label={`Mapa de contexto de ${site.name} (NASA Trek)`}>
        <TileLayer url={layer.url} maxNativeZoom={layer.max_native_zoom} maxZoom={12} noWrap />
        <Rectangle bounds={[[s, w], [n, e]]} pathOptions={{ color: "#f2b53a", weight: 2, fillOpacity: 0.15 }} />
      </MapContainer>
      <small className="note">{layer.attribution}</small>
    </>
  );
}
