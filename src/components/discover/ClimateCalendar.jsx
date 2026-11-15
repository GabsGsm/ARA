// Analog Validity Calendar (climatologia): chuva (barras) e temperatura média/mín/máx (linhas) por mês.
// Contexto regional de longo prazo do NASA POWER — não é previsão nem medição da célula.
import { fmt } from "../../lib/format.js";

const M = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export default function ClimateCalendar({ climate }) {
  const p = climate?.params;
  if (!p?.T2M) return <p className="note">Sem climatologia para este ponto.</p>;
  const rain = p.PRECTOTCORR.monthly.map((v, i) => v * DAYS[i]);
  const T = p.T2M.monthly, Tx = p.T2M_MAX?.monthly ?? T, Tn = p.T2M_MIN?.monthly ?? T;
  const W = 340, H = 150, L = 30, R = 30, Tp = 10, B = 22, cw = (W - L - R) / 12;
  const rMax = Math.max(10, ...rain);
  const tMin = Math.min(...Tn) - 2, tMax = Math.max(...Tx) + 2;
  const yT = (t) => Tp + (1 - (t - tMin) / (tMax - tMin)) * (H - Tp - B);
  const path = (s) => s.map((v, i) => `${i ? "L" : "M"}${(L + cw * (i + 0.5)).toFixed(1)},${yT(v).toFixed(1)}`).join("");
  const driest = rain.indexOf(Math.min(...rain));
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`Climatologia: chuva anual ${fmt(rain.reduce((a, b) => a + b, 0), 0)} mm, temperatura média ${fmt(p.T2M.annual, 1)} °C.`}>
        {rain.map((v, i) => {
          const h = (v / rMax) * (H - Tp - B);
          return <rect key={i} x={L + cw * i + 3} y={H - B - h} width={cw - 6} height={h} rx="2" fill={i === driest ? "#59e0ff" : "rgb(89 168 224 / .55)"} />;
        })}
        <path d={path(Tx)} fill="none" stroke="#ef8f80" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d={path(Tn)} fill="none" stroke="#8fb8d8" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d={path(T)} fill="none" stroke="#f7c75a" strokeWidth="2" />
        {M.map((m, i) => <text key={i} x={L + cw * (i + 0.5)} y={H - 6} textAnchor="middle" fontSize="10" fill="#a9bbb7">{m}</text>)}
        <text x={L - 4} y={Tp + 8} textAnchor="end" fontSize="9" fill="#f7c75a">{fmt(tMax, 0)}°</text>
        <text x={L - 4} y={H - B} textAnchor="end" fontSize="9" fill="#f7c75a">{fmt(tMin, 0)}°</text>
        <text x={W - R + 4} y={Tp + 8} fontSize="9" fill="#59a8e0">{fmt(rMax, 0)} mm</text>
      </svg>
      <figcaption className="note">
        Barras: chuva mensal (mês mais seco em destaque). Linhas: temperatura média (dourada), máxima e mínima. Total anual {fmt(rain.reduce((a, b) => a + b, 0), 0)} mm ·
        {" "}radiação {fmt(p.ALLSKY_SFC_SW_DWN?.annual, 2)} kWh/m²/dia · vento {fmt(p.WS2M?.annual, 1)} m/s. NASA POWER {climate.period}, pixel de ~0,5° — contexto regional.
      </figcaption>
    </figure>
  );
}
