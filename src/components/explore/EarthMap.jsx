// Mapa da Terra: imagens Esri + camada opcional NASA GIBS + células do ranking.
import { useEffect, useState } from "react";
import { MapContainer, Rectangle, TileLayer, Tooltip, useMap } from "react-leaflet";
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-06-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";

function FitToResults({ results }) {
  const map = useMap();
  useEffect(() => {
    const pts = results.flatMap((r) => core.cellBounds(r.cell));
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  }, [map, results]);
  return null;
}

export default function EarthMap({ results, selected, onSelect }) {
  const { cellName } = useAraData();
  const [gibs, setGibs] = useState(false);
  return (
    <div className="relative mt-3">
      <MapContainer center={[0, 0]} zoom={2} worldCopyJump className="h-[430px] rounded-2xl border border-line-2 max-md:h-[320px]"
                    aria-label="Mapa das melhores células da Terra">
        <TileLayer url={ESRI} maxZoom={17} attribution="Imagens © Esri" />
        {gibs && <TileLayer url={GIBS} maxNativeZoom={9} maxZoom={17} opacity={0.85} attribution="NASA GIBS / MODIS Terra" />}
        {results.map((r) => {
          const on = r.cell.id === selected;
          return (
            <Rectangle key={r.cell.id} bounds={core.cellBounds(r.cell)} eventHandlers={{ click: () => onSelect(r.cell.id) }}
                       pathOptions={{ color: on ? "#f7c75a" : "#f2b53a", weight: on ? 3 : 1.5, fillOpacity: on ? 0.3 : 0.1 }}>
              <Tooltip>{`${r.position}º ${cellName(r.cell)}`}</Tooltip>
            </Rectangle>
          );
        })}
        <FitToResults results={results} />
      </MapContainer>
      <label className="absolute bottom-2.5 left-2.5 z-[500] flex items-center gap-2 rounded-full bg-petrol-950/85 px-3 py-1.5 text-[13px] text-ink">
        <input type="checkbox" checked={gibs} onChange={(e) => setGibs(e.target.checked)} /> Camada NASA GIBS (MODIS cor real)
      </label>
    </div>
  );
}
