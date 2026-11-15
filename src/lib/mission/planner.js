// Planejador de rota do ARA Missão: menor custo sobre o relevo real somando inclinação, solo e sombra.
// Inspirado no planejamento global dos rovers da JPL (mapa de custo + busca no grafo — Carsten et al. 2007),
// com Dijkstra/A* em grade de 8 vizinhos. Nada aqui é o software da NASA: é a nossa versão, explicável.
import { critAngle, slipAt } from "./rover.js";
import { densityTallerThan } from "./rocks.js";

const RAD = Math.PI / 180;

class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

/** Grade N×N com altura, fofura do solo, fração iluminada, zona científica, área já perturbada e abundância de rochas. */
export function hazardGrid(scene, N, softAt, litMask, extra = {}) {
  const { heights, n, meta } = scene;
  const k = n / N, h = new Float32Array(N * N), soft = new Float32Array(N * N), lit = new Float32Array(N * N).fill(1);
  const sci = new Uint8Array(N * N), dist = new Uint8Array(N * N), rock = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, c = 0, l = 0;
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
      s += heights[yy * n + xx]; if (litMask) l += litMask[yy * n + xx]; c++;
    }
    h[y * N + x] = s / c;
    if (litMask) lit[y * N + x] = l / c;
    const u = (x + 0.5) / N, v = (y + 0.5) / N, i = y * N + x;
    soft[i] = softAt ? softAt(u, v) : 0.3;
    if (extra.sciAt) sci[i] = extra.sciAt(u, v) ? 1 : 0;
    if (extra.disturbedAt) dist[i] = extra.disturbedAt(u, v) ? 1 : 0;
    rock[i] = extra.kAt ? extra.kAt(u, v) : 0.03;
  }
  return { h, soft, lit, sci, dist, rock, N, res: meta.size_m / N };
}

/**
 * Rota de menor custo para o veículo `spec`.
 * Proíbe subir acima do menor entre o limite operacional e o ângulo crítico do solo (−3° de margem)
 * e penaliza areia (patinagem esperada) e sombra (rover solar não recarrega; frio).
 */
export function planRover(grid, a, b, spec, w = { soil: 1, shadow: 1, sci: 0, reuse: 0, rock: 1 }) {
  const { h, soft, lit, sci, dist: dz, rock, N, res } = grid;
  const hBlock = obstacleLimit(spec);
  const idx = (u, v) => Math.min(N - 1, Math.max(0, Math.floor(v * N))) * N + Math.min(N - 1, Math.max(0, Math.floor(u * N)));
  const s = idx(a.u, a.v), t = idx(b.u, b.v);
  const dist = new Float64Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1);
  const solar = spec.solarW > 0;
  dist[s] = 0;
  const heap = new Heap(); heap.push(0, s);
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const tx = t % N, ty = (t / N) | 0;
  while (heap.size) {
    const [, i] = heap.pop();
    if (i === t) break;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of nb) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx, run = Math.hypot(dx, dy) * res, rise = h[j] - h[i];
      const ang = Math.atan2(Math.abs(rise), run) / RAD;
      const limUp = Math.min(spec.maxSlope, critAngle(soft[j]) - 3);
      if (ang > (rise > 0 ? limUp : spec.maxSlope)) continue;
      const slip = rise > 0 ? slipAt(ang, soft[j]) : 0.03;
      let c = run * (1 + 0.08 * ang + (rise > 0 ? 0.06 * ang : 0)) / (1 - Math.min(0.9, slip))
        + run * w.soil * 1.5 * soft[j] * soft[j]
        + run * w.shadow * (1 - lit[j]) * (solar ? 2.5 : 0.4)
        + run * (w.rock ?? 1) * 400 * densityTallerThan(rock[j], hBlock) * spec.width
        + run * (w.sci || 0) * sci[j];
      if (w.reuse && dz[j]) c *= 1 - w.reuse; // andar sobre trilha antiga não perturba chão novo
      const nd = dist[i] + c;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd + Math.hypot(nx - tx, ny - ty) * res, j); }
    }
  }
  if (!Number.isFinite(dist[t])) return null;
  const cells = [];
  for (let i = t; i !== -1; i = prev[i]) cells.push(i);
  cells.reverse();
  return describeRoute(grid, cells, spec);
}

/** Altura de pedra que o veículo não passa: rocker-bogie ≈ diâmetro da roda; LRV ≈ altura livre do chassi. */
export const obstacleLimit = (spec) => (spec.rockerBogie ? 2 * spec.wheelR : spec.clearance);

/** Estatísticas da rota: comprimento, subida, declive máximo, solo fofo, sombra, tempo e energia previstos. */
export function describeRoute(grid, cells, spec, g = null) {
  const { h, soft, lit, sci, dist: dz, rock, N, res } = grid;
  const pts = cells.map((i) => ({ u: ((i % N) + 0.5) / N, v: (((i / N) | 0) + 0.5) / N, h: h[i], soft: soft[i], lit: lit[i], sci: sci?.[i] ?? 0, old: dz?.[i] ?? 0, k: rock?.[i] ?? 0.03 }));
  let len = 0, up = 0, down = 0, maxSlope = 0, softLen = 0, shadeLen = 0, time = 0, maxSlip = 0, sciLen = 0, newLen = 0, rockRisk = 0;
  const hBlock = obstacleLimit(spec);
  for (let k = 1; k < pts.length; k++) {
    const run = Math.hypot(pts[k].u - pts[k - 1].u, pts[k].v - pts[k - 1].v) * N * res, dh = pts[k].h - pts[k - 1].h;
    len += run; if (dh > 0) up += dh; else down -= dh;
    const ang = Math.atan2(dh, run) / RAD;
    maxSlope = Math.max(maxSlope, Math.abs(ang));
    const slip = slipAt(ang, pts[k].soft);
    maxSlip = Math.max(maxSlip, slip);
    time += run / (spec.vmax * (1 - Math.min(0.95, slip)));
    if (pts[k].soft > 0.6) softLen += run;
    if (pts[k].lit < 0.5) shadeLen += run;
    if (pts[k].sci) sciLen += run;
    if (!pts[k].old) newLen += run;
    rockRisk += densityTallerThan(pts[k].k, hBlock) * run * spec.width;
    pts[k].d = len;
  }
  pts[0].d = 0;
  void g;
  return { pts, len, up, down, maxSlope, maxSlip, softFrac: len ? softLen / len : 0, shadeFrac: len ? shadeLen / len : 0, time,
    sciLen, newArea: newLen * spec.width, reuseFrac: len ? 1 - newLen / len : 0, rockRisk };
}

/** Energia prevista (Wh) para percorrer a rota a toda velocidade, com o mesmo modelo do simulador. */
export function routeEnergy(route, spec, gAcc) {
  let wh = 0;
  for (let k = 1; k < route.pts.length; k++) {
    const a = route.pts[k - 1], b = route.pts[k], run = b.d - a.d, ang = Math.atan2(b.h - a.h, run);
    const slip = Math.min(0.95, slipAt((ang * 180) / Math.PI, b.soft)), v = spec.vmax * (1 - slip), dt = run / v;
    const crr = 0.08 + 0.12 * b.soft;
    const p = Math.max(0, (spec.mass * gAcc * spec.vmax * (crr * Math.cos(ang) + Math.sin(ang))) / spec.eta) + spec.hotelW - spec.rtgW;
    wh += (p * dt) / 3600;
  }
  return wh;
}

/** Três estratégias para comparar antes de dirigir. */
export const STRATEGIES = [
  { id: "rapida", w: { soil: 0.3, shadow: 0.2, sci: 0, reuse: 0, rock: 0.3 }, label: ["Mais rápida", "Fastest"], desc: ["Caminho curto; aceita mais areia, sombra e pedras.", "Short path; accepts more sand, shade and rocks."] },
  { id: "segura", w: { soil: 2, shadow: 2, sci: 0, reuse: 0, rock: 3 }, label: ["Mais segura", "Safest"], desc: ["Foge de areia, sombra e campos de pedras.", "Avoids sand, shade and rock fields."] },
  { id: "pristina", w: { soil: 1.2, shadow: 1.2, sci: 25, reuse: 0.6, rock: 1.5 }, label: ["Preserva a ciência", "Protects science"], desc: ["Contorna zonas científicas e reaproveita trilhas antigas.", "Skirts science zones and reuses old tracks."] },
];
