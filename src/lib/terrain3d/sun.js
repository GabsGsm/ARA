// Posição do Sol para Marte, Lua e Terra (geometria esférica simples, suficiente para iluminar o relevo).
// season: Marte = Ls (graus); Terra = dia do ano; Lua = fase do ciclo de 18,6 anos da inclinação (0..1).
// hour: hora solar local verdadeira (0..24, meio-dia = 12) na escala do "dia" de cada corpo.
import { T } from "../i18n.js";

const RAD = Math.PI / 180;

export const SEASON = {
  mars: { get label() { return T("Estação (Ls)", "Season (Ls)"); }, min: 0, max: 359, step: 1, def: 30, fmt: (v) => `Ls ${Math.round(v)}°` },
  earth: { get label() { return T("Dia do ano", "Day of year"); }, min: 1, max: 365, step: 1, def: 172, fmt: (v) => dayLabel(v) },
  moon: { get label() { return T("Declinação do Sol", "Solar declination"); }, min: -1.54, max: 1.54, step: 0.02, def: 0, fmt: (v) => `${v.toFixed(2)}°` },
};

function dayLabel(n) {
  const d = new Date(Date.UTC(2026, 0, 1) + (n - 1) * 86400000);
  return d.toLocaleDateString(T("pt-BR", "en-US"), { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function declination(body, season) {
  if (body === "mars") return Math.asin(Math.sin(25.19 * RAD) * Math.sin(season * RAD)) / RAD;
  if (body === "earth") return 23.44 * Math.sin((2 * Math.PI * (284 + season)) / 365);
  return season; // Lua: o próprio valor (±1,54°)
}

/** { elevation, azimuth } em graus; azimute a partir do norte, sentido horário. */
export function sunPosition(latDeg, body, season, hour) {
  const phi = latDeg * RAD, dec = declination(body, season) * RAD, H = (hour - 12) * 15 * RAD;
  const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { elevation: el / RAD, azimuth: ((az / RAD) + 360) % 360, declination: dec / RAD };
}

/** Horas (locais) do nascer e do pôr do Sol num horizonte plano; null se não nasce / não se põe. */
export function daylight(latDeg, body, season) {
  const phi = latDeg * RAD, dec = declination(body, season) * RAD;
  const c = -Math.tan(phi) * Math.tan(dec);
  if (c >= 1) return { polarNight: true };
  if (c <= -1) return { polarDay: true };
  const H = Math.acos(c) / RAD / 15;
  return { rise: 12 - H, set: 12 + H };
}

/** Fração do terreno iluminada (0..1) com sombras do próprio relevo: marcha de raios no mapa de alturas.
 *  heights: Float32Array n×n (m); res: m/pixel; az/el em graus. Amostra uma grade step×step. */
export function litFraction(heights, n, res, azDeg, elDeg, exag = 1, step = 4) {
  if (elDeg <= 0) return 0;
  const az = azDeg * RAD, tanEl = Math.tan(elDeg * RAD);
  // direção para o Sol na grade (x leste, y sul)
  const dx = Math.sin(az), dy = -Math.cos(az);
  const maxD = n * 1.5;
  let lit = 0, tot = 0;
  for (let y = 0; y < n; y += step) {
    for (let x = 0; x < n; x += step) {
      const h0 = heights[y * n + x] * exag;
      let shadow = false;
      for (let t = 2; t < maxD; t += 1 + t * 0.03) {
        const px = Math.round(x + dx * t), py = Math.round(y + dy * t);
        if (px < 0 || py < 0 || px >= n || py >= n) break;
        if (heights[py * n + px] * exag > h0 + t * res * tanEl) { shadow = true; break; }
      }
      tot++; if (!shadow) lit++;
    }
  }
  return lit / tot;
}

/** Máscara de sol/sombra (1 = ao sol, 0 = sombra) para cada ponto do relevo real, por marcha de raio
 *  na direção do Sol. Igual aos mapas de iluminação usados para o polo sul lunar. Devolve { mask, lit }. */
export function shadowMask(heights, n, res, azDeg, elDeg) {
  const mask = new Float32Array(n * n);
  if (elDeg <= -0.5) return { mask, lit: 0 };
  const az = azDeg * RAD, tanEl = Math.tan(Math.max(elDeg, 0.05) * RAD);
  const dx = Math.sin(az), dy = -Math.cos(az);
  let hmax = -Infinity;
  for (let i = 0; i < n * n; i++) if (heights[i] > hmax) hmax = heights[i];
  let lit = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const h0 = heights[y * n + x];
      let s = 1;
      for (let t = 1.5; ; t += 1 + t * 0.015) {
        const need = h0 + t * res * tanEl;
        if (need > hmax) break;
        const px = x + dx * t, py = y + dy * t;
        if (px < 0 || py < 0 || px > n - 1 || py > n - 1) break;
        const hh = heights[(py | 0) * n + (px | 0)];
        if (hh > need) { s = Math.max(0, 1 - (hh - need) / (res * 0.8)); if (s === 0) break; }
      }
      mask[y * n + x] = s;
      lit += s;
    }
  }
  // penumbra perto do horizonte: o disco solar tem ~0,5°
  if (elDeg < 0.3) { const k = Math.max(0, (elDeg + 0.5) / 0.8); for (let i = 0; i < n * n; i++) mask[i] *= k; lit *= k; }
  return { mask, lit: lit / (n * n) };
}

/** Hora solar local "agora" para um corpo (aproximação: Terra pelo fuso do usuário; Marte pela data via MSD). */
export function nowHour(body, lonDeg) {
  const now = Date.now();
  if (body === "mars") {
    const jd = now / 86400000 + 2440587.5;
    const msd = (jd - 2405522.0028779) / 1.0274912517;
    const mtc = ((msd % 1) * 24 + 24) % 24;
    return ((mtc + lonDeg / 15) % 24 + 24) % 24; // aproximação: LMST
  }
  if (body === "earth") {
    const d = new Date(now);
    return ((d.getUTCHours() + d.getUTCMinutes() / 60 + lonDeg / 15) % 24 + 24) % 24;
  }
  // Lua: dia sinódico de 29,53 dias; fase a partir de uma lua nova conhecida (6 jan 2000 18:14 UTC)
  const days = (now - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const phase = ((days / 29.530589) % 1 + 1) % 1;
  return ((phase * 24 + 12 + lonDeg / 15) % 24 + 24) % 24;
}

export const fmtHour = (h) => {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
