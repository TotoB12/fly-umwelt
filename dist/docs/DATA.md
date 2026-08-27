# Data and provenance

## Bundled datasets

### BANC v888 whole CNS — default

Files are under `public/data/banc/` and are ordinary same-origin static assets. The source products are the public Lee Lab compiled v888 metadata and v3 aggregate edge table. Source URLs are recorded for provenance and developer rebuilds only; the browser runtime refuses remote graph fallbacks.

The manifest records:

- source URLs and SHA-256 hashes;
- source detector version;
- neuron-selection rule and counts;
- cumulative graph tiers;
- every output file's hash, size and record count;
- known anatomical and physiological limitations.

Read `BANC_PACK.md` and `public/data/banc/audit.json` before changing selection rules.

Primary paper: <https://doi.org/10.1038/s41586-026-10735-w>

### FAFB v783 brain comparison

The checked-in FAFB pack remains available for comparison and historical whole-brain experiments. It contains 139,255 neuron identities and a pinned aggregate graph derived from the public `snedea/flybrain` package. It is not the default embodied organism because it omits the VNC and most leg motor pathways.

Primary paper: <https://doi.org/10.1038/s41586-024-07558-y>

### Deterministic fixture

The 120-neuron fixture is test-only. It contains explicit sensory paths, twelve leg motor neurons and narrow outputs so parser, neural and body regressions can be tested quickly. It is not a biological dataset.

### Front-leg calibration and experiment artifacts

`public/data/calibration/front-leg-femur-tibia.json` is a small same-origin artifact separating measured constraints, engineering parameters, extrapolations, runtime limits, preregistered checks and source licenses. It is copied unchanged into `dist/data/calibration/` and checked against `src/core/leg-calibration.js` by `npm run calibration:leg`.

`front-leg-validation-v1.json` is the immutable exact-protocol/evidence contract. Its pre-bridge limitation text records the historical 3.5 baseline and is not rewritten after the fact. `front-leg-spike-force-bridge-v1.json` records the 3.6 force/probe measurements, publisher-figure-derived one-spike medians, pinned FlyGym morphology scalars, GCaMP context, equations and claim boundaries. It is checked by `npm run bridge:leg`.

`locomotor-competence-v1.json` records the 3.7 Mendes/Azevedo/Wosnitza walking constraints, retrieved-source hashes, the zero-spiking motor diagnosis, frozen engineering transfer, fit/held-out seed policy and explicit claim boundaries. Source XML/JSON is not redistributed. It is checked against browser constants and the actual bundled Balanced graph by `npm run competence:locomotion`.

`locomotor-honesty-v1.json` supersedes that artifact for current 3.8 claims while retaining the 3.7 file as history. It adds source-pinned descending steering, contextual locomotor recruitment and touch-to-MDN evidence; records the removal of tonic-asymmetry yaw and plant-private collision behavior; and separates mandatory causal integrity from unresolved scientific qualification. `npm run audit:locomotion` checks reproducibility and causal integrity. The stricter `npm run competence:locomotion` intentionally remains nonzero while steering-DN recruitment, obstacle recovery and phasic bout/stop control are unqualified.

## Articulated morphology and runtime

`public/data/morphology/neuromechfly-v2.1.0/` contains the flattened controller-free FlyGym 2.1 browser XML, 39 STL meshes, model metadata and file-level provenance. `public/vendor/mujoco-3.9.0/` contains the official MuJoCo JavaScript/WebAssembly runtime used by that browser viewer. Apache-2.0 texts are under `public/vendor/licenses/`. `scripts/vendor_neuromechfly_browser_assets.mjs` retrieves only pinned sources, verifies frozen top-level/runtime/license hashes and regenerates full provenance.

The model uses millimetres, grams and seconds. Its `0.00102431` compiled mass is therefore `1.02431 mg`, not kilograms. Model position-actuator gains, friction, solver settings and contact parameters are engineering data from the upstream browser model.

`articulated-body-bridge-v1.json` classifies the stable 72 BANC action channels against the 42 body coordinates. It is primarily a negative/uncertainty artifact: only femur–tibia flex/extend have coordinate/sign mappings, no mapping has a population-to-angle gain, eight candidate mappings are disabled, and long-tendon/unknown actions remain unresolved.

## Restrained musculoskeletal morphology

`public/data/morphology/flymimic-frontleg-20260623a/` contains the pinned Özdil et al. / FlyMimic MuJoCo XML, 71 STL meshes, EPFL mesh metadata and file-level provenance. `scripts/vendor_flymimic_musculoskeletal_assets.mjs` verifies byte identity between pinned FlyGym and FlyMimic XML, the complete versioned bucket listing, every source ETag/size, fixed SHA-256 values and Apache-2.0 license. The 74 tracked files total 14,022,871 bytes. Remote sources are never used by the browser.

The bundle deliberately excludes PPO policies, motion capture, imitation reward, environment/task wrappers and gait/adhesion control. The model contains 15 anatomy-derived front-leg Hill MTUs and 15 spatial tendons, but its physiological parameters include estimates/optimization, external contacts are unvalidated, every excitation lower bound is `0.0001`, and its compiled mass differs from the separate viewer body. It is qualification data, not a live controller or a BANC mapping. See `MUSCULOSKELETAL_BODY_3_8.md` and `docs/benchmarks/musculoskeletal-body-qualification-3.8.0.json`.

The zero-safe profile does not add or rewrite a morphology file. Browser code derives a 49,595-byte XML in memory through exactly 15 audited control-range substitutions, then compiles it under a distinct physics-profile key. `flymimic-banc-front-tibia-bridge-v1.json` records two exact BANC/FlyMimic identity correspondences with null gain/timing and disabled automatic control. The derived-profile, identity and separate-body evidence is frozen in `musculoskeletal-zero-safe-qualification-3.8.0.json`, `flymimic-banc-front-tibia-bridge-3.8.0.json` and `body-reconciliation-3.8.0.json`; see `MUSCULOSKELETAL_INTEGRATION_3_8.md`.

`azevedo-force-figure4d-v1.json` contains publisher-figure-derived coordinates. These are not raw force recordings, sample means or confidence intervals. The project keeps that evidence class machine-visible.

The Azevedo Dryad repository is approximately 48.8 GB and is referenced rather than vendored. Its automated-access challenge was not bypassed. This release encodes reported scalars and derived publisher-figure coordinates; it does not claim a raw-trace reanalysis. See `FEMUR_TIBIA_CALIBRATION.md` and `FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md`.

## BANC reproducibility

The BANC source is a living public resource. The paper reports a strict v888 proofreading count, while the public metadata can contain annotations added after that snapshot. Reproducibility therefore depends on hashes, not only version labels.

Fly Umwelt records source hashes in both `manifest.json` and `audit.json`. A rebuild against changed source files should be treated as a new data release even when the bucket path still says `banc_888`.

## Redistribution

Project code is MIT-licensed. Connectome data, annotations and derived packages have their own citation and redistribution expectations. Review the BANC paper, Harvard Dataverse record and FlyWire terms before redistributing the data independently of this project.

The BANC Nature article is open access under CC BY 4.0. Individual source products and external annotations may carry additional attribution requirements; preserve provenance files.

## Data formats

### Neurons

`neurons.csv.gz` contains root ID, runtime transmitter class and evidence fields used by the parser.

### Classification

`classification.csv.gz` contains the annotation columns needed for sensory, motor and observer mappings. It intentionally preserves source text because exact labels matter and broad substring matching has caused real errors.

### Edge shards

Each decompressed edge record is:

```text
uint32 source index
uint32 target index
float32 normalized input fraction
```

All fields are little-endian. Tiers are cumulative components described in the manifest.

## Integrity

Run:

```bash
npm run check:banc
npm run calibration:leg
npm run experiments:leg
npm run bridge:leg
```

The gate verifies all hashes and every edge record. Do not manually edit generated compressed files.
