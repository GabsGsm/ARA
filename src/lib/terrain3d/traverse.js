// Travessias: rota de menor custo com os limites da missão, perfil, custo físico e a "Travessia Gêmea"
// (o trecho do análogo terrestre cujo perfil de subidas e descidas mais se parece com a rota planejada).
import { heightAt } from "./data.js";

const RAD = Math.PI / 180;

/** Limites por modo (fontes: NASA Artemis III — EVA < 20° em 2 km; JPL — rovers evitam > 30°). */
export const MODES = {
  eva: { label: "Caminhada (EVA Artemis)", maxSlope: 20, speed: 0.9, note: "Limite de declividade para EVA da Artemis III: 20° (escala de 2 km)." },
  perseverance: { label: "Rover Perseverance", maxSlope: 30, speed: 0.042, note: "Rovers da JPL evitam declividades acima de ~30°; velocidade máx. 4,2 cm/s." },
  lrv: { label: "Carro lunar (LRV Apollo)", maxSlope: 25, speed: 2.8, note: "O LRV subia rampas de até ~25°; média de ~10 km/h nas Apollo." },
};

/** Grade reduzida (N×N) com alturas médias, para o planejador. */
export function coarseGrid(scene, N = 128) {
  const { heights, n, meta } = scene;
  const k = n / N, h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, c = 0;
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) { s += heights[yy * n + xx]; c++; }
    h[y * N + x] = s / c;
  }
  return { h, N, res: meta.size_m / N };
}

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

/** Rota de menor custo entre a e b (u, v em 0..1). Passos acima de maxSlope são proibidos. */
export function plan(grid, a, b, maxSlope) {
  const { h, N, res } = grid;
  const idx = (u, v) => Math.min(N - 1, Math.max(0, Math.floor(v * N))) * N + Math.min(N - 1, Math.max(0, Math.floor(u * N)));
  const s = idx(a.u, a.v), t = idx(b.u, b.v);
  const dist = new Float64Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1);
  const tanMax = Math.tan(maxSlope * RAD);
  dist[s] = 0;
  const heap = new Heap(); heap.push(0, s);
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const tx = t % N, ty = (t / N) | 0;
  while (heap.size) {
    const [d, i] = heap.pop();
    if (i === t) break;
    if (d > dist[i]) continue;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of nb) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx, run = Math.hypot(dx, dy) * res, rise = h[j] - h[i];
      const grade = Math.abs(rise) / run;
      if (grade > tanMax) continue;
      // custo: distância + penalidade por inclinação (subir pesa mais que descer)
      const c = run * (1 + 3 * grade + (rise > 0 ? 2 * grade : 0));
      const nd = d + c;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd + 0 * Math.hypot(nx - tx, ny - ty) * res, j); }
    }
  }
  if (!Number.isFinite(dist[t])) return null;
  const cells = [];
  for (let i = t; i !== -1; i = prev[i]) cells.push(i);
  cells.reverse();
  return describe(grid, cells);
}

function describe(grid, cells) {
  const { h, N, res } = grid;
  const pts = cells.map((i) => ({ u: ((i % N) + 0.5) / N, v: (((i / N) | 0) + 0.5) / N, h: h[i] }));
  let len = 0, up = 0, down = 0, maxSlope = 0;
  const seg = [];
  for (let k = 1; k < pts.length; k++) {
    const run = Math.hypot(pts[k].u - pts[k - 1].u, pts[k].v - pts[k - 1].v) * N * res, dh = pts[k].h - pts[k - 1].h;
    len += run; if (dh > 0) up += dh; else down -= dh;
    const g = Math.atan2(dh, run) / RAD;
    maxSlope = Math.max(maxSlope, Math.abs(g));
    seg.push({ run, dh, grade: g });
    pts[k].d = len;
  }
  pts[0].d = 0;
  return { pts, seg, len, up, down, maxSlope };
}

/** Perfil reamostrado: inclinação (graus, com sinal) em m trechos iguais ao longo da rota. */
export function gradeProfile(route, m = 40) {
  const out = [];
  const step = route.len / m;
  let k = 1;
  for (let i = 0; i < m; i++) {
    const d0 = i * step, d1 = (i + 1) * step;
    while (k < route.pts.length - 1 && route.pts[k].d < d0) k++;
    const hAt = (d) => {
      let j = 1; while (j < route.pts.length - 1 && route.pts[j].d < d) j++;
      const p0 = route.pts[j - 1], p1 = route.pts[j], f = (d - p0.d) / Math.max(p1.d - p0.d, 1e-6);
      return p0.h + (p1.h - p0.h) * Math.min(1, Math.max(0, f));
    };
    out.push(Math.atan2(hAt(d1) - hAt(d0), step) / RAD);
  }
  return out;
}

/** Diferença entre dois perfis (graus RMS), aceitando o trecho percorrido no sentido inverso. */
export function profileDistance(p, q) {
  const rms = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length);
  const rev = [...q].reverse().map((x) => -x);
  return Math.min(rms(p, q), rms(p, rev));
}

/** Procura no análogo a rota com perfil mais parecido com o da rota planejada (mesmo comprimento em linha reta). */
export function findTwin(gridE, route, chord, maxSlope, tries = 90, seed = 7) {
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const target = gradeProfile(route);
  const L = chord / (gridE.N * gridE.res); // comprimento em fração da cena
  let best = null;
  for (let i = 0; i < tries; i++) {
    const ang = rnd() * Math.PI * 2;
    const du = Math.cos(ang) * L, dv = Math.sin(ang) * L;
    const a = { u: 0.08 + rnd() * 0.84, v: 0.08 + rnd() * 0.84 };
    const b = { u: a.u + du, v: a.v + dv };
    if (b.u < 0.05 || b.u > 0.95 || b.v < 0.05 || b.v > 0.95) continue;
    const rt = plan(gridE, a, b, maxSlope);
    if (!rt || rt.len < chord * 0.7) continue;
    const score = profileDistance(target, gradeProfile(rt)) + 4 * Math.abs(rt.up - route.up) / Math.max(route.up, 20);
    if (!best || score < best.score) best = { ...rt, a, b, score };
  }
  return best;
}

/** Custo metabólico estimado da caminhada (Pandolf et al. 1977, com o peso escalado pela gravidade).
 *  W = corpo (kg), L = carga/traje (kg), V = velocidade (m/s). Devolve kcal da rota. */
export function metabolic(route, g, W = 75, L = 50, V = 0.9) {
  const gr = g / 9.807;
  let J = 0;
  for (const s of route.seg) {
    const G = Math.max(0, (s.dh / s.run) * 100); // inclinação em % (só subida aumenta o custo neste modelo)
    const M = gr * (1.5 * W + 2 * (W + L) * (L / W) ** 2 + 1.0 * (W + L) * (1.5 * V * V + 0.35 * V * G)); // watts
    J += M * (s.run / V);
  }
  return J / 4184;
}

/** Fração da rota com sol (máscara de sombras da cena, 1 = sol). */
export function sunFraction(route, scene, mask) {
  if (!mask) return null;
  const n = scene.n;
  let lit = 0;
  for (const p of route.pts) lit += mask[Math.min(n - 1, Math.floor(p.v * n)) * n + Math.min(n - 1, Math.floor(p.u * n))];
  return lit / route.pts.length;
}

/** Posição da Terra no céu de um ponto da Lua (sub-Earth point = libração). Devolve azimute/elevação em graus. */
export function earthInSky(latDeg, lonDeg, libLat = 0, libLon = 0) {
  const p1 = latDeg * RAD, l1 = lonDeg * RAD, p2 = libLat * RAD, l2 = libLon * RAD;
  const cosc = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  const c = Math.acos(Math.max(-1, Math.min(1, cosc)));
  const az = Math.atan2(Math.sin(l2 - l1) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1));
  return { elevation: 90 - c / RAD, azimuth: ((az / RAD) + 360) % 360 };
}

export { heightAt };
