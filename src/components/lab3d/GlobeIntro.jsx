// Descida animada: globo de Marte/Lua (mosaico real) gira até o sítio e a câmera desce até ele,
// depois some e entrega para a descida no relevo (TerrainView). Pula com o botão ou com animações pausadas.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { dataUrl, fmt } from "../../lib/format.js";

const R_KM = { mars: 3389.5, moon: 1737.4 };
const DUR = 5200;

function dirFor(lat, lon) {
  // SphereGeometry do three: u = (lon + 180) / 360 -> phi = lon + 180°
  const la = (lat * Math.PI) / 180, phi = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(la), Math.sin(la), Math.sin(phi) * Math.cos(la));
}

export default function GlobeIntro({ body, lat, lon, name, onDone, slow = false }) {
  const box = useRef(null);
  const [alt, setAlt] = useState(null);
  const [fade, setFade] = useState(false);
  const done = useRef(false);
  const finish = () => { if (done.current) return; done.current = true; setFade(true); setTimeout(onDone, 650); };

  useEffect(() => {
    const el = box.current, w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.001, 100);
    const tex = new THREE.TextureLoader().load(dataUrl(`data/globe/${body}.jpg`), () => { start = performance.now(); });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    scene.add(globe);
    // atmosfera fina (só Marte) e luz
    if (body === "mars") {
      const atm = new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 32), new THREE.MeshBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0.12, side: THREE.BackSide }));
      scene.add(atm);
    }
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    scene.add(sun, new THREE.AmbientLight(0xffffff, body === "moon" ? 0.08 : 0.25));
    // estrelas
    const N = 1500, p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40); p.set([v.x, v.y, v.z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false })));
    // marcador do sítio
    const target = dirFor(lat, lon);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.03, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true }));
    ring.position.copy(target.clone().multiplyScalar(1.002));
    ring.lookAt(target.clone().multiplyScalar(2));
    globe.add(ring);

    // começa vendo o globo inteiro, com o sítio deslocado 70° em longitude; termina bem perto, olhando para ele
    const startDir = dirFor(lat * 0.4, lon - 70);
    let start = null, raf = 0;
    const R = R_KM[body];
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (start == null) { renderer.render(scene, cam); return; }
      const k = Math.min(1, (now - start) / (slow ? DUR * 8 : DUR));
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const dir = startDir.clone().lerp(target, Math.min(1, e * 1.4)).normalize();
      const dist = 3.4 * Math.pow(1.012 / 3.4, Math.pow(e, 1.6)); // queda exponencial da altitude
      cam.position.copy(dir.clone().multiplyScalar(dist));
      cam.lookAt(dir.clone().multiplyScalar(e > 0.7 ? 1 : 0));
      cam.up.set(0, 1, 0);
      sun.position.copy(dir.clone().multiplyScalar(5).add(new THREE.Vector3(2, 3, 1)));
      ring.material.opacity = 0.6 + 0.4 * Math.sin(now / 160);
      setAlt((dist - 1) * R);
      renderer.render(scene, cam);
      if (k >= 1) finish();
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); renderer.dispose(); tex.dispose(); el.innerHTML = ""; };
  }, [body, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`t3-intro ${fade ? "out" : ""}`}>
      <div ref={box} className="absolute inset-0" />
      <div className="t3-intro-hud">
        <small>Aproximando de</small>
        <strong>{name}</strong>
        <span>ALT {alt == null ? "…" : `${fmt(alt, alt > 100 ? 0 : 1)} km`}</span>
      </div>
      <button type="button" className="t3-intro-skip" onClick={finish}>Pular ›</button>
    </div>
  );
}
