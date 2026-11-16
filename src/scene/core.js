// Shared 3D viewer: renderer, camera, controls, lights, picking, camera flights, mesh helpers.
// Units: 1 scene unit = 1 foot.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ---------- mesh helpers ---------- */

const matCache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${opts.opacity ?? 1}|${opts.emissive ?? ''}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: 0,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissive ? 0.6 : 0,
    depthWrite: (opts.opacity ?? 1) >= 1,
  });
  m.userData.shared = !opts.unique;
  if (!opts.unique) matCache.set(key, m);
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const sphGeo = new THREE.SphereGeometry(1, 20, 14);
boxGeo.userData.shared = cylGeo.userData.shared = sphGeo.userData.shared = true;

/** Box of size w×h×d whose BOTTOM sits at y, centred on x/z. */
export function box(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(boxGeo, opts.material || mat(color, opts));
  m.scale.set(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01));
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.shadow !== false && (opts.opacity ?? 1) >= 1;
  m.receiveShadow = true;
  return m;
}

/** Cylinder of radius r and height h whose bottom sits at y. */
export function cyl(r, h, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(cylGeo, mat(color, opts));
  m.scale.set(r, h, r);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Sphere of radius r centred at (x, y, z). */
export function sphere(r, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(sphGeo, mat(color, opts));
  m.scale.setScalar(r);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function tree(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.6 * s, 6 * s, '#7a5a3c', 0, 0, 0));
  g.add(sphere(3.6 * s, '#6aa56a', 0, 8 * s, 0));
  g.add(sphere(2.6 * s, '#7cb87a', 1.2 * s, 10.2 * s, 0.6 * s));
  g.position.set(x, 0, z);
  return g;
}

/** HTML label pinned to a 3D position. */
export function makeLabel(html, className, onClick) {
  const div = document.createElement('div');
  div.className = className;
  div.innerHTML = html;
  if (onClick) {
    div.classList.add('clickable');
    div.addEventListener('pointerdown', (e) => e.stopPropagation());
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return new CSS2DObject(div);
}

/* ---------- viewer ---------- */

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#eceee8');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 600, 3000);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 8000);
  camera.position.set(60, 60, 60);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a0', 1.5));
  const sun = new THREE.DirectionalLight('#fff3df', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: '#dde2d6', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  const content = new THREE.Group();
  scene.add(content);

  function frame(size, center = new THREE.Vector3()) {
    const h = size * 0.8;
    const cam = sun.shadow.camera;
    cam.left = -h;
    cam.right = h;
    cam.top = h;
    cam.bottom = -h;
    cam.near = 1;
    cam.far = size * 5;
    cam.updateProjectionMatrix();
    sun.position.set(center.x + size * 0.7, size * 1.4, center.z + size * 0.5);
    sun.target.position.copy(center);
    scene.fog.near = size * 3;
    scene.fog.far = size * 10;
    controls.maxDistance = size * 5;
  }

  function resize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  /* camera flights */
  let flight = null;
  function flyTo(pos, target, ms = 1000, fov = 50) {
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), f0: camera.fov, f1: fov, start: performance.now(), ms };
  }
  controls.addEventListener('start', () => (flight = null));

  /* picking (click without drag, hover cursor) */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pickables = [];
  let pickHandler = null;
  let hovered = null;

  function pickAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const visible = pickables.filter((o) => isShown(o));
    for (const h of ray.intersectObjects(visible, true)) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o;
    }
    return null;
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 5 || e.button !== 0) return;
    const o = pickAt(e);
    pickHandler?.(o ? o.userData.pick : null);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const o = pickAt(e);
    if (o !== hovered) {
      hovered = o;
      renderer.domElement.style.cursor = o ? 'pointer' : '';
    }
  });

  const tickers = new Set();
  renderer.setAnimationLoop((t) => {
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.start) / flight.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(flight.p0, flight.p1, e);
      controls.target.lerpVectors(flight.t0, flight.t1, e);
      camera.fov = flight.f0 + (flight.f1 - flight.f0) * e;
      camera.updateProjectionMatrix();
      if (k >= 1) flight = null;
    }
    controls.update();
    tickers.forEach((f) => f(t));
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  function clear() {
    pickables = [];
    hovered = null;
    tickers.clear();
    content.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) {
        for (const m of [].concat(o.material)) {
          if (m.userData.shared) continue;
          m.map?.dispose();
          m.dispose();
        }
      }
    });
    content.clear();
  }

  return {
    scene,
    camera,
    controls,
    content,
    renderer,
    frame,
    flyTo,
    clear,
    addPickable: (o) => pickables.push(o),
    onPick: (fn) => (pickHandler = fn),
    addTicker: (fn) => tickers.add(fn),
  };
}

function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
