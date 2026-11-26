// One EV-charger status for both the EV card and the 3D hero: 'charging' | 'plugged' | 'off'.
// Works with simulator snapshots and Home Hub /api/live (power, state text, or plugged/connected flags).
// Test override: ?ev=charging | ?ev=plugged | ?ev=off
export function evStatus(e = {}) {
  const st = String(e.state || '').toLowerCase();
  if ((e.power_kw || 0) > 0.05 || (st.includes('charging') && !st.includes('dis'))) return 'charging';
  if (e.plugged === true || e.connected === true || e.vehicle_connected === true || /plug|connect|prepar|finish|wait|suspend|complete|full|occupied/.test(st)) return 'plugged';
  return 'off';
}
const OVR = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ev') : null;
export function applyEv(s) {
  if (!s?.ev) return s;
  const e = s.ev;
  if (OVR === 'charging') Object.assign(e, { state: 'Charging', state_th: 'กำลังชาร์จ', power_kw: e.power_kw > 0.05 ? e.power_kw : 7.2, vehicle_soc_pct: e.vehicle_soc_pct ?? 64 });
  else if (OVR === 'plugged') Object.assign(e, { state: 'Plugged', state_th: 'เสียบสายแล้ว · ไม่ได้ชาร์จ', power_kw: 0, vehicle_soc_pct: e.vehicle_soc_pct ?? 64 });
  else if (OVR === 'off') Object.assign(e, { state: 'Idle', state_th: 'ว่าง', power_kw: 0, vehicle_soc_pct: null });
  if (OVR && s.power_kw) s.power_kw.ev = e.power_kw;
  e.status = evStatus(e);
  return s;
}
