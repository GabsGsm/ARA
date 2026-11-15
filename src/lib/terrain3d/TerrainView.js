// ARA — visualizador 3D de relevo real (three.js).
// Mundo: x = leste, z = sul, y = cima, em metros; o terreno fica centrado na origem e a altura
// é relativa ao meio da faixa de elevação da cena (as duas vistas gêmeas ficam comparáveis).
import * as THREE from "three";
// (THREE.Clock ainda funciona; trocar por THREE.Timer quando o three remover)
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { heightAt, slopeAt, slopeGrid, uvToLatLon } from "./data.js";
import { GLB, PROCEDURAL, fitToLength, loadGLB } from "./models.js";

const LAYERS = { imagem: 0, declividade: 1, altitude: 2, relevo: 3, operacoes: 4 };
const EYE = 1.75;          // altura dos olhos (m)
const WALK = 1.4, RUN = 14; // m/s
const JUMP_V = 2.5;        // m/s — o mesmo impulso nos três corpos

export default class TerrainView {
  constructor(container, cb = {}) {
    this.el = container;
    this.cb = cb;
    this.exag = 1;
    this.layer = "imagem";
    this.contours = { on: false, step: 50 };
    this.flags = { labels: true, path: true, cell: true };
    this.mode = "orbit";
    this.dirty = true;
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.onGround = true;

    const w = container.clientWidth || 600, h = container.clientHeight || 400;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h);
    // sombras: calculadas no relevo real (sun.js/shadowMask), não pelo shadow map da GPU
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add("terrain-canvas");

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    this.labels.domElement.className = "terrain-labels";
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, w / h, 1, 1e6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener("change", () => {
      this.dirty = true;
      if (!this._syncing && !this._flying) this.cb.onCamera?.(this.getCamState());
    });
    this.controls.addEventListener("start", () => { this._userMoving = true; this.cb.onUser?.(); });
    this.controls.addEventListener("end", () => { this._userMoving = false; });

    this.pointerLock = new PointerLockControls(this.camera, this.renderer.domElement);
    this.pointerLock.addEventListener("unlock", () => this.cb.onWalkLock?.(false));
    this.pointerLock.addEventListener("lock", () => this.cb.onWalkLock?.(true));

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.HemisphereLight(0xffffff, 0x222222, 0.3);
    this.scene.add(this.ambient);
    this.overlays = new THREE.Group();
    this.scene.add(this.overlays);

    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    const dom = this.renderer.domElement;
    this._onMove = (e) => this.hover(e);
    this._onClick = (e) => this.click(e);
    this._onLeave = () => this.cb.onHover?.(null);
    dom.addEventListener("pointermove", this._onMove);
    dom.addEventListener("pointerleave", this._onLeave);
    dom.addEventListener("pointerdown", (e) => { this._down = [e.clientX, e.clientY]; });
    dom.addEventListener("pointerup", this._onClick);
    this._onKey = (e) => this.key(e);
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup", this._onKey);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.clock = new THREE.Clock();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick(); };
    loop();
  }

  // ------------------------------------------------------------------ cena
  setScene(data) {
    this.data = data;
    const { meta, heights, n, body } = data;
    const S = meta.size_m;
    this.S = S;
    this.mid = (meta.height.min + meta.height.max) / 2;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); }
    this.overlays.clear();
    this.labels.domElement.innerHTML = "";

    const geo = new THREE.PlaneGeometry(S, S, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const elev = new Float32Array(n * n);
    const slope = slopeGrid(data);
    for (let i = 0; i < n * n; i++) { pos.setY(i, heights[i] - this.mid); elev[i] = heights[i]; }
    geo.setAttribute("aElev", new THREE.BufferAttribute(elev, 1));
    geo.setAttribute("aSlope", new THREE.BufferAttribute(slope, 1));
    this.shadowAttr = new THREE.BufferAttribute(new Float32Array(n * n).fill(1), 1);
    geo.setAttribute("aShadow", this.shadowAttr);
    this.opsAttr = new THREE.BufferAttribute(new Float32Array(n * n), 1);
    geo.setAttribute("aOps", this.opsAttr);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    let map = null;
    if (data.color) {
      map = new THREE.Texture(data.color);
      map.colorSpace = THREE.SRGBColorSpace;
      map.flipY = false;
      map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      map.needsUpdate = true;
    }
    const mat = new THREE.MeshStandardMaterial({
      map, color: map ? 0xffffff : body === undefined ? 0xaaaaaa : (meta.body === "moon" ? 0xb4b2ad : 0xc08a62),
      roughness: 0.97, metalness: 0,
    });
    this.uniforms = {
      uMode: { value: LAYERS[this.layer] }, uMin: { value: meta.height.min }, uMax: { value: meta.height.max },
      uStep: { value: this.contours.step }, uContours: { value: this.contours.on ? 1 : 0 },
      uMinMap: { value: null }, uMinOn: { value: 0 },
    };
    if (data.minerals) {
      const mt = new THREE.Texture(data.minerals);
      mt.flipY = false; mt.colorSpace = THREE.SRGBColorSpace;
      mt.magFilter = THREE.NearestFilter; mt.needsUpdate = true;
      this.uniforms.uMinMap.value = mt;
      this.uniforms.uMinOn.value = this.minerals ? 1 : 0;
    }
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aElev;\nattribute float aSlope;\nattribute float aShadow;\nattribute float aOps;\nvarying float vElev;\nvarying float vSlope;\nvarying float vShadow;\nvarying float vOps;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvElev = aElev;\nvSlope = aSlope;\nvShadow = aShadow;\nvOps = aOps;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
uniform int uMode; uniform float uMin; uniform float uMax; uniform float uStep; uniform int uContours;
uniform sampler2D uMinMap; uniform float uMinOn;
varying float vElev; varying float vSlope; varying float vShadow; varying float vOps;
vec3 slopeColor(float s){
  if (s < 5.0) return mix(vec3(0.16,0.62,0.45), vec3(0.45,0.78,0.42), s/5.0);
  if (s < 15.0) return mix(vec3(0.45,0.78,0.42), vec3(0.98,0.84,0.30), (s-5.0)/10.0);
  if (s < 25.0) return mix(vec3(0.98,0.84,0.30), vec3(0.96,0.50,0.20), (s-15.0)/10.0);
  if (s < 35.0) return mix(vec3(0.96,0.50,0.20), vec3(0.80,0.15,0.18), (s-25.0)/10.0);
  return vec3(0.45,0.08,0.30);
}
vec3 hypso(float t){
  vec3 a = vec3(0.04,0.17,0.22), b = vec3(0.16,0.42,0.42), c = vec3(0.53,0.62,0.52), d = vec3(0.95,0.86,0.66), e = vec3(0.98,0.72,0.25);
  if (t < 0.25) return mix(a,b,t/0.25);
  if (t < 0.5) return mix(b,c,(t-0.25)/0.25);
  if (t < 0.8) return mix(c,d,(t-0.5)/0.3);
  return mix(d,e,(t-0.8)/0.2);
}`)
        .replace("#include <map_fragment>", `#include <map_fragment>
float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
if (uMode == 1) diffuseColor.rgb = mix(slopeColor(vSlope), slopeColor(vSlope) * (0.55 + lum), 0.35);
else if (uMode == 2) diffuseColor.rgb = hypso(clamp((vElev - uMin) / max(uMax - uMin, 1.0), 0.0, 1.0));
else if (uMode == 3) diffuseColor.rgb = vec3(0.78);
else if (uMode == 4) {
  vec3 oc = vOps > 2.5 ? vec3(0.2,0.78,0.5) : vOps > 1.5 ? vec3(0.98,0.84,0.3) : vOps > 0.5 ? vec3(0.96,0.5,0.2) : vec3(0.75,0.15,0.18);
  diffuseColor.rgb = mix(oc, oc * (0.6 + lum), 0.3);
}
#ifdef USE_MAP
if (uMinOn > 0.5) { vec4 mm = texture2D(uMinMap, vMapUv); diffuseColor.rgb = mix(diffuseColor.rgb, mm.rgb * 1.05, mm.a * 0.78); }
#endif
if (uContours == 1) {
  float c = vElev / uStep;
  float w = fwidth(c);
  float line = 1.0 - smoothstep(0.0, 1.2 * w, abs(fract(c - 0.5) - 0.5));
  float major = 1.0 - smoothstep(0.0, 1.6 * w / 5.0, abs(fract(c / 5.0 - 0.5) - 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.52), clamp(line * 0.55 + major * 0.35, 0.0, 0.9));
}`)
        .replace("#include <aomap_fragment>", `reflectedLight.directDiffuse *= vShadow;
reflectedLight.directSpecular *= vShadow;
#include <aomap_fragment>`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.y = this.exag;
    this.scene.add(this.mesh);
    this.overlays.scale.y = this.exag;

    this.applyBody(data.body, meta.body);
    if (this.vehicle) { this.scene.remove(this.vehicle); this.vehicle = null; }
    this.routes = [];
    this.buildOverlays();
    this.camera.near = Math.max(0.5, S / 20000);
    this.camera.far = S * 12;
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = S * 3;
    this.controls.minDistance = S / 400;
    if (!this._camSet) {
      this._camSet = true;
      // descida orbital: começa bem alto e desce até a vista inicial (pula se animações estiverem pausadas)
      if (document.documentElement.classList.contains("calm")) this.resetView();
      else { this.setCamState({ p: [0.02, 2.6, 0.35], t: [0, 0, 0] }); this.flyTo({ p: [0.0, 0.46, 0.6], t: [0, -0.02, 0.04] }, 3200); }
    }
    this.dirty = true;
  }

  applyBody(B, key) {
    const S = this.S;
    this.ambient.color.set(B.ambientColor);
    this.ambient.groundColor.set(key === "moon" ? "#000000" : "#3a2a20");
    this.ambient.intensity = B.ambient * 3;
    this.sun.color.set(B.sunColor);
    this.sun.intensity = B.sunI;
    // céu
    const cv = document.createElement("canvas"); cv.width = 2; cv.height = 256;
    const g = cv.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, B.sky[1]); grad.addColorStop(0.62, B.sky[0]); grad.addColorStop(1, B.sky[0]);
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.fog = key === "moon" ? null : new THREE.Fog(B.fog, S * 1.2, S * 5);
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry.dispose(); this.stars = null; }
    if (key === "moon") {
      const N = 2500, p = new Float32Array(N * 3), r = S * 8;
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        p[i * 3] = r * s * Math.cos(t); p[i * 3 + 1] = Math.abs(r * u); p[i * 3 + 2] = r * s * Math.sin(t);
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
      this.scene.add(this.stars);
    }
  }

  uvToWorld(u, v, lift = 0) {
    const h = heightAt(this.data, u, v) - this.mid;
    return new THREE.Vector3((u - 0.5) * this.S, h + lift, (v - 0.5) * this.S);
  }

  line(points, color, opacity = 1, width = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, linewidth: width, depthTest: true });
    const l = new THREE.Line(g, m);
    l.renderOrder = 2;
    this.overlays.add(l);
    return l;
  }

  squareUV(cu, cv, half, lift) {
    const pts = [], k = 60;
    const corners = [[cu - half, cv - half], [cu + half, cv - half], [cu + half, cv + half], [cu - half, cv + half], [cu - half, cv - half]];
    for (let s = 0; s < 4; s++) {
      const [a, b] = [corners[s], corners[s + 1]];
      for (let i = 0; i <= k; i++) pts.push(this.uvToWorld(a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k, lift));
    }
    return pts;
  }

  label(text, u, v, cls, onClick) {
    const div = document.createElement(onClick ? "button" : "div");
    div.className = `t3-label ${cls || ""}`;
    div.innerHTML = `<i></i><span>${text}</span>`;
    if (onClick) { div.type = "button"; div.addEventListener("click", (e) => { e.stopPropagation(); onClick(); }); }
    const obj = new CSS2DObject(div);
    obj.position.copy(this.uvToWorld(u, v, this.S / 400));
    obj.center.set(0, 1);
    this.overlays.add(obj);
    return obj;
  }

  buildOverlays() {
    // os objetos ficam num grupo com escala y = exagero: posições em altura real
    this.overlays.clear();
    this.labels.domElement.innerHTML = "";
    const { meta } = this.data;
    const lift = this.S / 1500;
    this.cellLine = null;
    if (meta.cell_m && this.flags.cell) {
      const half = meta.cell_m / meta.size_m / 2;
      this.cellLine = this.line(this.squareUV(0.5, 0.5, half, lift), 0xffd166, 0.95);
    }
    if (this.flags.path) {
      for (const p of meta.paths || []) {
        for (const run of p.runs) this.line(run.map(([u, v]) => this.uvToWorld(u, v, lift * 1.4)), 0xffffff, 0.95);
        // marcos do trajeto: primeira parada de cada intervalo de 250 sóis dentro da cena
        const seen = new Set();
        for (const st of meta.kind === "overview" ? [] : p.stops || []) {
          const k = Math.floor(st.sol / 250);
          if (seen.has(k) || st.u < 0.03 || st.u > 0.97 || st.v < 0.03 || st.v > 0.97) continue;
          if ((meta.pois || []).some((q) => Math.hypot(q.u - st.u, q.v - st.v) < 0.04)) continue; // não cobre outro rótulo
          seen.add(k);
          this.label(`Sol ${st.sol}`, st.u, st.v, "sol");
        }
      }
    }
    if (this.flags.labels) {
      for (const p of meta.pois || []) {
        if (p.kind === "site") {
          this.line(this.squareUV(p.u, p.v, p.half, lift * 2), 0xffd166, 0.95);
          this.label(p.name, p.u, p.v, "site", () => this.cb.onSite?.(p.site));
        } else this.label(p.name, p.u, p.v, p.kind);
      }
    }
    if (this.profilePts) this.drawProfile(...this.profilePts);
    for (const r of this.routes || []) {
      if (!r?.pts?.length) continue;
      this.line(r.pts.map((p) => this.uvToWorld(p.u, p.v, this.S / 700)), r.color ?? 0x59e0ff, 1);
      if (r.label) this.label(r.label, r.pts[0].u, r.pts[0].v, "pin");
    }
    this.dirty = true;
  }

  // ------------------------------------------------------------------ controles públicos
  setExaggeration(x) {
    this.exag = x;
    if (this.mesh) { this.mesh.scale.y = x; this.overlays.scale.y = x; }
    this.placeVehicle();
    this.dirty = true;
  }

  setLayer(name) { this.layer = name; if (this.uniforms) this.uniforms.uMode.value = LAYERS[name]; this.dirty = true; }

  setContours(on, step) {
    this.contours = { on, step };
    if (this.uniforms) { this.uniforms.uContours.value = on ? 1 : 0; this.uniforms.uStep.value = step; }
    this.dirty = true;
  }

  setMinerals(on) {
    this.minerals = on;
    if (this.uniforms?.uMinMap.value) this.uniforms.uMinOn.value = on ? 1 : 0;
    this.dirty = true;
  }

  setFlags(f) { this.flags = { ...this.flags, ...f }; if (this.data) this.buildOverlays(); }

  setSun(azDeg, elDeg) {
    this.sunAzEl = [azDeg, elDeg];
    if (!this.S) return;
    const az = (azDeg * Math.PI) / 180, el = (Math.max(elDeg, -2) * Math.PI) / 180, d = this.S * 2.5;
    // x leste, z sul: azimute a partir do norte (−z), horário
    this.sun.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
    this.sun.target.position.set(0, 0, 0);
    const B = this.data.body;
    const up = Math.max(0, Math.min(1, (elDeg + 1) / 6));
    // Regolito lunar não é lambertiano (lei de Lommel-Seeliger): com Sol rasante continua claro.
    // Aproximação: compensa parte do cos(incidência) quando o Sol está baixo.
    const ls = this.data.meta.body === "moon" ? Math.min(5, Math.max(1, 0.5 / Math.max(Math.sin(Math.max(elDeg, 0.5) * Math.PI / 180), 0.02))) : 1;
    this.sun.intensity = B.sunI * up * ls;
    this.ambient.intensity = B.ambient * 3 * (this.data.meta.body === "moon" ? 1 : 0.35 + 0.65 * Math.max(0, Math.min(1, (elDeg + 4) / 14)));
    this.dirty = true;
  }

  /** Máscara de sombra calculada no relevo (Float32Array n×n, 1 = sol). */
  setShadowMask(mask) {
    if (!this.shadowAttr || mask.length !== this.shadowAttr.array.length) return;
    this.shadowAttr.array.set(mask);
    this.shadowAttr.needsUpdate = true;
    this.dirty = true;
  }

  /** Contagem de critérios atendidos por ponto (0..3) para a camada "Janela operacional". */
  setOpsMask(arr) {
    if (!this.opsAttr || arr.length !== this.opsAttr.array.length) return;
    this.opsAttr.array.set(arr); this.opsAttr.needsUpdate = true; this.dirty = true;
  }

  getShadowMask() { return this.shadowAttr?.array ?? null; }

  /** Rotas (lista de {u, v}) desenhadas sobre o relevo. */
  setRoutes(routes) {
    this.routes = routes;
    if (this.data) this.buildOverlays();
  }

  /** Veículo em escala real apoiado no terreno: { key, u, v, length, heading }. */
  async setVehicle(spec) {
    if (this.vehicle) { this.scene.remove(this.vehicle); this.vehicle = null; this.dirty = true; }
    this._vehReq = spec;
    if (!spec || !this.data) return;
    let obj;
    try {
      obj = PROCEDURAL[spec.key] ? PROCEDURAL[spec.key]() : await loadGLB(GLB[spec.key]);
    } catch (e) { console.error(e); return; }
    if (this._vehReq !== spec) return;
    const g = fitToLength(obj, spec.length);
    g.rotation.y = ((spec.heading ?? 0) * Math.PI) / 180;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    this.vehicle = g;
    this.placeVehicle();
    this.scene.add(g);
    this.dirty = true;
  }

  placeVehicle() {
    const v = this.vehicle, s = this._vehReq;
    if (!v || !s) return;
    const h = (heightAt(this.data, s.u, s.v) - this.mid) * this.exag;
    v.position.set((s.u - 0.5) * this.S, h, (s.v - 0.5) * this.S);
  }

  setProfile(a, b) {
    this.profilePts = a && b ? [a, b] : null;
    if (this.data) this.buildOverlays();
  }

  drawProfile(a, b) {
    const pts = [];
    for (let i = 0; i <= 200; i++) pts.push(this.uvToWorld(a.u + (b.u - a.u) * i / 200, a.v + (b.v - a.v) * i / 200, this.S / 900));
    this.line(pts, 0x59e0ff, 1);
    this.label("A", a.u, a.v, "pin");
    this.label("B", b.u, b.v, "pin");
  }

  // estado de câmera relativo ao tamanho da cena (para sincronizar as vistas gêmeas)
  getCamState() {
    const S = this.S || 1, e = this.exag;
    const p = this.camera.position, t = this.controls.target;
    return { p: [p.x / S, p.y / S / e, p.z / S], t: [t.x / S, t.y / S / e, t.z / S] };
  }

  setCamState(s) {
    if (!s || !this.S || this.mode === "walk") return;
    const S = this.S, e = this.exag;
    this._syncing = true;
    this.camera.position.set(s.p[0] * S, s.p[1] * S * e, s.p[2] * S);
    this.controls.target.set(s.t[0] * S, s.t[1] * S * e, s.t[2] * S);
    this.controls.update();
    this._syncing = false;
    this.dirty = true;
  }

  resetView() {
    this.setCamState({ p: [0.0, 0.46, 0.6], t: [0, -0.02, 0.04] });
  }

  /** Voo suave até um estado de câmera (tour guiado). */
  flyTo(s, ms = 2400) {
    if (!this.S) return Promise.resolve();
    const from = this.getCamState();
    const t0 = performance.now();
    this._flying = true;
    return new Promise((res) => {
      this._fly = (now) => {
        const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
        this._syncing = true;
        this.setCamState({ p: mix(from.p, s.p), t: mix(from.t, s.t) });
        this._syncing = false;
        this.cb.onCamera?.(this.getCamState(), true);
        if (k >= 1) { this._fly = null; this._flying = false; res(); }
      };
    });
  }

  cancelFly() { this._fly = null; this._flying = false; }

  /** Descida orbital até a vista inicial (usada ao fim da animação do globo). */
  descend() {
    if (!this.S || this.mode === "walk") return;
    this.setCamState({ p: [0.02, 2.6, 0.35], t: [0, 0, 0] });
    this.flyTo({ p: [0.0, 0.46, 0.6], t: [0, -0.02, 0.04] }, 3000);
  }

  setMode(mode, start) {
    if (!this.data) return; // a página chama de novo quando a cena carregar
    if (mode === this.mode && !(mode === "walk" && start)) return;
    this.mode = mode;
    if (mode === "walk") {
      this.cancelFly();
      this.controls.enabled = false;
      const t = this.controls.target;
      if (start) t.set((start.u - 0.5) * this.S, 0, (start.v - 0.5) * this.S);
      const u = t.x / this.S + 0.5, v = t.z / this.S + 0.5;
      const g = (heightAt(this.data, u, v) - this.mid) * this.exag;
      this.camera.position.set(t.x, g + EYE, t.z);
      this.camera.lookAt(t.x + 10, g + EYE - 3.5, t.z - 10); // olhando um pouco para o chão
      this.overlays.visible = false;                          // linhas e rótulos ficariam flutuando na altura dos olhos
      this.labels.domElement.style.display = "none";
      this.vel.set(0, 0, 0);
      this.camera.near = 0.2; this.camera.updateProjectionMatrix();
    } else {
      if (this.pointerLock.isLocked) this.pointerLock.unlock();
      this.overlays.visible = true;
      this.labels.domElement.style.display = "";
      this.controls.enabled = true;
      this.camera.near = Math.max(0.5, this.S / 20000); this.camera.updateProjectionMatrix();
      const p = this.camera.position;
      this.controls.target.set(p.x, p.y - EYE, p.z);
      this.camera.position.set(p.x, p.y + this.S * 0.12, p.z + this.S * 0.18);
      this.controls.update();
    }
    this.dirty = true;
  }

  lockWalk() { if (this.mode === "walk" && !this.touch) this.pointerLock.lock(); }

  /** Controles por toque (celular): joystick (x, y em -1..1), olhar (dx, dy em px) e pulo. */
  touchMove(x, y) { this.touch = true; this.joy = { x, y }; }
  touchLook(dx, dy) {
    this.touch = true;
    const e = new THREE.Euler(0, 0, 0, "YXZ").setFromQuaternion(this.camera.quaternion);
    e.y -= dx * 0.005; e.x = Math.max(-1.45, Math.min(1.45, e.x - dy * 0.005));
    this.camera.quaternion.setFromEuler(e);
    this.dirty = true;
  }
  jump() {
    if (this.mode !== "walk" || !this.onGround) return;
    this.vel.y = JUMP_V; this.onGround = false; this.jumpStart = this.camera.position.y; this.jumpMax = 0;
  }
  setRun(on) { this.running = on; }

  // ------------------------------------------------------------------ interação
  pick(e) {
    if (!this.mesh) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObject(this.mesh, false)[0];
    if (!hit) return null;
    const u = hit.point.x / this.S + 0.5, v = hit.point.z / this.S + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const ll = uvToLatLon(this.data, u, v);
    return { u, v, ...ll, h: heightAt(this.data, u, v), slope: slopeAt(this.data, u, v) };
  }

  hover(e) {
    if (this.mode === "walk" || this._hoverBusy) return;
    this._hoverBusy = true;
    requestAnimationFrame(() => { this._hoverBusy = false; this.cb.onHover?.(this.pick(e)); });
  }

  click(e) {
    if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > 5) return;
    if (this.mode === "walk") { this.lockWalk(); return; }
    const p = this.pick(e);
    if (p) this.cb.onPick?.(p);
  }

  key(e) {
    if (this.mode !== "walk") return;
    const down = e.type === "keydown";
    this.keys[e.code] = down;
    if (down && e.code === "Space") this.jump();
    if (["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code) && this.pointerLock.isLocked) e.preventDefault();
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this._fly) this._fly(performance.now());
    if (this.mode === "walk" && this.data) {
      const k = this.keys, speed = (k.ShiftLeft || k.ShiftRight || this.running) ? RUN : WALK;
      const j = this.joy || { x: 0, y: 0 };
      const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - j.y;
      const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + j.x;
      if (fwd) this.pointerLock.moveForward(fwd * speed * dt);
      if (side) this.pointerLock.moveRight(side * speed * dt);
      const p = this.camera.position, half = this.S / 2 - 1;
      p.x = Math.max(-half, Math.min(half, p.x)); p.z = Math.max(-half, Math.min(half, p.z));
      const u = p.x / this.S + 0.5, v = p.z / this.S + 0.5;
      const ground = (heightAt(this.data, u, v) - this.mid) * this.exag + EYE;
      this.vel.y -= this.data.body.g * dt;
      p.y += this.vel.y * dt;
      if (!this.onGround && this.jumpStart != null) this.jumpMax = Math.max(this.jumpMax, p.y - this.jumpStart);
      if (p.y <= ground) {
        if (!this.onGround && this.jumpStart != null) this.cb.onJump?.(this.jumpMax);
        p.y = ground; this.vel.y = 0; this.onGround = true; this.jumpStart = null;
      }
      this.cb.onWalk?.({ u, v, h: heightAt(this.data, u, v), slope: slopeAt(this.data, u, v), ...uvToLatLon(this.data, u, v) });
      this.dirty = true;
    } else if (this.controls.enabled) {
      this.controls.update();
    }
    if (this.dirty || this._fly) {
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL("image/png"); }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("keyup", this._onKey);
    this.controls.dispose();
    this.pointerLock.dispose?.();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.renderer.dispose();
    this.el.innerHTML = "";
  }
}
