// Simulator for the owner's system (demo data). Port of reader/simulator.py with extras
// (PV strings, multi-day history). SigenStor EC 20.0 TP · 2× BAT 10.0 · EVDC 25 · Gateway Home TP 30K.
export const LAT = 13.75, LON = 100.5;
// Real string layout from mySigen (PV Panel page). vmp/imp = approx. module datasheet values (unverified).
export const PV_STRINGS = [
  { id: 'PV1', brand: 'AIKO', w: 670, n: 12, kwp: 8.04, vmp: 41.6, share: 0.384 },
  { id: 'PV2', brand: 'Jinko', w: 580, n: 12, kwp: 6.96, vmp: 42.3, share: 0.348 },
  { id: 'PV3', brand: 'Jinko', w: 580, n: 10, kwp: 5.80, vmp: 42.3, share: 0.268 },
  { id: 'PV4', brand: null, w: 0, n: 0, kwp: 0, vmp: 0, share: 0 },
];
export const CFG = { pv_kwp: 20.8, panels: 34, inverter_kw: 20, batt_kwh: 20, batt_max_kw: 10, soc_min: 10, soc_max: 100, ev_kw: 5 };
const TZ_MS = 7 * 3600e3;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function bkk(d) { const t = new Date(d.getTime() + TZ_MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), min: t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60, dow: t.getUTCDay(), key: Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) / 864e5) }; }
const dayFromKey = key => { const t = new Date(key * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay(), key }; };
function doy(p) { return Math.floor((Date.UTC(p.y, p.m, p.d) - Date.UTC(p.y, 0, 0)) / 864e5); }

/** Sun position for Bangkok: {elev, az} in degrees, az from north clockwise. */
export function sunPos(p, minute) {
  const n = doy(p), b = (2 * Math.PI / 365) * (n - 81);
  const decl = (23.44 * Math.PI / 180) * Math.sin(b);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const st = minute / 60 + (4 * (LON - 105) + eot) / 60, ha = (15 * (st - 12)) * Math.PI / 180, lat = LAT * Math.PI / 180;
  const se = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const el = Math.asin(Math.max(-1, Math.min(1, se)));
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(decl) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat)))));
  if (ha > 0) az = 2 * Math.PI - az;
  return { elev: el * 180 / Math.PI, az: az * 180 / Math.PI };
}
export function sunTimes(p) { // minutes of sunrise / sunset
  let rise = null, set = null;
  for (let m = 0; m < 1440; m += 2) { const e = sunPos(p, m).elev; if (e > 0 && rise === null) rise = m; if (e > 0) set = m; }
  return { rise, set };
}

function cloud(p) { const r = rng(p.key * 7919); const base = 0.82 + 0.18 * r(); const w = []; for (let k = 0; k < 4; k++) w.push([0.02 + 0.06 * r(), 45 + 135 * r(), 6.28 * r()]); return { base, w, r2: r(), rain: r() < 0.18 }; }
function pvKw(p, m, cp) { const e = sunPos(p, m).elev; if (e <= 0) return 0; let f = cp.base * (cp.rain ? 0.55 : 1); for (const [a, per, ph] of cp.w) f -= a * (0.5 + 0.5 * Math.sin(m / per * 6.283 + ph)); f = Math.max(0.25, Math.min(1, f)); return Math.min(CFG.inverter_kw, CFG.pv_kwp * 1.12 * Math.pow(Math.sin(e * Math.PI / 180), 1.3) * f); }
function loadKw(p, m, cp) { const h = m / 60, we = p.dow === 0 || p.dow === 6, g = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  return Math.max(0.3, 0.55 + 1.2 * g(7, 0.8) + (we ? 1.6 : 0.9) * g(13, 2.5) + 2.8 * g(20.5, 1.6) + ((h >= 22 || h < 5) ? 1.1 : 0) + 0.14 * Math.sin(m / 9 + cp.r2 * 6) + 0.06 * Math.sin(m / 3.1)); }
function evWin(p) { return (p.dow === 0 || p.dow === 6) ? [600, 720] : [690, 780]; }
function evKw(p, m) { const [s, e] = evWin(p); return (m >= s && m < e) ? CFG.ev_kw * (0.95 + 0.05 * Math.sin(m / 5)) : 0; }

const cache = new Map();
/** Simulate one Bangkok day minute-by-minute up to `until` (minutes). Returns state, 5-min points, energy & flow matrix (kWh). */
export function simulateDay(p, until = 1439) {
  until = Math.floor(until);
  const ck = p.key + ':' + until; if (cache.has(ck)) return cache.get(ck);
  const cp = cloud(p), r = rng(p.key * 104729); let soc = 50 + 20 * r(); const ev0 = 30 + 20 * r();
  const E = { pv: 0, home: 0, imp: 0, exp: 0, chg: 0, dis: 0, ev: 0 };
  const F = { pv_home: 0, pv_ev: 0, pv_bat: 0, pv_grid: 0, bat_home: 0, bat_ev: 0, grid_home: 0, grid_ev: 0 };
  const pts = []; let last, acc = { pv: 0, home: 0, battery: 0, grid: 0, ev: 0, n: 0 };
  for (let m = 0; m <= until; m++) {
    const pv = pvKw(p, m, cp), home = loadKw(p, m, cp), ev = evKw(p, m), sur = pv - home - ev, cap = CFG.batt_kwh; let b;
    if (sur > 0) b = Math.min(sur, CFG.batt_max_kw, (CFG.soc_max - soc) / 100 * cap * 60); else b = -Math.min(-sur, CFG.batt_max_kw, (soc - CFG.soc_min) / 100 * cap * 60);
    const grid = -(sur - b), h = 1 / 60; soc += b * h / cap * 100 * (b > 0 ? 0.95 : 1);
    E.pv += pv * h; E.home += home * h; E.ev += ev * h; E.chg += Math.max(b, 0) * h; E.dis += Math.max(-b, 0) * h; E.imp += Math.max(grid, 0) * h; E.exp += Math.max(-grid, 0) * h;
    // allocation: solar → home → EV → battery → export; then battery → home/EV; then grid
    let s = pv; const a1 = Math.min(s, home); s -= a1; const a2 = Math.min(s, ev); s -= a2; const a3 = Math.min(s, Math.max(b, 0)); s -= a3;
    let needH = home - a1, needE = ev - a2, d = Math.max(-b, 0); const b1 = Math.min(d, needH); d -= b1; needH -= b1; const b2 = Math.min(d, needE); needE -= b2;
    F.pv_home += a1 * h; F.pv_ev += a2 * h; F.pv_bat += a3 * h; F.pv_grid += s * h; F.bat_home += b1 * h; F.bat_ev += b2 * h; F.grid_home += needH * h; F.grid_ev += needE * h;
    last = { pv, home, ev, batt: b, grid, soc, minute: m };
    acc.pv += pv; acc.home += home; acc.battery += b; acc.grid += grid; acc.ev += ev; acc.n++;
    if (m % 5 === 4 || m === until) { const n = acc.n; pts.push({ m: m - (n - 1) / 2, pv: acc.pv / n, home: acc.home / n, battery: acc.battery / n, grid: acc.grid / n, ev: acc.ev / n, soc }); acc = { pv: 0, home: 0, battery: 0, grid: 0, ev: 0, n: 0 }; }
  }
  const [s0, s1] = evWin(p);
  const res = { last, pts, E, F, evSoc: Math.min(95, ev0 + E.ev / 60 * 100), evMin: last.minute >= s0 ? Math.max(0, Math.min(last.minute, s1) - s0) : 0, rain: cp.rain };
  if (cache.size > 80) cache.clear(); cache.set(ck, res); return res;
}

/** Full snapshot in the same shape as the reader's /api/snapshot (+ extras used by device pages). */
export function snapshot(now = new Date()) {
  const p = bkk(now), s = simulateDay(p, p.min), e = s.E, L = s.last;
  const j = (x, k) => x ? x * (1 + 0.03 * Math.sin(now.getTime() / 4000 + k)) : x;
  const pv = j(L.pv, 1), home = j(L.home, 2), batt = j(L.batt, 3), ev = L.ev, grid = home + ev + batt - pv;
  const days = p.key - Math.floor(Date.UTC(2025, 5, 1) / 864e5);
  const tempAmb = 27 + 6 * Math.max(0, Math.sin((p.min / 60 - 7) / 14 * Math.PI));
  // real strings: PV1 AIKO 670W×12, PV2 Jinko 580W×12, PV3 Jinko 580W×10, PV4 unused
  const strings = PV_STRINGS.map(st => {
    if (!st.n) return { ...st, kw: 0, v: 0, a: 0, unused: true };
    const kw = pv * st.share, tcell = tempAmb + 25 * kw / st.kwp;
    const v = kw > 0.02 ? st.n * st.vmp * (1 - 0.0029 * (tcell - 25)) : 0;
    return { ...st, kw, v, a: v ? kw * 1000 / v : 0, unused: false };
  });
  return {
    ts: new Date(now.getTime() + TZ_MS).toISOString().slice(0, 19) + '+07:00', tz: 'Asia/Bangkok', source: 'simulate', demo: true,
    plant: { model: 'SigenStor EC 20.0 TP', firmware: 'SIM-0.2', running_state: 'Running', running_state_th: 'ทำงานปกติ', ems_mode: 'Max self consumption', grid: 'On grid', grid_sensor_connected: true },
    power_kw: { pv, home, battery: batt, grid, ev },
    battery: { soc_pct: L.soc, soh_pct: 99.2, capacity_kwh: 20, temp_c: 29.5 + 3 * Math.abs(batt) / 10, state: batt > 0.05 ? 'charging' : batt < -0.05 ? 'discharging' : 'idle',
      modules: [{ name: 'SigenStor BAT 10.0 #1', soc: L.soc + 0.4, kw: batt / 2 }, { name: 'SigenStor BAT 10.0 #2', soc: L.soc - 0.4, kw: batt / 2 }] },
    ev: { state: ev > 0 ? 'Charging' : 'Idle', state_th: ev > 0 ? 'กำลังชาร์จ' : 'ว่าง', power_kw: ev, vehicle_soc_pct: ev > 0 ? s.evSoc : null, session_kwh: e.ev, session_min: s.evMin },
    today_kwh: { pv: e.pv, home: e.home, grid_import: e.imp, grid_export: e.exp, battery_charge: e.chg, battery_discharge: e.dis, ev: e.ev },
    total_kwh: { pv: Math.max(days, 0) * 38 + e.pv, home: Math.max(days, 0) * 30.5 + e.home, grid_import: days * 6.5 + e.imp, grid_export: days * 4 + e.exp, ev: days * 12 + e.ev },
    self_sufficiency_pct: Math.max(0, Math.min(100, 100 * (1 - e.imp / Math.max(e.home + e.ev, 0.01)))),
    inverter: { ac_kw: pv - batt - ev, pv_kw: pv, strings, temp_c: tempAmb + 8 + 6 * pv / 10, firmware: 'SIM-0.2', rated_kw: 20 },
    gateway: { grid_kw: grid, on_grid: true, voltage: [230.5, 229.8, 231.2] },
    alarms: [], errors: [],
  };
}

/** Range data: today / yesterday → 5-min points; 7d / 30d → daily totals. Energy & flows summed. */
export function range(kind, now = new Date()) {
  const p = bkk(now);
  const sum = (a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; return a; };
  if (kind === 'today' || kind === 'yesterday') {
    const dp = kind === 'today' ? p : dayFromKey(p.key - 1);
    const s = simulateDay(dp, kind === 'today' ? p.min : 1439);
    return { kind, points: s.pts, E: { ...s.E }, F: { ...s.F } };
  }
  const n = kind === '7d' ? 7 : 30, days = [], E = {}, F = {};
  for (let i = n - 1; i >= 0; i--) {
    const dp = dayFromKey(p.key - i), s = simulateDay(dp, i === 0 ? p.min : 1439);
    days.push({ key: dp.key, label: `${dp.d}/${dp.m + 1}`, ...s.E }); sum(E, s.E); sum(F, s.F);
  }
  return { kind, days, E, F };
}
