// Mapa da Terra: imagens Esri + camada opcional NASA GIBS + células do ranking.
// Ao escolher um resultado (lista, tabela ou mapa) o mapa voa até a célula (lat/lon);
// ao trocar de local, mostra todas as células do ranking.
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip, useMap } from "react-leaflet";
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-06-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";
const CELL_ZOOM = 11; // 5 × 5 km ocupa boa parte do mapa

function allBounds(results) {
  return results.flatMap((r) => core.cellBounds(r.cell));
}

/** Enquadra todas as células quando o conjunto muda; voa até a célula escolhida pelo usuário. */
function MapSync({ results, focus, fitTick }) {
  const map = useMap();
  const idsKey = results.map((r) => r.cell.id).join("|");
  useEffect(() => {
    const pts = allBounds(results);
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: CELL_ZOOM });
  }, [map, idsKey, fitTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const r = focus && results.find((x) => x.cell.id === focus.id);
    if (r) map.flyTo([r.cell.lat, r.cell.lon], CELL_ZOOM, { duration: 1.4 });
  }, [map, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

import { useTr } from "../../hooks/useSettings.jsx";

export default function EarthMap({ results, selected, focus, onPick }) {
  const tr = useTr();
  const { cellName } = useAraData();
  const [gibs, setGibs] = useState(false);
  const [fitTick, setFitTick] = useState(0);
  const sorted = useMemo(() => [...results].reverse(), [results]); // 1º desenhado por cima
  return (
    <div className="relative mt-3">
      <MapContainer center={[0, 0]} zoom={2} worldCopyJump className="h-[430px] rounded-2xl border border-line-2 max-md:h-[320px]"
                    aria-label="Mapa das melhores células da Terra">
        <TileLayer url={ESRI} maxZoom={17} attribution="Imagens © Esri" />
        {gibs && <TileLayer url={GIBS} maxNativeZoom={9} maxZoom={17} opacity={0.85} attribution="NASA GIBS / MODIS Terra" />}
        {sorted.map((r) => {
          const on = r.cell.id === selected;
          const color = on ? "#f7c75a" : "#f2b53a";
          const click = { click: () => onPick(r.cell.id) };
          return [
            <Rectangle key={`${r.cell.id}-box`} bounds={core.cellBounds(r.cell)} eventHandlers={click}
                       pathOptions={{ color, weight: on ? 3 : 1.5, fillOpacity: on ? 0.3 : 0.1 }} />,
            // marcador visível mesmo com o mapa afastado (5 km some na escala do mundo)
            <CircleMarker key={`${r.cell.id}-pt`} center={[r.cell.lat, r.cell.lon]} radius={on ? 9 : 6} eventHandlers={click}
                          pathOptions={{ color: "#041c28", weight: 2, fillColor: color, fillOpacity: on ? 1 : 0.8 }}>
              <Tooltip direction="top" offset={[0, -6]}>{`${r.position}º ${cellName(r.cell)}`}</Tooltip>
            </CircleMarker>,
          ];
        })}
        <MapSync results={results} focus={focus} fitTick={fitTick} />
      </MapContainer>
      <button type="button" onClick={() => setFitTick((t) => t + 1)}
              className="absolute right-2.5 top-2.5 z-[500] cursor-pointer rounded-full border border-line bg-petrol-950/85 px-3 py-1.5 text-[13px] text-ink hover:border-gold">
        {tr("Ver todos", "Show all")}
      </button>
      <label className="absolute bottom-2.5 left-2.5 z-[500] flex items-center gap-2 rounded-full bg-petrol-950/85 px-3 py-1.5 text-[13px] text-ink">
        <input type="checkbox" checked={gibs} onChange={(e) => setGibs(e.target.checked)} /> {tr("Camada NASA GIBS (MODIS cor real)", "NASA GIBS layer (MODIS true colour)")}
      </label>
    </div>
  );
}
