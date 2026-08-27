# Quickstart

## Run the self-contained app

Node 20 or newer is sufficient. No Python step, account, database or external simulator is required for normal use.

```bash
npm run dev
```

Open <http://127.0.0.1:4173>.

The page loads the bundled BANC whole-CNS model by default. Its first load fetches same-origin compressed static assets; supported browsers may cache them for later visits.

## Choose structural fidelity

The **Directed pairs** control changes the loaded nervous-system graph:

- **Auto** — Core on constrained devices, Balanced otherwise;
- **Core** — 1,912,731 pairs with at least five contacts;
- **Balanced** — 3,730,893 pairs with at least three contacts; default on capable devices;
- **Maximal** — 13,366,470 usable pairs, including one- and two-contact pairs.

Changing tier creates a new individual because it changes the nervous system. Maximal is never selected automatically.

## Choose numerical fidelity

The **Compute** and **Neural resolution** controls are independent of graph structure:

- Auto / WebAssembly / JavaScript;
- Economy 4 ms / Balanced 2 ms / Fine 1 ms / Research 0.5 ms.

Changing backend or timestep preserves the individual. Auto performs a state-reversible local calibration and chooses a supported timestep with measured headroom.

## Choose a scientific condition

- **Natural** — disclosed ongoing neural state, homeostasis, physiology and body-relative memory input;
- **Causal** — reduced ongoing drive and no memory input;
- **Evoked** — zero spontaneous baseline for perturbation experiments.

All three use the same direct six-leg rule: broad descending activity may clock coordination, but only mapped leg-motor populations produce traction.

## Useful URLs

```text
/?dataset=banc&tier=core
/?dataset=banc&tier=balanced&engine=wasm
/?dataset=banc&tier=maximal&resolution=economy
/?dataset=fafb
/?fullprobe=1
```

## Run the release gates

The normal complete gate is:

```bash
npm run docs:check
npm run validate
npm run smoke:full
```

`npm run validate` includes the following release-critical checks:

```bash
npm run check
npm run check:banc
npm run calibration:leg
npm run experiments:leg
npm run bridge:leg
npm run body:articulated
npm run body:musculoskeletal
npm run body:musculoskeletal:zero-safe
npm run bridge:flymimic-banc
npm run body:reconcile
npm run audit:locomotion
npm test
npm run build
npm run smoke:articulated
npm run smoke:musculoskeletal
```

Run `npm run behavior` for the compact causal behavior panel and `npm run stress` when performance-sensitive code changes. `npm run smoke` exercises the fixture UI, while `npm run smoke:full` loads the full Balanced BANC graph. Browser smokes need an unblocked Chromium/Chrome installation. In managed environments that block localhost, a smoke script reports the browser gate as unavailable rather than pretending it passed.

The source-profile zero clamp, two front-leg DSI mismatches and three locomotor scientific failures are deliberately retained. `npm run experiments:leg:strict` and `npm run competence:locomotion` therefore remain intentionally red; do not use them as release-engineering gates.

## Rebuild BANC for audit work

The generated BANC pack is already committed. Rebuilding is optional and intended for developers comparing a new public snapshot:

```bash
python -m pip install pyarrow numpy
npm run data:banc:strict
```

The builder reads the public v888 metadata and v3 aggregate edge tables, writes deterministic gzip shards, records source hashes and validates known source counts. A rebuilt live public table may legitimately differ from the frozen paper snapshot; inspect `audit.json` rather than editing filters to force a remembered number.

## Build and preview production output

```bash
npm run build
SERVE_DIST=1 npm run dev
```

Then open <http://127.0.0.1:4173>. This serves `dist/`, matching the Cloudflare Pages artifact layout.

## Deploy to Cloudflare Pages

| Setting | Value |
|---|---|
| Framework | None |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 20+ |
| Functions | None |

See [`CLOUDFLARE_PAGES.md`](CLOUDFLARE_PAGES.md) for headers and asset limits, [`README.md`](README.md) for the documentation index and [`NEXT_DEVELOPER_HANDOFF.md`](NEXT_DEVELOPER_HANDOFF.md) before changing scientific or body contracts.
