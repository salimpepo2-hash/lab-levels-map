// lab-levels-map front end. Data: data/built.json (made by scripts/build.mjs).
const COL = { 1: '#d9534f', 2: '#f0ad4e', 3: '#2e9e5b' };
const NAME = { 1: 'مستوى أول', 2: 'مستوى تاني', 3: 'مستوى تالت' };
const FAR_MIN = 20; // minutes shown in red from here up
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmtT = t => t ? `${t.approx ? '~' : ''}${t.min} د` : '-';
const S = { gov: '', admin: '', levels: { 1: true, 2: true, 3: true }, dev: -1 };
let D, govName = {};
const markers = {};

const map = L.map('map').setView([30.05, 31.24], 10);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
const cluster = L.markerClusterGroup({ iconCreateFunction: c => L.divIcon({ html: `<div class=cl>${c.getChildCount()}</div>`, className: '', iconSize: [34, 34] }) }).addTo(map);
const routeLayer = L.layerGroup().addTo(map);

const key = c => c.gov + ':' + c.id;
const inScope = c => (!S.gov || c.gov === S.gov) && (!S.admin || c.admin === S.admin);
const scopeList = () => D.centers.filter(inScope);
const visibleList = () => scopeList().filter(c => S.levels[c.level]);
const access = c => (c.level === 3 ? c.to.hospital : (c.to.l3 || c.to.l2)) || null;
function fill(c) { if (S.dev >= 0) return !c.deviceList ? '#9e9e9e' : hasDev(c) ? '#2e7d32' : '#c62828'; return COL[c.level]; }
const hasDev = c => !!(c.deviceList && S.dev >= 0 && c.deviceList[S.dev] > 0);
const devCount = c => c.deviceList ? c.deviceList.filter(n => n > 0).length : null;
const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
function exportCsv() {
  const head = ['المحافظة', 'الإدارة', 'المنشأة', 'المستوى', 'أجهزة متوفرة من ' + D.deviceNames.length];
  if (S.dev >= 0) head.push(D.deviceNames[S.dev]);
  head.push('دقايق لأقرب تاني', 'دقايق لأقرب تالت', 'دقايق لأقرب مستشفى معتمدة');
  const rows = [head].concat(visibleList().map(c => {
    const r = [govName[c.gov], c.admin, c.name, NAME[c.level], devCount(c)];
    if (S.dev >= 0) r.push(c.deviceList ? c.deviceList[S.dev] : '');
    r.push(c.to.l2 ? c.to.l2.min : '', c.to.l3 ? c.to.l3.min : '', c.to.hospital ? c.to.hospital.min : '');
    return r;
  }));
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'lab-levels.csv';
  document.body.appendChild(a); a.click(); a.remove();
}
function devPopup(c) {
  if (!c.deviceList) return '';
  const list = D.deviceNames.map((nm, i) => {
    const v = c.deviceList[i];
    return `<li class="${v > 0 ? 'on' : 'off'}"${i === S.dev ? ' style="font-weight:700;background:#fffde7"' : ''}>${v > 0 ? '✓' : '✕'} ${esc(nm)}${v > 1 ? ' (' + v + ')' : ''}</li>`;
  }).join('');
  return `<details ${S.dev >= 0 ? 'open' : ''}><summary>الأجهزة: ${devCount(c)} من ${D.deviceNames.length}</summary><ul style="margin:4px 0;padding:0">${list}</ul></details>`;
}
function devCard() {
  if (S.dev < 0) return '';
  const list = scopeList().filter(c => c.deviceList);
  const have = list.filter(hasDev).length, tot = list.length, pct = tot ? Math.round(have / tot * 100) : 0;
  const col = p => p >= 70 ? '#2e7d32' : p >= 40 ? '#f0ad4e' : '#c62828';
  let h = `<hr><div class=ct style="font-size:13px">${esc(D.deviceNames[S.dev])}</div>`;
  h += `<div>متوفر في <b>${have}</b> من <b>${tot}</b> (<b style="color:${col(pct)}">${pct}%</b>)، غير متوفر في <b>${tot - have}</b></div>`;
  h += `<div class=bar><i style="width:${pct}%;background:${col(pct)}"></i></div>`;
  const byAdmin = !S.admin && new Set(list.map(c => c.admin)).size > 1;
  const groups = {};
  list.forEach(c => { const g = byAdmin ? c.admin : NAME[c.level]; const x = groups[g] || (groups[g] = { h: 0, t: 0 }); x.t++; if (hasDev(c)) x.h++; });
  h += `<small>التوزيع حسب ${byAdmin ? 'الإدارة' : 'المستوى'}</small>`;
  h += Object.keys(groups).map(g => { const x = groups[g], p = Math.round(x.h / x.t * 100); return `<div class=cov><span title="${esc(g)}">${esc(g)}</span><div class=bar><i style="width:${p}%;background:${col(p)}"></i></div><span style="width:34px;text-align:left">${x.h}/${x.t}</span></div>`; }).join('');
  return h;
}

function avg(a) { return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null; }
function summarize(list) {
  const n = l => list.filter(c => c.level === l).length;
  const m = (l, k) => avg(list.filter(c => c.level === l && c.to[k]).map(c => c.to[k].min));
  return { n1: n(1), n2: n(2), n3: n(3), a12: m(1, 'l2'), a13: m(1, 'l3'), a23: m(2, 'l3'), a3h: m(3, 'hospital') };
}
const row = (label, t) => t ? `<div>${label}: <b>${fmtT(t)}</b> (${esc(t.name)})</div>` : '';

function popup(c) {
  let h = `<div class=pop><b>${esc(c.name)}</b><br>${NAME[c.level]}`;
  if (c.admin) h += `<br>الإدارة: ${esc(c.admin)}`;
  if (c.level === 1) h += row('أقرب تاني', c.to.l2) + row('أقرب تالت', c.to.l3);
  if (c.level === 2) h += row('أقرب تالت', c.to.l3);
  if (c.level === 3) h += row('أقرب مستشفى معتمدة', c.to.hospital);
  h += `<div><a target=_blank rel=noopener href="https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}">فتح في خرائط جوجل</a></div>`;
  h += ''+ devPopup(c);
  return h + '</div>';
}

function scopeLabel() {
  if (S.admin) return (D.governorates.length > 1 && S.gov ? govName[S.gov] + ' - ' : '') + S.admin;
  if (S.gov) return govName[S.gov];
  return D.governorates.length === 1 ? D.governorates[0].name : 'كل المحافظات';
}

function renderCard() {
  const s = summarize(scopeList());
  let h = `<div class=ct>${esc(scopeLabel())}</div>`;
  h += [1, 2, 3].map(n => `<div><span class=dot style="background:${COL[n]}"></span>${NAME[n]}: <b>${s['n' + n]}</b></div>`).join('');
  h += `<hr><div>متوسط أول ← أقرب تاني: <b>${s.a12 == null ? '-' : s.a12 + ' د'}</b></div>`;
  h += `<div>أول ← أقرب تالت: <b>${s.a13 == null ? '-' : s.a13 + ' د'}</b></div>`;
  h += `<div>تاني ← أقرب تالت: <b>${s.a23 == null ? '-' : s.a23 + ' د'}</b></div>`;
  h += `<div>تالت ← أقرب مستشفى معتمدة: <b>${s.a3h == null ? '-' : s.a3h + ' د'}</b></div>`;
  h += `<small>الدقايق تقريبية، بالسيارة بدون زحمة، والأقرب محسوب على كل المراكز مش داخل الإدارة بس</small>`;
  h += ''+ devCard();
  if (S.admin) h += `<button id=reset type=button>عرض ${S.gov ? 'المحافظة' : 'كل المراكز'} كلها</button>`;
  $('card').innerHTML = h;
  const r = $('reset'); if (r) r.onclick = () => { S.admin = ''; $('admin').value = ''; draw(true); };
}

function renderTable(list) {
  const rows = list.slice().sort((a, b) => {
    const x = access(a), y = access(b);
    return (y ? y.min : -1) - (x ? x.min : -1);
  });
  $('tp-title').textContent = `الأبعد في الوقت أولًا (${rows.length})`;
  $('tp-body').innerHTML = rows.map(c => {
    const t = access(c), far = t && t.min >= FAR_MIN;
    return `<tr data-k="${esc(key(c))}"><td>${esc(c.name)}<div class=sub>${esc(c.admin)}</div></td><td><span class=dot style="background:${COL[c.level]}"></span></td><td>${S.dev >= 0 && c.deviceList ? (hasDev(c) ? '<b class=on>✓</b> ' : '<b class=off>✕</b> ') : ''}${devCount(c) == null ? '-' : devCount(c) + '/' + D.deviceNames.length}</td><td class="${far ? 'far' : ''}">${fmtT(t)}</td></tr>`;
  }).join('');
  [...$('tp-body').rows].forEach(tr => tr.onclick = () => {
    const m = markers[tr.dataset.k]; if (!m) return;
    if (innerWidth < 700) $('tp').style.display = 'none';
    cluster.zoomToShowLayer(m, () => m.openPopup());
  });
}

function draw(fit) {
  cluster.clearLayers(); routeLayer.clearLayers();
  const list = visibleList(), pts = [];
  for (const k in markers) delete markers[k];
  list.forEach(c => {
    const m = L.circleMarker([c.lat, c.lon], { radius: 8, color: '#fff', weight: 2, fillColor: fill(c), fillOpacity: 1 });
    m.bindPopup(() => popup(c));
    m.on('popupopen', () => { routeLayer.clearLayers(); Object.values(c.to).forEach(t => t && L.polyline(t.line, { color: '#337ab7', weight: 3, dashArray: t.approx ? '6 6' : null }).addTo(routeLayer)); });
    cluster.addLayer(m); markers[key(c)] = m; pts.push([c.lat, c.lon]);
  });
  if (fit && pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1), Object.assign({ maxZoom: 14 }, innerWidth > 700 ? { paddingTopLeft: [300, 10] } : { paddingBottomRight: [0, Math.round(innerHeight * 0.35)] }));
  renderCard(); renderTable(list);
}

function fillAdmins() {
  const counts = {};
  D.centers.filter(c => !S.gov || c.gov === S.gov).forEach(c => { if (c.admin) counts[c.admin] = (counts[c.admin] || 0) + 1; });
  const names = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'ar'));
  $('admin-row').hidden = !names.length;
  $('admin').innerHTML = `<option value="">كل الإدارات (${S.gov ? 'المحافظة' : 'الكل'} كلها)</option>` + names.map(n => `<option value="${esc(n)}">${esc(n)} (${counts[n]})</option>`).join('');
  S.admin = '';
}

fetch('data/built.json').then(r => r.json()).then(d => {
  D = d; d.governorates.forEach(g => govName[g.id] = g.name);
  d.hospitals.forEach(h => L.marker([h.lat, h.lon], { title: h.name, icon: L.divIcon({ html: '<div class=hs>H</div>', className: '', iconSize: [22, 22] }) }).bindPopup(`<div class=pop>مستشفى معتمدة: ${esc(h.name)}</div>`).addTo(map));
  // governorate selector exists only when there is more than one governorate
  $('gov-row').hidden = d.governorates.length < 2;
  if (d.governorates.length > 1) $('gov').innerHTML = '<option value="">كل المحافظات</option>' + d.governorates.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  fillAdmins();
  if (d.deviceNames && d.centers.some(c => c.deviceList)) {
    $('dev').innerHTML = '<option value="-1">بدون فلتر جهاز</option>' + d.deviceNames.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('');
    $('dev-row').hidden = false;
  }
  $('dev').onchange = e => { S.dev = +e.target.value; draw(false); };
  $('csv').onclick = exportCsv;
  $('gov').onchange = e => { S.gov = e.target.value; fillAdmins(); draw(true); };
  $('admin').onchange = e => { S.admin = e.target.value; draw(true); };
  [1, 2, 3].forEach(n => $('lv' + n).onchange = e => { S.levels[n] = e.target.checked; draw(false); });
  $('tbl').onclick = () => { const t = $('tp'); t.style.display = t.style.display === 'block' ? 'none' : 'block'; };
  $('tp-close').onclick = () => $('tp').style.display = 'none';
  $('toggle').onclick = () => $('ctl').classList.toggle('open');
  draw(true);
});
