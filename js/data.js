// Data adapter: the UI only talks to this module.
// SimAdapter = demo data. ApiAdapter = the home reader (/api/snapshot, /api/history) — drop-in later.
import * as Sim from './sim.js';

class SimAdapter {
  constructor() { this.demo = true; this.name = 'ตัวจำลอง (ข้อมูลตัวอย่าง)'; }
  async snapshot() { return Sim.snapshot(new Date()); }
  async range(kind) { return Sim.range(kind, new Date()); }
}

// Maps the reader's /api/snapshot to the same shape. Fields the reader doesn't have yet fall back to null.
class ApiAdapter {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.demo = false; this.name = 'Sigenergy Modbus (ข้อมูลจริง)'; }
  async snapshot() {
    const s = await (await fetch(this.base + '/api/snapshot', { cache: 'no-store' })).json();
    this.demo = !!s.demo;
    s.inverter ??= { ac_kw: null, pv_kw: s.power_kw.pv, strings: [], temp_c: null, firmware: s.plant.firmware, rated_kw: 20 };
    s.gateway ??= { grid_kw: s.power_kw.grid, on_grid: s.plant.grid === 'On grid' };
    s.battery.modules ??= [];
    return s;
  }
  async range(kind) {
    // TODO(reader): add /api/range?kind=… with daily totals + flow matrix. Today: compute from 5-min history.
    const h = await (await fetch(this.base + '/api/history', { cache: 'no-store' })).json();
    const pts = h.points.map(p => ({ ...p, m: +p.t.slice(0, 2) * 60 + +p.t.slice(3, 5) }));
    return { kind, points: pts, ...flowsFromPoints(pts, 5 / 60) };
  }
}

/** Energy totals + allocation matrix from power points (works for any source). */
export function flowsFromPoints(pts, h) {
  const E = { pv: 0, home: 0, imp: 0, exp: 0, chg: 0, dis: 0, ev: 0 };
  const F = { pv_home: 0, pv_ev: 0, pv_bat: 0, pv_grid: 0, bat_home: 0, bat_ev: 0, grid_home: 0, grid_ev: 0 };
  for (const p of pts) {
    const pv = Math.max(p.pv || 0, 0), home = Math.max(p.home || 0, 0), ev = Math.max(p.ev || 0, 0), b = p.battery || 0, g = p.grid || 0;
    E.pv += pv * h; E.home += home * h; E.ev += ev * h; E.chg += Math.max(b, 0) * h; E.dis += Math.max(-b, 0) * h; E.imp += Math.max(g, 0) * h; E.exp += Math.max(-g, 0) * h;
    let s = pv; const a1 = Math.min(s, home); s -= a1; const a2 = Math.min(s, ev); s -= a2; const a3 = Math.min(s, Math.max(b, 0)); s -= a3;
    let nh = home - a1, ne = ev - a2, d = Math.max(-b, 0); const b1 = Math.min(d, nh); d -= b1; nh -= b1; const b2 = Math.min(d, ne); ne -= b2;
    F.pv_home += a1 * h; F.pv_ev += a2 * h; F.pv_bat += a3 * h; F.pv_grid += s * h; F.bat_home += b1 * h; F.bat_ev += b2 * h; F.grid_home += nh * h; F.grid_ev += ne * h;
  }
  return { E, F };
}

export function createAdapter() {
  const q = new URLSearchParams(location.search);
  const api = q.get('api') || localStorage.getItem('he.api');
  return api ? new ApiAdapter(api) : new SimAdapter();
}
export { Sim };
