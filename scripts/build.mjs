// Builds docs/data/built.json from data/governorates/*.json
// Levels + nearest targets are computed across ALL governorates together.
// Road minutes come from OSRM, cached in data/cache/routes.json (committed).
// Usage: node scripts/build.mjs [--offline] [--strict]
//   --offline: no network; cache misses become straight-line estimates
//   --strict : fail if any minute is an estimate or any input is invalid (used by apply and checks)
import fs from 'node:fs';
import path from 'node:path';

const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const OFFLINE = process.argv.includes('--offline');
const STRICT = process.argv.includes('--strict');
const die = m => { console.error('ERROR: ' + m); process.exit(1); };
const EST_KMH = 30, DETOUR = 1.4; // fallback estimate, marked approx
const gdir = 'data/governorates', cpath = 'data/cache/routes.json';
const cache = fs.existsSync(cpath) ? JSON.parse(fs.readFileSync(cpath, 'utf8')) : {};

// ---- level rule (single place to change) ----
export function level(c) {
  const full = c.separation === 'rooms' || c.separation === 'physical';
  const acc = c.accreditation === 'accredited' || c.accreditation === 'in_progress';
  if (c.devices >= 2 && acc && full) return 3;
  if (c.devices >= 1) return 2;
  return 1;
}

const hav = (a, b) => {
  const R = 6371, r = x => x * Math.PI / 180;
  const dl = r(b.lat - a.lat), dn = r(b.lon - a.lon);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function route(a, b) {
  const key = `${a.lat},${a.lon}|${b.lat},${b.lon}`;
  if (cache[key]) return cache[key];
  if (!OFFLINE) {
    try {
      const u = `${OSRM}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=geojson`;
      const j = await (await fetch(u)).json();
      const r = j.routes[0];
      return cache[key] = { min: Math.max(1, Math.round(r.duration / 60)), km: +(r.distance / 1000).toFixed(1), line: r.geometry.coordinates.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]), approx: false };
    } catch (e) { console.warn('route failed, using estimate:', key); }
  }
  const km = hav(a, b) * DETOUR;
  return { min: Math.max(1, Math.round(km / EST_KMH * 60)), km: +km.toFixed(1), line: [[a.lat, a.lon], [b.lat, b.lon]], approx: true, estimate: true };
}

// nearest by road among the 3 closest straight-line candidates
async function nearest(from, pool) {
  const cands = pool.filter(p => p !== from).sort((x, y) => hav(from, x) - hav(from, y)).slice(0, 3);
  let best = null;
  for (const c of cands) {
    const r = await route(from, c);
    if (!best || r.min < best.r.min) best = { c, r };
  }
  return best && { id: best.c.id, name: best.c.name, gov: best.c.gov, min: best.r.min, km: best.r.km, line: best.r.line, approx: best.r.approx };
}

const govs = fs.readdirSync(gdir).filter(f => f.endsWith('.json') && !f.startsWith('example') || process.env.INCLUDE_EXAMPLE)
  .map(f => JSON.parse(fs.readFileSync(path.join(gdir, f), 'utf8')));
// ---- input validation (always on) ----
const num = v => typeof v === 'number' && Number.isFinite(v);
for (const g of govs) {
  if (!g.id || !g.name || !Array.isArray(g.centers) || !Array.isArray(g.hospitals)) die(`governorate file needs id, name, centers, hospitals (${g.id || '?'})`);
  for (const c of g.centers) {
    const w = `${g.id} center ${c.id}`;
    if (c.id === undefined || !c.name) die(`${w}: id and name are required`);
    if (!num(c.lat) || !num(c.lon) || c.lat < 21 || c.lat > 32 || c.lon < 24 || c.lon > 37) die(`${w}: lat/lon missing or outside Egypt`);
    if (![0, 1, 2].includes(c.devices)) die(`${w}: devices must be 0, 1 or 2`);
    if (!['accredited', 'in_progress', 'none'].includes(c.accreditation)) die(`${w}: accreditation must be accredited | in_progress | none`);
    if (!['rooms', 'physical', 'partial', 'none'].includes(c.separation)) die(`${w}: separation must be rooms | physical | partial | none`);
  }
  for (const h of g.hospitals) {
    const w = `${g.id} hospital ${h.id}`;
    if (h.id === undefined || !h.name) die(`${w}: id and name are required`);
    if (!num(h.lat) || !num(h.lon) || h.lat < 21 || h.lat > 32 || h.lon < 24 || h.lon > 37) die(`${w}: lat/lon missing or outside Egypt`);
  }
}
// ---- optional per-governorate details: admin (الإدارة الصحية) and the 13-device list ----
// data/devices.json: device names + which two devices decide the level.
// data/details/<gov>.json: { "<center id>": { "admin": "...", "devices": [13 counts] } }
const devCfg = JSON.parse(fs.readFileSync('data/devices.json', 'utf8'));
for (const g of govs) {
  const dp = path.join('data/details', g.id + '.json');
  g.details = fs.existsSync(dp) ? JSON.parse(fs.readFileSync(dp, 'utf8')) : null;
  if (!g.details) continue;
  for (const c of g.centers) {
    const d = g.details[String(c.id)];
    const w = `${g.id} center ${c.id} in ${dp}`;
    if (!d) die(`${w}: missing`);
    if (!d.admin) die(`${w}: admin is required`);
    if (!Array.isArray(d.devices) || d.devices.length !== devCfg.names.length || !d.devices.every(n => Number.isInteger(n) && n >= 0)) die(`${w}: devices must be ${devCfg.names.length} whole numbers`);
    const own = devCfg.levelDevices.filter(i => d.devices[i] > 0).length;
    if (own !== c.devices) console.warn(`WARNING ${w}: device list gives ${own} level devices, center says ${c.devices} (level uses the center value)`);
  }
}
const centers = govs.flatMap(g => g.centers.map(c => {
  const d = g.details && g.details[String(c.id)];
  return { ...c, gov: g.id, level: level(c), admin: d ? d.admin : '', deviceList: d ? d.devices : null };
}));
const hospitals = govs.flatMap(g => g.hospitals.map(h => ({ ...h, gov: g.id })));
for (const [k, list] of [['center', centers], ['hospital', hospitals]]) { const ids = new Set(); for (const x of list) { const key = x.gov + ':' + x.id; if (ids.has(key)) die('duplicate ' + k + ' id ' + key); ids.add(key); } }
const L = n => centers.filter(c => c.level === n);

for (const c of centers) {
  c.to = {};
  if (c.level === 1) { c.to.l2 = await nearest(c, [...L(2), ...L(3)].filter(x => x.level === 2)); c.to.l3 = await nearest(c, L(3)); }
  if (c.level === 2) c.to.l3 = await nearest(c, L(3));
  if (c.level === 3) c.to.hospital = await nearest(c, hospitals);
}
// L1 -> nearest L2 means a level-2 center; if none exist, UI falls back to higher level (L3) as agreed.

const avg = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null;
const summarize = list => ({
  count: { l1: list.filter(c => c.level === 1).length, l2: list.filter(c => c.level === 2).length, l3: list.filter(c => c.level === 3).length },
  avgMin: {
    l1_to_l2: avg(list.filter(c => c.level === 1 && c.to.l2).map(c => c.to.l2.min)),
    l1_to_l3: avg(list.filter(c => c.level === 1 && c.to.l3).map(c => c.to.l3.min)),
    l2_to_l3: avg(list.filter(c => c.level === 2 && c.to.l3).map(c => c.to.l3.min)),
    l3_to_hospital: avg(list.filter(c => c.level === 3 && c.to.hospital).map(c => c.to.hospital.min))
  }
});
const out = {
  governorates: govs.map(g => ({ id: g.id, name: g.name, summary: summarize(centers.filter(c => c.gov === g.id)) })),
  all: summarize(centers), deviceNames: devCfg.names, centers, hospitals
};
if (STRICT) {
  const est = centers.flatMap(c => Object.values(c.to)).filter(t => t && t.approx).length;
  if (est) die(`${est} routes are estimates (no cached road route). Run the build online and commit data/cache/routes.json.`);
}
if (!centers.length) die('no centers found');
fs.mkdirSync('docs/data', { recursive: true });
fs.writeFileSync('docs/data/built.json', JSON.stringify(out));
fs.writeFileSync(cpath, JSON.stringify(cache));
console.log('built', centers.length, 'centers,', hospitals.length, 'hospitals,', govs.length, 'governorates');
