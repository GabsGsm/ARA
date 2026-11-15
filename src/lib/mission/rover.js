// ARA Missão — simulador de travessia de rover sobre o relevo real (DEM) de Marte, Lua ou Terra.
// Modelo simplificado e transparente: cada número vem de fonte pública (ver SOURCES) ou está marcado como suposição.
//  • Energia: P = m·g·v·(Crr·cosθ + sinθ) / η / (1 − patinagem) + consumo fixo; recarga por MMRTG ou painel solar
//    (o painel só gera se o rover está ao Sol — sombras calculadas no próprio relevo).
//  • Patinagem: cresce com a subida; atola no ângulo crítico do solo (areia solta ≈ 17°, solo coeso ≈ 28°).
//    Em Marte, quão "fofo" é o solo vem da inércia térmica THEMIS: inércia baixa = grãos finos / areia.
//  • Tombamento: inclinação lateral ou longitudinal acima do limite estático (45° para rocker-bogie).
//  • Rodas: blocos de relevo mais ásperos do que a altura livre do veículo desgastam as rodas (lição do Curiosity).
import { heightAt } from "../terrain3d/data.js";
import { T } from "../i18n.js";

export const SOURCES = [
  { id: "lrvgc", en: "NASA NSSDC — LRV: chassis ground clearance ≈ 36 cm; the LRV had no rocker-bogie suspension", text: "NASA NSSDC — LRV: altura livre do chassi ≈ 36 cm; o LRV não tinha suspensão rocker-bogie", url: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html" },
  { id: "m2020", en: "NASA/JPL — Mars 2020 press kit: MMRTG ≈ 110 W at the start of the mission; 2 Li-ion batteries of ≈ 43 Ah", text: "NASA/JPL — Mars 2020 press kit: MMRTG ≈ 110 W no início da missão; 2 baterias Li-íon de ≈ 43 Ah", url: "https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/spacecraft/power/" },
  { id: "msl", en: "Heverly et al. (2013) — Traverse performance characterization for the Mars Science Laboratory rover, J. Field Robotics 30(6): up to 22° on smooth bedrock and 28° on cohesive soil", text: "Heverly et al. (2013) — Traverse performance characterization for the Mars Science Laboratory rover, J. Field Robotics 30(6): até 22° em rocha lisa e 28° em solo coeso", url: "https://doi.org/10.1002/rob.21481" },
  { id: "mer", en: "Lindemann (JPL), MER mobility tests in loose sand — moderate slip at 10°, embedding at ≈ 17° (Keck Institute xTerramechanics)", text: "Lindemann (JPL), ensaios de mobilidade dos MER em areia solta — patinagem moderada a 10°, atolamento a ≈ 17° (Keck Institute xTerramechanics)", url: "https://kiss.caltech.edu/workshops/xTerra/presentations1/lindemann.pdf" },
  { id: "lrv", en: "NASA NSSDC — The Apollo Lunar Roving Vehicle: 2 non-rechargeable 36 V, 121 Ah batteries; 210 kg; 490 kg payload", text: "NASA NSSDC — The Apollo Lunar Roving Vehicle: 2 baterias de 36 V e 121 Ah, não recarregáveis; 210 kg; carga 490 kg", url: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html" },
  { id: "ti", en: "Fergason, Christensen & Kieffer (2006) — High-resolution thermal inertia derived from THEMIS, JGR 111: low thermal inertia indicates fine/unconsolidated material", text: "Fergason, Christensen & Kieffer (2006) — High-resolution thermal inertia derived from THEMIS, JGR 111: inércia térmica baixa indica material fino/inconsolidado", url: "https://doi.org/10.1029/2006JE002735" },
  { id: "wheel", en: "Arvidson et al. (2017) — Relating geologic units and mobility system kinematics contributing to Curiosity wheel damage at Gale Crater, Journal of Terramechanics; NASA — wheel wear inspection", text: "Arvidson et al. (2017) — Relating geologic units and mobility system kinematics contributing to Curiosity wheel damage at Gale Crater, Journal of Terramechanics; NASA — inspeção de desgaste das rodas", url: "https://science.nasa.gov/resource/routine-inspection-of-rover-wheel-wear-and-tear?site=msl" },
  { id: "wong", en: "Wong, J. Y. — Theory of Ground Vehicles (Wiley): rolling resistance on deformable soil", text: "Wong, J. Y. — Theory of Ground Vehicles (Wiley): resistência ao rolamento em solo deformável", url: "https://www.wiley.com/en-us/Theory+of+Ground+Vehicles%2C+5th+Edition-p-9781119719892" },
  { id: "autonav", en: "Carsten et al. (2007) — Global path planning on board the Mars Exploration Rovers, IEEE Aerospace Conf.", text: "Carsten et al. (2007) — Global path planning on board the Mars Exploration Rovers, IEEE Aerospace Conf.", url: "https://www-robotics.jpl.nasa.gov/media/documents/IEEEAC-Carsten-1125.pdf" },
];

// Veículos. maxSlope = limite operacional usado no planejamento; tip = limite estático de tombamento.
// hotelW (consumo fixo enquanto opera) e eta (eficiência do trem de força) são SUPOSIÇÕES de ordem de grandeza.
export const ROVERS = {
  perseverance: { name: "Perseverance", body: "mars", mass: 1025, len: 3.0, width: 2.7, rockerBogie: true, vmax: 0.042, maxSlope: 30, tip: 45, wheelR: 0.2625, clearance: 0.6,
    batteryWh: 2 * 43 * 28, rtgW: 110, solarW: 0, hotelW: 90, eta: 0.5, src: ["m2020", "msl"] },
  curiosity: { name: "Curiosity", body: "mars", mass: 899, len: 3.0, width: 2.8, rockerBogie: true, vmax: 0.04, maxSlope: 30, tip: 45, wheelR: 0.25, clearance: 0.6,
    batteryWh: 2 * 42 * 28, rtgW: 110, solarW: 0, hotelW: 90, eta: 0.5, src: ["msl", "wheel"] },
  mer: { name: "Spirit / Opportunity", body: "mars", mass: 185, len: 1.6, width: 2.3, rockerBogie: true, vmax: 0.05, maxSlope: 25, tip: 45, wheelR: 0.125, clearance: 0.3,
    batteryWh: 2 * 8 * 32, rtgW: 0, solarW: 140, hotelW: 30, eta: 0.5, src: ["mer"] },
  lrv: { get name() { return T("Carro lunar Apollo (LRV)", "Apollo Lunar Roving Vehicle (LRV)"); }, body: "moon", mass: 700, len: 3.1, width: 2.06, rockerBogie: false, vmax: 3.6, maxSlope: 25, tip: 45, wheelR: 0.41, clearance: 0.36,
    batteryWh: 2 * 121 * 36, rtgW: 0, solarW: 0, hotelW: 50, eta: 0.8, src: ["lrv"] },
};

/** Fofura do solo 0 (rocha) .. 1 (areia solta) a partir da inércia térmica (J m⁻² K⁻¹ s⁻½). */
export const softFromTI = (ti) => (ti == null ? null : Math.max(0, Math.min(1, (330 - ti) / 160)));
/** Ângulo em que o veículo atola (patinagem 100%): 17° em areia solta, 28° em solo coeso, ~32° em rocha. */
export const critAngle = (soft) => 32 - 15 * soft;
export const slipAt = (upDeg, soft) => Math.min(1, 0.03 + 0.97 * Math.pow(Math.max(0, upDeg) / critAngle(soft), 3));

/** Grade de inércia térmica THEMIS (data/minerals/jezero.json → themis.grid) amostrada por lat/lon. */
export function tiSampler(themis) {
  if (!themis?.grid) return null;
  const [[la0, lo0], [la1, lo1]] = themis.bounds, { rows, cols, ti } = themis.grid;
  return (lat, lon) => {
    if (lat < la0 || lat > la1 || lon < lo0 || lon > lo1) return null;
    const r = Math.min(rows - 1, Math.floor(((la1 - lat) / (la1 - la0)) * rows)), c = Math.min(cols - 1, Math.floor(((lon - lo0) / (lo1 - lo0)) * cols));
    const v = ti[r]?.[c];
    return v == null || Number.isNaN(v) ? null : v;
  };
}

/** Estado inicial da missão. */
export function startState(spec, at) {
  return { u: at.u, v: at.v, heading: at.heading ?? 0, speed: 0, battery: spec.batteryWh, energyUsed: 0, dist: 0, t: 0,
    sink: 0, wheel: 0, slip: 0, pitch: 0, roll: 0, status: "ok", events: [], track: [{ u: at.u, v: at.v }], sinkRisk: 0 };
}

export function steerForWarp(steer, warp) {
  const safeWarp = Math.max(1, warp);
  // Cap steering response at three simulation seconds per real second.
  return steer * Math.min(safeWarp, 3) / safeWarp;
}

export function withinTargetRadius(previous, current, target, radius, size) {
  const du = current.u - previous.u, dv = current.v - previous.v;
  const lengthSquared = du * du + dv * dv;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((target.u - previous.u) * du + (target.v - previous.v) * dv) / lengthSquared)) : 0;
  return Math.hypot(previous.u + t * du - target.u, previous.v + t * dv - target.v) * size <= radius;
}

function rockIntersectsRover(rock, x, z, heading, spec) {
  const dx = rock.x - x, dz = rock.z - z;
  const forward = Math.sin(heading) * dx - Math.cos(heading) * dz;
  const lateral = Math.cos(heading) * dx + Math.sin(heading) * dz;
  const radius = rock.d / 2;
  return Math.abs(forward) <= spec.len / 2 + radius && Math.abs(lateral) <= spec.width / 2 + radius;
}

function rockIntersectsWheel(rock, x, z, heading, spec) {
  const dx = rock.x - x, dz = rock.z - z;
  const forward = Math.sin(heading) * dx - Math.cos(heading) * dz;
  const lateral = Math.cos(heading) * dx + Math.sin(heading) * dz;
  const radius = rock.d / 2 + spec.wheelR * 0.35;
  for (const side of [-1, 1]) for (const along of [-spec.len * 0.38, 0, spec.len * 0.38]) {
    if (Math.hypot(forward - along, lateral - side * spec.width * 0.42) <= radius) return true;
  }
  return false;
}

/**
 * Um passo da simulação. input = { throttle −1..1, steer −1..1 }. dt em segundos de missão.
 * env = { scene, soft(u,v) → 0..1, sunlit(u,v) → bool, sunElev (graus) }
 */
export function step(st, spec, input, dt, env) {
  if (st.status !== "ok") return st;
  const { scene } = env, S = scene.meta.size_m, g = scene.body.g;
  const s = { ...st };
  s.t += dt;
  // virar no lugar (rocker-bogie gira no próprio eixo; o LRV tinha esterçamento nas 4 rodas)
  // rocker-bogie gira no próprio eixo devagar; o LRV tinha esterçamento nas 4 rodas (raio mínimo ≈ 3,1 m, NSSDC):
  // a 13 km/h, 0,6 rad/s dá um raio de ~6 m — dirigível por uma pessoa e coerente com o veículo real
  const turnRate = spec.vmax > 1 ? 0.6 : 0.1; // rad/s
  s.heading += (input.steer || 0) * turnRate * dt;
  const dir = { x: Math.sin(s.heading), z: -Math.cos(s.heading) };
  // geometria local: inclinação na direção do movimento e lateral (pontos a ±meio comprimento)
  const L = Math.max(spec.len, 3) / S;
  const h0 = heightAt(scene, s.u, s.v);
  const hF = heightAt(scene, s.u + dir.x * L, s.v + dir.z * L), hB = heightAt(scene, s.u - dir.x * L, s.v - dir.z * L);
  const hR = heightAt(scene, s.u - dir.z * L, s.v + dir.x * L), hL = heightAt(scene, s.u + dir.z * L, s.v - dir.x * L);
  const run = 2 * L * S;
  s.pitch = (Math.atan((hF - hB) / run) * 180) / Math.PI;
  s.roll = (Math.atan((hR - hL) / run) * 180) / Math.PI;
  const soft = env.soft?.(s.u, s.v) ?? 0.3;
  const thr = Math.max(-1, Math.min(1, input.throttle || 0));
  const goingUp = thr >= 0 ? s.pitch : -s.pitch;
  s.slip = thr ? slipAt(goingUp, soft) : 0;
  const v = thr * spec.vmax * (1 - s.slip);
  s.speed = v;
  // energia
  const theta = (Math.max(-60, Math.min(60, goingUp)) * Math.PI) / 180;
  const crr = 0.08 + 0.12 * soft;
  const pDrive = thr ? Math.max(0, (spec.mass * g * Math.abs(thr) * spec.vmax * (crr * Math.cos(theta) + Math.sin(theta))) / spec.eta) : 0;
  const pSolar = spec.solarW && env.sunlit?.(s.u, s.v) ? spec.solarW * Math.max(0, Math.sin(((env.sunElev ?? 0) * Math.PI) / 180)) : 0;
  const pIn = spec.rtgW + pSolar, pOut = pDrive + spec.hotelW;
  s.battery = Math.min(spec.batteryWh, s.battery + ((pIn - pOut) * dt) / 3600);
  s.energyUsed += (pOut * dt) / 3600;
  s.power = { in: pIn, out: pOut, drive: pDrive };
  // movimento
  s.blocked = null;
  if (v && env.rocks) {
    // pedras menores que o pixel (campo estatístico Golombek & Rapp): passar por cima, raspar ou ser bloqueado
    const nu = s.u + (dir.x * v * dt) / S, nv = s.v + (dir.z * v * dt) / S;
    const x = (nu - 0.5) * S, z = (nv - 0.5) * S, lim = spec.rockerBogie ? 2 * spec.wheelR : spec.clearance;
    const searchRadius = Math.hypot(spec.len / 2, spec.width / 2) + 1.5;
    for (const rk of env.rocks(x, z, searchRadius)) {
      if (!rockIntersectsRover(rk, x, z, s.heading, spec)) continue;
      const ahead = (rk.x - x) * dir.x + (rk.z - z) * dir.z;
      if (rk.h > lim && ahead * Math.sign(v) > -0.2) { s.blocked = rk; break; }
      if (!env.hits.has(rk.id) && rk.h > spec.wheelR * 0.6 && rockIntersectsWheel(rk, x, z, s.heading, spec)) {
        env.hits.add(rk.id);
        const contact = (rk.h - spec.wheelR * 0.6) / Math.max(0.01, lim - spec.wheelR * 0.6);
        s.wheel = Math.min(100, s.wheel + 1.5 * Math.min(1, contact) ** 2);
        s.rocksClimbed = (s.rocksClimbed || 0) + 1;
      }
    }
  }
  if (v && !s.blocked) {
    const du = (dir.x * v * dt) / S, dv = (dir.z * v * dt) / S;
    s.u = Math.max(0.002, Math.min(0.998, s.u + du)); s.v = Math.max(0.002, Math.min(0.998, s.v + dv));
    s.dist += Math.abs(v) * dt;
    const last = s.track[s.track.length - 1];
    if (Math.hypot(s.u - last.u, s.v - last.v) * S > Math.max(2, spec.len)) s.track = [...s.track, { u: s.u, v: s.v }];
    // aspereza na escala do veículo (desvio do centro em relação aos quatro apoios) → desgaste das rodas.
    // O DEM não resolve pedras menores que o pixel, então isto só pega degraus e quebras de relevo visíveis.
    const rough = Math.abs(h0 - (hF + hB + hL + hR) / 4);
    if (rough > spec.clearance * 0.3) s.wheel = Math.min(100, s.wheel + (rough / spec.clearance) * Math.abs(v) * dt * 0.05);
  }
  // atolamento: patinagem alta afunda as rodas (como o Spirit em Troy, 2009); dar ré com calma ainda salva
  if (s.slip > 0.6 && thr) s.sink = Math.min(1, s.sink + (s.slip - 0.6) * soft * dt * 0.02 * (spec.vmax > 1 ? 10 : 1));
  else if (thr < 0) s.sink = Math.max(0, s.sink - dt * 0.004 * (spec.vmax > 1 ? 10 : 1));
  s.sinkRisk = s.slip;
  if (s.blocked) s.speed = 0;
  // fim de missão
  if (Math.abs(s.roll) > spec.tip || Math.abs(s.pitch) > spec.tip) s.status = "tombou";
  else if (s.sink >= 1) s.status = "atolou";
  else if (s.battery <= 0) { s.battery = 0; s.status = "sem_energia"; }
  else if (s.wheel >= 100) s.status = "rodas";
  return s;
}

export const END_TEXT = {
  tombou: { title: "O rover tombou", text: "A inclinação passou do limite estático do veículo. Na missão real, o planejamento evita qualquer trecho perto desse limite: não há quem desvire um rover em Marte." },
  atolou: { title: "Você atolou", text: "A patinagem alta enterrou as rodas — foi assim que o Spirit ficou preso em areia fofa em 2009 e encerrou a missão. Em solo fino, suba em ângulo menor ou contorne." },
  sem_energia: { title: "Energia esgotada", text: "O consumo passou do que a fonte repõe. Rovers solares precisam de sol nos painéis e de pausas para recarregar; o LRV das Apollo nem recarregava." },
  rodas: { title: "Rodas danificadas", text: "Muito tempo em terreno áspero. Depois de 2013 a equipe do Curiosity passou a planejar rotas que evitam rocha pontiaguda para poupar as rodas." },
  chegou: { title: "Missão cumprida", text: "Você chegou ao destino. Compare com a rota planejada: distância, tempo e energia." },
};
