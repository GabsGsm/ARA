// Visualizador 3D de um veículo em escala real, ao lado de uma pessoa de 1,75 m para comparar o tamanho.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLB, PROCEDURAL, fitToLength, loadGLB } from "../../lib/terrain3d/models.js";

function person() {
  const m = new THREE.MeshStandardMaterial({ color: 0x8fa6b8, roughness: 0.8, transparent: true, opacity: 0.55 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 6, 16), m); body.position.y = 0.73; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), m); head.position.y = 1.62; g.add(head);
  return g;
}

export default function VehicleViewer({ vehicle, calm }) {
  const host = useRef(null);
  const st = useRef(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a2a20, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(4, 6, 3); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const grid = new THREE.PolarGridHelper(12, 12, 12, 64, 0x5a4a40, 0x3a302a); grid.position.y = 0.002; scene.add(grid);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.05; controls.autoRotateSpeed = 0.8;
    const holder = new THREE.Group(); scene.add(holder);
    const who = person(); scene.add(who);
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    st.current = { scene, camera, controls, holder, who, renderer };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { if (st.current) st.current.controls.autoRotate = !calm; }, [calm]);

  useEffect(() => {
    const s = st.current;
    if (!s || !vehicle) return;
    let alive = true;
    s.holder.clear();
    setStatus("Carregando modelo…");
    const load = PROCEDURAL[vehicle.key] ? Promise.resolve(PROCEDURAL[vehicle.key]()) : loadGLB(GLB[vehicle.key], (f) => alive && setStatus(`Carregando modelo… ${Math.round(f * 100)}%`));
    load.then((obj) => {
      if (!alive) return;
      const g = fitToLength(obj, vehicle.len);
      s.holder.add(g);
      const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
      const big = Math.max(size.x, size.y, size.z, 1.75);
      s.who.position.set(size.x / 2 + 0.6, 0, 0);
      const d = big * 2.2;
      s.camera.position.set(d * 0.75, big * 0.75, d);
      s.controls.target.set(0.3, Math.min(size.y, 1.75) / 2, 0);
      s.controls.minDistance = big * 0.6; s.controls.maxDistance = big * 6;
      setStatus("");
    }).catch(() => alive && setStatus("Não foi possível baixar o modelo da NASA agora."));
    return () => { alive = false; };
  }, [vehicle]);

  return (
    <div className="vh-viewer">
      <div ref={host} className="vh-canvas" aria-label={`Modelo 3D: ${vehicle?.name}`} role="img" />
      {status && <p className="vh-status" role="status">{status}</p>}
      <p className="vh-hint">Arraste para girar · role para aproximar · silhueta = pessoa de 1,75 m</p>
    </div>
  );
}
