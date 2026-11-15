// Proteção planetária na missão (inspirado na proposta PRISTINE da equipe): onde a ciência precisa ficar intocada,
// qual chão já foi perturbado e a memória de todas as travessias feitas em cada local.
//  • Zonas científicas — Marte: unidades CRISM de alteração aquosa (filossilicatos Fe/Mg; olivina + carbonato),
//    alvos de maior potencial de preservar bioassinaturas. Lua: regiões em sombra permanente (PSR), onde o gelo
//    pode reter contaminantes do próprio veículo. Qualquer corpo: zonas marcadas pela equipe.
//  • Faixa perturbada: largura do veículo + margem de cenário (poeira das rodas, partículas, biocarga) — parâmetro ajustável.
//  • Memória: cada travessia fica salva neste navegador e entra no planejamento das seguintes.
import { shadowMask } from "../terrain3d/sun.js";

export const PP_SOURCES = [
  { id: "nid", en: "NASA NID 8715.129 — Biological Planetary Protection for Human Missions to Mars (2020)", text: "NASA NID 8715.129 — Biological Planetary Protection for Human Missions to Mars (2020)", url: "https://nodis3.gsfc.nasa.gov/OPD_docs/NID_8715-129_.pdf" },
  { id: "nas", en: "National Academies (2021) — Evaluation of bioburden requirements / human missions to Mars, ch. 4", text: "National Academies (2021) — Evaluation of bioburden requirements / human missions to Mars, cap. 4", url: "https://nap.nationalacademies.org/read/26336/chapter/7" },
  { id: "hum", en: "NASA (2022) — Science objectives for human exploration of Mars: planetary protection guidelines", text: "NASA (2022) — Science objectives for human exploration of Mars: planetary protection guidelines", url: "https://ntrs.nasa.gov/api/citations/20220006192/downloads/ScienceObjectivesHumanMars_PPGuidelines_2022May.pdf" },
  { id: "psr", en: "Paiva & Sinibaldi (2025, JGR Planets) — lander exhaust can contaminate the ice of the Moon’s permanently shadowed regions", text: "Paiva & Sinibaldi (2025, JGR Planets) — exaustão de módulos pode contaminar o gelo das regiões em sombra permanente da Lua", url: "https://astrobiology.com/2026/01/07/lunar-spacecraft-exhaust-could-obscure-clues-to-origins-of-life/" },
  { id: "crism", en: "Valantinas et al. (2026) — CRISM + CaSSIS mineral units of Jezero’s western rim", text: "Valantinas et al. (2026) — unidades minerais CRISM + CaSSIS da borda oeste de Jezero", url: "https://zenodo.org/records/22257754" },
];

const KEY = "ara-mission-memory";
export function loadMemory() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
export function saveMemory(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* sem armazenamento */ } }
export function sceneMemory(mem, id) { return mem[id] ?? { missions: [], zones: [] }; }

/** Grade N×N de zonas científicas a partir do mapa mineral (ImageBitmap invertido em Y, como a textura). */
export function scienceFromMinerals(scene, N = 256) {
  const bmp = scene.minerals, classes = scene.meta.minerals?.classes;
  if (!bmp || !classes) return null;
  const keep = classes.filter((c) => /phyllo|carbonate|strong/i.test(`${c.name} ${c.spectral}`)).map((c) => c.color);
  const cv = new OffscreenCanvas(N, N), ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, N, N);
  const px = ctx.getImageData(0, 0, N, N).data, out = new Uint8Array(N * N);
  let any = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = ((N - 1 - y) * N + x) * 4;               // o bitmap está invertido verticalmente
    if (px[i + 3] < 100) continue;
    if (keep.some((c) => Math.abs(c[0] - px[i]) + Math.abs(c[1] - px[i + 1]) + Math.abs(c[2] - px[i + 2]) < 60)) { out[y * N + x] = 1; any++; }
  }
  return any ? out : null;
}

/** Sombra permanente (Lua): pontos que nunca recebem Sol direto com o Sol no ponto mais alto possível, girando o azimute. */
export function permanentShadow(scene, N = 256) {
  const { heights, n, meta } = scene;
  const el = 90 - Math.abs(meta.lat) + 1.54;   // altura máxima do Sol no ano (declinação máx. 1,54°)
  if (el > 12) return null;
  const lit = new Uint8Array(n * n);
  for (let az = 0; az < 360; az += 30) {
    const { mask } = shadowMask(heights, n, meta.size_m / n, az, el);
    for (let i = 0; i < n * n; i++) if (mask[i] > 0.5) lit[i] = 1;
  }
  const out = new Uint8Array(N * N), k = n / N;
  let any = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!lit[Math.floor(y * k) * n + Math.floor(x * k)]) { out[y * N + x] = 1; any++; }
  }
  return any ? out : null;
}

/** Rasteriza trilhas (listas de {u,v}) numa grade N×N com meia-largura halfW (m). */
export function rasterTracks(tracks, sizeM, N, halfW) {
  const out = new Uint8Array(N * N), r = (halfW / sizeM) * N;
  const stamp = (cx, cy) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(N - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= Math.max(r * r, 0.5)) out[y * N + x] = 1;
  };
  for (const tr of tracks) for (let i = 0; i < tr.length; i++) {
    const a = tr[i], b = tr[i + 1] ?? a, steps = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) * N * 2));
    for (let s = 0; s <= steps; s++) stamp((a.u + ((b.u - a.u) * s) / steps) * N, (a.v + ((b.v - a.v) * s) / steps) * N);
  }
  return out;
}

/** Zonas marcadas pela equipe: círculos { u, v, r (m) }. */
export function rasterZones(zones, sizeM, N) {
  const out = new Uint8Array(N * N);
  for (const z of zones) {
    const cx = z.u * N, cy = z.v * N, r = (z.r / sizeM) * N;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(N - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) out[y * N + x] = 1;
  }
  return out;
}

export const at = (grid, N, u, v) => (grid ? grid[Math.min(N - 1, Math.max(0, Math.floor(v * N))) * N + Math.min(N - 1, Math.max(0, Math.floor(u * N)))] : 0);

/** Consequências de uma trilha: área nova perturbada, metros em zona científica, reaproveitamento. */
export function consequences(track, sizeM, N, sci, old, width) {
  let len = 0, sciLen = 0, newLen = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i], d = Math.hypot(b.u - a.u, b.v - a.v) * sizeM;
    len += d;
    if (at(sci, N, b.u, b.v)) sciLen += d;
    if (!at(old, N, b.u, b.v)) newLen += d;
  }
  return { len, sciLen, newArea: newLen * width, reuse: len ? 1 - newLen / len : 0 };
}
