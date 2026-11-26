// Browser port of reader/simulator.py (keep constants in sync). Demo data only.
(function () {
  const LAT = 13.75, LON = 100.5;
  const CFG = { pv_kwp: 10.4, inverter_kw: 20, batt_kwh: 20, batt_max_kw: 10, soc_min: 10, soc_max: 100, ev_kw: 5 };
  // deterministic RNG per day (mulberry32)
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function bkkParts(d) { // Bangkok wall clock from any Date
    const t = new Date(d.getTime() + 7 * 3600e3);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), min: t.getUTCHours() * 60 + t.getUTCMinutes(), dow: t.getUTCDay() };
  }
  function doy(p) { return Math.floor((Date.UTC(p.y, p.m, p.d) - Date.UTC(p.y, 0, 0)) / 864e5); }
  function sunElev(p, minute) {
    const n = doy(p), hour = minute / 60, b = (2 * Math.PI / 365) * (n - 81);
    const decl = (23.44 * Math.PI / 180) * Math.sin(b);
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
    const st = hour + (4 * (LON - 105) + eot) / 60, ha = (15 * (st - 12)) * Math.PI / 180, lat = LAT * Math.PI / 180;
    const s = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    return Math.asin(Math.max(-1, Math.min(1, s))) * 180 / Math.PI;
  }
  function dayKey(p) { return Date.UTC(p.y, p.m, p.d) / 864e5; }
  function cloudParams(p) { const r = rng(dayKey(p) * 7919); const base = 0.85 + 0.15 * r(); const w = []; for (let k = 0; k < 4; k++) w.push([0.02 + 0.06 * r(), 45 + 135 * r(), 6.28 * r()]); return { base, w, r2: r() }; }
  function pvKw(p, m, cp) { const e = sunElev(p, m); if (e <= 0) return 0; let f = cp.base; for (const [a, per, ph] of cp.w) f -= a * (0.5 + 0.5 * Math.sin(m / per * 6.283 + ph)); f = Math.max(0.35, Math.min(1, f)); return Math.min(CFG.inverter_kw, CFG.pv_kwp * 0.82 * Math.pow(Math.sin(e * Math.PI / 180), 1.15) * f); }
  function loadKw(p, m, cp) { const h = m / 60, we = p.dow === 0 || p.dow === 6; const g = (c, w) => Math.exp(-(((h - c) / w) ** 2));
    return Math.max(0.3, 0.55 + 1.2 * g(7, 0.8) + (we ? 1.6 : 0.9) * g(13, 2.5) + 2.8 * g(20.5, 1.6) + ((h >= 22 || h < 5) ? 1.1 : 0) + 0.25 * Math.sin(m / 7 + cp.r2 * 6) + 0.15 * Math.sin(m / 3.1)); }
  function evWin(p) { return (p.dow === 0 || p.dow === 6) ? [600, 720] : [690, 780]; }
  function evKw(p, m) { const [s, e] = evWin(p); return (m >= s && m < e) ? CFG.ev_kw * (0.95 + 0.05 * Math.sin(m / 5)) : 0; }
  function simulateDay(p, until) {
    const cp = cloudParams(p), r = rng(dayKey(p) * 104729); let soc = 50 + 20 * r(); const ev0 = 30 + 20 * r();
    const e = { pv: 0, home: 0, imp: 0, exp: 0, chg: 0, dis: 0, ev: 0 }; const hist = []; let last;
    for (let m = 0; m <= until; m++) {
      const pv = pvKw(p, m, cp), load = loadKw(p, m, cp), ev = evKw(p, m), sur = pv - load - ev, cap = CFG.batt_kwh; let b;
      if (sur > 0) b = Math.min(sur, CFG.batt_max_kw, (CFG.soc_max - soc) / 100 * cap * 60); else b = -Math.min(-sur, CFG.batt_max_kw, (soc - CFG.soc_min) / 100 * cap * 60);
      const grid = -(sur - b), h = 1 / 60; soc += b * h / cap * 100 * (b > 0 ? 0.95 : 1);
      e.pv += pv * h; e.home += load * h; e.ev += ev * h; e.chg += Math.max(b, 0) * h; e.dis += Math.max(-b, 0) * h; e.imp += Math.max(grid, 0) * h; e.exp += Math.max(-grid, 0) * h;
      last = { pv, home: load, ev, batt: b, grid, soc, minute: m };
      if (m % 5 === 0) hist.push({ t: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, pv, home: load, battery: b, grid, ev, soc });
    }
    const [s, en] = evWin(p); last.energy = e; last.evSoc = Math.min(95, ev0 + e.ev / 60 * 100); last.evMin = last.minute >= s ? Math.max(0, Math.min(last.minute, en) - s) : 0;
    return { last, hist };
  }
  window.SigenSim = {
    snapshot(now = new Date()) {
      const p = bkkParts(now), { last: s, hist } = simulateDay(p, p.min), e = s.energy;
      const j = (x, k) => x ? x * (1 + 0.04 * Math.sin(now.getTime() / 4000 + k)) : x;
      const pv = j(s.pv, 1), home = j(s.home, 2), batt = j(s.batt, 3), ev = s.ev, grid = home + ev + batt - pv;
      const yest = simulateDay(bkkParts(new Date(now.getTime() - 864e5)), 1439).last.energy.pv;
      const iso = new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 19) + '+07:00';
      const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100 + 0;
      return { snap: {
        ts: iso, tz: 'Asia/Bangkok', source: 'simulate', demo: true,
        plant: { name: '', model: 'SigenStor EC 20.0 TP', firmware: 'SIM', running_state: 'Running', running_state_th: 'ทำงานปกติ', ems_mode: 'Max self consumption', grid: 'On grid', grid_sensor_connected: true },
        power_kw: { pv: r2(pv), home: r2(home), battery: r2(batt), grid: r2(grid), ev: r2(ev) },
        battery: { soc_pct: r1(s.soc), soh_pct: 99.2, capacity_kwh: 20, temp_c: r1(29.5 + 3 * Math.abs(batt) / 10), state: batt > 0.05 ? 'charging' : batt < -0.05 ? 'discharging' : 'idle' },
        ev: { state: ev > 0 ? 'Charging' : 'Idle', state_th: ev > 0 ? 'กำลังชาร์จ' : 'ว่าง', power_kw: r2(ev), vehicle_soc_pct: ev > 0 ? r1(s.evSoc) : null, session_kwh: r2(e.ev), session_min: s.evMin },
        today_kwh: { pv: r1(e.pv), home: r1(e.home), grid_import: r1(e.imp), grid_export: r1(e.exp), battery_charge: r1(e.chg), battery_discharge: r1(e.dis), ev: r1(e.ev), pv_yesterday: r1(yest) },
        self_sufficiency_pct: Math.round(Math.max(0, Math.min(100, 100 * (1 - e.imp / Math.max(e.home + e.ev, 0.01))))),
        alarms: [], errors: [] }, history: hist.map(h => ({ ...h, pv: r2(h.pv), home: r2(h.home), battery: r2(h.battery), grid: r2(h.grid), ev: r2(h.ev), soc: r1(h.soc) })) };
    }
  };
})();
