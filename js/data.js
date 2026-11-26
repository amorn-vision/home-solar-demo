// Data adapter: the UI only talks to this module.
// SimAdapter = demo data. ApiAdapter = the Home Hub on the LAN (/api/live …).
import * as Sim from './sim.js';

class SimAdapter {
  constructor() { this.demo = true; this.name = 'ตัวจำลอง (ข้อมูลตัวอย่าง)'; }
  async snapshot() { return Sim.snapshot(new Date()); }
  async range(kind) { return Sim.range(kind, new Date()); }
}

// Live data from the Home Hub on the home LAN (/api/live, /api/today, /api/day, /api/days).
// Same snapshot shape as the simulator. Used automatically when the page is served by the hub,
// or with ?api=http://<hub>:8080 . The public GitHub Pages demo never finds a hub and stays on SimAdapter.
const isoDay = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
class ApiAdapter {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.demo = false; this.live = true; this.name = 'Home Hub · Sigenergy Modbus (ข้อมูลจริง)'; this.last = null; }
  async get(path) { const r = await fetch(this.base + path, { cache: 'no-store' }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }
  async snapshot() {
    let s;
    try { s = await this.get('/api/live'); }
    catch (e) { if (!this.last) throw e; return { ...this.last, errors: ['เชื่อมต่อ Home Hub ไม่ได้'] }; }
    this.demo = !!s.demo; this.name = s.demo ? 'Home Hub · โหมดจำลอง' : 'Home Hub · Sigenergy Modbus (ข้อมูลจริง)';
    const raw = s.pv_strings || s.inverter?.pv_strings || [];
    const strings = Sim.PV_STRINGS.map(cfg => { const r = raw.find(x => x.id === cfg.id) || {}; return { ...cfg, kw: r.kw ?? 0, v: r.v ?? 0, a: r.a ?? 0, unused: !cfg.n }; });
    s.inverter = { ac_kw: null, temp_c: null, firmware: s.plant?.firmware, rated_kw: 20, ...(s.inverter || {}), pv_kw: s.inverter?.pv_kw ?? s.power_kw.pv, strings };
    s.gateway ??= { grid_kw: s.power_kw.grid, on_grid: s.plant.grid === 'On grid' };
    s.battery.modules ??= [];
    for (const k of ['pv', 'home', 'grid_import', 'grid_export', 'battery_charge', 'battery_discharge', 'ev']) s.today_kwh[k] ??= 0;
    this.last = s; return s;
  }
  async range(kind) {
    if (kind === 'today' || kind === 'yesterday') {
      const d = kind === 'today' ? await this.get('/api/today') : await this.get('/api/day?d=' + isoDay(new Date(Date.now() - 864e5)));
      const pts = d.points || []; const fl = flowsFromPoints(pts, 5 / 60);
      return { kind, points: pts, E: { ...fl.E, ...(d.E || {}) }, F: fl.F };
    }
    const d = await this.get('/api/days?n=' + (kind === '7d' ? 7 : 30));
    const days = d.days.map(x => ({ ...x, pv: x.pv || 0, home: x.home || 0, ev: x.ev || 0, imp: x.imp || 0 }));
    return { kind, days, E: d.E, F: d.F };
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

/** Hub when available (same origin, or ?api= / saved), otherwise the simulator. */
export async function createAdapter() {
  const q = new URLSearchParams(location.search);
  if (q.get('demo') === '1') return new SimAdapter();
  const cand = q.get('api') || localStorage.getItem('he.api') || (location.hostname.endsWith('github.io') || location.protocol === 'file:' ? null : '');
  if (cand === null) return new SimAdapter();
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(cand.replace(/\/$/, '') + '/api/live', { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (r.ok && (await r.json()).power_kw) return new ApiAdapter(cand);
  } catch (e) { console.info('no hub API, using simulator', e?.message); }
  return new SimAdapter();
}
export { Sim };
