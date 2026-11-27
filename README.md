# lab-levels-map

Static map of lab centers by capability level, with drive minutes to the nearest higher level. Governorate-agnostic: Cairo first, others added as new data files.

## Levels (rule in `scripts/build.mjs`, function `level`)
- L1: no devices
- L2: at least 1 device
- L3: both devices + accredited or in progress + full separation (separate rooms or physical separation)

## Cards
L1: minutes to nearest L2 and nearest L3. L2: nearest L3. L3: nearest accredited hospital. Governorate summary card: counts per level and average minutes. Nearest is chosen by road time among the 3 closest by straight line, across all governorates together.

## Data
One file per governorate in `data/governorates/<id>.json` (raw: coordinates + survey answers). Never edit built output.
Fields per center: id, name, lat, lon, devices (0-2), accreditation (accredited | in_progress | none), separation (rooms | physical | partial | none). Hospitals: id, name, lat, lon.

## Workflow
Change data or add a governorate file -> `node scripts/build.mjs` (needs network only for new pairs; OSRM public server, set `OSRM_URL` to use another) -> commit `data/cache/routes.json` + `docs/data/built.json` -> PR -> merge -> GitHub Pages deploys.
Cached routes mean the live site never calls a routing service. Minutes marked "~" are estimates from OSRM (no traffic) or the offline fallback.
`example.json` is skipped unless `INCLUDE_EXAMPLE=1`.
