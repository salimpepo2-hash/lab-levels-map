// Builds docs/data/built.json from data/governorates/*.json
// Levels + nearest targets are computed across ALL governorates together.
// Road minutes come from OSRM, cached in data/cache/routes.json (committed).
// Usage: node scripts/build.mjs [--offline]   (offline = straight-line estimate only for cache misses)
import fs from 'node:fs';
import path from 'node:path';

const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const OFFLINE = process.argv.includes('--offline');
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
  const cands = pool.filter(p => p.id !== from.id).sort((x, y) => hav(from, x) - hav(from, y)).slice(0, 3);
  let best = null;
  for (const c of cands) {
    const r = await route(from, c);
    if (!best || r.min < best.r.min) best = { c, r };
  }
  return best && { id: best.c.id, name: best.c.name, gov: best.c.gov, min: best.r.min, km: best.r.km, line: best.r.line, approx: best.r.approx };
}

const govs = fs.readdirSync(gdir).filter(f => f.endsWith('.json') && !f.startsWith('example') || process.env.INCLUDE_EXAMPLE)
  .map(f => JSON.parse(fs.readFileSync(path.join(gdir, f), 'utf8')));
const centers = govs.flatMap(g => g.centers.map(c => ({ ...c, gov: g.id, level: level(c) })));
const hospitals = govs.flatMap(g => g.hospitals.map(h => ({ ...h, gov: g.id })));
const ids = new Set(); for (const x of [...centers, ...hospitals]) { if (ids.has(x.gov + x.id)) throw new Error('duplicate id ' + x.id); ids.add(x.gov + x.id); }
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
  generated: new Date().toISOString(),
  governorates: govs.map(g => ({ id: g.id, name: g.name, summary: summarize(centers.filter(c => c.gov === g.id)) })),
  all: summarize(centers), centers, hospitals
};
fs.mkdirSync('docs/data', { recursive: true });
fs.writeFileSync('docs/data/built.json', JSON.stringify(out));
fs.writeFileSync(cpath, JSON.stringify(cache));
console.log('built', centers.length, 'centers,', hospitals.length, 'hospitals,', govs.length, 'governorates');
