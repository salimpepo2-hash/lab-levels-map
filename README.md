# lab-levels-map

Static map of lab centers by capability level, with drive minutes to the nearest higher level. Governorate-agnostic: Cairo first, others added as new data files. Changes go through the Issue and /apply flow described below.

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

## Editing flow (from the phone, via chat)
1. Describe the change in chat. An Issue is opened with exact edits (JSON block: `title`, `edits` with `file` + `find` + `replace`, or `file` + `create` for a new file, e.g. a new governorate).
2. The owner comments `/apply` (English keyboard) on the Issue. The workflow `apply-edits.yml` applies the edits to the `dev` branch, runs `node scripts/build.mjs --strict` (recalculates levels, nearest, road routes), and commits the edits together with the regenerated `docs/data/built.json` and `data/cache/routes.json`. If anything fails, nothing is committed and the Issue gets the reason.
3. A pull request dev -> main is opened. `check.yml` re-checks it. Merge it with a merge commit (not squash).
4. Push to main deploys GitHub Pages (`pages.yml`). Nothing else deploys.
Only the repo owner's Issues and comments trigger apply. Generated files and `.github/` cannot be edited through apply.
