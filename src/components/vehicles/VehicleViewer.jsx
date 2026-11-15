// Visualizador 3D de um veículo em escala real, ao lado de uma pessoa de 1,75 m para comparar o tamanho.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLB, PROCEDURAL, fitModel, loadGLB } from "../../lib/terrain3d/models.js";
import { useTr } from "../../hooks/useSettings.jsx";
import "../../assets/css/vehicles.css";

function person() {
  const m = new THREE.MeshStandardMaterial({ color: 0x8fa6b8, roughness: 0.8, transparent: true, opacity: 0.55 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 6, 16), m); body.position.y = 0.73; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), m); head.position.y = 1.62; g.add(head);
  return g;
}

export default function VehicleViewer({ vehicle, calm, spotlight = false }) {
  const host = useRef(null);
  const st = useRef(null);
  const [status, setStatus] = useState("");
  const tr = useTr();

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    let spot = null, beam = null;
    if (spotlight) {
      // palco: quase escuro, um foco de luz vindo de cima e um cone de luz visível
      scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x120c0a, 0.35));
      spot = new THREE.SpotLight(0xfff1d6, 160, 30, 0.42, 0.55, 1.4);
      spot.position.set(0, 9, 0.5); scene.add(spot, spot.target);
      const rim = new THREE.DirectionalLight(0x6fa8ff, 0.5); rim.position.set(-5, 3, -6); scene.add(rim);
      beam = new THREE.Mesh(new THREE.ConeGeometry(3.6, 9, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 4.5; scene.add(beam);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.9 }));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.42, 96), new THREE.MeshBasicMaterial({ color: 0xf2b53a, transparent: true, opacity: 0.55 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
    } else {
      scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a2a20, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(4, 6, 3); scene.add(sun);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);
      const grid = new THREE.PolarGridHelper(12, 12, 12, 64, 0x5a4a40, 0x3a302a); grid.position.y = 0.002; scene.add(grid);
    }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.05; controls.autoRotateSpeed = 0.8;
    const holder = new THREE.Group(); scene.add(holder);
    const who = person(); scene.add(who);
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    st.current = { scene, camera, controls, holder, who, renderer, spot, beam };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { if (st.current) st.current.controls.autoRotate = !calm; }, [calm]);

  useEffect(() => {
    const s = st.current;
    if (!s || !vehicle) return;
    let alive = true;
    s.holder.clear();
    setStatus(tr("Carregando modelo…", "Loading model…"));
    const load = PROCEDURAL[vehicle.key] ? Promise.resolve(PROCEDURAL[vehicle.key]()) : loadGLB(GLB[vehicle.key], (f) => alive && setStatus(`${tr("Carregando modelo…", "Loading model…")} ${Math.round(f * 100)}%`));
    load.then((obj) => {
      if (!alive) return;
      const g = fitModel(obj, vehicle.key, vehicle.len);
      s.holder.add(g);
      const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
      const big = Math.max(size.x, size.y, size.z, 1.75);
      s.who.position.set(size.x / 2 + 0.6, 0, 0);
      if (s.spot) {
        // o foco acompanha o tamanho do veículo
        const r = Math.max(size.x, size.z) * 0.85 + 0.6;
        s.spot.position.set(0, r * 2.6, 0.3); s.spot.angle = Math.atan(r / (r * 2.6)) * 1.25; s.spot.distance = r * 8;
        s.beam.scale.set(r / 3.6, (r * 2.6) / 9, r / 3.6); s.beam.position.y = (r * 2.6) / 2;
      }
      const d = big * 2.2;
      s.camera.position.set(d * 0.75, big * 0.75, d);
      s.controls.target.set(0.3, Math.min(size.y, 1.75) / 2, 0);
      s.controls.minDistance = big * 0.6; s.controls.maxDistance = big * 6;
      s.controls.saveState();
      setStatus("");
    }).catch(() => alive && setStatus(tr("Não foi possível baixar o modelo da NASA agora.", "Could not download the NASA model right now.")));
    return () => { alive = false; };
  }, [vehicle]);

  const zoom = (action) => {
    const controls = st.current?.controls;
    if (!controls) return;
    if (action === "in") controls.dollyIn(1.25);
    else if (action === "out") controls.dollyOut(1.25);
    else controls.reset();
    controls.update();
  };

  return (
    <div className="vh-viewer">
      <div ref={host} className="vh-canvas" aria-label={`${tr("Modelo 3D", "3D model")}: ${vehicle?.name}`} role="img" />
      <div className="vh-zoom" role="group" aria-label={tr("Zoom do modelo", "Model zoom")}>
        <button type="button" onClick={() => zoom("in")} aria-label={tr("Aproximar", "Zoom in")} title={tr("Aproximar", "Zoom in")}>+</button>
        <button type="button" onClick={() => zoom("out")} aria-label={tr("Afastar", "Zoom out")} title={tr("Afastar", "Zoom out")}>−</button>
        <button type="button" onClick={() => zoom("reset")} aria-label={tr("Restaurar zoom", "Reset zoom")} title={tr("Restaurar zoom", "Reset zoom")}>1:1</button>
      </div>
      {status && <p className="vh-status" role="status">{status}</p>}
      <p className="vh-hint">{tr("Arraste para girar · role para aproximar · silhueta = pessoa de 1,75 m", "Drag to rotate · scroll to zoom · silhouette = 1.75 m person")}</p>
    </div>
  );
}
