# Fly Umwelt documentation index

This index separates the authoritative 3.8.0 state from historical records. New developers and agents should begin with the first four links and treat machine-readable benchmark JSON as the final authority for frozen numerical results.

## Start here — current state

- [`../README.md`](../README.md) — project purpose, current capabilities, limits and normal commands.
- [`NEXT_DEVELOPER_HANDOFF.md`](NEXT_DEVELOPER_HANDOFF.md) — exact implementation state, constraints, open dependencies and release procedure.
- [`../BUILD_REPORT.md`](../BUILD_REPORT.md) — most recent complete qualification and static-artifact results.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — causal boundaries, Workers, live/staged body distinction and static deployment.
- [`REALITY_MATRIX.md`](REALITY_MATRIX.md) — measured, derived and engineered parts of the model.
- [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) and [`WHOLE_FLY_EXECUTION_PROGRAM.md`](WHOLE_FLY_EXECUTION_PROGRAM.md) — dependency-ordered research program.

## Current science and embodiment

- [`SCIENTIFIC_MODEL.md`](SCIENTIFIC_MODEL.md) — neural, sensory and body equations and assumptions.
- [`PERIPHERAL_MAPPING.md`](PERIPHERAL_MAPPING.md) — BANC motor and sensory population mapping.
- [`FEMUR_TIBIA_CALIBRATION.md`](FEMUR_TIBIA_CALIBRATION.md) — normalized joint and restrained-probe calibration boundary.
- [`ARTICULATED_BODY_3_8.md`](ARTICULATED_BODY_3_8.md) — staged free-root NeuroMechFly mechanics qualification.
- [`MUSCULOSKELETAL_BODY_3_8.md`](MUSCULOSKELETAL_BODY_3_8.md) — restrained FlyMimic muscle-body qualification and source-profile failure.
- [`MUSCULOSKELETAL_INTEGRATION_3_8.md`](MUSCULOSKELETAL_INTEGRATION_3_8.md) — zero-safe profile, identity-only bridge and blocking body reconciliation.
- [`FRONT_LEG_VALIDATION_3_6.md`](FRONT_LEG_VALIDATION_3_6.md) and [`FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md`](FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md) — the frozen 3.6 scientific subsystem, continued under the 3.8 release identity.
- [`RESEARCH_AUDIT.md`](RESEARCH_AUDIT.md) — evidence gaps and research priorities.

## Qualification, data and deployment

- [`VALIDATION.md`](VALIDATION.md) — gate meanings, preserved failures and reproduction commands.
- [`BANC_PACK.md`](BANC_PACK.md) and [`DATA.md`](DATA.md) — data selection, provenance and redistribution boundaries.
- [`QUICKSTART.md`](QUICKSTART.md) — local run, complete release-gate entry point and production preview.
- [`CLOUDFLARE_PAGES.md`](CLOUDFLARE_PAGES.md) — static-only Pages contract and deployment checklist.
- [`ROOM_FORMAT.md`](ROOM_FORMAT.md) — room schema and causal role.
- [`CLAIMS_AND_ETHICS.md`](CLAIMS_AND_ETHICS.md) — scientific, life, welfare and consciousness claim boundaries.
- [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) — licenses and upstream attribution.

## Machine-readable evidence

Frozen reports are in [`benchmarks/`](benchmarks/). The most recent body-integration records are:

- [`benchmarks/articulated-body-qualification-3.8.0.json`](benchmarks/articulated-body-qualification-3.8.0.json);
- [`benchmarks/musculoskeletal-body-qualification-3.8.0.json`](benchmarks/musculoskeletal-body-qualification-3.8.0.json);
- [`benchmarks/musculoskeletal-zero-safe-qualification-3.8.0.json`](benchmarks/musculoskeletal-zero-safe-qualification-3.8.0.json);
- [`benchmarks/flymimic-banc-front-tibia-bridge-3.8.0.json`](benchmarks/flymimic-banc-front-tibia-bridge-3.8.0.json);
- [`benchmarks/body-reconciliation-3.8.0.json`](benchmarks/body-reconciliation-3.8.0.json);
- [`benchmarks/locomotor-honesty-3.8.0.json`](benchmarks/locomotor-honesty-3.8.0.json).

Calibration contracts consumed at runtime are under `public/data/calibration/` in the source tree and `/data/calibration/` in the static artifact. Do not infer a stronger claim from a runtime artifact than its narrative document and validator allow.

## Historical records

These files are retained to prevent retrospective rewriting. Their release counts and “next step” statements describe their own point in time, not the current project:

- [`../REDESIGN_HANDOFF.md`](../REDESIGN_HANDOFF.md) — pre-implementation 3.0 UI redesign plan;
- [`REDESIGN_IMPLEMENTATION.md`](REDESIGN_IMPLEMENTATION.md) — completed 3.0 redesign record;
- [`../ACCURACY_IMPLEMENTATION_REPORT.md`](../ACCURACY_IMPLEMENTATION_REPORT.md) — 3.1 accuracy implementation record;
- [`../WHOLE_CNS_IMPLEMENTATION_REPORT.md`](../WHOLE_CNS_IMPLEMENTATION_REPORT.md) — qualified 3.5 whole-CNS state.

Run `npm run docs:check` after editing current documentation. It verifies links, documented commands, required status facts and the historical/current boundary.
