// Escolha do veículo da missão: palco escuro com foco de luz, modelo 3D girando e ficha resumida.
import { useEffect, useState } from "react";
import VehicleViewer from "../vehicles/VehicleViewer.jsx";
import { ROVERS } from "../../lib/mission/rover.js";
import { obstacleLimit } from "../../lib/mission/planner.js";
import { byKey, localize } from "../../lib/vehicles.js";
import { useMotion } from "../../hooks/useMotion.jsx";
import { useSettings } from "../../hooks/useSettings.jsx";
import { fmt } from "../../lib/format.js";

export default function VehiclePicker({ options, value, onConfirm, onClose }) {
  const { tr, lang } = useSettings();
  const { calm } = useMotion();
  const [key, setKey] = useState(value);
  const spec = ROVERS[key];
  const card = localize(byKey(key) ?? { key, name: spec.name, len: spec.len }, lang);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter") onConfirm(key); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, onClose, onConfirm]);
  return (
    <div className="vp-back" role="dialog" aria-modal="true" aria-labelledby="vpTitle">
      <div className="vp-box">
        <header className="vp-head">
          <div>
            <p className="eyebrow mb-1">{tr("Missão", "Mission")}</p>
            <h2 id="vpTitle">{tr("Escolha o veículo", "Choose your vehicle")}</h2>
          </div>
          <button type="button" className="t3-x" onClick={onClose} aria-label={tr("Fechar", "Close")}>×</button>
        </header>
        <div className="vp-body">
          <ul className="vp-list" role="radiogroup" aria-label={tr("Veículos", "Vehicles")}>
            {options.map(([k, r]) => (
              <li key={k}>
                <button type="button" role="radio" aria-checked={k === key} onClick={() => setKey(k)}>
                  <b>{localize(byKey(k) ?? { key: k, name: r.name }, lang).name}</b>
                  <small>{r.body === "moon" ? tr("Lua", "Moon") : tr("Marte", "Mars")} · {fmt(r.mass, 0)} kg · {fmt(r.vmax * 3.6, r.vmax < 1 ? 2 : 1)} km/h</small>
                </button>
              </li>
            ))}
          </ul>
          <div className="vp-stage">
            <VehicleViewer vehicle={{ key, name: card.name, len: card.len ?? spec.len }} calm={calm} spotlight />
          </div>
          <div className="vp-sheet">
            <h3>{card.name}</h3>
            <dl>
              <div><dt>{tr("Massa", "Mass")}</dt><dd>{fmt(spec.mass, 0)} kg</dd></div>
              <div><dt>{tr("Velocidade máx.", "Top speed")}</dt><dd>{fmt(spec.vmax * 3.6, spec.vmax < 1 ? 2 : 1)} km/h</dd></div>
              <div><dt>{tr("Sobe até", "Climbs up to")}</dt><dd>{spec.maxSlope}°</dd></div>
              <div><dt>{tr("Passa pedras de", "Clears rocks up to")}</dt><dd>{fmt(obstacleLimit(spec) * 100, 0)} cm</dd></div>
              <div><dt>{tr("Energia", "Power")}</dt><dd>{spec.rtgW ? tr(`gerador nuclear ${spec.rtgW} W`, `nuclear generator ${spec.rtgW} W`) : spec.solarW ? tr(`painel solar ${spec.solarW} W`, `solar panel ${spec.solarW} W`) : tr("bateria não recarregável", "non-rechargeable battery")}</dd></div>
              <div><dt>{tr("Bateria", "Battery")}</dt><dd>{fmt(spec.batteryWh / 1000, 1)} kWh</dd></div>
            </dl>
            {card.lesson && <p className="vp-lesson">{card.lesson}</p>}
            <button type="button" className="ms-go" onClick={() => onConfirm(key)}>✓ {tr("Confirmar e levar ao terreno", "Confirm and take it to the terrain")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
