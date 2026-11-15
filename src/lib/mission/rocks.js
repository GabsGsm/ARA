// Pedras menores que o pixel do DEM: campo estatístico gerado com o modelo de Golombek & Rapp (1997),
// usado pela NASA/JPL na avaliação de risco dos locais de pouso (Pathfinder, MER, Phoenix, MSL, InSight):
//   F_k(D) = k · exp(−q(k) · D),  q(k) = 1,79 + 0,152 / k
// F_k(D) = fração da área coberta por pedras de diâmetro ≥ D; k = fração total coberta por pedras.
// Altura ≈ metade do diâmetro (hipótese usada nas análises de pouso). As pedras são sorteadas por "ladrilho"
// com semente fixa: a mesma posição sempre tem as mesmas pedras (o simulador e o desenho 3D concordam).

export const ROCK_SOURCES = [
  { id: "gr97", en: "Golombek & Rapp (1997) — Size-frequency distributions of rocks on Mars and Earth analog sites, JGR 102: model F_k(D) = k·e^(−q(k)D)", text: "Golombek & Rapp (1997) — Size-frequency distributions of rocks on Mars and Earth analog sites, JGR 102: modelo F_k(D) = k·e^(−q(k)D)", url: "https://pure.psu.edu/en/publications/rock-size-frequency-distributions-on-mars-and-implications-for-ma/" },
  { id: "g21", en: "Golombek et al. (2021) — Rock size-frequency distributions at the InSight landing site (background terrain: 0–10% cover; InSight ≈ 1–5%)", text: "Golombek et al. (2021) — Rock size-frequency distributions at the InSight landing site (fundo de terreno: 0–10% de cobertura; InSight ≈ 1–5%)", url: "https://authors.library.caltech.edu/records/d1t32-akr32/files/Earth_and_Space_Science_-_2021_-_Golombek_-_Rock_Size_u2010Frequency_Distributions_at_the_InSight_Landing_Site_Mars.pdf?download=1" },
  { id: "b11", en: "Bandfield et al. (2011) — Lunar surface rock abundance from LRO Diviner: most of the Moon has little exposed rock, except on steep slopes", text: "Bandfield et al. (2011) — Lunar surface rock abundance from LRO Diviner: a maior parte da Lua tem pouca rocha exposta, exceto encostas íngremes", url: "https://gemelli.spacescience.org/jbandfield/publications/bandfield_diviner_ra.pdf" },
  { id: "msl", en: "Heverly et al. (2013) — Traverse performance characterization for the Mars Science Laboratory rover, J. Field Robotics 30(6): up to 22° on smooth bedrock and 28° on cohesive soil", text: "Rocker-bogie: passa por obstáculos maiores que o diâmetro da roda (MSL: rodas de 50 cm)", url: "https://science.nasa.gov/resource/new-wheels" },
];

const q = (k) => 1.79 + 0.152 / Math.max(k, 1e-4);
export const cfa = (k, D) => k * Math.exp(-q(k) * D);

/**
 * Abundância de rochas k (0..0,3) estimada a partir do dado disponível em cada corpo.
 *  Marte: inércia térmica THEMIS — mais alta = mais rocha/afloramento (relação usada desde Christensen 1986);
 *         mapeada para a faixa de "terreno de fundo" (1–10%) dos estudos com HiRISE.
 *  Lua:   pouca rocha (Diviner), aumentando nas encostas íngremes.
 *  Terra: fragmentos grossos do SoilGrids como indicador (previsão de modelo).
 */
export function rockAbundance(body, { ti, slope = 0, cfvo } = {}) {
  if (body === "mars") return ti == null ? 0.05 : Math.max(0.01, Math.min(0.12, 0.01 + (0.11 * (ti - 150)) / 250));
  if (body === "moon") return Math.min(0.15, 0.005 + 0.03 * Math.max(0, slope - 15) / 10);
  return cfvo == null ? 0.03 : Math.max(0.005, Math.min(0.2, (cfvo / 100) * 0.35));
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function poisson(r, lam) {
  if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())));
  let L = Math.exp(-lam), k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

export const TILE = 32; // m
const cache = new Map();

/** Pedras de um ladrilho (tx, tz) de 32 × 32 m, em metros no sistema do mundo. kAt(x, z) dá a abundância local. */
export function tileRocks(tx, tz, kAt, Dmin = 0.15, Dmax = 3) {
  const key = `${tx},${tz}`;
  if (cache.has(key)) return cache.get(key);
  const x0 = tx * TILE, z0 = tz * TILE, k = kAt(x0 + TILE / 2, z0 + TILE / 2);
  const r = rng((tx * 73856093) ^ (tz * 19349663) ^ 0x9e3779b9);
  const out = [];
  if (k > 0) {
    for (let D = Dmin; D < Dmax; D *= 1.25) {
      const D2 = D * 1.25, Dm = Math.sqrt(D * D2);
      const area = (cfa(k, D) - cfa(k, D2)) * TILE * TILE;
      const n = poisson(r, area / ((Math.PI * Dm * Dm) / 4));
      for (let i = 0; i < n; i++) {
        const d = D + r() * (D2 - D);
        out.push({ id: `${key}:${out.length}`, x: x0 + r() * TILE, z: z0 + r() * TILE, d, h: d * (0.4 + r() * 0.2), rot: r() * Math.PI * 2 });
      }
    }
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}
export function clearRockCache() { cache.clear(); }

// Corredor da rota planejada: como no planejamento real com mapas de rochas do HiRISE, a rota é traçada
// ENTRE as pedras — dentro dele não há pedra que bloqueie ou machuque a roda. Fora dele, o campo estatístico vale.
let corridor = null; // { segs: [[x0, z0, x1, z1]], half, hMin }
export function setRockCorridor(points, half, hMin) {
  corridor = points && points.length > 1
    ? { segs: [
      ...points.slice(1).map((q, i) => [points[i].x, points[i].z, q.x, q.z]),
      // atalhos nas curvas (quem dirige corta o canto entre um trecho e o seguinte)
      ...points.slice(2).map((q, i) => [points[i].x, points[i].z, q.x, q.z]),
    ], half, hMin }
    : null;
}
export const corridorDistance = (x, z) => {
  if (!corridor) return Infinity;
  let best = Infinity;
  for (const [x0, z0, x1, z1] of corridor.segs) {
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
    best = Math.min(best, Math.hypot(x0 + t * dx - x, z0 + t * dz - z));
  }
  return best;
};

/** Pedras num raio (m) em torno de (x, z). */
export function rocksNear(x, z, radius, kAt) {
  const out = [];
  const nearCorridor = corridor && corridorDistance(x, z) < radius + corridor.half + 2;
  const t0x = Math.floor((x - radius) / TILE), t1x = Math.floor((x + radius) / TILE);
  const t0z = Math.floor((z - radius) / TILE), t1z = Math.floor((z + radius) / TILE);
  for (let tx = t0x; tx <= t1x; tx++) for (let tz = t0z; tz <= t1z; tz++) {
    for (const rk of tileRocks(tx, tz, kAt)) {
      if (Math.hypot(rk.x - x, rk.z - z) > radius) continue;
      if (nearCorridor && rk.h > corridor.hMin && corridorDistance(rk.x, rk.z) < corridor.half + rk.d / 2) continue;
      out.push(rk);
    }
  }
  return out;
}

/** Densidade (por m²) de pedras com altura ≥ h (h ≈ D/2) — para o planejador estimar o risco por km. */
export function densityTallerThan(k, h) {
  const D0 = 2 * h;
  let n = 0;
  for (let D = D0; D < 6; D *= 1.15) { const D2 = D * 1.15, Dm = Math.sqrt(D * D2); n += (cfa(k, D) - cfa(k, D2)) / ((Math.PI * Dm * Dm) / 4); }
  return n;
}
