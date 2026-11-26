// Home-tab hero: 3D house + Bangkok sun arc + floating power labels.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { buildHouse } from './model.js';
import { evStatus } from './ev.js';
import { sunPos, sunTimes, bkk } from './sim.js';

// House front (road, local +z) azimuth from house.json site.frontAzimuthDeg (real: ~30° NNE per pre-install PV designer). Sun = NOAA-style calc in sim.js.
let FRONT_AZ = 30;

export async function createScene(el) {
  const data = await (await fetch('./data/house.json')).json();
  FRONT_AZ = data.site?.frontAzimuthDeg ?? 30;
  const C = new THREE.Vector3(data.meta.lot.width / 2, 5.5, data.meta.lot.depth / 2);
  // perf: phones get a cheaper pipeline (no MSAA, dpr ≤ 1.5, PCF 512 shadows); desktop unchanged
  const MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, alpha: false, powerPreference: MOBILE ? 'low-power' : 'default' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // shadows only re-baked when the sun moves
  let active = true, onScreen = true, raf = 0, lastT = 0, lastFrame = 0, thr = 0, rotSince = 0, pulseUntil = 0, tween = null, dragging = false, endT = 0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  el.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  // soft sky gradient + mist
  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
  const g = sky.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#b9d3df'); gr.addColorStop(0.55, '#dfe9e6'); gr.addColorStop(1, '#cfdcd2');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xd6e3dd, 55, 150);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3e5a44, 1.3); scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.3);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(MOBILE ? 512 : 1024, MOBILE ? 512 : 1024);
  Object.assign(sunLight.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 });
  sunLight.target.position.set(C.x, 0, C.z); scene.add(sunLight, sunLight.target);

  // ground + hills
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), new THREE.MeshStandardMaterial({ color: 0x2c4a35, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(C.x, -0.08, C.z); ground.receiveShadow = true; scene.add(ground);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4f6f57, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + (i % 3) * 0.2, d = 75 + (i * 37 % 40);
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), hillMat);
    h.scale.set(18 + (i * 13 % 14), 7 + (i * 7 % 9), 14 + (i * 11 % 10));
    h.position.set(C.x + Math.cos(a) * d, -2, C.z + Math.sin(a) * d); scene.add(h);
  }
  // low hedge/trees for a softer site
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x3d6b48, roughness: 1, flatShading: true });
  for (const [x, z, s] of [[-3, 2, 1.6], [-2.5, 8, 1.3], [23.5, 1, 1.8], [22.5, -2, 1.3], [5, -3, 1.5], [14, -3.5, 1.7]]) {
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), treeMat); t.position.set(x, s * 1.1, z); t.castShadow = true; scene.add(t);
  }

  const house = buildHouse(data); if (house.cars) house.cars.visible = true; scene.add(house.root); // parked EVs: BYD M6 (left), ATTO 3 (right)

  // sun arc
  const arcGroup = new THREE.Group(); scene.add(arcGroup);
  const R = 19, ORIGIN = new THREE.Vector3(C.x, 0, C.z);
  const dirOf = (az, el) => { const a = (az - FRONT_AZ + 180) * Math.PI / 180, e = el * Math.PI / 180;
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)); };
  { // true-north marker (ground arrow + N label)
    const n = dirOf(0, 0), g = new THREE.Group();
    const sh = new THREE.Shape(); sh.moveTo(0, 1.6); sh.lineTo(0.7, -0.9); sh.lineTo(0, -0.4); sh.lineTo(-0.7, -0.9); sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xd32f2f, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-n.x, -n.z); g.add(m);
    const d = document.createElement('div'); d.textContent = 'N'; d.style.cssText = 'font:700 12px system-ui;color:#d32f2f;background:#fff;border-radius:9px;padding:1px 5px';
    const l = new CSS2DObject(d); l.position.set(n.x * 2.4, 0.2, n.z * 2.4); g.add(l);
    g.position.set(-3.2, 0.05, C.z + 4); scene.add(g);
  }
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffb300 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const r = x.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(255,200,80,.9)'); r.addColorStop(1, 'rgba(255,170,40,0)'); x.fillStyle = r; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), depthWrite: false, fog: false }));
  glow.scale.set(7, 7, 1); sunMesh.add(glow); scene.add(sunMesh);
  let arcDay = null;
  function updateSun(now) {
    const p = bkk(now);
    if (arcDay !== p.key) {
      arcDay = p.key; arcGroup.clear();
      const { rise, set } = sunTimes(p), pts = [];
      for (let m = rise - 6; m <= set + 6; m += 4) { const s = sunPos(p, m); pts.push(ORIGIN.clone().addScaledVector(dirOf(s.az, Math.max(s.elev, -1)), R)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.09, 6, false), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85, fog: false }));
      arcGroup.add(tube);
      for (const m of [rise, set]) { const s = sunPos(p, m); const d = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8a3d })); d.position.copy(ORIGIN).addScaledVector(dirOf(s.az, 0), R); arcGroup.add(d); }
    }
    const s = sunPos(p, p.min), day = s.elev > 0;
    sunMesh.visible = day;
    sunMesh.position.copy(ORIGIN).addScaledVector(dirOf(s.az, s.elev), R);
    sunLight.position.copy(day ? sunMesh.position : ORIGIN.clone().add(new THREE.Vector3(-10, 30, 12)));
    sunLight.intensity = day ? 0.8 + 1.8 * Math.min(1, s.elev / 40) : 0.35;
    sunLight.color.setHex(day && s.elev < 15 ? 0xffd2a0 : day ? 0xfff1dc : 0x9fb4ff);
    hemi.intensity = day ? 1.3 : 0.75;
    renderer.shadowMap.needsUpdate = true; requestRender();
    return s;
  }

  // floating labels: [key, text, color, labelPos, anchorPos]
  const L = [
    ['pv', 'SOLAR', '#f5b301', [8.7, 15.2, 4.6], [8.7, 10.2, 5.4]],
    ['home', 'HOME', '#3b8fe0', [-3.2, 6.8, 8.6], [3.4, 5.0, 8.6]],
    ['grid', 'GRID', '#8a96a3', [23.6, 3.4, 12.6], [19.8, 1.2, 10.0]],
    ['battery', 'BATTERY', '#2fbf71', [27.0, 3.0, -1.0], [14.48, 0.8, 4.2]],
    ['ev', 'EV', '#ff7a45', [14.6, 0.4, 16.2], [16.6, 0.9, 7.0]],
  ];
  const lblEls = {}, leaderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  for (const [k, name, col, pos, anchor] of L) {
    const d = document.createElement('div'); d.className = 'scene-lbl';
    d.innerHTML = `<i style="background:${col}"></i><span class="n">${name}</span><b>–</b>`;
    const o = new CSS2DObject(d); o.position.fromArray(pos); scene.add(o); lblEls[k] = d;
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...anchor), new THREE.Vector3(...pos)]), leaderMat));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: col })); dot.position.fromArray(anchor); scene.add(dot);
  }

  // camera / controls
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true; controls.target.copy(C); controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 12; controls.maxDistance = 80;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.55; controls.enablePan = false;
  let idleTimer;
  controls.addEventListener('start', () => { dragging = true; poke(); controls.autoRotate = false; clearTimeout(idleTimer); requestRender(); });
  controls.addEventListener('end', () => { dragging = false; endT = performance.now(); requestRender(); idleTimer = setTimeout(() => { if (mode === '3d') { controls.autoRotate = true; requestRender(); } }, 6000); });
  controls.addEventListener('change', () => requestRender());
  let mode = '3d';
  function homePos() { const a = el.clientWidth / Math.max(el.clientHeight, 1), dist = 60 / Math.min(1.2, Math.max(0.7, a * 0.8)); return C.clone().add(new THREE.Vector3(0.35, 0.36, 0.86).normalize().multiplyScalar(dist)); }
  function topPos() { const a = el.clientWidth / Math.max(el.clientHeight, 1); return new THREE.Vector3(C.x, 30 + 26 / Math.min(a, 1.4), C.z + 0.01); }
  cam.position.copy(homePos());
  function setMode(m) {
    mode = m; controls.autoRotate = m === '3d'; controls.enableRotate = m === '3d';
    const from = cam.position.clone(), to = m === '3d' ? homePos() : topPos(), t0 = performance.now();
    tween = t => { const k = Math.min(1, (t - t0) / 900), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; cam.position.lerpVectors(from, to, e); if (k >= 1) tween = null; };
    arcGroup.visible = sunMesh.visible = m === '3d' ? true : false; if (m === '3d') updateSun(new Date());
    requestRender();
  }
  function resize() { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); labels.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); requestRender(); }
  new ResizeObserver(resize).observe(el); resize();

  // ---- render on demand: only while dragging/damping, tweening, or (throttled) auto-rotating ----
  const ROT_FPS = MOBILE ? 15 : 30, ROT_MAX = MOBILE ? 20000 : 60000, PULSE_FPS = 12; // charging pulse: 12 fps, pauses with the idle timer
  const poke = () => { pulseUntil = performance.now() + ROT_MAX + 6000; }; // idle auto-rotate is slow → low fps is visually the same, far less heat
  const lastPos = new THREE.Vector3(), lastQ = new THREE.Quaternion(); window.__renders = window.__renders || 0;
  function requestRender() { if (!raf && active && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    const busy = dragging || !!tween || performance.now() - endT < 1500;
    const pulse = house.ev?.state === 'charging' && performance.now() < pulseUntil, anim = controls.autoRotate || pulse, fps = controls.autoRotate ? ROT_FPS : PULSE_FPS;
    if (!busy && anim && t - lastFrame < 1000 / fps - 2) { if (!thr) thr = setTimeout(() => { thr = 0; requestRender(); }, 1000 / fps - (t - lastFrame)); return; } // throttle without spinning rAF
    if (pulse) house.ev.tick(t);
    const dt = lastT ? Math.min(0.25, (t - lastT) / 1000) : 1 / 60; lastT = t; lastFrame = t;
    if (controls.autoRotate) { if (!rotSince) rotSince = t; else if (t - rotSince > ROT_MAX) controls.autoRotate = false; } else rotSince = 0; // idle auto-rotate pauses → 0 fps
    tween?.(t); controls.update(dt);
    const moved = cam.position.distanceToSquared(lastPos) > 1e-6 || cam.quaternion.angleTo(lastQ) > 5e-5;
    lastPos.copy(cam.position); lastQ.copy(cam.quaternion);
    renderer.render(scene, cam); labels.render(scene, cam); window.__renders++;
    if (tween || dragging || anim || (moved && performance.now() - endT < 1500)) requestRender(); else lastT = 0;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastT = 0; requestRender(); } });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen) { lastT = 0; requestRender(); } }).observe(el);
  setInterval(() => { if (active && mode === '3d' && !document.hidden) updateSun(new Date()); }, 30000);
  updateSun(new Date()); requestRender();

  const fmt = x => (x == null ? '–' : Math.abs(x).toFixed(2));
  return {
    update(s) {
      const p = s.power_kw;
      const st = s.ev?.status || evStatus(s.ev); // same status as the EV card
      if (house.ev?.setState && st !== house.ev.state) { house.ev.setState(st); poke(); renderer.shadowMap.needsUpdate = true; requestRender(); }
      lblEls.pv.querySelector('b').textContent = fmt(p.pv) + ' kW';
      lblEls.home.querySelector('b').textContent = fmt(p.home) + ' kW';
      lblEls.grid.querySelector('b').textContent = (p.grid > 0.05 ? '↓ ' : p.grid < -0.05 ? '↑ ' : '') + fmt(p.grid) + ' kW';
      lblEls.battery.querySelector('b').textContent = (p.battery > 0.05 ? '+' : p.battery < -0.05 ? '−' : '') + fmt(p.battery) + ' kW';
      lblEls.ev.querySelector('b').textContent = fmt(p.ev) + ' kW';
      lblEls.ev.classList.toggle('dim', !(p.ev > 0.05));
    },
    setMode, get mode() { return mode; },
    setActive(a) { active = a; if (a) { lastT = 0; poke(); resize(); requestRender(); } },
    sunNow: () => sunPos(bkk(new Date()), bkk(new Date()).min),
  };
}
