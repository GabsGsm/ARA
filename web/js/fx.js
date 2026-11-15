// ARA — efeitos visuais (minimalistas): planetas girando em 360° (globe.js),
// poucas estrelas discretas, uma estrela cadente de vez em quando, parallax leve
// pelo mouse e o botão "Pausar animações". Independente de app.js.
import { Globe } from "./globe.js";

const root = document.documentElement;
const body = document.body;
const sky = document.getElementById("sky");
const ctx = sky.getContext("2d");
const btn = document.getElementById("btnMotion");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const globes = [...document.querySelectorAll("canvas.globe")].map((c) => new Globe(c));

let calm = localStorage.getItem("ara-calm") ? localStorage.getItem("ara-calm") === "1" : reduce.matches;
let W = 0, H = 0, stars = [], meteors = [], raf = 0, last = 0, nextMeteor = 6000;
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
const rand = (a, b) => a + Math.random() * (b - a);

function resize() {
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  sky.width = W * DPR; sky.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  stars = Array.from({ length: Math.round((W * H) / 14000) }, () => ({
    x: Math.random() * W, y: Math.random() * H * 0.85,
    r: Math.random() < 0.1 ? rand(0.9, 1.4) : rand(0.3, 0.8),
    a: rand(0.15, 0.6), sp: rand(0.4, 1.6), ph: rand(0, Math.PI * 2), z: rand(0.2, 1),
  }));
  if (calm) draw(0, 0);
}

function draw(t, dt) {
  ctx.clearRect(0, 0, W, H);
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;
  ctx.fillStyle = "#f4f6ef";
  for (const s of stars) {
    const tw = calm ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.001 * s.sp + s.ph);
    ctx.globalAlpha = s.a * tw;
    ctx.beginPath(); ctx.arc(s.x - mouse.x * 10 * s.z, s.y - mouse.y * 6 * s.z, s.r, 0, Math.PI * 2); ctx.fill();
  }
  if (!calm) {
    nextMeteor -= dt * 1000;
    if (nextMeteor <= 0) {
      const ang = rand(2.5, 2.75), v = rand(650, 900);
      meteors.push({ x: rand(W * 0.3, W * 1.05), y: rand(-30, H * 0.3), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 0, ttl: rand(0.8, 1.1), len: rand(100, 170) });
      nextMeteor = rand(9000, 16000);
    }
    meteors = meteors.filter((m) => (m.life += dt) < m.ttl);
    for (const m of meteors) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      const k = Math.sin((m.life / m.ttl) * Math.PI), sp = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255,246,220,${0.85 * k})`); g.addColorStop(1, "rgba(255,210,120,0)");
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
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
  for (const g of globes) g.draw(t);
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
  if (on) {
    mouse.tx = mouse.ty = mouse.x = mouse.y = 0;
    draw(0, 0);
    // desenha os planetas parados assim que as texturas carregarem
    const still = () => { globes.forEach((g) => g.draw(0, true)); if (globes.some((g) => !g.ready)) setTimeout(still, 150); };
    still();
  } else raf = requestAnimationFrame(loop);
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
