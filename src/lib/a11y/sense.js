// Acessibilidade sem serviços externos: narração (Web Speech API) e sonificação do relevo (Web Audio API).
// Sonificação: o perfil vira uma melodia contínua — mais agudo = mais alto; o "chiado" sobe com a aspereza
// (variação de um ponto para o outro), e um clique marca cada 10% do caminho.

let ctx = null;
let playing = null;

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
export const canSound = () => typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window);

export function speak(text, lang = document.documentElement.lang?.startsWith("en") ? "en" : "pt") {
  if (!canSpeak()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "en" ? "en-US" : "pt-BR";
  const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang === "en" ? "en" : "pt"));
  if (v) u.voice = v;
  u.rate = 1;
  window.speechSynthesis.speak(u);
  return true;
}
export function stopSpeaking() { if (canSpeak()) window.speechSynthesis.cancel(); }

/**
 * Toca um ou mais perfis em sequência. tracks = [{ values: number[], label?, lo?, hi? }]; usa a mesma escala para todos
 * (assim "mais alto" significa a mesma coisa nos dois lugares). dur = segundos por perfil.
 */
export function sonify(tracks, { dur = 3.2, gap = 0.6 } = {}) {
  if (!canSound()) return null;
  stopSound();
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  const all = tracks.flatMap((t) => t.values.filter((v) => Number.isFinite(v)));
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const t0 = ctx.currentTime + 0.05;
  const nodes = [];
  tracks.forEach((tr, k) => {
    const start = t0 + k * (dur + gap), vals = tr.values, n = vals.length;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(0.18, start + 0.05);
    // ruído para a aspereza
    const nb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(), ng = ctx.createGain(), bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 2400; ns.buffer = nb; ns.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    ng.gain.setValueAtTime(0, start);
    let maxD = 1e-9;
    for (let i = 1; i < n; i++) if (Number.isFinite(vals[i]) && Number.isFinite(vals[i - 1])) maxD = Math.max(maxD, Math.abs(vals[i] - vals[i - 1]));
    for (let i = 0; i < n; i++) {
      const t = start + (i / (n - 1)) * dur, v = vals[i];
      if (!Number.isFinite(v)) { g.gain.setValueAtTime(0.0, t); continue; } // lacuna = silêncio
      g.gain.setValueAtTime(0.18, t);
      osc.frequency.setValueAtTime(220 * Math.pow(4, (v - lo) / span), t);          // 220 Hz → 880 Hz
      const d = i ? Math.abs(v - vals[i - 1]) : 0;
      ng.gain.setValueAtTime(Number.isFinite(d) ? 0.12 * Math.min(1, d / (maxD * 0.6)) : 0, t);
    }
    g.gain.setValueAtTime(0.18, start + dur - 0.05); g.gain.linearRampToValueAtTime(0, start + dur);
    ng.gain.setValueAtTime(0, start + dur);
    osc.start(start); osc.stop(start + dur + 0.02); ns.start(start); ns.stop(start + dur);
    // cliques a cada 10%
    for (let c = 1; c < 10; c++) {
      const ck = ctx.createOscillator(), cg = ctx.createGain();
      ck.frequency.value = 1800; ck.connect(cg); cg.connect(ctx.destination);
      const tc = start + (c / 10) * dur;
      cg.gain.setValueAtTime(0, tc); cg.gain.linearRampToValueAtTime(0.05, tc + 0.004); cg.gain.linearRampToValueAtTime(0, tc + 0.03);
      ck.start(tc); ck.stop(tc + 0.04); nodes.push(ck);
    }
    nodes.push(osc, ns);
  });
  const total = tracks.length * (dur + gap);
  playing = { nodes, until: t0 + total };
  return total;
}
export function stopSound() {
  if (!playing) return;
  for (const n of playing.nodes) { try { n.stop(); } catch { /* já parou */ } }
  playing = null;
}

/** Bipe curto de alerta (missão). */
export function beep(freq = 660, ms = 120) {
  if (!canSound()) return;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.linearRampToValueAtTime(0, t + ms / 1000);
  o.start(t); o.stop(t + ms / 1000 + 0.02);
}
