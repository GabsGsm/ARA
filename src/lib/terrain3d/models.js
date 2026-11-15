// Modelos 3D dos veículos: GLB oficiais da NASA (domínio público, carregados direto de assets.science.nasa.gov)
// e dois modelos simplificados feitos aqui com as dimensões publicadas (Sojourner e o carro lunar das Apollo),
// porque a NASA não publica um GLB gratuito deles.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const NASA = "https://assets.science.nasa.gov/content/dam/science";
export const GLB = {
  perseverance: `${NASA}/psd/mars/resources/gltf_files/25042_Perseverance.glb`,
  curiosity: `${NASA}/psd/mars/resources/gltf_files/24584_Curiosity_static.glb`,
  mer: `${NASA}/psd/mars/resources/gltf_files/24883_MER_static.glb`,
  ingenuity: `${NASA}/psd/mars/resources/gltf_files/25043_Ingenuity_v3.glb`,
  lunar_module: `${NASA}/cds/3d/resources/model/apollo-lunar-module/Apollo%20Lunar%20Module.glb`,
  astronaut: `${NASA}/cds/3d/resources/model/astronaut/Astronaut.glb`,
};

const cache = new Map();
const loader = new GLTFLoader();

/** Carrega um GLB (com cache) e devolve um clone da cena. onProgress(0..1). */
export function loadGLB(url, onProgress) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((res, rej) => loader.load(url, (g) => res(g.scene), (e) => e.total && onProgress?.(e.loaded / e.total), rej)));
  }
  return cache.get(url).then((s) => s.clone(true));
}

/** Ajusta o modelo para ter `length` metros na maior dimensão horizontal, apoiado no chão (y = 0) e centrado. */
export function fitToLength(obj, length) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const k = length / Math.max(size.x, size.z, 1e-6);
  obj.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  const g = new THREE.Group(); g.add(obj);
  return g;
}

const mat = (color, metal = 0.3, rough = 0.6) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });

function wheel(r, w, color) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), mat(color, 0.6, 0.4));
  t.rotation.z = Math.PI / 2; g.add(t);
  for (let i = 0; i < 14; i++) { // garras
    const c = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, r * 0.08, r * 0.12), mat(0x9aa0a6, 0.5, 0.5));
    const a = (i / 14) * Math.PI * 2; c.position.set(0, Math.sin(a) * r, Math.cos(a) * r); c.rotation.x = -a; g.add(c);
  }
  return g;
}

/** Sojourner (Mars Pathfinder, 1997): 65 × 48 × 30 cm, 10,6 kg, rodas de 13 cm, rocker-bogie. Modelo simplificado. */
export function sojourner() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.42), mat(0xd4a64a, 0.8, 0.35)); body.position.y = 0.17; g.add(body);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.012, 0.62), mat(0x2b3a8f, 0.4, 0.3)); panel.position.y = 0.24; g.add(panel);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 8), mat(0xffffff)); ant.position.set(0.18, 0.4, -0.25); g.add(ant);
  const apxs = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 16), mat(0xc0c4c8, 0.7, 0.3)); apxs.rotation.x = Math.PI / 2; apxs.position.set(0, 0.12, -0.25); g.add(apxs);
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.22, 0, 0.22]) { const w = wheel(0.065, 0.07, 0xc8ccd0); w.position.set(x, 0.065, z); g.add(w); }
    const rock = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.46), mat(0xb0b4b8, 0.7, 0.3)); rock.position.set(x * 0.92, 0.13, 0); rock.rotation.x = 0.12; g.add(rock);
  }
  return g;
}

/** Carro lunar das Apollo 15–17 (LRV): 3,1 m de comprimento, bitola 1,83 m, rodas de 82 cm. Modelo simplificado. */
export function lrv() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.6), mat(0x9ea3a8, 0.7, 0.4)); frame.position.y = 0.6; g.add(frame);
  for (const z of [-0.3, 0.35]) for (const x of [-0.35, 0.35]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), mat(0x3b3f45, 0.2, 0.8)); seat.position.set(x, 0.72, z); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.04), mat(0x3b3f45, 0.2, 0.8)); back.position.set(x, 0.92, z + 0.23); if (z > 0) g.add(back);
  }
  for (const x of [-0.92, 0.92]) for (const z of [-1.15, 1.15]) {
    const w = wheel(0.41, 0.23, 0xcfa64a); w.position.set(x, 0.41, z); g.add(w);
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.26, 20, 1, true, 0, Math.PI), mat(0x8fa0b0, 0.5, 0.5));
    fender.rotation.z = Math.PI / 2; fender.rotation.y = Math.PI / 2; fender.position.set(x, 0.41, z); g.add(fender);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), mat(0xdddddd)); mast.position.set(0, 1.2, -1.05); g.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, 0.6), mat(0xe8e8e8, 0.4, 0.5));
  dish.position.set(0, 1.75, -1.05); dish.rotation.x = -0.9; g.add(dish);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.3), mat(0xeeeeee, 0.3, 0.5)); cam.position.set(0.3, 1.0, -1.2); g.add(cam);
  return g;
}

export const PROCEDURAL = { sojourner, lrv };
