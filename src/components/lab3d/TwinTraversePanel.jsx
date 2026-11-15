// Resultado da Travessia Gêmea: rota planejada no planeta × trecho do análogo com o mesmo perfil.
import { fmt } from "../../lib/format.js";
import { MODES } from "../../lib/terrain3d/traverse.js";

const fmtTime = (s) => (s >= 3600 ? `${fmt(s / 3600, 1)} h` : `${fmt(s / 60, 0)} min`);

function Profiles({ a, b }) {
  const W = 560, H = 120, P = 26;
  const all = [...a, ...b];
  const lo = Math.min(-5, ...all), hi = Math.max(5, ...all);
  const x = (i, n) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (g) => 8 + (1 - (g - lo) / (hi - lo)) * (H - 24);
  const path = (s) => s.map((g, i) => `${i ? "L" : "M"}${x(i, s.length).toFixed(1)},${y(g).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Perfis de inclinação ao longo das duas rotas">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.2)" />
      <text x={4} y={y(hi) + 4} fontSize="9" fill="#a9bbb7">+{fmt(hi, 0)}°</text>
      <text x={4} y={y(lo)} fontSize="9" fill="#a9bbb7">{fmt(lo, 0)}°</text>
      <path d={path(a)} fill="none" stroke="#ffd166" strokeWidth="2" />
      <path d={path(b)} fill="none" stroke="#59e0ff" strokeWidth="2" />
      <text x={W - P} y={H - 2} textAnchor="end" fontSize="9" fill="#a9bbb7">início → fim (inclinação em cada trecho)</text>
    </svg>
  );
}

export default function TwinTraversePanel({ result, mode, onClose }) {
  if (!result) return null;
  const m = MODES[mode];
  const { route, twin, planetName, earthName, gPlanet, kcal, sun, earthVis, profA, profB, fidelity, status } = result;
  return (
    <div className="t3-profile card t3-trav" role="region" aria-label="Travessia gêmea">
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow mb-0">Travessia gêmea · {m.label}</h3>
        <button type="button" className="t3-x" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      {status && <p className="m-0 text-[13px] text-ink-2">{status}</p>}
      {route && (
        <>
          <Profiles a={profA} b={profB ?? []} />
          <div className="t3-trav-grid">
            <div>
              <b style={{ color: "#ffd166" }}>{planetName}</b>
              <span>{fmt(route.len / 1000, 2)} km · sobe {fmt(route.up, 0)} m · desce {fmt(route.down, 0)} m</span>
              <span>Trecho mais íngreme {fmt(route.maxSlope, 1)}° (limite {m.maxSlope}°)</span>
              <span>Tempo a {fmt(m.speed * 3.6, m.speed < 0.3 ? 2 : 1)} km/h: {fmtTime(route.len / m.speed)}</span>
              {sun?.planet != null && <span>Rota ao sol agora: {fmt(sun.planet * 100, 0)}%</span>}
              {earthVis != null && <span>Terra visível (comunicação direta): {fmt(earthVis * 100, 0)}% da rota</span>}
              {mode === "eva" && kcal && <span>Energia estimada: {fmt(kcal.planet, 0)} kcal com {fmt(gPlanet, 2)} m/s²</span>}
            </div>
            <div>
              <b style={{ color: "#59e0ff" }}>{twin ? `Trecho gêmeo em ${earthName}` : "Análogo"}</b>
              {twin ? (
                <>
                  <span>{fmt(twin.len / 1000, 2)} km · sobe {fmt(twin.up, 0)} m · desce {fmt(twin.down, 0)} m</span>
                  <span>Trecho mais íngreme {fmt(twin.maxSlope, 1)}°</span>
                  <span>Diferença de perfil: {fmt(fidelity, 1)}° RMS {fidelity < 3 ? "— muito parecido" : fidelity < 6 ? "— parecido" : "— diferente"}</span>
                  {sun?.earth != null && <span>Trecho ao sol agora: {fmt(sun.earth * 100, 0)}%</span>}
                  {mode === "eva" && kcal && <span>Energia no ensaio: {fmt(kcal.earth, 0)} kcal com 9,81 m/s² — <b>{fmt(kcal.earth / kcal.planet, 1)}×</b> a da missão</span>}
                </>
              ) : <span>Nenhum trecho com perfil parecido dentro do limite de declividade.</span>}
            </div>
          </div>
          {mode === "eva" && kcal && twin && (
            <p className="t3-note">Para o ensaio cansar como a missão, a mesma rota na Terra pesa {fmt(kcal.earth / kcal.planet, 1)}×: ensaie com menos carga, mais pausas ou trechos mais curtos — ou use suspensão parcial do peso. Estimativa pelo modelo de Pandolf (1977) com o peso escalado pela gravidade; não substitui medição metabólica.</p>
          )}
          <p className="t3-note">{m.note} Rota de menor custo numa grade de ~{fmt(route.cell ?? 78, 0)} m; o trecho gêmeo é a rota do análogo, com a mesma distância em linha reta, cujas subidas e descidas mais se parecem com as da missão.</p>
        </>
      )}
    </div>
  );
}
