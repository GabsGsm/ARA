// ARA — efeitos visuais: céu estrelado (canvas), estrelas cadentes, poeira dourada,
// parallax pelo mouse e o botão "Pausar animações". Independente de app.js:
// se os dados não carregarem, o visual continua funcionando.

const root = document.documentElement;
const body = document.body;
const sky = document.getElementById("sky");
const ctx = sky.getContext("2d");
const btn = document.getElementById("btnMotion");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

let calm = localStorage.getItem("ara-calm") ? localStorage.getItem("ara-calm") === "1" : reduce.matches;
let W = 0, H = 0, DPR = 1, stars = [], dust = [], meteors = [], raf = 0, last = 0, nextMeteor = 2500;
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
const rand = (a, b) => a + Math.random() * (b - a);

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  sky.width = W * DPR; sky.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.round((W * H) / 3800);
  stars = Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() < 0.08 ? rand(1.2, 2) : rand(0.3, 1.1),
    a: rand(0.25, 0.95), sp: rand(0.6, 2.4), ph: rand(0, Math.PI * 2),
    z: rand(0.2, 1), warm: Math.random() < 0.18,
  }));
  dust = Array.from({ length: Math.round(W / 28) }, newDust);
  if (calm) draw(0, 0);
}

function newDust() {
  return { x: rand(W * 0.35, W), y: rand(H * 0.3, H + 20), r: rand(0.6, 2.2), vy: rand(6, 22), vx: rand(-4, 4), life: rand(0, 1), ttl: rand(6, 14) };
}

function spawnMeteor() {
  const x = rand(W * 0.15, W * 1.05), y = rand(-40, H * 0.35);
  const ang = rand(2.4, 2.8); // para baixo e para a esquerda
  const v = rand(700, 1100);
  meteors.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 0, ttl: rand(0.7, 1.2), len: rand(90, 180) });
}

function draw(t, dt) {
  ctx.clearRect(0, 0, W, H);
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;

  for (const s of stars) {
    const tw = calm ? 1 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.sp + s.ph);
    const x = s.x - mouse.x * 18 * s.z, y = s.y - mouse.y * 12 * s.z;
    ctx.globalAlpha = s.a * tw;
    ctx.fillStyle = s.warm ? "#ffe2a6" : "#f4f6ef";
    ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
    if (s.r > 1.3 && tw > 0.85) { // cruz de brilho nas estrelas grandes
      ctx.globalAlpha = s.a * (tw - 0.85) * 4;
      ctx.fillRect(x - s.r * 4, y - 0.4, s.r * 8, 0.8);
      ctx.fillRect(x - 0.4, y - s.r * 4, 0.8, s.r * 8);
    }
  }

  if (!calm) {
    for (const d of dust) {
      d.life += dt / d.ttl; d.y -= d.vy * dt; d.x += d.vx * dt;
      if (d.life >= 1 || d.y < -10) Object.assign(d, newDust(), { life: 0, y: H + 10 });
      const a = Math.sin(d.life * Math.PI) * 0.7;
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 4);
      g.addColorStop(0, `rgba(255,224,150,${a})`); g.addColorStop(1, "rgba(255,200,90,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 4, 0, Math.PI * 2); ctx.fill();
    }

    nextMeteor -= dt * 1000;
    if (nextMeteor <= 0) { spawnMeteor(); nextMeteor = rand(3500, 8000); }
    meteors = meteors.filter((m) => (m.life += dt) < m.ttl);
    for (const m of meteors) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      const k = Math.sin((m.life / m.ttl) * Math.PI);
      const sp = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255,246,220,${0.95 * k})`); g.addColorStop(0.3, `rgba(255,210,120,${0.5 * k})`); g.addColorStop(1, "rgba(255,200,90,0)");
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255,250,235,${k})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  root.style.setProperty("--mx", mouse.x.toFixed(3));
  root.style.setProperty("--my", mouse.y.toFixed(3));
}

function loop(t) {
  const dt = Math.min((t - (last || t)) / 1000, 0.05);
  last = t;
  draw(t, dt);
  raf = requestAnimationFrame(loop);
}

function setCalm(on, save = false) {
  calm = on;
  body.classList.toggle("calm", on);
  btn?.setAttribute("aria-pressed", String(on));
  if (btn) btn.textContent = on ? "Retomar animações" : "Pausar animações";
  document.querySelectorAll(".orbit").forEach((svg) => (on ? svg.pauseAnimations?.() : svg.unpauseAnimations?.()));
  if (save) localStorage.setItem("ara-calm", on ? "1" : "0");
  cancelAnimationFrame(raf); last = 0;
  if (on) { mouse.tx = mouse.ty = 0; mouse.x = mouse.y = 0; draw(0, 0); } else raf = requestAnimationFrame(loop);
}

addEventListener("resize", resize);
addEventListener("pointermove", (e) => {
  if (calm || e.pointerType === "touch") return;
  mouse.tx = (e.clientX / W) * 2 - 1;
  mouse.ty = (e.clientY / H) * 2 - 1;
});
document.addEventListener("visibilitychange", () => {
  if (calm) return;
  cancelAnimationFrame(raf); last = 0;
  if (!document.hidden) raf = requestAnimationFrame(loop);
});
btn?.addEventListener("click", () => setCalm(!calm, true));

resize();
setCalm(calm);
