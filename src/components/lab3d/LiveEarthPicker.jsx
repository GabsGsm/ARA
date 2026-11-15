// Testar qualquer lugar da Terra: escolha no mapa, digite coordenadas ou use um análogo famoso.
import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { T } from "../../lib/i18n.js";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Análogos usados por NASA/ESA em treinamentos e testes (coordenadas aproximadas do centro da área)
const FAMOUS_SRC = [
  { name: ["Cratera Haughton, Ilha Devon (Canadá)", "Haughton crater, Devon Island (Canada)"], lat: 75.38, lon: -89.68, why: ["Projeto Haughton-Mars (NASA)", "Haughton-Mars Project (NASA)"] },
  { name: ["Mars Desert Research Station, Utah (EUA)", "Mars Desert Research Station, Utah (USA)"], lat: 38.406, lon: -110.792, why: ["Estação de simulação marciana", "Mars simulation station"] },
  { name: ["Meteor Crater, Arizona (EUA)", "Meteor Crater, Arizona (USA)"], lat: 35.027, lon: -111.022, why: ["Treino de geologia das Apollo", "Apollo geology training"] },
  { name: ["Cratera de Ries (Alemanha)", "Ries crater (Germany)"], lat: 48.88, lon: 10.57, why: ["Treino de astronautas da Artemis", "Artemis astronaut training"] },
  { name: ["Mauna Kea, Havaí (EUA)", "Mauna Kea, Hawaii (USA)"], lat: 19.76, lon: -155.46, why: ["Testes de rovers lunares (PISCES)", "Lunar rover tests (PISCES)"] },
  { name: ["Rio Tinto (Espanha)", "Río Tinto (Spain)"], lat: 37.69, lon: -6.59, why: ["Análogo de química de Marte", "Mars chemistry analog"] },
  { name: ["Holuhraun (Islândia)", "Holuhraun (Iceland)"], lat: 64.87, lon: -16.83, why: ["Campo de lava jovem, treino Artemis", "Young lava field, Artemis training"] },
  { name: ["Kilbourne Hole, Novo México (EUA)", "Kilbourne Hole, New Mexico (USA)"], lat: 31.97, lon: -106.97, why: ["Cratera de explosão, treino Artemis", "Explosion crater, Artemis training"] },
  { name: ["Craters of the Moon, Idaho (EUA)", "Craters of the Moon, Idaho (USA)"], lat: 43.42, lon: -113.52, why: ["Lava basáltica, testes da NASA", "Basaltic lava, NASA tests"] },
];
/** Lista no idioma atual. */
export const famous = () => FAMOUS_SRC.map((f) => ({ ...f, name: T(...f.name), why: T(...f.why) }));

const pin = L.divIcon({ className: "t3-pin", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LiveEarthPicker({ busy, progress, error, onTest, active, onClear }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [name, setName] = useState("");
  const [map, setMap] = useState(false);
  const ok = lat !== "" && lon !== "" && Math.abs(Number(lat)) <= 85 && Math.abs(Number(lon)) <= 180;
  const pick = (la, lo, nm = "") => { setLat(la.toFixed(4)); setLon((((lo + 540) % 360) - 180).toFixed(4)); setName(nm); };
  return (
    <div className="t3-live">
      <p className="t3-note mt-0">{T("Escolha um ponto: o ARA baixa o relevo e a imagem ao vivo, monta a cena 3D e calcula as mesmas medidas do ranking.", "Pick a point: ARA downloads the relief and imagery live, builds the 3D scene and computes the same measures as the ranking.")}</p>
      <select className="t3-select mt-2" value="" aria-label={T("Análogos famosos", "Famous analogs")}
              onChange={(e) => { const f = famous()[Number(e.target.value)]; if (f) pick(f.lat, f.lon, f.name); }}>
        <option value="">{T("Análogos famosos (NASA/ESA)…", "Famous analogs (NASA/ESA)…")}</option>
        {famous().map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
      </select>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="t3-field"><span>Latitude</span><input inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value); setName(""); }} placeholder="36,42" /></label>
        <label className="t3-field"><span>Longitude</span><input inputMode="decimal" value={lon} onChange={(e) => { setLon(e.target.value); setName(""); }} placeholder="-116,81" /></label>
      </div>
      <div className="t3-btns">
        <button type="button" aria-expanded={map} onClick={() => setMap((v) => !v)}>{map ? T("Fechar mapa", "Close map") : T("Escolher no mapa", "Pick on map")}</button>
        <button type="button" className="gold" disabled={!ok || busy}
                onClick={() => onTest(Number(lat), Number(lon), name || `Ponto ${Number(lat).toFixed(3)}°, ${Number(lon).toFixed(3)}°`)}>Testar</button>
      </div>
      {map && (
        <div className="t3-minimap">
          <MapContainer center={[lat ? Number(lat) : 20, lon ? Number(lon) : 0]} zoom={lat ? 8 : 2} worldCopyJump style={{ height: "100%" }}>
            <TileLayer url={ESRI} attribution="Esri, Maxar, Earthstar Geographics" />
            <ClickToPick onPick={(la, lo) => pick(la, lo)} />
            {ok && <Marker position={[Number(lat), Number(lon)]} icon={pin} />}
          </MapContainer>
        </div>
      )}
      {busy && <div className="t3-progress" role="status"><span style={{ width: `${Math.round(progress.f * 100)}%` }} /><small>{progress.text}</small></div>}
      {error && <p className="t3-note" role="alert" style={{ color: "var(--color-bad)" }}>{error}</p>}
      {active && <div className="t3-btns"><button type="button" onClick={onClear}>{T("Voltar ao análogo do ranking", "Back to the ranking analog")}</button></div>}
    </div>
  );
}
