// Resultado da Travessia Gêmea: rota planejada no planeta × trecho do análogo com o mesmo perfil.
import { fmt } from "../../lib/format.js";
import { MODES } from "../../lib/terrain3d/traverse.js";
import { T } from "../../lib/i18n.js";

const fmtTime = (s) => (s >= 3600 ? `${fmt(s / 3600, 1)} h` : `${fmt(s / 60, 0)} min`);

function Profiles({ a, b }) {
  const W = 560, H = 120, P = 26;
  const all = [...a, ...b];
  const lo = Math.min(-5, ...all), hi = Math.max(5, ...all);
  const x = (i, n) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (g) => 8 + (1 - (g - lo) / (hi - lo)) * (H - 24);
  const path = (s) => s.map((g, i) => `${i ? "L" : "M"}${x(i, s.length).toFixed(1)},${y(g).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={T("Perfis de inclinação ao longo das duas rotas", "Slope profiles along both routes")}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.2)" />
      <text x={4} y={y(hi) + 4} fontSize="9" fill="#a9bbb7">+{fmt(hi, 0)}°</text>
      <text x={4} y={y(lo)} fontSize="9" fill="#a9bbb7">{fmt(lo, 0)}°</text>
      <path d={path(a)} fill="none" stroke="#ffd166" strokeWidth="2" />
      <path d={path(b)} fill="none" stroke="#59e0ff" strokeWidth="2" />
      <text x={W - P} y={H - 2} textAnchor="end" fontSize="9" fill="#a9bbb7">{T("início → fim (inclinação em cada trecho)", "start → end (slope of each stretch)")}</text>
    </svg>
  );
}

export default function TwinTraversePanel({ result, mode, onClose }) {
  if (!result) return null;
  const m = MODES[mode];
  const { route, twin, planetName, earthName, gPlanet, kcal, sun, earthVis, profA, profB, fidelity, status } = result;
  return (
    <div className="t3-profile card t3-trav" role="region" aria-label={T("Travessia gêmea", "Twin traverse")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow mb-0">{T("Travessia gêmea", "Twin traverse")} · {m.label}</h3>
        <button type="button" className="t3-x" onClick={onClose} aria-label={T("Fechar", "Close")}>×</button>
      </div>
      {status && <p className="m-0 text-[13px] text-ink-2">{status}</p>}
      {route && (
        <>
          <Profiles a={profA} b={profB ?? []} />
          <div className="t3-trav-grid">
            <div>
              <b style={{ color: "#ffd166" }}>{planetName}</b>
              <span>{fmt(route.len / 1000, 2)} km · {T("sobe", "up")} {fmt(route.up, 0)} m · {T("desce", "down")} {fmt(route.down, 0)} m</span>
              <span>{T("Trecho mais íngreme", "Steepest stretch")} {fmt(route.maxSlope, 1)}° ({T("limite", "limit")} {m.maxSlope}°)</span>
              <span>{T("Tempo a", "Time at")} {fmt(m.speed * 3.6, m.speed < 0.3 ? 2 : 1)} km/h: {fmtTime(route.len / m.speed)}</span>
              {sun?.planet != null && <span>{T("Rota ao sol agora", "Route in sunlight now")}: {fmt(sun.planet * 100, 0)}%</span>}
              {earthVis != null && <span>{T("Terra visível (comunicação direta)", "Earth in view (direct communication)")}: {fmt(earthVis * 100, 0)}% {T("da rota", "of the route")}</span>}
              {mode === "eva" && kcal && <span>{T("Energia estimada", "Estimated energy")}: {fmt(kcal.planet, 0)} kcal {T("com", "at")} {fmt(gPlanet, 2)} m/s²</span>}
            </div>
            <div>
              <b style={{ color: "#59e0ff" }}>{twin ? T(`Trecho gêmeo em ${earthName}`, `Twin stretch in ${earthName}`) : T("Análogo", "Analog")}</b>
              {twin ? (
                <>
                  <span>{fmt(twin.len / 1000, 2)} km · {T("sobe", "up")} {fmt(twin.up, 0)} m · {T("desce", "down")} {fmt(twin.down, 0)} m</span>
                  <span>{T("Trecho mais íngreme", "Steepest stretch")} {fmt(twin.maxSlope, 1)}°</span>
                  <span>{T("Diferença de perfil", "Profile difference")}: {fmt(fidelity, 1)}° RMS {fidelity < 3 ? T("— muito parecido", "— very similar") : fidelity < 6 ? T("— parecido", "— similar") : T("— diferente", "— different")}</span>
                  {sun?.earth != null && <span>{T("Trecho ao sol agora", "Stretch in sunlight now")}: {fmt(sun.earth * 100, 0)}%</span>}
                  {mode === "eva" && kcal && <span>{T("Energia no ensaio", "Energy in the rehearsal")}: {fmt(kcal.earth, 0)} kcal {T("com", "at")} {fmt(9.81, 2)} m/s² — <b>{fmt(kcal.earth / kcal.planet, 1)}×</b> {T("a da missão", "the mission's")}</span>}
                </>
              ) : <span>{T("Nenhum trecho com perfil parecido dentro do limite de declividade.", "No stretch with a similar profile within the slope limit.")}</span>}
            </div>
          </div>
          {mode === "eva" && kcal && twin && (
            <p className="t3-note">{T(`Para o ensaio cansar como a missão, a mesma rota na Terra pesa ${fmt(kcal.earth / kcal.planet, 1)}×: ensaie com menos carga, mais pausas ou trechos mais curtos — ou use suspensão parcial do peso. Estimativa pelo modelo de Pandolf (1977) com o peso escalado pela gravidade; não substitui medição metabólica.`, `For the rehearsal to be as tiring as the mission, the same route on Earth costs ${fmt(kcal.earth / kcal.planet, 1)}× more: rehearse with a lighter load, more rests or shorter stretches — or use partial weight offload. Estimate from the Pandolf (1977) model with weight scaled by gravity; not a substitute for metabolic measurement.`)}</p>
          )}
          <p className="t3-note">{m.note} {T(`Rota de menor custo numa grade de ~${fmt(route.cell ?? 78, 0)} m; o trecho gêmeo é a rota do análogo, com a mesma distância em linha reta, cujas subidas e descidas mais se parecem com as da missão.`, `Least-cost route on a ~${fmt(route.cell ?? 78, 0)} m grid; the twin stretch is the analog route, with the same straight-line distance, whose climbs and descents best match the mission's.`)}</p>
        </>
      )}
    </div>
  );
}
