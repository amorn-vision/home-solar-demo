// Small dependency-free SVG charts: line chart w/ tooltip, daily bars, Sankey.
const NS = 'http://www.w3.org/2000/svg';
const f1 = x => Math.abs(x) >= 100 ? Math.round(x).toLocaleString('th-TH') : (Math.abs(x) < 0.05 ? 0 : x).toLocaleString('th-TH', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const f2 = x => (Math.abs(x) < 0.005 ? 0 : x).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

export const COLORS = { pv: '#f2b705', home: '#3b8fe0', battery: '#2fbf71', grid: '#8a96a3', ev: '#ff7a45' };

function tooltipHost(el) {
  el.style.position = 'relative';
  let tip = el.querySelector('.tip'); if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; el.appendChild(tip); }
  return tip;
}

/** series: [{key,label,color,area?}] ; points: [{m, key:value}] (kW) */
export function lineChart(el, points, series, { height = 230, unit = 'kW' } = {}) {
  const W = Math.max(el.clientWidth, 300), H = height, L = 34, R = 18, T = 12, B = 24;
  let lo = 0, hi = 1;
  for (const p of points) for (const s of series) { lo = Math.min(lo, p[s.key]); hi = Math.max(hi, p[s.key]); }
  hi = Math.ceil(hi * 1.1); lo = lo < 0 ? Math.floor(lo * 1.1) : 0;
  const x = m => L + (W - L - R) * m / 1440, y = v => T + (H - T - B) * (hi - v) / (hi - lo);
  const step = (hi - lo) > 12 ? 4 : 2;
  let g = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl${v === 0 ? ' zero' : ''}"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  for (let h = 0; h <= 24; h += 6) g += `<text x="${x(h * 60)}" y="${H - 6}" class="ax" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
  for (const s of series) {
    if (!points.length) break;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)} ${y(p[s.key]).toFixed(1)}`).join(' ');
    if (s.area) g += `<path d="${d} L${x(points.at(-1).m)} ${y(0)} L${x(points[0].m)} ${y(0)} Z" fill="${s.color}" opacity=".16"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.area ? 2.2 : 1.8}" stroke-linejoin="round"/>`;
  }
  g += `<line class="cursor" y1="${T}" y2="${H - B}" style="display:none"/>` + series.map(s => `<circle class="cdot" data-k="${s.key}" r="4" fill="${s.color}" stroke="#fff" stroke-width="1.5" style="display:none"/>`).join('');
  el.innerHTML = `<div class="readout"><span class="muted">แตะกราฟเพื่อดูค่าแต่ละช่วงเวลา</span></div><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.readout'), cur = svg.querySelector('.cursor');
  const show = ev => {
    if (!points.length) return;
    const r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * W / r.width, m = (mx - L) / (W - L - R) * 1440;
    let best = points[0]; for (const p of points) if (Math.abs(p.m - m) < Math.abs(best.m - m)) best = p;
    cur.style.display = ''; cur.setAttribute('x1', x(best.m)); cur.setAttribute('x2', x(best.m));
    svg.querySelectorAll('.cdot').forEach(c => { c.style.display = ''; c.setAttribute('cx', x(best.m)); c.setAttribute('cy', y(best[c.dataset.k])); });
    tip.innerHTML = `<b>${hhmm(best.m)} น.</b>` + series.map(s => `<span class="ro"><i style="background:${s.color}"></i>${s.short || s.label} <b>${f2(best[s.key])}</b></span>`).join('');
  };
  svg.addEventListener('pointerdown', show); svg.addEventListener('pointermove', e => e.buttons || e.pointerType === 'mouse' ? show(e) : 0);
  return { showAt(m) { const r = svg.getBoundingClientRect(); show({ clientX: r.left + x(m) / W * r.width }); } };
}

/** days: [{label, pv, home, ev}] → grouped bars (kWh) */
export function barChart(el, days, { height = 220 } = {}) {
  const W = Math.max(el.clientWidth, 300), H = height, L = 34, R = 8, T = 12, B = 24;
  const hi = Math.ceil(Math.max(10, ...days.map(d => Math.max(d.pv, d.home + d.ev))) * 1.1 / 10) * 10;
  const bw = (W - L - R) / days.length, y = v => T + (H - T - B) * (1 - v / hi);
  let g = '';
  for (let v = 0; v <= hi; v += hi > 40 ? 20 : 10) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  const every = days.length > 10 ? 5 : 1;
  days.forEach((d, i) => {
    const x0 = L + i * bw, w = Math.max(2, bw * 0.36), use = d.home + d.ev;
    g += `<rect x="${x0 + bw * 0.12}" y="${y(d.pv)}" width="${w}" height="${y(0) - y(d.pv)}" rx="2" fill="${COLORS.pv}"/>`;
    g += `<rect x="${x0 + bw * 0.12 + w + 1}" y="${y(use)}" width="${w}" height="${y(0) - y(use)}" rx="2" fill="${COLORS.home}"/>`;
    g += `<rect class="hit" data-i="${i}" x="${x0}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`;
    if (i % every === 0 || i === days.length - 1) g += `<text x="${x0 + bw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${d.label}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
  const tip = tooltipHost(el), svg = el.querySelector('svg');
  const show = i => { const d = days[i], r = svg.getBoundingClientRect();
    tip.innerHTML = `<b>${d.label}</b><div><i style="background:${COLORS.pv}"></i>ผลิต<span>${f1(d.pv)} kWh</span></div><div><i style="background:${COLORS.home}"></i>ใช้ (รวม EV)<span>${f1(d.home + d.ev)} kWh</span></div><div><i style="background:${COLORS.grid}"></i>ซื้อไฟ<span>${f1(d.imp)} kWh</span></div>`;
    tip.style.display = 'block'; const px = (L + (i + 0.5) * bw) / W * r.width; tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth) + 'px'; };
  svg.querySelectorAll('.hit').forEach(h => h.addEventListener('pointerdown', () => show(+h.dataset.i)));
  return { showAt: show };
}

/** Sankey of energy flows (kWh). F = allocation matrix, E = totals. */
export function sankey(el, F, E) {
  const W = Math.max(el.clientWidth, 300), H = 320, nw = 12, gap = 18, padT = 8, padB = 22, MINH = 30;
  const left = [
    { id: 'pv', label: 'โซลาร์', color: COLORS.pv, v: F.pv_home + F.pv_ev + F.pv_bat + F.pv_grid },
    { id: 'bat', label: 'แบตจ่าย', color: COLORS.battery, v: F.bat_home + F.bat_ev },
    { id: 'grid', label: 'กริดซื้อ', color: COLORS.grid, v: F.grid_home + F.grid_ev },
  ].filter(n => n.v > 0.05);
  const right = [
    { id: 'home', label: 'อาคารใช้', color: COLORS.home, v: F.pv_home + F.bat_home + F.grid_home },
    { id: 'ev', label: 'รถ EV', color: COLORS.ev, v: F.pv_ev + F.bat_ev + F.grid_ev },
    { id: 'chg', label: 'ชาร์จแบต', color: COLORS.battery, v: F.pv_bat },
    { id: 'exp', label: 'ขายไฟ', color: '#a9b3bd', v: F.pv_grid },
  ].filter(n => n.v > 0.05);
  const links = [['pv', 'home', F.pv_home], ['pv', 'ev', F.pv_ev], ['pv', 'chg', F.pv_bat], ['pv', 'exp', F.pv_grid], ['bat', 'home', F.bat_home], ['bat', 'ev', F.bat_ev], ['grid', 'home', F.grid_home], ['grid', 'ev', F.grid_ev]]
    .filter(l => l[2] > 0.05 && left.some(n => n.id === l[0]) && right.some(n => n.id === l[1]));
  const total = Math.max(left.reduce((a, n) => a + n.v, 0), right.reduce((a, n) => a + n.v, 0), 0.01);
  const scaleL = (H - padT - padB - (gap + MINH) * (left.length - 1)) / total, scaleR = (H - padT - padB - (gap + MINH) * (right.length - 1)) / total, sc = Math.min(scaleL, scaleR);
  const place = (nodes, x) => { let yy = padT + Math.max(0, ((H - padT - padB) - (nodes.reduce((a, n) => a + Math.max(n.v * sc, MINH), 0) + gap * (nodes.length - 1))) / 2); for (const n of nodes) { n.x = x; n.y = yy; n.h = Math.max(2, n.v * sc); n.off = 0; yy += Math.max(n.h, MINH) + gap; } };
  const order = ['chg', 'exp', 'home', 'ev']; right.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const LX = 86, RX = W - 86 - nw; place(left, LX); place(right, RX);
  const li = id => left.findIndex(n => n.id === id), ri = id => right.findIndex(n => n.id === id);
  const byId = Object.fromEntries([...left, ...right].map(n => [n.id, n]));
  let defs = '', body = '', lbl = '';
  const bez = (t, a, b) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3 * b;
  // outgoing order by target, incoming order by source → fewer crossings
  const outOff = {}, inOff = {};
  const outSorted = [...links].sort((p, q) => li(p[0]) - li(q[0]) || ri(p[1]) - ri(q[1]));
  for (const [a, b, v] of outSorted) { outOff[a + b] = byId[a].off; byId[a].off += v * sc; }
  const inSorted = [...links].sort((p, q) => ri(p[1]) - ri(q[1]) || li(p[0]) - li(q[0]));
  for (const [a, b, v] of inSorted) { inOff[a + b] = byId[b].off; byId[b].off += v * sc; }
  links.forEach(([a, b, v], i) => {
    const s = byId[a], t = byId[b], h = v * sc, y0 = s.y + outOff[a + b] + h / 2, y1 = t.y + inOff[a + b] + h / 2;
    const x0 = s.x + nw, x1 = t.x, cx = (x0 + x1) / 2;
    defs += `<linearGradient id="lg${i}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0"><stop offset="0" stop-color="${s.color}"/><stop offset="1" stop-color="${t.color}"/></linearGradient>`;
    body += `<path d="M${x0} ${y0} C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}" stroke="url(#lg${i})" stroke-width="${Math.max(h, 1)}" fill="none" opacity=".38"/>`;
    if (h > 15) { const t = 0.7, bx = (1 - t) ** 3 * x0 + 3 * (1 - t) ** 2 * t * cx + 3 * (1 - t) * t * t * cx + t ** 3 * x1;
      lbl += `<text x="${bx}" y="${bez(t, y0, y1) + 4}" class="sk-link" text-anchor="middle">${f1(v)} kWh · ${Math.round(v / s.v * 100)}%</text>`; }
  });
  for (const n of left) body += `<rect x="${n.x}" y="${n.y}" width="${nw}" height="${n.h}" rx="3" fill="${n.color}"/><text x="${n.x - 8}" y="${n.y + n.h / 2 - 2}" class="sk-n" text-anchor="end">${n.label}</text><text x="${n.x - 8}" y="${n.y + n.h / 2 + 13}" class="sk-v" text-anchor="end">${f1(n.v)} kWh</text>`;
  for (const n of right) body += `<rect x="${n.x}" y="${n.y}" width="${nw}" height="${n.h}" rx="3" fill="${n.color}"/><text x="${n.x + nw + 8}" y="${n.y + n.h / 2 - 2}" class="sk-n">${n.label}</text><text x="${n.x + nw + 8}" y="${n.y + n.h / 2 + 13}" class="sk-v">${f1(n.v)} kWh</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><defs>${defs}</defs>${body}${lbl}</svg>`;
}

export function miniArea(el, points, key, color, height = 120) {
  const W = Math.max(el.clientWidth, 280), H = height, hi = Math.max(1, ...points.map(p => p[key])) * 1.15;
  const x = m => 4 + (W - 8) * m / 1440, y = v => 6 + (H - 22) * (1 - v / hi);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  let ax = ''; for (let h = 0; h <= 24; h += 6) ax += `<text x="${Math.min(Math.max(x(h * 60), 14), W - 18)}" y="${H - 3}" class="ax" text-anchor="middle">${String(h).padStart(2, '0')}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><defs><linearGradient id="ma" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${points.length ? `<path d="${d} L${x(points.at(-1).m)} ${y(0)} L${x(points[0].m)} ${y(0)} Z" fill="url(#ma)"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>` : ''}${ax}</svg>`;
}
export { f1, f2, hhmm };
