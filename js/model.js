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

export const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.9 }),
  partition: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  band: new THREE.MeshStandardMaterial({ color: 0x4b5157, roughness: 0.7 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x6fae98, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.5 }),
  railGlass: new THREE.MeshStandardMaterial({ color: 0xbfd8d0, transparent: true, opacity: 0.35, roughness: 0.1 }),
  louver: new THREE.MeshStandardMaterial({ color: 0x5d6369, roughness: 0.6 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8f7d68, roughness: 1 }),
  roof: new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.8 }),
  fascia: new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.6 }),
  metalRoof: new THREE.MeshStandardMaterial({ color: 0x6b7076, roughness: 0.6 }),
  plinth: new THREE.MeshStandardMaterial({ color: 0xbdb7ad, roughness: 1 }),
  lawn: new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 1 }),
  stair: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.8 }),
  column: new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.8 }),
};

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

function solarTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2436'; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#3a4a66'; g.lineWidth = 2;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * 128 / 6, 0); g.lineTo(i * 128 / 6, 256); g.stroke(); }
  for (let j = 1; j < 12; j++) { g.beginPath(); g.moveTo(0, j * 256 / 12); g.lineTo(128, j * 256 / 12); g.stroke(); }
  g.strokeStyle = '#c9ced6'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildHouse(data) {
  const root = new THREE.Group(); root.name = 'house';
  const levels = Object.fromEntries(data.levels.map(l => [l.id, l]));
  const pickables = [];
  const floorGroups = {};
  const roomMeshes = {};
  const tag = (o, floor) => { o.userData.floor = floor; return o; };

  // ---------- site ----------
  const site = tag(new THREE.Group(), 0); site.name = 'site'; root.add(site);
  const lot = data.meta.lot;
  const lawn = bb(0, -0.05, 0, lot.width, 0.0, lot.depth, MAT.lawn); lawn.name = 'lawn'; site.add(lawn);
  site.add(Object.assign(bb(-4, -0.06, lot.depth, lot.width + 4, -0.01, lot.depth + 6, MAT.road), { name: 'road' }));
  // plinth under main house (ground floor +0.45)
  site.add(Object.assign(bb(3.10, 0, 2.00, 14.35, 0.30, 8.90, MAT.plinth), { name: 'plinth' }));
  site.add(bb(1.00, 0, 3.10, 3.10, 0.20, 6.30, MAT.plinth));
  // low boundary walls (assumed)
  site.add(bb(0, 0, 0, 0.12, 1.5, lot.depth, MAT.wall));
  site.add(bb(0, 0, 0, lot.width, 1.8, 0.12, MAT.wall));

  for (const lv of data.levels) {
    const g = tag(new THREE.Group(), lv.id); g.name = 'floor-' + lv.id; root.add(g);
    floorGroups[lv.id] = g;
  }
  const roofGroup = tag(new THREE.Group(), 4); roofGroup.name = 'roof'; root.add(roofGroup);

  const stair = data.stair.rect;

  // ---------- room floor tiles (clickable) ----------
  for (const r of data.rooms) {
    const lv = levels[r.floor];
    const top = r.elev ?? lv.elevation;
    const [x0, z0, x1, z1] = r.rect;
    const shape = new THREE.Shape();
    shape.moveTo(x0, -z0); shape.lineTo(x1, -z0); shape.lineTo(x1, -z1); shape.lineTo(x0, -z1); shape.closePath();
    const hasHole = r.floor > 1 && overlap(r.rect, stair);
    if (hasHole) {
      const h = new THREE.Path();
      h.moveTo(stair[0], -stair[1]); h.lineTo(stair[0], -stair[3]); h.lineTo(stair[2], -stair[3]); h.lineTo(stair[2], -stair[1]); h.closePath();
      shape.holes.push(h);
    }
    const thick = r.floor === 1 ? Math.max(top - 0.0, 0.1) : 0.2;
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

  // ---------- walls via cell grid ----------
  for (const lv of data.levels) {
    const rooms = data.rooms.filter(r => r.floor === lv.id);
    const g = floorGroups[lv.id];
    const xs = [...new Set(rooms.flatMap(r => [r.rect[0], r.rect[2]]))].sort((a, b) => a - b);
    const zs = [...new Set(rooms.flatMap(r => [r.rect[1], r.rect[3]]))].sort((a, b) => a - b);
    const owner = (x, z) => rooms.find(r => inRect(r.rect, x, z)) || null;
    const isIn = r => r && INDOOR.has(r.kind);
    const y0 = lv.elevation, y1 = lv.top;
    const segs = []; // {axis:'x'|'z', c, a0, a1, A, B} A/B rooms either side
    // vertical edges (constant x)
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
    // merge collinear segments with same pair
    segs.sort((p, q) => p.axis.localeCompare(q.axis) || p.c - q.c || p.a0 - q.a0);
    const merged = [];
    for (const s of segs) {
      const L = merged[merged.length - 1];
      if (L && L.axis === s.axis && L.c === s.c && Math.abs(L.a1 - s.a0) < 1e-6 && L.A === s.A && L.B === s.B) L.a1 = s.a1;
      else merged.push({ ...s });
    }
    for (const s of merged) {
      const exterior = !(isIn(s.A) && isIn(s.B));
      if (!exterior) { addPartition(g, s, y0, y1); continue; }
      const inside = isIn(s.A) ? s.A : s.B;
      const outsideRoom = isIn(s.A) ? s.B : s.A;
      const outwardSign = isIn(s.A) ? 1 : -1; // A is on the low side
      addExteriorWall(g, s, y0, y1, inside, outsideRoom, outwardSign, lv.id);
    }
    // railings for balconies / terrace on edges not touching indoor rooms
    for (const r of rooms.filter(r => r.kind === 'balcony')) {
      const [x0, z0, x1, z1] = r.rect; const yb = r.elev ?? lv.elevation;
      const edges = [
        ['x', z0, x0, x1, -1], ['x', z1, x0, x1, 1], ['z', x0, z0, z1, -1], ['z', x1, z0, z1, 1]];
      for (const [axis, c, a0, a1, sgn] of edges) {
        const probe = axis === 'x' ? owner((a0 + a1) / 2, c + sgn * 0.01) : owner(c + sgn * 0.01, (a0 + a1) / 2);
        if (probe) continue;
        addRailing(g, axis, c, a0, a1, yb);
      }
    }
    // dark grey slab band around exterior of upper floors
    if (lv.id > 1) {
      for (const s of merged.filter(s => !(isIn(s.A) && isIn(s.B)))) {
        const sign = isIn(s.A) ? 1 : -1;
        const off = s.c + sign * 0.13;
        if (s.axis === 'x') g.add(bb(s.a0 - 0.05, y0 - 0.32, off - 0.05, s.a1 + 0.05, y0 + 0.02, off + 0.05, MAT.band));
        else g.add(bb(off - 0.05, y0 - 0.32, s.a0 - 0.05, off + 0.05, y0 + 0.02, s.a1 + 0.05, MAT.band));
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
    for (const [a, b] of pieces) {
      g.add(s.axis === 'x' ? bb(a, y0, s.c - t / 2, b, y1, s.c + t / 2, MAT.partition) : bb(s.c - t / 2, y0, a, s.c + t / 2, y1, b, MAT.partition));
    }
    if (door) g.add(s.axis === 'x' ? bb(mid - door / 2, y0 + 2.1, s.c - t / 2, mid + door / 2, y1, s.c + t / 2, MAT.partition)
      : bb(s.c - t / 2, y0 + 2.1, mid - door / 2, s.c + t / 2, y1, mid + door / 2, MAT.partition));
  }

  function addExteriorWall(g, s, y0, y1, inside, outsideRoom, outwardSign, floor) {
    const t = 0.2, L = s.a1 - s.a0;
    const wet = inside.kind === 'wet';
    const toBalcony = outsideRoom && (outsideRoom.kind === 'balcony' || outsideRoom.kind === 'porch');
    let ww = 0, sill = 0, head = 0;
    if (wet) { ww = Math.min(0.8, L * 0.5); sill = 1.5; head = 2.1; }
    else if (toBalcony) { ww = Math.min(L - 0.6, 2.6); sill = 0.02; head = 2.3; }
    else if (L >= 1.2) { ww = Math.min(L * 0.55, floor === 1 ? 2.6 : 2.2); sill = floor === 1 ? 0.6 : 0.8; head = 2.3; }
    // stair hall back wall: tall glass (assumed)
    if (inside.id === 'f1-stair' && s.axis === 'x' && s.c === 2.0) { ww = 1.6; sill = 0.6; head = 2.9; }
    const c = s.c, h = y1 - y0;
    const make = (a, b, ya, yb, mat) => s.axis === 'x' ? bb(a, ya, c - t / 2, b, yb, c + t / 2, mat) : bb(c - t / 2, ya, a, c + t / 2, yb, b, mat);
    if (ww <= 0.3) { g.add(make(s.a0, s.a1, y0, y1, MAT.wall)); return; }
    const mid = (s.a0 + s.a1) / 2, w0 = mid - ww / 2, w1 = mid + ww / 2;
    g.add(make(s.a0, w0, y0, y1, MAT.wall));
    g.add(make(w1, s.a1, y0, y1, MAT.wall));
    if (sill > 0.05) g.add(make(w0, w1, y0, y0 + sill, MAT.wall));
    g.add(make(w0, w1, y0 + head, y1, MAT.wall));
    // glass + frame
    const gl = s.axis === 'x' ? bb(w0, y0 + sill, c - 0.02, w1, y0 + head, c + 0.02, MAT.glass) : bb(c - 0.02, y0 + sill, w0, c + 0.02, y0 + head, w1, MAT.glass);
    gl.castShadow = false; gl.name = 'glass'; g.add(gl);
    const f = 0.06, fo = outwardSign * 0.09;
    const frame = (a, b, ya, yb) => s.axis === 'x' ? bb(a, ya, c + fo - 0.03, b, yb, c + fo + 0.03, MAT.frame) : bb(c + fo - 0.03, ya, a, c + fo + 0.03, yb, b, MAT.frame);
    g.add(frame(w0 - f, w1 + f, y0 + head, y0 + head + f));
    g.add(frame(w0 - f, w1 + f, y0 + sill - f, y0 + sill));
    g.add(frame(w0 - f, w0, y0 + sill, y0 + head));
    g.add(frame(w1, w1 + f, y0 + sill, y0 + head));
    g.add(frame(mid - f / 2, mid + f / 2, y0 + sill, y0 + head));
  }

  function addRailing(g, axis, c, a0, a1, yb) {
    const h = 1.05;
    if (axis === 'x') {
      g.add(bb(a0, yb, c - 0.02, a1, yb + h, c + 0.02, MAT.railGlass));
      g.add(bb(a0, yb + h, c - 0.04, a1, yb + h + 0.05, c + 0.04, MAT.rail));
    } else {
      g.add(bb(c - 0.02, yb, a0, c + 0.02, yb + h, a1, MAT.railGlass));
      g.add(bb(c - 0.04, yb + h, a0, c + 0.04, yb + h + 0.05, a1, MAT.rail));
    }
  }

  // ---------- stairs (U-type) ----------
  for (const lv of data.levels.slice(0, 2)) {
    const g = floorGroups[lv.id];
    const [x0, z0, x1, z1] = stair;
    const rise = lv.top - lv.elevation, half = rise / 2, n = 9;
    const fw = (x1 - x0 - 0.1) / 2, land = 1.0, run = (z1 - z0 - land);
    // flight A: right half, going from front (z1) toward back, up to landing
    for (let i = 0; i < n; i++) {
      const zA = z1 - (i + 1) * run / n;
      g.add(bb(x1 - fw, lv.elevation, zA, x1, lv.elevation + (i + 1) * half / n, zA + run / n, MAT.stair));
    }
    g.add(bb(x0, lv.elevation + half - 0.15, z0, x1, lv.elevation + half, z0 + land, MAT.stair));
    // flight B: left half, from landing toward front
    for (let i = 0; i < n; i++) {
      const zB = z0 + land + i * run / n;
      g.add(bb(x0, lv.elevation + half + i * half / n, zB, x0 + fw, lv.elevation + half + (i + 1) * half / n, zB + run / n, MAT.stair));
    }
    g.add(bb(x0 + fw, lv.elevation, z0 + land, x0 + fw + 0.1, lv.elevation + half + 1.0, z1, MAT.partition));
  }

  // ---------- columns & carport ----------
  const f1 = floorGroups[1];
  const col = (x, z, y1 = 3.45) => f1.add(bb(x - 0.12, 0, z - 0.12, x + 0.12, y1, z + 0.12, MAT.column));
  col(14.35, 8.90); col(10.60, 8.90); col(17.23, 8.78); col(17.23, 2.12); col(20.15, 9.75, 3.3); col(20.15, 2.95, 3.3);
  // stone cladding at entrance (porch side of dining wall)
  f1.add(bb(10.70, 0.35, 7.20, 10.80, 3.40, 8.90, MAT.stone));
  // pergola over right carport bay (+3.3, assumed slatted)
  const perg = tag(new THREE.Group(), 1); perg.name = 'pergola';
  perg.add(bb(17.35, 3.20, 2.80, 20.30, 3.32, 2.95, MAT.wood));
  perg.add(bb(17.35, 3.20, 9.75, 20.30, 3.32, 9.90, MAT.wood));
  for (let x = 17.45; x < 20.3; x += 0.32) perg.add(bb(x, 3.32, 2.80, x + 0.07, 3.42, 9.90, MAT.wood));
  f1.add(perg);
  // simple cars (2 bays)
  const car = (x, color) => {
    const c = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
    c.add(box(1.8, 0.7, 4.4, m, 0, 0.55, 0));
    c.add(box(1.6, 0.55, 2.2, new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.2 }), 0, 1.15, -0.2));
    c.position.set(x, 0.2, 6.3); return c;
  };
  f1.add(car(15.85, 0xbfc3c7)); f1.add(car(18.85, 0x2f7fc1));

  // laundry yard low walls (assumed)
  f1.add(bb(3.10, 0, 0.12, 3.20, 1.8, 2.0, MAT.wall));
  f1.add(bb(10.70, 0, 0.12, 10.80, 1.8, 2.0, MAT.wall));

  // ---------- facade details ----------
  const f3 = floorGroups[3];
  // two tall grey louvered panels on floor-3 front (assumed positions)
  for (const xc of [4.3, 7.4]) {
    for (let k = 0; k < 14; k++) f3.add(bb(xc - 0.55, 6.6 + k * 0.17, 8.98, xc + 0.55, 6.66 + k * 0.17, 9.12, MAT.louver));
    f3.add(bb(xc - 0.6, 6.5, 8.95, xc - 0.55, 9.05, 9.14, MAT.louver));
    f3.add(bb(xc + 0.55, 6.5, 8.95, xc + 0.6, 9.05, 9.14, MAT.louver));
  }
  // vertical slats at stair-hall front glass (floors 2-3, assumed)
  for (let x = 8.4; x < 10.5; x += 0.22) {
    f3.add(bb(x, 6.45, 9.02, x + 0.06, 9.15, 9.14, MAT.louver));
  }
  // low metal roof over floor-3 work bay & floor-2 back bay
  roofGroup.add(bb(14.35, 9.20, 1.80, 17.55, 9.32, 5.40, MAT.metalRoof));

  // ---------- main mono-pitch roof ----------
  const rf = data.roof; const [rx0, rz0, rx1, rz1] = rf.rect;
  const depth = rz1 - rz0, rise = rf.highY - rf.lowY;
  const ang = Math.atan2(rise, depth);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(rx1 - rx0, 0.18, Math.hypot(depth, rise)), MAT.roof);
  const roofPivot = new THREE.Group();
  roofPivot.position.set((rx0 + rx1) / 2, (rf.lowY + rf.highY) / 2, (rz0 + rz1) / 2);
  roofPivot.rotation.x = rf.highSide === 'front' ? -ang : ang; // -ang lifts the +z (front) edge
  slab.castShadow = true; slab.receiveShadow = true; slab.name = 'roof-slab';
  roofPivot.add(slab);
  // fascia rim
  const W = rx1 - rx0, D = Math.hypot(depth, rise);
  roofPivot.add(box(W + 0.1, 0.35, 0.1, MAT.fascia, 0, 0, D / 2));
  roofPivot.add(box(W + 0.1, 0.35, 0.1, MAT.fascia, 0, 0, -D / 2));
  roofPivot.add(box(0.1, 0.35, D, MAT.fascia, W / 2, 0, 0));
  roofPivot.add(box(0.1, 0.35, D, MAT.fascia, -W / 2, 0, 0));
  roofGroup.add(roofPivot);
  // gable infill between wall top (9.20) and sloped roof on side walls
  // (simple: a thin white band under the roof along the main body)
  roofGroup.add(bb(3.10, 9.10, 2.00, 14.35, 9.25, 8.90, MAT.wall));

  // ---------- solar panels ----------
  const sol = data.solar;
  const solar = new THREE.Group(); solar.name = 'solar-array';
  solar.userData = { pick: 'solar', floor: 4 };
  const pm = new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.25, metalness: 0.4 });
  const gw = sol.cols * sol.panel.w + (sol.cols - 1) * sol.panelGap;
  const total = sol.groups * gw + (sol.groups - 1) * sol.groupGap;
  const gd = sol.rows * sol.panel.h + (sol.rows - 1) * sol.panelGap;
  let idx = 0;
  for (let gI = 0; gI < sol.groups; gI++) for (let c = 0; c < sol.cols; c++) for (let r = 0; r < sol.rows; r++) {
    const x = sol.centerX - total / 2 + gI * (gw + sol.groupGap) + c * (sol.panel.w + sol.panelGap) + sol.panel.w / 2 - (rx0 + rx1) / 2;
    const z = -gd / 2 + r * (sol.panel.h + sol.panelGap) + sol.panel.h / 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(sol.panel.w, 0.04, sol.panel.h), pm);
    p.position.set(x, 0.16, z);
    p.castShadow = true; p.name = 'panel-' + (++idx);
    p.userData = { pick: 'solar', floor: 4, panelIndex: idx, group: gI + 1 };
    solar.add(p); pickables.push(p);
  }
  roofPivot.add(solar);
  roofGroup.userData.solar = solar;

  return { root, pickables, floorGroups, roofGroup, roomMeshes, solar };
}
