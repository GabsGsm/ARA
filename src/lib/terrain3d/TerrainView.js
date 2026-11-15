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
import { rocksNear } from "../mission/rocks.js";
import { T } from "../i18n.js";

const LAYERS = { imagem: 0, declividade: 1, altitude: 2, relevo: 3, operacoes: 4, protecao: 5 };
const EYE = 1.75;          // altura dos olhos (m)
const WALK = 1.4, RUN = 3.5; // m/s
const JUMP_V = 2.5;        // m/s — o mesmo impulso nos três corpos
const WALK_CAMERA_DISTANCE = 4.5;

function createWalker() {
  const suit = new THREE.MeshStandardMaterial({ color: 0xe7e9e5, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf2b53a, roughness: 0.65 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x25445a, metalness: 0.45, roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333b40, roughness: 0.9 });
  const root = new THREE.Group();
  const addCapsule = (parent, radius, length, material, y) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  };
  const torso = addCapsule(root, 0.23, 0.46, suit, 1.15);
  torso.rotation.x = -0.08;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), suit);
  helmet.position.set(0, 1.67, 0);
  root.add(helmet);
  const faceplate = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), visor);
  faceplate.position.set(0, 1.68, -0.105);
  faceplate.rotation.x = -0.18;
  root.add(faceplate);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.22), dark);
  backpack.position.set(0, 1.18, 0.27);
  root.add(backpack);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.025), trim);
  badge.position.set(0, 1.25, -0.235);
  root.add(badge);

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, 1.39, 0);
    addCapsule(pivot, 0.095, 0.43, suit, -0.24);
    root.add(pivot);
    return pivot;
  });
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.82, 0);
    addCapsule(pivot, 0.12, 0.43, suit, -0.27);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), dark);
    boot.position.set(0, -0.56, -0.04);
    pivot.add(boot);
    root.add(pivot);
    return pivot;
  });
  root.userData.walkingParts = { arms, legs, suit, trim, visor, dark };
  root.traverse((object) => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
  return root;
}

function disposeWalker(walker) {
  walker.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

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
    if (this.mode === "walk") this.setMode("orbit");
    this.data = data;
    const { meta, heights, n, body } = data;
    const S = meta.size_m;
    this.S = S;
    this.mid = (meta.height.min + meta.height.max) / 2;
    if (this.walker) { this.scene.remove(this.walker); disposeWalker(this.walker); this.walker = null; this.walkPos = null; }
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); }
    this.clearOverlays();

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
else if (uMode == 5) {
  vec3 base = diffuseColor.rgb;
  if (vOps > 3.5) base = mix(base, vec3(0.95,0.2,0.25), 0.62);
  else if (vOps > 2.5) base = mix(base, vec3(0.25,0.85,1.0), 0.55);
  else if (vOps > 1.5) base = mix(base, vec3(0.78,0.35,0.95), 0.5);
  else if (vOps > 0.5) base = mix(base, vec3(0.35,0.6,1.0), 0.45);
  diffuseColor.rgb = base;
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
    this.setRockField(null);
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

  corridor(points, width, color, lift) {
    if (points.length < 2) return;
    const centers = points.map((p) => this.uvToWorld(p.u, p.v, lift));
    const positions = [], indices = [], half = width / 2;
    for (let i = 0; i < centers.length; i++) {
      const before = centers[Math.max(0, i - 1)], after = centers[Math.min(centers.length - 1, i + 1)];
      const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
      const ox = (-dz / length) * half, oz = (dx / length) * half, point = points[i];
      const left = this.uvToWorld(point.u + ox / this.S, point.v + oz / this.S, lift);
      const right = this.uvToWorld(point.u - ox / this.S, point.v - oz / this.S, lift);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    this.overlays.add(mesh);
  }

  clearOverlays() {
    for (const object of this.overlays.children) {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose();
    }
    this.overlays.clear();
    this.labels.domElement.innerHTML = "";
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
    this.clearOverlays();
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
          this.label(`${T("Sol", "Sol")} ${st.sol}`, st.u, st.v, "sol");
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
      const lift = Math.max(0.5, Math.min(2, this.S / 5000));
      if (r.corridorWidth > 0) this.corridor(r.pts, r.corridorWidth, r.color ?? 0x59e0ff, lift);
      this.line(r.pts.map((p) => this.uvToWorld(p.u, p.v, r.corridorWidth > 0 ? lift + 0.05 : this.S / 700)), r.color ?? 0x59e0ff, 1);
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

  /** Coloca o veículo em (u, v) com rumo, arfagem e rolagem, e leva a câmera de perseguição junto. */
  poseVehicle(st, dt = 0.016) {
    const v = this.vehicle;
    const h = (heightAt(this.data, st.u, st.v) - this.mid) * this.exag;
    const x = (st.u - 0.5) * this.S, z = (st.v - 0.5) * this.S;
    if (v) {
      v.position.set(x, h, z);
      v.rotation.set(0, 0, 0);
      v.rotateY(Math.PI - st.heading + (this._vehYaw ?? 0));
      v.rotateX((-(st.pitch ?? 0) * Math.PI) / 180);
      v.rotateZ(((st.roll ?? 0) * Math.PI) / 180);
    }
    this.updateRocks(x, z);
    const len = this._vehReq?.length ?? 3;
    const kind = this.chaseKind || "atras";
    const D = kind === "alto" ? Math.max(60, len * 25) : kind === "perto" ? Math.max(4, len * 2.2) : Math.max(10, len * 5);
    const H = kind === "alto" ? D * 0.9 : D * 0.42;
    const dx = Math.sin(st.heading), dz = -Math.cos(st.heading);
    let cx = x - dx * D, cz = z - dz * D;
    const half = this.S / 2;
    cx = Math.max(-half, Math.min(half, cx)); cz = Math.max(-half, Math.min(half, cz));
    const groundC = (heightAt(this.data, cx / this.S + 0.5, cz / this.S + 0.5) - this.mid) * this.exag;
    const want = new THREE.Vector3(cx, Math.max(h + H, groundC + 1.5), cz);
    if (!this._chase) this._chase = want.clone();
    this._chase.lerp(want, Math.min(1, dt * 3));
    this.camera.position.copy(this._chase);
    this.camera.lookAt(x + dx * len, h + len * 0.3, z + dz * len);
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

  focusOnVehicle({ u, v, length }, ms = 2600) {
    if (!this.data || !this.S) return Promise.resolve();
    const S = this.S, e = Math.max(this.exag, 0.1);
    const resolution = this.data.meta.color?.native_res_m ?? this.data.meta.height.native_res_m ?? 1;
    const d = Math.max(100, length * 35, resolution * 80);
    const targetHeight = (heightAt(this.data, u, v) - this.mid) / S;
    const x = u - 0.5 + (d * 0.6) / S, z = v - 0.5 + d / S;
    const cameraU = Math.max(0.001, Math.min(0.999, x + 0.5));
    const cameraV = Math.max(0.001, Math.min(0.999, z + 0.5));
    const cameraGround = (heightAt(this.data, cameraU, cameraV) - this.mid) / S;
    const cameraY = Math.max(targetHeight + (d * 0.7) / S, cameraGround + 12 / (S * e));
    const targetY = targetHeight + Math.max(1, length * 0.3) / (S * e);
    this.controls.minDistance = Math.max(1, length * 1.2);
    return this.flyTo({ p: [x, cameraY, z], t: [u - 0.5, targetY, v - 0.5] }, ms);
  }

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
    if (mode !== "walk" && this.walker) {
      this.scene.remove(this.walker);
      disposeWalker(this.walker);
      this.walker = null;
      this.walkPos = null;
      this._walkJump = 0;
    }
    if (this._ambBase != null && mode !== "drive") { this.ambient.intensity = this._ambBase; this._ambBase = null; }
    if (mode === "drive") {
      this.cancelFly();
      // realce de visualização para dirigir em regiões escuras (ex.: polo sul lunar); não altera a física
      this._ambBase = this.ambient.intensity;
      this.ambient.intensity = Math.max(this._ambBase, this.data?.meta.body === "moon" ? 1.2 : 0.35);
      this.controls.enabled = false;
      if (this.pointerLock.isLocked) this.pointerLock.unlock();
      this.overlays.visible = true;
      this.labels.domElement.style.display = "";
      this.camera.near = 0.3; this.camera.updateProjectionMatrix();
      this._chase = null;
      this.dirty = true;
      return;
    }
    if (mode === "walk") {
      this.cancelFly();
      this.controls.enabled = false;
      if (this.walker) { this.scene.remove(this.walker); disposeWalker(this.walker); }
      const t = this.controls.target;
      const u = start?.u ?? t.x / this.S + 0.5, v = start?.v ?? t.z / this.S + 0.5;
      t.set((u - 0.5) * this.S, 0, (v - 0.5) * this.S);
      const g = (heightAt(this.data, u, v) - this.mid) * this.exag;
      this.walkPos = new THREE.Vector3(t.x, g, t.z);
      this._walkJump = 0;
      this.walker = createWalker();
      this.walker.position.copy(this.walkPos);
      this.scene.add(this.walker);
      this.camera.position.set(t.x, g + EYE + 1.1, t.z + WALK_CAMERA_DISTANCE);
      this.camera.rotation.order = "YXZ";
      this.camera.lookAt(t.x, g + 1.05, t.z);
      this.overlays.visible = false;                          // linhas e rótulos ficariam flutuando na altura dos olhos
      this.labels.domElement.style.display = "none";
      this.vel.set(0, 0, 0);
      this.onGround = true;
      this._walkAnim = 0;
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
    this.vel.y = JUMP_V; this.onGround = false; this.jumpStart = this._walkJump ?? 0; this.jumpMax = 0;
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

  /** Aproxima (f < 1) ou afasta (f > 1) a câmera do alvo. */
  zoomBy(f) {
    if (this.mode !== "orbit" || !this.S) return;
    this.cancelFly();
    const t = this.controls.target, p = this.camera.position;
    const d = p.clone().sub(t).multiplyScalar(f);
    const L = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, d.length()));
    p.copy(t).add(d.setLength(L));
    this.controls.update();
    this.dirty = true;
  }

  /** Campo de pedras (modelo estatístico): kAt(x, z) → abundância local; cor das pedras. null desliga. */
  setRockField(kAt, color = 0x7a5a48) {
    if (this.rockMesh) { this.scene.remove(this.rockMesh); this.rockMesh.geometry.dispose(); this.rockMesh.material.dispose(); this.rockMesh = null; }
    this.rockK = kAt; this.rockColor = color; this._rockAt = null; this.dirty = true;
  }

  updateRocks(x, z) {
    if (!this.rockK || !this.data) return;
    if (this._rockAt && Math.hypot(this._rockAt[0] - x, this._rockAt[1] - z) < 6) return;
    this._rockAt = [x, z];
    const list = rocksNear(x, z, 45, this.rockK).filter((r) => r.d >= 0.6 || (r.d >= 0.35 && Math.hypot(r.x - x, r.z - z) < 10));
    const max = Math.min(list.length, 12000);
    if (!this.rockMesh || this.rockMesh.count < max || this.rockMesh.instanceMatrix.count < max) {
      if (this.rockMesh) { this.scene.remove(this.rockMesh); this.rockMesh.geometry.dispose(); this.rockMesh.material.dispose(); }
      const geo = new THREE.IcosahedronGeometry(0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: this.rockColor, roughness: 0.95, flatShading: true });
      this.rockMesh = new THREE.InstancedMesh(geo, mat, Math.max(2000, Math.ceil(max * 1.3)));
      this.scene.add(this.rockMesh);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < max; i++) {
      const r = list[i], u = r.x / this.S + 0.5, v = r.z / this.S + 0.5;
      const g = (heightAt(this.data, u, v) - this.mid) * this.exag;
      e.set(0, r.rot, 0); q.setFromEuler(e); sc.set(r.d, r.h * 2, r.d * 0.85); pos.set(r.x, g + r.h * 0.35, r.z);
      m.compose(pos, q, sc); this.rockMesh.setMatrixAt(i, m);
    }
    this.rockMesh.count = max;
    this.rockMesh.instanceMatrix.needsUpdate = true;
    this.dirty = true;
  }

  /** Modo direção: fn(input, dtReal) → { u, v, heading, pitch, roll } chamado a cada quadro. */
  setDriver(fn) { this.driver = fn; }
  setChaseView(kind) { this.chaseKind = kind; this.dirty = true; }

  key(e) {
    if (this.mode === "drive") {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      this.keys[e.code] = e.type === "keydown";
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.type === "keydown" && e.code === "KeyC") this.chaseKind = this.chaseKind === "alto" ? "perto" : this.chaseKind === "perto" ? "atras" : "alto";
      return;
    }
    if (this.mode !== "walk") return;
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const down = e.type === "keydown";
    this.keys[e.code] = down;
    if (down && e.code === "Space") this.jump();
    // setas e espaço não rolam a página enquanto se caminha
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code) || (this.pointerLock.isLocked && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))) e.preventDefault();
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this._fly) this._fly(performance.now());
    if (this.mode === "walk" && this.data) {
      const k = this.keys, speed = (k.ShiftLeft || k.ShiftRight || this.running) ? RUN : WALK;
      const j = this.joy || { x: 0, y: 0 };
      let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - j.y;
      // sem o mouse travado (teclado só): A/D e ←/→ GIRAM o astronauta; Q/E andam de lado.
      // com o mouse travado: o mouse gira e A/D andam de lado (como num jogo em terceira pessoa).
      const lr = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const strafe = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
      let side = (this.pointerLock.isLocked ? lr : 0) + strafe + j.x;
      if (!this.pointerLock.isLocked && lr) {
        const e = new THREE.Euler(0, 0, 0, "YXZ").setFromQuaternion(this.camera.quaternion);
        e.y -= lr * 1.9 * dt; this.camera.quaternion.setFromEuler(e);
      }
      const inputLength = Math.hypot(fwd, side);
      if (inputLength > 1) { fwd /= inputLength; side /= inputLength; }
      const p = this.walkPos, yaw = new THREE.Euler(0, 0, 0, "YXZ").setFromQuaternion(this.camera.quaternion).y, half = this.S / 2 - 1;
      // frente da câmera (three.js olha para −Z): (−sen yaw, −cos yaw); direita: (cos yaw, −sen yaw)
      p.x += (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * speed * dt;
      p.z += (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * speed * dt;
      p.x = Math.max(-half, Math.min(half, p.x)); p.z = Math.max(-half, Math.min(half, p.z));
      const u = p.x / this.S + 0.5, v = p.z / this.S + 0.5;
      const elevation = (heightAt(this.data, u, v) - this.mid) * this.exag;
      this.vel.y -= this.data.body.g * dt;
      this._walkJump = Math.max(0, (this._walkJump ?? 0) + this.vel.y * dt);
      if (!this.onGround && this.jumpStart != null) this.jumpMax = Math.max(this.jumpMax, this._walkJump - this.jumpStart);
      if (this._walkJump <= 0) {
        if (!this.onGround && this.jumpStart != null) this.cb.onJump?.(this.jumpMax);
        this.vel.y = 0; this.onGround = true; this.jumpStart = null;
      }
      const ground = (heightAt(this.data, u, v) - this.mid) * this.exag;
      p.y = ground;
      if (this.walker) {
        this.walker.position.set(p.x, ground + this._walkJump, p.z);
        this.walker.rotation.y = yaw;
        const parts = this.walker.userData.walkingParts, moving = inputLength > 0.02;
        this._walkAnim += dt * (moving ? speed * 1.8 : 0);
        const swing = moving ? Math.sin(this._walkAnim) * 0.48 : 0;
        parts.legs[0].rotation.x = swing; parts.legs[1].rotation.x = -swing;
        parts.arms[0].rotation.x = -swing * 0.7; parts.arms[1].rotation.x = swing * 0.7;
      }
      const cameraX = p.x + Math.sin(yaw) * WALK_CAMERA_DISTANCE;
      const cameraZ = p.z + Math.cos(yaw) * WALK_CAMERA_DISTANCE;
      const cameraU = cameraX / this.S + 0.5, cameraV = cameraZ / this.S + 0.5;
      const cameraGround = (heightAt(this.data, cameraU, cameraV) - this.mid) * this.exag;
      this.camera.position.set(cameraX, cameraGround + EYE + 1.1 + this._walkJump, cameraZ);
      this.cb.onWalk?.({ u, v, h: heightAt(this.data, u, v), slope: slopeAt(this.data, u, v), ...uvToLatLon(this.data, u, v) });
      this.dirty = true;
    } else if (this.mode === "drive" && this.data) {
      const k = this.keys, j = this.joy || { x: 0, y: 0 };
      const input = {
        throttle: (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - j.y,
        steer: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + j.x,
        brake: !!k.Space,
      };
      const st = this.driver?.(input, dt);
      if (st) this.poseVehicle(st, dt);
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
    if (this.walker) disposeWalker(this.walker);
    this.renderer.dispose();
    this.el.innerHTML = "";
  }
}
