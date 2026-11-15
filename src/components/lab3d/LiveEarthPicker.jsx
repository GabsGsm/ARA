// Testar qualquer lugar da Terra: escolha no mapa, digite coordenadas ou use um análogo famoso.
import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Análogos usados por NASA/ESA em treinamentos e testes (coordenadas aproximadas do centro da área)
export const FAMOUS = [
  { name: "Cratera Haughton, Ilha Devon (Canadá)", lat: 75.38, lon: -89.68, why: "Projeto Haughton-Mars (NASA)" },
  { name: "Mars Desert Research Station, Utah (EUA)", lat: 38.406, lon: -110.792, why: "Estação de simulação marciana" },
  { name: "Meteor Crater, Arizona (EUA)", lat: 35.027, lon: -111.022, why: "Treino de geologia das Apollo" },
  { name: "Cratera de Ries (Alemanha)", lat: 48.88, lon: 10.57, why: "Treino de astronautas da Artemis" },
  { name: "Mauna Kea, Havaí (EUA)", lat: 19.76, lon: -155.46, why: "Testes de rovers lunares (PISCES)" },
  { name: "Rio Tinto (Espanha)", lat: 37.69, lon: -6.59, why: "Análogo de química de Marte" },
  { name: "Holuhraun (Islândia)", lat: 64.87, lon: -16.83, why: "Campo de lava jovem, treino Artemis" },
  { name: "Kilbourne Hole, Novo México (EUA)", lat: 31.97, lon: -106.97, why: "Cratera de explosão, treino Artemis" },
  { name: "Craters of the Moon, Idaho (EUA)", lat: 43.42, lon: -113.52, why: "Lava basáltica, testes da NASA" },
];

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
      <p className="t3-note mt-0">Escolha um ponto: o ARA baixa o relevo e a imagem ao vivo, monta a cena 3D e calcula as mesmas medidas do ranking.</p>
      <select className="t3-select mt-2" value="" aria-label="Análogos famosos"
              onChange={(e) => { const f = FAMOUS[Number(e.target.value)]; if (f) pick(f.lat, f.lon, f.name); }}>
        <option value="">Análogos famosos (NASA/ESA)…</option>
        {FAMOUS.map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
      </select>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="t3-field"><span>Latitude</span><input inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value); setName(""); }} placeholder="36,42" /></label>
        <label className="t3-field"><span>Longitude</span><input inputMode="decimal" value={lon} onChange={(e) => { setLon(e.target.value); setName(""); }} placeholder="-116,81" /></label>
      </div>
      <div className="t3-btns">
        <button type="button" aria-expanded={map} onClick={() => setMap((v) => !v)}>{map ? "Fechar mapa" : "Escolher no mapa"}</button>
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
      {active && <div className="t3-btns"><button type="button" onClick={onClear}>Voltar ao análogo do ranking</button></div>}
    </div>
  );
}
