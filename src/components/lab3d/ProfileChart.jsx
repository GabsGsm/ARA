// Perfil de elevação A→B nas duas cenas, no mesmo eixo (distância real, altura relativa ao ponto A).
import { fmt } from "../../lib/format.js";
import { T } from "../../lib/i18n.js";

const COLORS = { left: "#ffd166", right: "#59e0ff" };

export default function ProfileChart({ profiles, onClose }) {
  const list = profiles.filter(Boolean);
  if (!list.length) return null;
  const W = 640, H = 180, P = { l: 52, r: 14, t: 14, b: 30 };
  const maxD = Math.max(...list.map((p) => p.len));
  const rel = list.map((p) => p.pts.map((q) => ({ d: q.d, h: q.h - p.pts[0].h })));
  const all = rel.flat();
  let lo = Math.min(...all.map((q) => q.h)), hi = Math.max(...all.map((q) => q.h));
  if (hi - lo < 10) { hi += 5; lo -= 5; }
  const x = (d) => P.l + (d / maxD) * (W - P.l - P.r);
  const y = (h) => P.t + (1 - (h - lo) / (hi - lo)) * (H - P.t - P.b);
  const ticks = 4;
  return (
    <div className="t3-profile card" role="region" aria-label={T("Perfil de elevação", "Elevation profile")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow mb-0">{T("Perfil de elevação A → B", "Elevation profile A → B")}</h3>
        <button type="button" className="t3-x" onClick={onClose} aria-label={T("Fechar perfil", "Close profile")}>×</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={T("Gráfico do perfil de elevação", "Elevation profile chart")}>
        {[...Array(ticks + 1)].map((_, i) => {
          const h = lo + ((hi - lo) * i) / ticks;
          return <g key={i}><line x1={P.l} x2={W - P.r} y1={y(h)} y2={y(h)} stroke="rgba(255,255,255,.1)" />
            <text x={P.l - 6} y={y(h) + 4} textAnchor="end" fontSize="10" fill="#a9bbb7">{fmt(h, 0)} m</text></g>;
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={x(maxD * t)} y={H - 10} textAnchor="middle" fontSize="10" fill="#a9bbb7">{fmt((maxD * t) / 1000, 1)} km</text>
        ))}
        {list.map((p, i) => (
          <path key={i} d={rel[i].map((q, k) => `${k ? "L" : "M"}${x(q.d).toFixed(1)},${y(q.h).toFixed(1)}`).join("")}
                fill="none" stroke={COLORS[p.side]} strokeWidth="2" />
        ))}
      </svg>
      <div className="grid gap-1 text-[12px] sm:grid-cols-2">
        {list.map((p) => (
          <p key={p.side} className="m-0" style={{ color: COLORS[p.side] }}>
            <b>{p.name}</b>: {fmt(p.len / 1000, 2)} km · {T("sobe", "up")} {fmt(p.up, 0)} m · {T("desce", "down")} {fmt(p.down, 0)} m · {T("trecho mais íngreme", "steepest stretch")} {fmt(p.maxSlope, 1)}°
          </p>
        ))}
      </div>
    </div>
  );
}
