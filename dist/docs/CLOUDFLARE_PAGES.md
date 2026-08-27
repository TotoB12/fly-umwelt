# Cloudflare Pages deployment

## Static-only design

Fly Umwelt requires no Pages Functions or server-side simulation. Cloudflare Pages distributes HTML, CSS, JavaScript modules, Web Workers, WebAssembly, rooms and connectome shards. Every simulation update occurs in the visitor's browser.

## Build

```bash
npm run build
```

Configure Pages with:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 20+ |
| Functions directory | none |

Cloudflare's official Pages limits documentation, rechecked 2026-08-26, lists a 25 MiB maximum for one static asset, 20,000 files on Free and up to 100,000 files on paid plans when `PAGES_WRANGLER_MAJOR_VERSION=4` is enabled in the Pages project settings. Fly Umwelt uses 35 compact BANC edge shards; each release gate checks every public file against 25 MiB and records the built file count. Source: <https://developers.cloudflare.com/pages/platform/limits/>.

## Headers

Cloudflare Pages reads a plain `_headers` file from the static output. Fly Umwelt uses it for:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

These headers provide cross-origin isolation for present/future shared-memory paths and keep runtime assets same-origin. The CSP permits local modules, Workers and WebAssembly compilation while refusing external scripts and framing.

Because the project has no Pages Functions, the static `_headers` rules apply directly to its assets.

## Asset layout

```text
dist/
  index.html
  _headers
  _redirects
  README.md
  BUILD_REPORT.md
  CHANGELOG.md
  REDESIGN_HANDOFF.md + historical implementation reports
  THIRD_PARTY_NOTICES.md
  src/
  docs/
  data/
    banc/
      manifest.json
      audit.json
      neurons.csv.gz
      classification.csv.gz
      35 edge shards
    calibration/
      articulated-body-bridge-v1.json
      front-leg-femur-tibia.json
      front-leg-validation-v1.json
      front-leg-spike-force-bridge-v1.json
      flymimic-banc-front-tibia-bridge-v1.json
      locomotor-competence-v1.json
      locomotor-honesty-v1.json
    morphology/
      neuromechfly-v2.1.0/
        provenance.json
        model_meta.json
        model/fly.xml + 39 STL meshes
      flymimic-frontleg-20260623a/
        provenance.json
        mesh_metadata.yaml
        model/flymimic-frontleg.xml + 71 STL meshes
  vendor/
    mujoco-3.9.0/
      mujoco.js
      mujoco.wasm
    licenses/
    ...
  wasm/lif-kernel.wasm
  rooms/default.json
```

The browser may cache validated compressed assets. The application verifies manifest hashes when WebCrypto is available. The zero-safe FlyMimic Worker path additionally verifies the byte-identical source XML and deterministic derived XML SHA-256 values before accepting the compiled profile.

## Production-equivalent local preview

```bash
npm run build
SERVE_DIST=1 npm run dev
```

`SERVE_DIST=1` is only a switch for the repository's local Node preview: it makes `scripts/serve.mjs` expose the already-built `dist/` directory instead of source plus the `public/` overlay. Cloudflare does not use that variable. Pages runs `npm run build` and then serves `dist` directly.

Then verify:

```bash
curl -I http://127.0.0.1:4173/
curl -I http://127.0.0.1:4173/wasm/lif-kernel.wasm
curl http://127.0.0.1:4173/data/banc/manifest.json
```

Also request a nonexistent data file and require a 404. Missing graph data must never fall back to `index.html`.

## Deployment checklist

- `npm run validate` completes, with browser smoke either passed or explicitly unavailable;
- `npm run calibration:leg` confirms the frozen browser constants and public calibration artifact agree;
- `npm run audit:locomotion` confirms report reproducibility, causal boundaries, active walking observations and contact-honest ingestion across the frozen seed split;
- `npm run body:articulated` verifies every morphology/runtime/license hash, compiles the 70-body model and reproduces mechanics-only probes;
- `npm run smoke:articulated` compiles the same model from static same-origin assets inside the browser world Worker;
- `npm run body:musculoskeletal` verifies the pinned 74-file restrained muscle bundle, compiles 15 Hill muscles/tendons and reproduces both antagonist causality and the blocking zero-excitation result;
- `npm run body:musculoskeletal:zero-safe` proves the deterministic in-memory 15-range derivative, exact zero-from-zero behavior, passive-mechanics preservation and profile isolation;
- `npm run bridge:flymimic-banc` validates two identity-only BANC/muscle correspondences while requiring null gain/timing and disabled control;
- `npm run body:reconcile` freezes the free-root/restrained mass, frame, segmentation, actuator and contact incompatibilities without merging them;
- `npm run smoke:musculoskeletal` compiles the zero-safe profile from same-origin static assets inside the browser world Worker, exposes the source negative result and never selects either body as the live plant;
- `npm run competence:locomotion` remains an intentionally red scientific check until steering, obstacle recovery and phasic bout/stop recruitment qualify;
- `find dist -type f -size +25M -print` returns nothing;
- `dist/vendor/mujoco-3.9.0/mujoco.wasm` is 9,139,270 bytes and served as `application/wasm`;
- the BANC manifest and one shard load from the deployed origin;
- `.wasm` has `application/wasm` MIME type;
- COOP/COEP appear on the deployed page;
- BANC Balanced starts on a capable desktop;
- Core starts on a constrained-device test;
- Maximal remains opt-in;
- offline/external requests are absent from the runtime network log.

The next maintainer should read [`README.md`](README.md) for the documentation index and [`NEXT_DEVELOPER_HANDOFF.md`](NEXT_DEVELOPER_HANDOFF.md) for the current scientific/body boundary before changing the build or deployment contract.
