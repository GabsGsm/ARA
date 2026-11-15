// ARA — planeta girando em 360° num <canvas>.
// Lê uma textura equiretangular (tools/make_globe_texture.py), projeta numa esfera
// e desloca a longitude a cada quadro. A luz e a sombra ficam fixas por cima,
// então parece um globo de verdade girando no próprio eixo.
//
// Portado do site estático (Alessandra, PR #2). No React é usado por components/home/GlobeCanvas.jsx:
// <canvas class="globe" data-tex={url} data-light="-0.55,-0.5" data-period="90"></canvas>

export class Globe {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    const [lx, ly] = (canvas.dataset.light || "-0.5,-0.4").split(",").map(Number);
    this.light = { x: lx, y: ly };
    this.period = Number(canvas.dataset.period || 90) * 1000; // ms por volta
    this.dir = Number(canvas.dataset.dir || 1);
    this.dark = Number(canvas.dataset.dark || 0.82);           // força da sombra
    this.phase = Number(canvas.dataset.phase || 0);
    this.ready = false;
    this.lastDraw = -1e9;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const t = document.createElement("canvas");
      t.width = img.naturalWidth; t.height = img.naturalHeight;
      const tc = t.getContext("2d", { willReadFrequently: true });
      tc.drawImage(img, 0, 0);
      this.TW = t.width; this.TH = t.height;
      this.tex = new Uint32Array(tc.getImageData(0, 0, t.width, t.height).data.buffer);
      this.setup();
      if (this.dead) return;
      this.ro = new ResizeObserver(() => { this.setup(); this.draw(this.lastT ?? 0, true); });
      this.ro.observe(this.cv);
    };
    img.src = canvas.dataset.tex;
  }

  destroy() { this.dead = true; this.ro?.disconnect(); }

  setup() {
    const css = this.cv.clientWidth;
    if (!css || !this.tex) return;
    const px = Math.max(64, Math.min(760, Math.round(css * Math.min(window.devicePixelRatio || 1, 1.6))));
    if (this.px === px && this.ready) return;
    this.px = px;
    this.cv.width = this.cv.height = px;
    const c = px / 2, r = px / 2 - 0.5;
    const n = px * px;
    const pix = new Int32Array(n), u0 = new Int32Array(n), row = new Int32Array(n);
    const TW = this.TW, TH = this.TH;
    let k = 0;
    for (let y = 0; y < px; y++) {
      const ny = (y + 0.5 - c) / r;
      for (let x = 0; x < px; x++) {
        const nx = (x + 0.5 - c) / r;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1.06) continue; // um pouco além da borda, para o antisserrilhado
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        const lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
        const lon = Math.atan2(nx, nz);
        pix[k] = y * px + x;
        u0[k] = Math.floor((lon / (2 * Math.PI) + 0.5) * TW);
        row[k] = Math.min(TH - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * TH))) * TW;
        k++;
      }
    }
    this.count = k; this.pix = pix; this.u0 = u0; this.row = row;
    this.out = this.ctx.createImageData(px, px);
    this.out32 = new Uint32Array(this.out.data.buffer);

    // sombra fixa (luz vinda de this.light) + escurecimento da borda
    const sh = document.createElement("canvas"); sh.width = sh.height = px;
    const s = sh.getContext("2d");
    const lx = c + this.light.x * r * 0.62, ly = c + this.light.y * r * 0.62;
    let g = s.createRadialGradient(lx, ly, r * 0.05, lx, ly, r * 1.9);
    g.addColorStop(0, "rgba(255,248,235,0.10)");
    g.addColorStop(0.28, "rgba(0,0,0,0)");
    g.addColorStop(0.62, `rgba(0,0,0,${0.42 * this.dark})`);
    g.addColorStop(0.85, `rgba(0,0,0,${0.86 * this.dark})`);
    g.addColorStop(1, `rgba(0,0,0,${0.96 * this.dark})`);
    s.fillStyle = g; s.fillRect(0, 0, px, px);
    g = s.createRadialGradient(c, c, r * 0.72, c, c, r);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.38)");
    s.fillStyle = g; s.fillRect(0, 0, px, px);
    this.shade = sh;

    const m = document.createElement("canvas"); m.width = m.height = px;
    const mc = m.getContext("2d");
    mc.beginPath(); mc.arc(c, c, r, 0, Math.PI * 2); mc.fill();
    this.mask = m;
    this.ready = true;
  }

  draw(t, force = false) {
    if (!this.ready) return;
    this.lastT = t;
    if (!force && t - this.lastDraw < 33) return; // ~30 quadros/s bastam para um giro lento
    this.lastDraw = t;
    const TW = this.TW, mask = TW - 1;
    const off = Math.floor((((t / this.period) * this.dir + this.phase) % 1 + 1) % 1 * TW);
    const { pix, u0, row, out32, tex, count } = this;
    for (let i = 0; i < count; i++) out32[pix[i]] = tex[row[i] + ((u0[i] + off) & mask)];
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.putImageData(this.out, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.drawImage(this.shade, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}
