import { createAdapter, Sim } from './data.js';
import { lineChart, barChart, sankey, miniArea, COLORS, f1, f2, hhmm } from './charts.js';

const $ = s => document.querySelector(s);
const ds = await createAdapter();
const S = { tab: 'home', range: 'today', view: 'chart', snap: null, scene: null, refresh: +(localStorage.getItem('he.refresh') || 5), timer: null };
const kw = x => f2(Math.abs(x ?? 0));
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); };

// ---------- theme ----------
function setTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('he.theme', t); document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); }
setTheme(new URLSearchParams(location.search).get('theme') || localStorage.getItem('he.theme') || 'light');
$('#themeSeg').onclick = e => e.target.dataset.t && setTheme(e.target.dataset.t);
$('#refSeg').onclick = e => { if (!e.target.dataset.s) return; S.refresh = +e.target.dataset.s; localStorage.setItem('he.refresh', S.refresh); markSeg('#refSeg', 's', S.refresh); loop(); };
$('#notiSeg').onclick = e => { if (!e.target.dataset.n) return; localStorage.setItem('he.noti', e.target.dataset.n); markSeg('#notiSeg', 'n', e.target.dataset.n); };
function markSeg(sel, key, val) { document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset[key] == val)); }
markSeg('#refSeg', 's', S.refresh); markSeg('#notiSeg', 'n', localStorage.getItem('he.noti') || 'day');
document.querySelectorAll('.sys').forEach(b => b.onclick = () => b.dataset.sys === 'solar' ? null : toast(`${b.title}: เร็ว ๆ นี้ (เฟสถัดไป)`));

// ---------- router ----------
function route() {
  const [tab = 'home', a, b] = (location.hash.slice(1) || 'home').split('/');
  S.tab = tab;
  if (tab === 'energy') { if (a) S.view = a; if (b) S.range = b; }
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'v-' + tab;
  document.querySelectorAll('.tabs a').forEach(x => x.classList.toggle('on', x.dataset.tab === tab || (tab === 'device' && x.dataset.tab === 'devices')));
  $('#viewBtn').style.visibility = tab === 'home' ? 'visible' : 'hidden';
  S.scene?.setActive(tab === 'home');
  if (tab === 'device') S.device = a || 'inverter';
  scrollTo({ top: 0 });
  render();
}
addEventListener('hashchange', route);

// ---------- HOME ----------
function cell(t, color, v, unit, sub) { return `<div class="cell"><div class="t"><i style="background:${color}"></i>${t}</div><div class="v">${v}<small>${unit}</small></div><div class="s">${sub}</div></div>`; }
function item(href, ic, title, sub, right = '') { return `<a class="item" href="${href}"><div class="ic">${ic}</div><div class="tx"><b>${title}</b><span>${sub}</span></div>${right ? `<div class="rv">${right}</div>` : ''}<div class="chev">›</div></a>`; }
const EMS_TH = { 'Max self consumption': 'ใช้เองสูงสุด (Self-consumption)', 'AI mode': 'AI Mode', TOU: 'ตามช่วงเวลา (TOU)', 'Full feed-in to grid': 'ขายไฟทั้งหมด', 'Remote EMS': 'Remote EMS', Custom: 'กำหนดเอง' };

function renderHome(s) {
  const p = s.power_kw, t = s.today_kwh;
  $('#bigKwh').textContent = f2(t.pv);
  $('#cells').innerHTML =
    cell('Solar', COLORS.pv, kw(p.pv), 'kW', `${f1(t.pv)} kWh`) +
    cell('อาคาร', COLORS.home, kw(p.home), 'kW', `${f1(t.home)} kWh`) +
    cell('แบต', COLORS.battery, (p.battery < -0.05 ? '−' : '') + kw(p.battery), 'kW', `${Math.round(s.battery.soc_pct)}%`) +
    cell('กริด', COLORS.grid, (p.grid < -0.05 ? '−' : '') + kw(p.grid), 'kW', `ซื้อ ${f1(t.grid_import)}`);
  const ev = s.ev;
  renderEvCard(s);
  $('#homeList').innerHTML =
    item('#energy', '⚡', 'พลังงาน', `ผลิต ${f1(t.pv)} kWh · ใช้ ${f1(t.home + (t.ev || 0))} kWh วันนี้`) +
    item('#energy/flow/today', '🌿', 'โหมดการทำงาน', `Sigenergy · ${EMS_TH[s.plant.ems_mode] || s.plant.ems_mode || '-'} · พึ่งพาตัวเอง ${Math.round(s.self_sufficiency_pct)}% วันนี้`) +
    item('#devices', '🔌', 'อุปกรณ์', `อินเวอร์เตอร์ ${kw(s.inverter.pv_kw)} kW · แบต 2 ก้อน ${Math.round(s.battery.soc_pct)}% · เกตเวย์ ${s.gateway.on_grid ? 'ปกติ' : 'ไฟดับ'}`) +
    item('#settings', '⚙️', 'ตั้งค่า', 'ธีม · การแจ้งเตือน · ข้อมูลระบบ');
  S.scene?.update(s);
  const sun = Sim.sunTimes(Sim.bkk(new Date()));
  $('#sunChip').textContent = `☀ ขึ้น ${hhmm(sun.rise)} · ตก ${hhmm(sun.set)} น.`;
}

// EV DC charger card (status, power, session energy/duration, car SOC)
const dur = sec => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 3600)}:${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')} ชม.`; };
function renderEvCard(s) {
  const e = s.ev, on = e.power_kw > 0.05, soc = e.vehicle_soc_pct, sec = e.session_s ?? (e.session_min || 0) * 60;
  $('#evCard').innerHTML = `<div class="ev-top"><div class="ev-ic">🚗</div><div class="ev-t"><b>ที่ชาร์จรถ EV DC</b><span class="ev-pill ${on ? 'on' : ''}">${e.state_th || '–'}</span></div>
    <div class="ev-kw">${kw(e.power_kw)}<small>kW</small></div><div class="chev" style="color:var(--mut);font-size:22px">›</div></div>
    <div class="ev-grid"><div><i>รอบชาร์จนี้</i><b>${f1(e.session_kwh)}</b> <small>kWh</small></div><div><i>ระยะเวลา</i><b>${dur(sec)}</b></div>
    <div><i>แบตรถ</i><b>${soc != null ? Math.round(soc) + '%' : '–'}</b>${soc != null ? `<div class="ev-bar"><i style="width:${Math.max(0, Math.min(100, soc))}%"></i></div>` : ''}</div></div>`;
}

// weather (Open-Meteo, Bangkok city centre — no key). PV estimate = radiation × kWp × PR.
async function loadWeather() {
  const box = $('#weather .wx-body');
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=13.75&longitude=100.50&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,shortwave_radiation_sum&timezone=Asia%2FBangkok&forecast_days=7';
    const d = (await (await fetch(u)).json()).daily;
    const icon = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 82 ? '🌦️' : '⛈️';
    const dn = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    box.className = 'wx-body wx';
    box.innerHTML = d.time.map((t, i) => { const dt = new Date(t + 'T12:00:00+07:00'), est = d.shortwave_radiation_sum[i] / 3.6 * Sim.CFG.pv_kwp * 0.8;
      return `<div class="${i ? '' : 'today'}"><div class="d">${i ? dn[dt.getDay()] : 'วันนี้'}</div><div class="e">${icon(d.weather_code[i])}</div><div class="tmax">${Math.round(d.temperature_2m_max[i])}°</div><div class="tmin">${Math.round(d.temperature_2m_min[i])}°</div><div class="pv" title="คาดการณ์การผลิตจากรังสีแดด">~${Math.round(est)} kWh</div></div>`; }).join('');
    box.insertAdjacentHTML('afterend', '<p class="note" style="margin:8px 2px 0">~kWh = คาดการณ์การผลิตโซลาร์จากรังสีแดดของวันนั้น</p>');
  } catch { box.textContent = 'โหลดพยากรณ์อากาศไม่ได้'; }
}

// ---------- ENERGY ----------
const SERIES = [
  { key: 'pv', label: 'Solar', color: COLORS.pv, area: true },
  { key: 'home', label: 'อาคาร', color: COLORS.home },
  { key: 'battery', label: 'แบต (+ชาร์จ/−จ่าย)', short: 'แบต', color: COLORS.battery },
  { key: 'grid', label: 'กริด (+ซื้อ/−ขาย)', short: 'กริด', color: COLORS.grid },
  { key: 'ev', label: 'EV', color: COLORS.ev },
];
function share(label, color, v, tot) { const pc = tot > 0 ? v / tot * 100 : 0; return `<div class="share"><div class="top"><span style="color:inherit;font-size:14px">${label}</span><b>${Math.round(pc)}%<span>${f1(v)} kWh</span></b></div><div class="bar"><i style="width:${pc}%;background:${color}"></i></div></div>`; }
async function renderEnergy() {
  markSeg('#rangeSeg', 'r', S.range); markSeg('#viewSeg', 'v', S.view);
  const r = await ds.range(S.range), E = r.E, F = r.F;
  $('#sumCells').innerHTML =
    cell('ผลิต', COLORS.pv, f1(E.pv), 'kWh', 'Solar') +
    cell('อาคารใช้', COLORS.home, f1(E.home), 'kWh', `EV ${f1(E.ev)}`) +
    cell('แบตเตอรี่', COLORS.battery, f1(E.chg), 'kWh', `จ่าย ${f1(E.dis)}`) +
    cell('ซื้อไฟ', COLORS.grid, f1(E.imp), 'kWh', `ขาย ${f1(E.exp)}`);
  const box = $('#chartBox'), multi = !!r.days;
  if (S.view === 'flow') {
    $('#chartTitle').textContent = 'การไหลของพลังงาน'; sankey(box, F, E);
    $('#legend').innerHTML = '<span>ซ้าย = แหล่งพลังงาน · ขวา = ปลายทาง · % คิดจากแหล่ง</span>';
  } else if (multi) {
    $('#chartTitle').textContent = 'พลังงานรายวัน (kWh)'; barChart(box, r.days);
    $('#legend').innerHTML = `<span><i style="background:${COLORS.pv}"></i>ผลิต</span><span><i style="background:${COLORS.home}"></i>ใช้ (รวม EV)</span><span>แตะแท่งเพื่อดูตัวเลข</span>`;
  } else {
    $('#chartTitle').textContent = 'กราฟกำลังไฟ (kW)'; S.chart = lineChart(box, r.points, SERIES);
    $('#legend').innerHTML = SERIES.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('') ;
  }
  const hTot = F.pv_home + F.bat_home + F.grid_home;
  $('#homeUse').textContent = `รวม ${f1(hTot)} kWh`;
  $('#shareHome').innerHTML = share('☀️ Solar', COLORS.pv, F.pv_home, hTot) + share('🔋 แบต', COLORS.battery, F.bat_home, hTot) + share('🔌 กริด', COLORS.grid, F.grid_home, hTot);
  const pTot = F.pv_home + F.pv_ev + F.pv_bat + F.pv_grid;
  $('#pvUse').textContent = `รวม ${f1(pTot)} kWh`;
  $('#sharePv').innerHTML = share('🏠 อาคาร', COLORS.home, F.pv_home, pTot) + share('🚗 รถ EV', COLORS.ev, F.pv_ev, pTot) + share('🔋 ชาร์จแบต', COLORS.battery, F.pv_bat, pTot) + share('↗️ ขายไฟ', COLORS.grid, F.pv_grid, pTot);
}
$('#rangeSeg').onclick = e => { if (e.target.dataset.r) { S.range = e.target.dataset.r; history.replaceState(null, '', `#energy/${S.view}/${S.range}`); renderEnergy(); } };
$('#viewSeg').onclick = e => { if (e.target.dataset.v) { S.view = e.target.dataset.v; history.replaceState(null, '', `#energy/${S.view}/${S.range}`); renderEnergy(); } };

// ---------- DEVICES ----------
function devices(s) {
  const b = s.battery, p = s.power_kw;
  return [
    { id: 'inverter', ic: '☀️', name: 'SigenStor EC 20.0 TP', type: `อินเวอร์เตอร์ 20 kW · แผง ${Sim.CFG.panels} แผง ${f2(Sim.CFG.pv_kwp)} kWp`, right: kw(s.inverter.pv_kw) + ' kW', sub: s.plant.running_state_th },
    { id: 'battery', ic: '🔋', name: 'SigenStor BAT 10.0 × 2', type: 'แบตเตอรี่ 20 kWh', right: Math.round(b.soc_pct) + '%', sub: (p.battery > 0.05 ? 'ชาร์จ ' : p.battery < -0.05 ? 'จ่าย ' : 'พัก ') + kw(p.battery) + ' kW' },
    { id: 'ev', ic: '🚗', name: 'SigenStor EVDC 25', type: 'ที่ชาร์จรถ DC 25 kW', right: kw(p.ev) + ' kW', sub: s.ev.state_th },
    { id: 'gateway', ic: '🔌', name: 'Sigen Gateway Home TP 30K', type: 'เกตเวย์ / มิเตอร์กริด 3 เฟส', right: kw(p.grid) + ' kW', sub: p.grid > 0.05 ? 'ซื้อไฟ' : p.grid < -0.05 ? 'ขายไฟ' : 'สมดุล' },
  ];
}
function renderDevices(s) {
  $('#devList').innerHTML = devices(s).map(d => item('#device/' + d.id, d.ic, d.name, `${d.type} · ${d.sub}`, d.right)).join('');
  $('#setDevices').innerHTML = devices(s).map(d => `<div><b style="font-weight:500">${d.name}</b><span>${d.type}</span></div>`).join('');
}
const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
async function renderDevice(s) {
  const id = S.device, d = devices(s).find(x => x.id === id) || devices(s)[0], today = await ds.range('today');
  let html = `<div class="card"><div class="dev-hero"><h3>${d.ic} ${d.name}</h3><div class="sub">${d.type}</div>`;
  if (id === 'inverter') {
    const iv = s.inverter;
    html += `<div class="n">${kw(iv.pv_kw)}<small>kW</small></div><div class="sub" style="margin:-4px 0 8px">กำลังผลิตโซลาร์ตอนนี้</div><span class="state-pill">${s.plant.running_state_th}</span></div></div>
      <div class="card"><div class="card-h"><b>การผลิตวันนี้</b><span class="muted">kW</span></div><div id="devChart"></div></div>
      <div class="card"><table class="tbl">${row('กำลังไฟ AC', kw(iv.ac_kw) + ' kW')}${row('PV รวม', kw(iv.pv_kw) + ' kW')}${row('แผงทั้งหมด', `${Sim.CFG.panels} แผง · ${f2(Sim.CFG.pv_kwp)} kWp`)}${row('ผลิตวันนี้', f1(s.today_kwh.pv) + ' kWh')}${row('ผลิตรวม', Math.round(s.total_kwh.pv).toLocaleString('th-TH') + ' kWh')}
      ${iv.strings.map((x, i) => row(x.unused || !x.n ? `${x.id || 'PV' + (i + 1)} <small>· ไม่ได้ใช้</small>` : `${x.id} <small>${x.brand} ${x.w}W × ${x.n} · ${f2(x.kwp)} kWp</small>`, x.unused || !x.n ? '0.00 kW' : `${f2(x.kw)} kW · ${Math.round(x.v)} V · ${f1(x.a)} A`)).join('')}
      ${row('อุณหภูมิ', iv.temp_c != null ? f1(iv.temp_c) + ' °C' : '–')}${row('Firmware', iv.firmware || '–')}${row('กำลังพิกัด', '20 kW')}</table></div>`;
  } else if (id === 'battery') {
    const b = s.battery, C = 2 * Math.PI * 52;
    html += `<svg class="ring" width="150" height="150" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--soft)" stroke-width="11"/><circle cx="60" cy="60" r="52" fill="none" stroke="${COLORS.battery}" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - b.soc_pct / 100)}"/><text x="60" y="64" text-anchor="middle" style="font-size:26px;font-weight:700;fill:var(--ink)">${Math.round(b.soc_pct)}%</text><text x="60" y="82" text-anchor="middle" style="font-size:10px;fill:var(--mut)">${f1(b.soc_pct / 100 * (b.capacity_kwh || 20))} / ${f1(b.capacity_kwh || 20)} kWh</text></svg>
      <span class="state-pill ${b.state === 'idle' ? 'idle' : ''}">${{ charging: 'กำลังชาร์จ', discharging: 'กำลังจ่ายไฟ', idle: 'พัก' }[b.state]} ${kw(s.power_kw.battery)} kW</span></div></div>
      <div class="card"><div class="card-h"><b>SOC วันนี้</b><span class="muted">%</span></div><div id="devChart"></div></div>
      <div class="card"><table class="tbl">${row('ชาร์จวันนี้', f1(s.today_kwh.battery_charge) + ' kWh')}${row('จ่ายวันนี้', f1(s.today_kwh.battery_discharge) + ' kWh')}${b.avail_discharge_kwh != null ? row('จ่ายได้อีก', f1(b.avail_discharge_kwh) + ' kWh') : ''}${row('สุขภาพ (SOH)', f1(b.soh_pct) + '%')}${row('อุณหภูมิเซลล์', f1(b.temp_c) + ' °C')}
      ${b.modules.map(m => row(m.name, `${Math.round(m.soc)}% · ${f2(Math.abs(m.kw))} kW`)).join('')}</table></div>`;
  } else if (id === 'ev') {
    const e = s.ev;
    html += `<div class="n">${kw(e.power_kw)}<small>kW</small></div><span class="state-pill ${e.power_kw > 0.05 ? '' : 'idle'}">${e.state_th}</span></div></div>
      <div class="card"><div class="card-h"><b>การชาร์จวันนี้</b><span class="muted">kW</span></div><div id="devChart"></div></div>
      <div class="card"><table class="tbl">${row('สถานะ', e.state_th || '–')}${row('แบตรถ', e.vehicle_soc_pct != null ? Math.round(e.vehicle_soc_pct) + '%' : '–')}${row('รอบชาร์จนี้', f1(e.session_kwh) + ' kWh · ' + dur(e.session_s ?? e.session_min * 60))}${e.vehicle_voltage_v != null ? row('แรงดัน / กระแส', `${f1(e.vehicle_voltage_v)} V · ${f1(e.current_a)} A`) : ''}${row('ชาร์จวันนี้', f1(s.today_kwh.ev) + ' kWh')}${row('ชาร์จรวม', Math.round(s.total_kwh.ev).toLocaleString('th-TH') + ' kWh')}${row('กำลังสูงสุด', (e.rated_kw ? f1(e.rated_kw) : '25') + ' kW DC')}</table></div>`;
  } else {
    const g = s.gateway;
    html += `<div class="n">${kw(g.grid_kw)}<small>kW</small></div><span class="state-pill">${g.on_grid ? 'เชื่อมต่อกริด' : 'ไฟดับ · ใช้ไฟสำรอง'}</span></div></div>
      <div class="card"><div class="card-h"><b>ซื้อ/ขายไฟวันนี้</b><span class="muted">kW (+ซื้อ)</span></div><div id="devChart"></div></div>
      <div class="card"><table class="tbl">${row('ซื้อไฟวันนี้', f1(s.today_kwh.grid_import) + ' kWh')}${row('ขายไฟวันนี้', f1(s.today_kwh.grid_export) + ' kWh')}${(g.voltage || []).map((v, i) => row('แรงดันเฟส ' + 'ABC'[i], f1(v) + ' V')).join('')}${g.freq_hz ? row('ความถี่', f2(g.freq_hz) + ' Hz') : ''}${row('ซื้อไฟรวม', Math.round(s.total_kwh.grid_import).toLocaleString('th-TH') + ' kWh')}</table></div>`;
  }
  $('#devDetail').innerHTML = html;
  const key = { inverter: 'pv', battery: 'soc', ev: 'ev', gateway: 'grid' }[id], col = { inverter: COLORS.pv, battery: COLORS.battery, ev: COLORS.ev, gateway: COLORS.grid }[id];
  miniArea($('#devChart'), today.points.map(p => ({ ...p, grid: Math.max(p.grid, 0) })), key, col);
}

function renderSettings() {
  $('#sysInfo').innerHTML = [
    ['แหล่งข้อมูล', ds.name], ['การเชื่อมต่อจริง', ds.live ? `Modbus TCP · Home Hub ${S.snap?.hub?.version || ''} (อ่านอย่างเดียว · LAN) · ทุก ${S.snap?.hub?.poll_s || 5} วินาที` : 'Modbus TCP ผ่าน Home Hub บนคอมในบ้าน (อ่านอย่างเดียว) · หน้านี้เป็นข้อมูลตัวอย่าง'],
    ['แผงโซลาร์', `${Sim.CFG.panels} แผง · ${f2(Sim.CFG.pv_kwp)} kWp`], ['สตริง', Sim.PV_STRINGS.filter(x => x.n).map(x => `${x.id} ${x.brand} ${x.w}W×${x.n}`).join(' · ') + ' · PV4 ไม่ได้ใช้'], ['ทิศบ้านในโมเดล', 'หน้าบ้านหันทิศ NNE (~30°) · แกนยาว WNW–ESE'],
    ['โมเดลบ้าน', 'ร่างแรกจากแบบ · ตำแหน่งอุปกรณ์เป็นตัวอย่าง'], ['เวอร์ชัน', 'v2 · ต้นแบบหน้าจอ'],
  ].map(([k, v]) => `<div><b style="font-weight:500">${k}</b><span>${v}</span></div>`).join('');
}

// ---------- loop ----------
async function render() {
  const s = S.snap; if (!s) return;
  $('#clock').textContent = s.ts.slice(11, 16);
  const badge = $('#demoBadge'), isLive = ds.live && !s.demo;
  badge.textContent = isLive ? 'ข้อมูลจริง · LAN' : ds.live ? 'Hub · ข้อมูลจำลอง' : 'ข้อมูลตัวอย่าง'; badge.classList.toggle('live', isLive);
  badge.title = isLive ? 'อ่านจาก Sigenergy ผ่าน Home Hub ในบ้าน (อ่านอย่างเดียว)' : 'ตัวเลขจำลอง ยังไม่ได้ต่อเครื่องจริง';
  $('#stTxt').textContent = s.errors?.length ? 'เชื่อมต่อไม่ได้' : 'ออนไลน์';
  document.querySelector('.status .dot')?.classList.toggle('off', !!s.errors?.length);
  if (S.tab === 'home') renderHome(s);
  else if (S.tab === 'energy') await renderEnergy();
  else if (S.tab === 'devices') renderDevices(s);
  else if (S.tab === 'device') await renderDevice(s);
  else if (S.tab === 'settings') { renderDevices(s); renderSettings(); }
}
let tick = 0;
async function poll() {
  try { S.snap = await ds.snapshot(); } catch (e) { console.warn(e); }
  if (S.tab === 'energy' || S.tab === 'device') { // charts: refresh at most once a minute so tooltips stay put
    if (tick++ % Math.max(1, Math.round(60 / S.refresh))) { if (S.snap) $('#clock').textContent = S.snap.ts.slice(11, 16); return; }
  }
  render();
}
function loop() { clearInterval(S.timer); S.timer = setInterval(poll, S.refresh * 1000); }

$('#viewBtn').onclick = () => { if (!S.scene) return; const m = S.scene.mode === '3d' ? '2d' : '3d'; S.scene.setMode(m); $('#viewBtn').textContent = m === '3d' ? '2D' : '3D'; };

await poll(); route(); loop(); loadWeather();
try {
  const { createScene } = await import('./scene.js');
  S.scene = await createScene($('#hero'));
  $('#heroLoading').remove(); S.scene.setActive(S.tab === 'home'); if (S.snap) S.scene.update(S.snap);
  if (new URLSearchParams(location.search).get('view') === '2d') $('#viewBtn').click();
} catch (e) { console.error(e); $('#heroLoading').textContent = 'แสดงโมเดล 3D ไม่ได้บนอุปกรณ์นี้'; }
window.__ready = true;
