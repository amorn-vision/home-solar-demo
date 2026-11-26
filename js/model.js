// Procedural house model built from data/house.json
import * as THREE from 'three';

const KIND_COLOR = {
  room: 0xf3e6cf, hall: 0xe9e1d4, wet: 0xcfe3ef, balcony: 0xd9d4cc,
  porch: 0xd8c7a8, carport: 0xcdbfa6, yard: 0xc9ccce
};
const PLAN_COLOR = {
  room: 0xffe2b3, hall: 0xe6dcff, wet: 0xbfe3ff, balcony: 0xd5f0c8,
  porch: 0xf5d1a8, carport: 0xdedede, yard: 0xd0d6da
};
const INDOOR = new Set(['room', 'hall', 'wet']);

export const MAT = {};
function setPalette(p = {}) {
  const P = Object.assign({ white: '#ffffff', accent: '#8e9aab', slate: '#5f6b7a', louver: '#8a9099', wood: '#7a4e2d', stone: '#4b4a47', dark: '#555555', metal: '#202224', glass: '#9fd8a8', plinth: '#9b9b98', roofUnder: '#d4d6d8' }, p);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(c), roughness: 0.85 }, o));
  Object.assign(MAT, {
    wall: std(P.wall || P.white, { roughness: 0.92 }), partition: std('#fbfbfa'), white: std(P.white),
    accent: std(P.accent), slate: std(P.slate), voidSlate: std(P.voidSlate || '#4f5a66', { roughness: 0.9 }), louver: std(P.louver, { roughness: 0.6 }),
    band: std(P.accent), frame: std(P.white, { roughness: 0.5 }),
    glass: std(P.glass, { roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.72 }),
    rail: std(P.metal, { roughness: 0.4, metalness: 0.4 }), metal: std(P.metal, { roughness: 0.4, metalness: 0.4 }),
    stone: std('#ffffff', { roughness: 1, map: stoneTexture(P.stone) }), wood: std(P.wood, { roughness: 0.8 }), stair: std(P.stairWood || P.wood, { roughness: 0.7 }),
    dark: std(P.dark, { roughness: 0.6 }), fascia: std(P.roofFascia || P.dark, { roughness: 0.6 }),
    roofTop: std('#ffffff', { roughness: 0.6, map: seamTexture(P.roofTop || '#e3e5e6') }), metalRoof: std('#ffffff', { roughness: 0.6, map: seamTexture(P.metalRoof || '#8d9196', 0.06) }),
    roof: std(P.roofUnder), roofUnder: std(P.roofUnder), plinth: std(P.plinth, { roughness: 1 }), concrete: std(P.concrete || '#a3a5a6', { roughness: 1 }),
    breeze: std('#ffffff', { roughness: 1, map: breezeTexture(P.concrete || '#a3a5a6') }),
    bronzeGlass: std(P.bronze || '#8b5a2b', { roughness: 0.3, transparent: true, opacity: 0.6 }),
    tintGlass: std(P.canopy || '#2a2d30', { roughness: 0.3, transparent: true, opacity: 0.75 }),
    shrub: std('#4f8a3c', { roughness: 1 }), tank: std('#c9c4b8', { roughness: 0.5 }), pipe: std('#2f6fb3', { roughness: 0.5 }),
    gold: std('#c9a23a', { roughness: 0.4, metalness: 0.5 }), shrineRed: std('#a8322d', { roughness: 0.6 }),
    lawn: std('#6aa84f', { roughness: 1 }), road: std('#8a8d90', { roughness: 1 }), column: std('#e9eaeb'),
  });
}
function breezeTexture(base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#4a4c4d'; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillRect(6 + i * 32, 6 + j * 32, 20, 20); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(25, 4); return t;
}
function seamTexture(base, step = 0.5) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#' + new THREE.Color(base).multiplyScalar(0.82).getHexString(); g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / step, 1); t.userData = { step }; return t;
}
function stoneTexture(base) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#2e2d2b'; g.fillRect(0, 0, 128, 128);
  const col = new THREE.Color(base); let y = 0, k = 0;
  while (y < 128) { const h = 6 + (k * 7 % 5); let x = -(k * 13 % 20);
    while (x < 128) { const w = 14 + ((x + k * 31) % 23); const t = 0.75 + ((x * 7 + k * 11) % 10) / 20;
      g.fillStyle = '#' + col.clone().multiplyScalar(t).getHexString(); g.fillRect(x + 1, y + 1, w - 2, h - 2); x += w; }
    y += h; k++; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// box from min/max corners
function bb(x0, y0, z0, x1, y1, z1, mat) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

function inRect(r, x, z) { return x > r[0] && x < r[2] && z > r[1] && z < r[3]; }
function overlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

function solarTexture(style = 'jinko', landscape = false) {
  // drawn portrait (long side vertical); rotated for landscape panels
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = landscape ? H : W; c.height = landscape ? W : H;
  const g = c.getContext('2d');
  if (landscape) { g.translate(H, 0); g.rotate(Math.PI / 2); }
  if (style === 'jinko-black') {
    g.fillStyle = '#14171c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#262b33'; g.lineWidth = 1.2;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * W / 6, 0); g.lineTo(i * W / 6, H); g.stroke(); }
    for (let j = 1; j < 24; j++) { g.beginPath(); g.moveTo(0, j * H / 24); g.lineTo(W, j * H / 24); g.stroke(); }
    g.strokeStyle = '#3a414c'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = '#8d939b'; g.lineWidth = 4; g.strokeRect(0, 0, W, H);
  } else if (style === 'aiko') {
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#15171a'; g.lineWidth = 1;
    for (let j = 1; j < 24; j++) { g.beginPath(); g.moveTo(0, j * H / 24); g.lineTo(W, j * H / 24); g.stroke(); }
    g.strokeStyle = '#050506'; g.lineWidth = 6; g.strokeRect(0, 0, W, H);
  } else {
    g.fillStyle = '#1b2a48'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3b5078'; g.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * W / 6, 0); g.lineTo(i * W / 6, H); g.stroke(); }
    for (let j = 1; j < 24; j++) { g.beginPath(); g.moveTo(0, j * H / 24); g.lineTo(W, j * H / 24); g.stroke(); }
    g.strokeStyle = '#7f93b8'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); // half-cut split
    g.strokeStyle = '#d3d7dc'; g.lineWidth = 6; g.strokeRect(0, 0, W, H);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildHouse(data) {
  setPalette(data.palette);
  const root = new THREE.Group(); root.name = 'house';
  const levels = Object.fromEntries(data.levels.map(l => [l.id, l]));
  const pickables = [];
  const floorGroups = {};
  const roomMeshes = {};
  const planWalls = {};
  const PLAN_WALL = new THREE.MeshBasicMaterial({ color: 0x2f3439 }), PLAN_WIN = new THREE.MeshBasicMaterial({ color: 0x4aa3c8 });
  const planStrip = (g, axis, c, a, b, t, y, mat) => { const fl = g.userData.floor; const m = axis === 'x' ? bb(a, y, c - t / 2, b, y + 0.02, c + t / 2, mat) : bb(c - t / 2, y, a, c + t / 2, y + 0.02, b, mat); m.castShadow = false; planWalls[fl].add(m); };
  const tag = (o, floor) => { o.userData.floor = floor; return o; };
  const facade = data.facade || { openings: [], features: [] };
  const floorOfY = y => (y < levels[2].elevation - 0.2 ? 1 : y < levels[3].elevation - 0.2 ? 2 : y < levels[3].top - 0.15 ? 3 : 4);

  // ---------- site ----------
  const site = tag(new THREE.Group(), 0); site.name = 'site'; root.add(site);
  const lot = data.meta.lot;
  site.add(Object.assign(bb(0, -0.05, 0, lot.width, 0.0, lot.depth, MAT.lawn), { name: 'lawn' }));
  site.add(Object.assign(bb(-4, -0.06, lot.depth, lot.width + 4, -0.01, lot.depth + 6, MAT.road), { name: 'road' }));
  site.add(Object.assign(bb(3.07, 0, 1.97, 14.38, 0.30, 8.93, MAT.plinth), { name: 'plinth' }));
  site.add(bb(0.97, 0, 3.07, 3.10, 0.30, 6.33, MAT.plinth));
  const boundary = new THREE.Group(); boundary.name = 'boundary'; site.add(boundary);
  boundary.add(bb(0, 0, 0, 0.12, 1.8, lot.depth, MAT.breeze));
  boundary.add(bb(0, 0, 0, lot.width, 1.8, 0.12, MAT.concrete));
  boundary.add(bb(lot.width - 0.12, 0, 0, lot.width, 1.8, 2.7, MAT.concrete));

  for (const lv of data.levels) {
    const g = tag(new THREE.Group(), lv.id); g.name = 'floor-' + lv.id; root.add(g);
    floorGroups[lv.id] = g;
    const pw = new THREE.Group(); pw.name = 'plan-walls-' + lv.id; pw.visible = false; g.add(pw); planWalls[lv.id] = pw;
  }
  const roofGroup = tag(new THREE.Group(), 4); roofGroup.name = 'roof'; root.add(roofGroup);
  const groupFor = f => (f >= 4 ? roofGroup : floorGroups[f]);
  const stair = data.stair.rect;

  // ---------- room floor tiles (clickable) ----------
  for (const r of data.rooms) {
    const lv = levels[r.floor];
    const top = r.elev ?? lv.elevation;
    const [x0, z0, x1, z1] = r.rect;
    const shape = new THREE.Shape();
    shape.moveTo(x0, -z0); shape.lineTo(x1, -z0); shape.lineTo(x1, -z1); shape.lineTo(x0, -z1); shape.closePath();
    if (r.floor > 1 && overlap(r.rect, stair)) {
      const h = new THREE.Path();
      h.moveTo(stair[0], -stair[1]); h.lineTo(stair[0], -stair[3]); h.lineTo(stair[2], -stair[3]); h.lineTo(stair[2], -stair[1]); h.closePath();
      shape.holes.push(h);
    }
    const thick = r.floor === 1 ? Math.max(top, 0.1) : 0.2;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: KIND_COLOR[r.kind] ?? 0xeeeeee, roughness: 0.85 });
    mat.userData.base = KIND_COLOR[r.kind]; mat.userData.plan = PLAN_COLOR[r.kind];
    const m = new THREE.Mesh(geo, mat);
    m.position.y = top - thick;
    m.receiveShadow = true; m.castShadow = r.floor > 1;
    m.name = 'room:' + r.id;
    m.userData = { pick: 'room', room: r, floor: r.floor };
    floorGroups[r.floor].add(m);
    pickables.push(m); roomMeshes[r.id] = m;
  }

  // ---------- walls via cell grid; exterior openings only where listed in data.facade.openings ----------
  for (const lv of data.levels) {
    const rooms = data.rooms.filter(r => r.floor === lv.id);
    const g = floorGroups[lv.id];
    const xs = [...new Set(rooms.flatMap(r => [r.rect[0], r.rect[2]]))].sort((a, b) => a - b);
    const zs = [...new Set(rooms.flatMap(r => [r.rect[1], r.rect[3]]))].sort((a, b) => a - b);
    const owner = (x, z) => rooms.find(r => inRect(r.rect, x, z)) || null;
    const isIn = r => r && INDOOR.has(r.kind);
    const y0 = lv.elevation, y1 = lv.top;
    const segs = [];
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length - 1; j++) {
      const zc = (zs[j] + zs[j + 1]) / 2;
      const A = owner(xs[i] - 0.01, zc), B = owner(xs[i] + 0.01, zc);
      if (A !== B && (isIn(A) || isIn(B))) segs.push({ axis: 'z', c: xs[i], a0: zs[j], a1: zs[j + 1], A, B });
    }
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length - 1; i++) {
      const xc = (xs[i] + xs[i + 1]) / 2;
      const A = owner(xc, zs[j] - 0.01), B = owner(xc, zs[j] + 0.01);
      if (A !== B && (isIn(A) || isIn(B))) segs.push({ axis: 'x', c: zs[j], a0: xs[i], a1: xs[i + 1], A, B });
    }
    segs.sort((p, q) => p.axis.localeCompare(q.axis) || p.c - q.c || p.a0 - q.a0);
    const merged = [];
    for (const s of segs) {
      const L = merged[merged.length - 1];
      const ext = !(isIn(s.A) && isIn(s.B));
      if (L && L.axis === s.axis && L.c === s.c && Math.abs(L.a1 - s.a0) < 1e-6 && (ext ? L.ext : (L.A === s.A && L.B === s.B)) && L.ext === ext
        && (!ext || (isIn(L.A) === isIn(s.A)))) L.a1 = s.a1;
      else merged.push({ ...s, ext });
    }
    for (const s of merged) {
      if (!s.ext) { addPartition(g, s, y0, y1); continue; }
      const outwardSign = isIn(s.A) ? 1 : -1;
      addExteriorWall(g, s, y0, y1, outwardSign, lv.id);
    }
    for (const r of rooms.filter(r => r.kind === 'balcony')) {
      const [x0, z0, x1, z1] = r.rect; const yb = r.elev ?? lv.elevation;
      const edges = [['x', z0, x0, x1, -1], ['x', z1, x0, x1, 1], ['z', x0, z0, z1, -1], ['z', x1, z0, z1, 1]];
      for (const [axis, c, a0, a1, sgn] of edges) {
        const probe = axis === 'x' ? owner((a0 + a1) / 2, c + sgn * 0.01) : owner(c + sgn * 0.01, (a0 + a1) / 2);
        if (probe) continue;
        addRailing(g, axis, c, a0, a1, yb);
      }
    }
    // blue-grey slab bands
    if (lv.id > 1) {
      for (const s of merged.filter(s => s.ext)) {
        const sign = isIn(s.A) ? 1 : -1, off = s.c + sign * 0.12;
        const side = s.axis === 'x' ? (sign > 0 ? 'front' : 'back') : (sign > 0 ? 'right' : 'left');
        const br = (facade.bandColors || []).find(r => r.side === side && r.floors.includes(lv.id));
        const bm = br ? (MAT[br.color] || MAT.band) : MAT.band;
        if (s.axis === 'x') g.add(bb(s.a0 - 0.12, y0 - 0.32, off - 0.03, s.a1 + 0.12, y0 + 0.02, off + 0.03, bm));
        else g.add(bb(off - 0.03, y0 - 0.32, s.a0 - 0.12, off + 0.03, y0 + 0.02, s.a1 + 0.12, bm));
      }
      for (const r of rooms.filter(r => r.kind === 'balcony')) {
        const [x0, z0, x1, z1] = r.rect;
        g.add(bb(x0, y0 - 0.32, z0, x1, y0 - 0.2, z1, MAT.band));
      }
    }
  }

  function addPartition(g, s, y0, y1) {
    const t = 0.1, L = s.a1 - s.a0;
    const door = L > 1.6 ? 0.9 : 0;
    const mid = (s.a0 + s.a1) / 2;
    const pieces = door ? [[s.a0, mid - door / 2], [mid + door / 2, s.a1]] : [[s.a0, s.a1]];
    for (const [a, b] of pieces) { g.add(s.axis === 'x' ? bb(a, y0, s.c - t / 2, b, y1, s.c + t / 2, MAT.partition) : bb(s.c - t / 2, y0, a, s.c + t / 2, y1, b, MAT.partition)); planStrip(g, s.axis, s.c, a, b, 0.1, y0 + 1.2, PLAN_WALL); }
    if (door) g.add(s.axis === 'x' ? bb(mid - door / 2, y0 + 2.1, s.c - t / 2, mid + door / 2, y1, s.c + t / 2, MAT.partition)
      : bb(s.c - t / 2, y0 + 2.1, mid - door / 2, s.c + t / 2, y1, mid + door / 2, MAT.partition));
  }

  function addExteriorWall(g, s, y0, y1, outwardSign, floor) {
    const t = 0.2, c = s.c;
    const ops = facade.openings.filter(o => o.floor === floor &&
      ((s.axis === 'x' && o.wall.z !== undefined && Math.abs(o.wall.z - c) < 1e-3) || (s.axis === 'z' && o.wall.x !== undefined && Math.abs(o.wall.x - c) < 1e-3)) &&
      o.from >= s.a0 - 1e-3 && o.to <= s.a1 + 1e-3).sort((a, b) => a.from - b.from);
    const side = s.axis === 'x' ? (outwardSign > 0 ? 'front' : 'back') : (outwardSign > 0 ? 'right' : 'left');
    const rule = (facade.wallColors || []).find(r => r.side === side && r.floors.includes(floor));
    const wallMat = rule ? (MAT[rule.color] || MAT.wall) : MAT.wall;
    const make = (a, b, ya, yb, mat = wallMat) => {
      if (ya <= y0 + 1e-6 && yb >= y1 - 1e-6) planStrip(g, s.axis, c, a, b, 0.2, y0 + 1.2, PLAN_WALL);
      return s.axis === 'x' ? bb(a, ya, c - t / 2, b, yb, c + t / 2, mat) : bb(c - t / 2, ya, a, c + t / 2, yb, b, mat);
    };
    let cur = s.a0;
    for (const o of ops) {
      if (o.from > cur + 1e-3) g.add(make(cur, o.from, y0, y1));
      if (o.sill > 0.01) g.add(make(o.from, o.to, y0, y0 + o.sill));
      if (y0 + o.head < y1 - 0.01) g.add(make(o.from, o.to, y0 + o.head, y1));
      addWindow(g, s.axis, c, outwardSign, o, y0); planStrip(g, s.axis, c, o.from, o.to, 0.12, y0 + 1.2, PLAN_WIN);
      cur = o.to;
    }
    if (cur < s.a1 - 1e-3) g.add(make(cur, s.a1, y0, y1));
  }

  // window/door: green glass, thick white frame, vertical mullions
  function addWindow(g, axis, c, sign, o, y0) {
    const ya = y0 + o.sill, yb = y0 + o.head, a0 = o.from, a1 = o.to;
    const q = (a, b, yA, yB, d0, d1, mat) => (axis === 'x' ? bb(a, yA, c + d0, b, yB, c + d1, mat) : bb(c + d0, yA, a, c + d1, yB, b, mat));
    const dd = (u, v) => (sign > 0 ? [u, v] : [-v, -u]);
    const gl = q(a0, b1(a1), ya, yb, -0.02, 0.02, MAT.glass); gl.castShadow = false; gl.name = 'glass:' + o.id; g.add(gl);
    const f = 0.09, [p0, p1] = dd(0.0, 0.14), FR = MAT[o.frameColor] || MAT.frame;
    g.add(q(a0, a1, yb - f, yb, p0, p1, FR));
    g.add(q(a0, a1, ya, ya + f, p0, p1, FR));
    g.add(q(a0, a0 + f, ya, yb, p0, p1, FR));
    g.add(q(a1 - f, a1, ya, yb, p0, p1, FR));
    const n = o.panes || 1;
    for (let i = 1; i < n; i++) { const m = a0 + (a1 - a0) * i / n; g.add(q(m - 0.03, m + 0.03, ya, yb, p0 * 0.6, p1 * 0.6, FR)); }
    if (o.type === 'window' && yb - ya > 1.6 && n > 1) { const tr = yb - 0.45; g.add(q(a0, a1, tr - 0.03, tr + 0.03, p0 * 0.6, p1 * 0.6, FR)); }
    if (o.deepFrame) {
      const e = 0.16, [d0, d1] = dd(0.0, 0.32);
      g.add(q(a0 - e, a1 + e, yb, yb + e, d0, d1, MAT.frame));
      g.add(q(a0 - e, a1 + e, ya - e, ya, d0, d1, MAT.frame));
      g.add(q(a0 - e, a0, ya, yb, d0, d1, MAT.frame));
      g.add(q(a1, a1 + e, ya, yb, d0, d1, MAT.frame));
    }
  }
  function b1(x) { return x; }

  function addRailing(g, axis, c, a0, a1, yb) {
    const h = 1.05, L = a1 - a0, n = Math.max(2, Math.round(L / 0.12));
    const q = (a, b, yA, yB, w) => (axis === 'x' ? bb(a, yA, c - w, b, yB, c + w, MAT.metal) : bb(c - w, yA, a, c + w, yB, b, MAT.metal));
    g.add(q(a0, a1, yb + h - 0.04, yb + h, 0.025));
    g.add(q(a0, a1, yb + 0.08, yb + 0.11, 0.015));
    for (let i = 0; i <= n; i++) { const a = a0 + L * i / n; g.add(q(a - 0.01, a + 0.01, yb, yb + h, 0.01)); }
  }

  // ---------- canvas-texture signs: company plate / house number ----------
  function signMesh(F) {
    if (typeof document === 'undefined') return null; // node (GLB tooling) without DOM
    const W = 1024, H = Math.round(1024 * F.h / F.w), c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    let mat;
    if (F.kind === 'company') {
      x.fillStyle = '#f3f4f5'; x.fillRect(0, 0, W, H);
      const gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#1f5fbf'); gr.addColorStop(0.55, '#2f8fd8'); gr.addColorStop(1, '#f39a1e');
      x.fillStyle = gr; x.fillRect(0, H * 0.84, W, H * 0.16);
      const L = H * 0.62, lx = W * 0.035, ly = H * 0.1; // triangular 'A' logo
      x.fillStyle = '#1f5fbf'; x.beginPath(); x.moveTo(lx + L * 0.5, ly); x.lineTo(lx, ly + L); x.lineTo(lx + L * 0.36, ly + L); x.closePath(); x.fill();
      x.fillStyle = '#f39a1e'; x.beginPath(); x.moveTo(lx + L * 0.5, ly); x.lineTo(lx + L, ly + L); x.lineTo(lx + L * 0.64, ly + L); x.closePath(); x.fill();
      x.fillStyle = '#2f8fd8'; x.fillRect(lx + L * 0.3, ly + L * 0.62, L * 0.4, L * 0.09);
      x.fillStyle = '#16325c'; x.textBaseline = 'middle';
      const tx = lx + L + W * 0.03, tw = W - tx - W * 0.03;
      x.font = `600 ${Math.round(H * 0.27)}px "Noto Sans Thai", Tahoma, sans-serif`; x.fillText(F.line1 || '', tx, H * 0.3, tw);
      x.font = `700 ${Math.round(H * 0.2)}px Arial, Helvetica, sans-serif`; x.fillStyle = '#1f5fbf'; x.fillText(F.line2 || '', tx, H * 0.64, tw);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 });
    } else { // brushed-steel numbers
      const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#e9ecef'); gr.addColorStop(0.5, '#9aa1a8'); gr.addColorStop(1, '#d6dadd');
      x.font = `700 ${Math.round(H * 0.9)}px Arial, Helvetica, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = H * 0.03; x.strokeStyle = '#5d646b'; x.strokeText(F.text || '', W / 2, H * 0.54); x.fillStyle = gr; x.fillText(F.text || '', W / 2, H * 0.54);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, metalness: 0.7, roughness: 0.35 });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.h), mat);
    m.position.set(F.x, F.y, F.z); m.rotation.y = F.rotY || 0; m.name = F.note || ('sign-' + F.kind); return m;
  }

  // ---------- facade features ----------
  const fmat = k => MAT[k] || MAT.white;
  for (const F of facade.features) {
    if (F.type === 'panel' || F.type === 'slab') {
      const [x0, y0, z0, x1, y1, z1] = F.box;
      const grp = F.group === 'roof' ? roofGroup : groupFor(floorOfY(y0));
      const m = bb(x0, y0, z0, x1, y1, z1, fmat(F.color)); if (F.note) m.name = F.note; grp.add(m);
      if (F.color === 'metalRoof') MAT.metalRoof.map.repeat.set((x1 - x0) / MAT.metalRoof.map.userData.step, 1);
      if (F.edge) {
        grp.add(bb(x0 - 0.02, y1 - 0.14, z0 - 0.02, x1 + 0.02, y1 + 0.01, z0 + 0.05, fmat(F.edge)));
        grp.add(bb(x0 - 0.02, y1 - 0.14, z1 - 0.05, x1 + 0.02, y1 + 0.01, z1 + 0.02, fmat(F.edge)));
        grp.add(bb(x1 - 0.05, y1 - 0.14, z0, x1 + 0.02, y1 + 0.01, z1, fmat(F.edge)));
      }
      continue;
    }
    if (F.type === 'shrubs') { const g2 = floorGroups[1]; for (const [x, z, r] of F.points) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), MAT.shrub); m.position.set(x, (F.y ?? 0) + r * 0.8, z); m.castShadow = true; g2.add(m); } continue; }
    if (F.type === 'cylinder') { const m = new THREE.Mesh(new THREE.CylinderGeometry(F.r, F.r, F.h, 20), fmat(F.color)); m.position.set(F.x, (F.y0 ?? 0) + F.h / 2, F.z); m.castShadow = true; if (F.note) m.name = F.note; groupFor(floorOfY(F.y0 ?? 0)).add(m); continue; }
    if (F.type === 'spirit') {
      const g2 = floorGroups[1], sp = new THREE.Group(); sp.name = 'ศาลพระภูมิ'; sp.position.set(F.x, 0, F.z);
      sp.add(box(0.35, 1.3, 0.35, MAT.white, 0, 0.65, 0)); sp.add(box(0.8, 0.06, 0.8, MAT.white, 0, 1.33, 0));
      sp.add(box(0.5, 0.45, 0.5, MAT.gold, 0, 1.58, 0));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.45, 4), MAT.shrineRed); roof.rotation.y = Math.PI / 4; roof.position.y = 2.03; sp.add(roof);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 8), MAT.gold); spire.position.y = 2.42; sp.add(spire);
      g2.add(sp); continue;
    }
    if (F.type === 'leanto') {
      const m = fmat(F.color), L = Math.hypot(F.zHigh - F.zLow, F.yHigh - F.yLow), ang = Math.atan2(F.yHigh - F.yLow, F.zHigh - F.zLow);
      const sl = box(F.x1 - F.x0, 0.05, L, m, (F.x0 + F.x1) / 2, (F.yHigh + F.yLow) / 2, (F.zHigh + F.zLow) / 2); sl.rotation.x = -ang; sl.name = F.note || 'lean-to'; floorGroups[1].add(sl);
      for (const x of F.posts || []) floorGroups[1].add(bb(x - 0.04, 0, F.zLow + 0.02, x + 0.04, F.yLow, F.zLow + 0.1, MAT.white));
      continue;
    }
    if (F.type === 'canopy') { // flat steel carport canopy: deep charcoal fascia, I-beam grid + diagonal bracing, smoke polycarbonate
      const [x0, z0, x1, z1] = F.rect, yT = F.top, fd = F.fascia ?? 0.3, open = new Set(F.open || []);
      const g2 = new THREE.Group(); g2.name = F.note || 'carport-canopy';
      const steel = MAT.canopy || MAT.metal, beam = MAT.metal;
      const smoke = new THREE.MeshStandardMaterial({ color: 0x4a5056, transparent: true, opacity: 0.42, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const sh = bb(x0, yT - 0.03, z0, x1, yT - 0.01, z1, smoke); sh.castShadow = false; sh.receiveShadow = false; sh.name = 'polycarbonate-smoke'; g2.add(sh);
      if (!open.has('front')) g2.add(bb(x0, yT - fd, z1 - 0.1, x1, yT + 0.02, z1, steel));
      if (!open.has('back')) g2.add(bb(x0, yT - fd, z0, x1, yT + 0.02, z0 + 0.1, steel));
      if (!open.has('left')) g2.add(bb(x0, yT - fd, z0, x0 + 0.1, yT + 0.02, z1, steel));
      if (!open.has('right')) g2.add(bb(x1 - 0.1, yT - fd, z0, x1, yT + 0.02, z1, steel));
      const bs = F.beamSpacing ?? 1.5, ps = F.purlinSpacing ?? 0.75;
      const nb = Math.max(1, Math.round((x1 - x0) / bs));
      for (let i = 1; i < nb; i++) { const x = x0 + (x1 - x0) * i / nb; // I-beam: web + flanges, run front-back
        g2.add(bb(x - 0.02, yT - 0.22, z0, x + 0.02, yT - 0.04, z1, beam)); g2.add(bb(x - 0.06, yT - 0.24, z0, x + 0.06, yT - 0.22, z1, beam)); g2.add(bb(x - 0.06, yT - 0.05, z0, x + 0.06, yT - 0.03, z1, beam)); }
      for (let z = z0 + ps; z < z1 - 0.15; z += ps) g2.add(bb(x0, yT - 0.11, z, x1, yT - 0.03, z + 0.05, beam));
      if (F.bracing !== false) { const xs = [x0, ...Array.from({ length: nb - 1 }, (_, i) => x0 + (x1 - x0) * (i + 1) / nb), x1];
        const bayZ = Math.min(2.4, (z1 - z0) / 2), zs = [[z0, z0 + bayZ], [z1 - bayZ, z1]];
        for (let i = 0; i < xs.length - 1; i++) for (const [za, zb] of zs) for (const dir of [1, -1]) {
          const dx = xs[i + 1] - xs[i], dz = zb - za, L = Math.hypot(dx, dz), r = box(0.025, 0.025, L, beam, (xs[i] + xs[i + 1]) / 2, yT - 0.16, (za + zb) / 2);
          r.rotation.y = Math.atan2(dx, dz) * dir; g2.add(r); } }
      for (const [px, pz] of F.posts || []) g2.add(bb(px - 0.05, 0, pz - 0.05, px + 0.05, yT - fd, pz + 0.05, beam));
      g2.traverse(o => { if (o.isMesh && o !== sh) o.castShadow = true; });
      floorGroups[1].add(g2); continue;
    }
    if (F.type === 'hedge') { const [x0, y0, z0, x1, y1, z1] = F.box; const m = bb(x0, y0, z0, x1, y1, z1, MAT.shrub); m.name = F.note || 'hedge'; floorGroups[1].add(m); continue; }
    if (F.type === 'sign') { const m = signMesh(F); if (m) groupFor(floorOfY(F.y ?? 0)).add(m); continue; }
    if (F.type === 'dome') {
      const g2 = new THREE.Group(); g2.name = F.note || 'cctv-dome'; g2.position.set(F.x, F.y, F.z);
      g2.add(box(0.2, 0.05, 0.2, MAT.white, 0, 0.12, 0)); g2.add(box(0.05, 0.1, 0.05, MAT.white, 0, 0.06, 0));
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), MAT.white); g2.add(d);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.2 })); lens.position.y = -0.03; g2.add(lens);
      if (F.amber) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xff8000, emissiveIntensity: 0.6 })); a.position.y = 0.2; g2.add(a); }
      groupFor(floorOfY(F.y)).add(g2); continue;
    }
    if (F.type === 'bullet') { // small wall/eave CCTV bullet camera
      const g2 = new THREE.Group(); g2.name = F.note || 'cctv'; g2.position.set(F.x, F.y, F.z); g2.rotation.y = F.rotY || 0;
      g2.add(box(0.08, 0.12, 0.08, MAT.white, 0, 0.06, 0)); g2.add(box(0.12, 0.1, 0.26, MAT.white, 0, -0.03, 0.1));
      g2.add(box(0.09, 0.07, 0.02, new THREE.MeshStandardMaterial({ color: 0x111111 }), 0, -0.03, 0.235));
      groupFor(floorOfY(F.y)).add(g2); continue;
    }
    const grp = groupFor(floorOfY(F.y0 ?? F.box?.[1] ?? 0));
    const P = F.plane, mat = fmat(F.color);
    // q(a range, y range, depth range from c)
    const q = (a, b, yA, yB, d0, d1, m = mat) => (P === 'z' ? bb(a, yA, F.c + d0, b, yB, F.c + d1, m) : bb(F.c + d0, yA, a, F.c + d1, yB, b, m));
    const out = F.out ?? 1, dd = (u, v) => (out > 0 ? [u, v] : [-v, -u]);
    if (F.type === 'frame') {
      const [d0, d1] = dd(0, F.depth), t = F.t;
      const bars = [[F.a0, F.a1, F.y1 - t, F.y1], [F.a0, F.a1, F.y0, F.y0 + t], [F.a0, F.a0 + t, F.y0, F.y1], [F.a1 - t, F.a1, F.y0, F.y1]];
      for (const [a, b, ya, yb] of bars) grp.add(q(a, b, ya, yb, d0, d1));
      if (F.outline) {
        const o = 0.05, [e0, e1] = dd(F.depth - 0.02, F.depth + 0.01), om = fmat(F.outline);
        const ob = [[F.a0 - o, F.a1 + o, F.y1, F.y1 + o], [F.a0 - o, F.a1 + o, F.y0 - o, F.y0], [F.a0 - o, F.a0, F.y0, F.y1], [F.a1, F.a1 + o, F.y0, F.y1]];
        for (const [a, b, ya, yb] of ob) grp.add(q(a, b, ya, yb, dd(0, F.depth)[0], dd(0, F.depth)[1], om));
      }
    } else if (F.type === 'louver') {
      const [d0, d1] = dd(0.12, 0.26);
      for (let y = F.y0 + 0.05; y < F.y1 - 0.05; y += 0.14) { const bl = q(F.a0, F.a1, y, y + 0.08, d0, d1); bl.rotation[P === 'z' ? 'x' : 'z'] = 0.35 * (P === 'z' ? 1 : -1) * out; grp.add(bl); }
      const [s0, s1] = dd(0.02, 0.3);
      grp.add(q(F.a0 - 0.06, F.a0, F.y0, F.y1, s0, s1)); grp.add(q(F.a1, F.a1 + 0.06, F.y0, F.y1, s0, s1));
      grp.add(q(F.a0 - 0.06, F.a1 + 0.06, F.y1 - 0.06, F.y1, s0, s1)); grp.add(q(F.a0 - 0.06, F.a1 + 0.06, F.y0, F.y0 + 0.06, s0, s1));
    } else if (F.type === 'slats') {
      const d = F.depth ?? 0.08;
      for (let a = F.a0; a + F.w <= F.a1 + 1e-6; a += F.spacing) grp.add(q(a, a + F.w, F.y0, F.y1, -d / 2, d / 2));
      grp.add(q(F.a0, F.a1, F.y1 - 0.05, F.y1, -d / 2, d / 2));
      grp.add(q(F.a0, F.a1, F.y0, F.y0 + 0.05, -d / 2, d / 2));
    } else if (F.type === 'hslats') {
      const d = F.depth ?? 0.05, h = F.h ?? 0.07;
      for (let y = F.y0; y + h <= F.y1 + 1e-6; y += F.spacing) grp.add(q(F.a0, F.a1, y, y + h, -d / 2, d / 2));
      grp.add(q(F.a0, F.a0 + 0.06, F.y0, F.y1, -d, d)); grp.add(q(F.a1 - 0.06, F.a1, F.y0, F.y1, -d, d));
    } else if (F.type === 'pergola') {
      const [x0, y0, z0, x1, y1, z1] = F.box; const g2 = groupFor(floorOfY(y0));
      g2.add(bb(x0, y0, z0, x1, y1, z0 + 0.12, mat)); g2.add(bb(x0, y0, z1 - 0.12, x1, y1, z1, mat));
      g2.add(bb(x0, y0, z0, x0 + 0.12, y1, z1, mat)); g2.add(bb(x1 - 0.12, y0, z0, x1, y1, z1, mat));
      if (F.dir === 'x') for (let z = z0 + F.spacing; z < z1 - 0.1; z += F.spacing) g2.add(bb(x0, y1 - 0.08, z, x1, y1, z + 0.06, mat));
      else for (let x = x0 + F.spacing; x < x1 - 0.1; x += F.spacing) g2.add(bb(x, y1 - 0.08, z0, x + 0.06, y1, z1, mat));
    }
  }

  // ---------- stairs (U-type) ----------
  for (const lv of data.levels.slice(0, 2)) {
    const g = floorGroups[lv.id];
    const [x0, z0, x1, z1] = stair;
    const rise = lv.top - lv.elevation, half = rise / 2, n = 9;
    const fw = (x1 - x0 - 0.1) / 2, land = 1.0, run = (z1 - z0 - land);
    for (let i = 0; i < n; i++) { const zA = z1 - (i + 1) * run / n; g.add(bb(x1 - fw, lv.elevation, zA, x1, lv.elevation + (i + 1) * half / n, zA + run / n, MAT.stair)); }
    g.add(bb(x0, lv.elevation + half - 0.15, z0, x1, lv.elevation + half, z0 + land, MAT.stair));
    for (let i = 0; i < n; i++) { const zB = z0 + land + i * run / n; g.add(bb(x0, lv.elevation + half + i * half / n, zB, x0 + fw, lv.elevation + half + (i + 1) * half / n, zB + run / n, MAT.stair)); }
    g.add(bb(x0 + fw, lv.elevation, z0 + land, x0 + fw + 0.1, lv.elevation + half + 1.0, z1, MAT.partition));
  }

  // ---------- columns, carport, cars (hidden by default) ----------
  const f1 = floorGroups[1];
  const col = (x, z, y1 = 3.45) => f1.add(bb(x - 0.12, 0, z - 0.12, x + 0.12, y1, z + 0.12, MAT.column));
  col(10.60, 8.78); col(17.23, 8.78); col(17.23, 2.12); 
  const cars = new THREE.Group(); cars.name = 'cars'; cars.visible = false; cars.userData.floor = 1;
  const car = (x, color) => {
    const c = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
    c.add(box(1.8, 0.7, 4.4, m, 0, 0.55, 0));
    c.add(box(1.6, 0.55, 2.2, new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.2 }), 0, 1.15, -0.2));
    c.position.set(x, 0.2, 6.3); return c;
  };
  cars.add(car(15.85, 0xbfc3c7)); cars.add(car(18.85, 0x2f7fc1));
  f1.add(cars);
  boundary.add(bb(3.10, 0, 0.12, 3.20, 1.8, 2.0, MAT.concrete));
  boundary.add(bb(10.70, 0, 0.12, 10.80, 1.8, 2.0, MAT.concrete));

  // ---------- main mono-pitch roof: thin slab, dark edge, light underside, clerestory gap ----------
  const rf = data.roof; const [rx0, rz0, rx1, rz1] = rf.rect;
  const depth = rz1 - rz0, rise = rf.highY - rf.lowY;
  const ang = Math.atan2(rise, depth);
  const W = rx1 - rx0, D = Math.hypot(depth, rise);
  const roofPivot = new THREE.Group(); roofPivot.name = 'main-roof';
  roofPivot.position.set((rx0 + rx1) / 2, (rf.lowY + rf.highY) / 2 + 0.1, (rz0 + rz1) / 2);
  roofPivot.rotation.x = rf.highSide === 'front' ? -ang : ang;
  // optional notch: rectangle cut from the FRONT (+z, street) corner at the low-x (ESE / street-view left) end
  const nt = rf.notch && rf.notch.width > 0 ? rf.notch : null;
  const nw = nt ? nt.width : 0, nd = nt ? nt.depth * D / depth : 0; // notch depth given in plan → along slope
  const RMAT = m => [MAT.roofUnder, MAT.roofUnder, m, MAT.roofUnder, MAT.roofUnder, MAT.roofUnder];
  const slab = box(W - nw, 0.12, D, RMAT(MAT.roofTop), nw / 2, 0, 0);
  { const t = MAT.roofTop.map; t.repeat.set((W - nw) / t.userData.step, 1); } slab.name = 'roof-slab'; roofPivot.add(slab);
  if (nt) {
    const t2 = MAT.roofTop.map.clone(); t2.needsUpdate = true; t2.repeat.set(nw / t2.userData.step, (D - nd) / D);
    const m2 = MAT.roofTop.clone(); m2.map = t2;
    const s2 = box(nw + 0.002, 0.12, D - nd, RMAT(m2), -W / 2 + nw / 2, 0, -nd / 2); s2.name = 'roof-slab-notch-strip'; roofPivot.add(s2);
    roofPivot.add(box(nw + 0.06, 0.32, 0.06, MAT.fascia, -W / 2 + nw / 2, -0.03, D / 2 - nd)); // notch inner edge (across)
    roofPivot.add(box(0.06, 0.32, nd, MAT.fascia, -W / 2 + nw, -0.03, D / 2 - nd / 2)); // notch inner edge (along slope)
  }
  roofPivot.add(box(W - nw + 0.06, 0.32, 0.06, MAT.fascia, nw / 2, -0.03, D / 2));
  roofPivot.add(box(W + 0.06, 0.32, 0.06, MAT.fascia, 0, -0.03, -D / 2));
  roofPivot.add(box(0.06, 0.32, D, MAT.fascia, W / 2, -0.03, 0));
  roofPivot.add(box(0.06, 0.32, D - nd, MAT.fascia, -W / 2, -0.03, -nd / 2));
  for (const st of rf.steps || []) {
    const ext = st.extendBack, cx = (st.fromX + st.toX) / 2 - (rx0 + rx1) / 2, w = st.toX - st.fromX;
    const zc = -D / 2 - ext / 2 + 0.03;
    const e = box(w, 0.12, ext + 0.06, [MAT.roofUnder, MAT.roofUnder, MAT.roofTop, MAT.roofUnder, MAT.roofUnder, MAT.roofUnder], cx, 0, zc); e.name = 'roof-step'; roofPivot.add(e);
    roofPivot.add(box(w + 0.06, 0.32, 0.06, MAT.fascia, cx, -0.03, -D / 2 - ext));
    roofPivot.add(box(0.06, 0.32, ext, MAT.fascia, cx + w / 2, -0.03, zc));
  }
  roofGroup.add(roofPivot);
  roofPivot.traverse(o => { if (o.isMesh && o.parent === roofPivot) o.castShadow = false; });
  // fill between floor-3 wall top (+9.20) and the sloped roof underside; thin clerestory glass strip at the high (front) side
  const under = z => rf.lowY + 0.04 + (rf.highSide === 'front' ? (z - rz0) : (rz1 - z)) / depth * rise;
  const wedge = (x0, x1, z0, z1) => {
    const sh = new THREE.Shape();
    sh.moveTo(z0, 9.2); sh.lineTo(z1, 9.2); sh.lineTo(z1, under(z1)); sh.lineTo(z0, under(z0)); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false });
    const m = new THREE.Mesh(geo, MAT.wall); m.rotation.y = -Math.PI / 2; m.position.x = x1; // shape x→ world z
    m.castShadow = false; m.receiveShadow = true; m.name = 'roof-gable-fill'; roofGroup.add(m);
  };
  wedge(3.00, 14.45, 1.90, 9.00); wedge(0.90, 3.00, 3.00, 6.40);
  if (rx1 > 15.5) wedge(14.45, Math.min(rx1 - 0.3, 17.45), 1.90, 5.30); // real roof extends over the floor-3 work bay
  // front fascia band (blue-grey) between floor-3 top and roof; bump-out top white with grey cap
  if (rf.frontFascia) {
    const zf = 9.0, top = under(zf + 0.08);
    const fb = bb(rf.frontFascia.from, 9.18, zf, rf.frontFascia.to, top, zf + 0.08, fmat(rf.frontFascia.color)); fb.name = 'front-fascia'; roofGroup.add(fb);
  }
  roofGroup.add(Object.assign(bb(0.86, 9.18, 3.0, 3.0, 9.30, 6.46, MAT.louver), { name: 'bumpout-cap' }));

  // ---------- solar panels (strings → side-by-side blocks on the main roof plane) ----------
  const sol = data.solar;
  const solar = new THREE.Group(); solar.name = 'solar-array';
  solar.userData = { pick: 'solar', floor: 4, strings: [] };
  const pg = sol.panelGap ?? 0.02;
  const strings = sol.strings ?? Array.from({ length: sol.groups }, (_, i) => ({ id: 'G' + (i + 1), label: 'กลุ่ม ' + (i + 1), count: sol.cols * sol.rows, cols: sol.cols, rows: sol.rows, offset: 0 }));
  const bgap = sol.blockGap ?? sol.groupGap ?? 0.3;
  const dims = strings.map(st => {
    const pn = st.panel || sol.panel; const land = st.orientation === 'landscape';
    const px = land ? pn.h : pn.w, pz = land ? pn.w : pn.h; // px along house length, pz along roof slope
    return { px, pz, land, wx: st.cols * px + (st.cols - 1) * pg, wz: st.rows * pz + (st.rows - 1) * pg };
  });
  const total = dims.reduce((a, d) => a + d.wx, 0) + bgap * (strings.length - 1);
  let idx = 0, xCur = sol.centerX - total / 2 - (rx0 + rx1) / 2;
  strings.forEach((st, gI) => {
    const dm = dims[gI];
    const mat = new THREE.MeshStandardMaterial({ map: solarTexture(st.style, dm.land), roughness: st.style === 'aiko' ? 0.35 : 0.25, metalness: 0.35 });
    const grp = new THREE.Group(); grp.name = 'string-' + st.id;
    grp.userData = { pick: 'solar', floor: 4, string: st.id, label: st.label };
    let n = 0;
    for (let r = st.rows - 1; r >= 0 && n < st.count; r--) for (let c = 0; c < st.cols && n < st.count; c++) {
      if (st.colRows && r >= st.colRows[c]) continue; // per-column row count, back-aligned (r=0 = back row)
      const x = xCur + c * (dm.px + pg) + dm.px / 2;
      const z = (st.offset || 0) + (st.colOffsets?.[c] || 0) - dm.wz / 2 + r * (dm.pz + pg) + dm.pz / 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(dm.px, 0.04, dm.pz), mat);
      p.position.set(x, 0.12, z); p.castShadow = true; p.name = 'panel-' + st.id + '-' + (n + 1); n++; idx++;
      p.userData = { pick: 'solar', floor: 4, panelIndex: n, group: gI + 1, string: st.id, stringLabel: st.label };
      grp.add(p); pickables.push(p);
    }
    solar.add(grp); solar.userData.strings.push({ id: st.id, label: st.label, count: n });
    xCur += dm.wx + bgap;
  });
  roofPivot.add(solar);
  roofGroup.userData.solar = solar;

  return { root, pickables, floorGroups, roofGroup, roomMeshes, solar, cars, boundary, planWalls };
}

/** Direction (local model coords) of a compass azimuth/elevation. Local +z = house front (road) at frontAz; local +x = frontAz-90. */
export function localDir(azDeg, elDeg, frontAz = 30) {
  const d = (azDeg - frontAz) * Math.PI / 180, e = elDeg * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(d) * Math.cos(e), Math.sin(e), Math.cos(d) * Math.cos(e));
}
