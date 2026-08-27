# Next developer/agent handoff — Fly Umwelt 3.8.0

## Objective and repository state

The core goal is to make an embodied fly simulation as biologically real as current public evidence, numerical tooling and consumer browsers technically permit. Scientific failure is a result to preserve, not a gap to conceal with scripted competence.

This workspace intentionally has no `.git` directory. The owner will reconnect it to the upstream repository manually on a credentialed machine. Work only inside this project folder, preserve existing files unless a change is necessary, and do not treat absent Git history as permission to discard provenance records.

The deliverable is a fully static web application for Cloudflare Pages. `npm run build` must produce a self-contained `dist/` with no `functions/`, `_worker.js`, `_routes.json`, bindings, server state, telemetry, remote module imports or mandatory external runtime fetches. Large physics assets load lazily from the same origin. `_headers` supplies CSP and cross-origin isolation.

## Non-negotiable scientific boundaries

Do not add cosmetic/scripted controllers, hidden finite-state behavior, target bearings, ideal actions, collision timers, motion floors, anti-circling logic, passive sticky feet, imported gait controllers, PPO policies, motion-capture replay or imitation policies. Camera, renderer, captions, neural field, editor and ethogram are observer-only.

Keep zero neural output exactly motionless. Broad descending activity may coordinate the transitional gait clock but may not create traction. Contact may produce physical load and sensory return but may not privately choose behavior. Any future adhesion must have supported active neural timing and physical substrate evidence.

Do not equate the Azevedo external restrained-probe force with FlyMimic internal tendon/actuator force. Do not average, splice or silently merge the current free-root and restrained models. Preserve every negative qualification and update its machine-readable report only through the matching `--write` validator when new evidence justifies it.

## Three body layers — do not conflate them

| Layer | Current role | Current contract |
|---|---|---|
| live `PlanarHexapodPlant` | default closed-loop organism | six engineering traction legs, one dynamic femur–tibia joint per leg, transitional coordination-gated gait scaffold |
| staged NeuroMechFly/MuJoCo body | qualification only | 70 bodies, free root, 1.02431 mg, 42 position actuators, six contact sensors; explicit torque and room/contact probes |
| restrained FlyMimic/MuJoCo body | qualification only | 73 bodies, anchored root, 2.494271478 mg, 15 Hill muscles/tendons, zero sensors; left-front leg only |

Neither MuJoCo object can be selected as the live plant through its Worker hook. This separation is intentional.

## Exact 3.8.0 integration result

The public FlyMimic XML remains byte-identical with source SHA-256 `04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531`. Its source profile still clamps all 15 controls to a minimum of `0.0001`, so the original zero-evidence gate remains red.

The separate `zero-safe` profile performs exactly 15 deterministic in-memory substitutions and has derived SHA-256 `47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e`. Zero-initial activation stays exactly zero and passive elastic force remains visible. Source and derivative states have distinct physics keys and cannot cross-restore. Following activation at `0.5`, 500 ms of zero control leaves a positive subnormal near `1.91e-291`; finite-time exact zero is therefore false and no hidden threshold is permitted.

The BANC bridge is identity-only:

| BANC root/type | FlyMimic actuator |
|---|---|
| `720575941481179066` / `tibia_flexor_Fast` | `LFTibia_flex_93434` |
| `720575941639281525` / `tibia_extensor_FETi` | `LFTibia_extensor_93932` |

SETi root `720575941478577231` remains distinct and excluded. Predicted-GABA metadata and the FETi LR-type conflict remain visible. `excitationGain` and `timingTransfer` are null; automatic control is disabled.

The body reconciliation is a blocking result. It finds 64 comparison-only canonical body-name matches and a restrained/free-root mass ratio of `2.435074809384`, but root topology, segmentation, frames, masses/inertias, actuator semantics and contact/sensor contracts conflict. Mechanical merge, mass/inertia transfer, contact transfer, muscle-route transplantation and live-plant replacement are disabled.

## Preserved scientific failures

- Front-leg protocol: club DSI predicts `−0.032471818` versus reported `0.117`; flexion-hook DSI predicts `1.0` versus reported `0.811`.
- Locomotor competence: represented steering descending neurons do not spike; the obstacle assay produces no represented reversal; phasic stop/recruitment is absent while requested locomotion can persist under contact-limited motion.
- Source FlyMimic zero rule: requested zero clamps to `0.0001`.
- Zero-safe decay boundary: activation after prior activity does not reach exact mathematical zero in finite time.
- Muscle integration: preparation-compatible excitation gain/timing, untethered contact validation and a mechanically coherent free-root muscle body do not yet exist.

`npm run experiments:leg`, `npm run audit:locomotion` and the body validators must preserve these results. `npm run experiments:leg:strict` and `npm run competence:locomotion` are intentionally red scientific gates.

## Key implementation and evidence files

- `src/core/mujoco-articulated-body.js` — staged free-root mechanics wrapper.
- `src/core/mujoco-musculoskeletal-body.js` — source/zero-safe restrained muscle wrapper and profile hashing.
- `src/workers/world.worker.js` — qualification-only lazy Worker hooks.
- `public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json` — frozen identity-only bridge.
- `scripts/validate_musculoskeletal_zero_safe.mjs` — derivative and numerical-boundary qualification.
- `scripts/validate_flymimic_banc_bridge.mjs` — exact BANC identity qualification.
- `scripts/validate_body_reconciliation.mjs` — read-only model comparison and blocking decision.
- `docs/MUSCULOSKELETAL_INTEGRATION_3_8.md` — narrative result.
- `docs/benchmarks/` — frozen machine-readable reports.

## Next work, in dependency order

1. Obtain preparation-compatible motor spike/subthreshold-to-muscle excitation gain and timing evidence. Do not derive it by equating external probe force with internal tendon force.
2. Build one explicitly reconciled free-root morphology whose frames, centres of mass, inertias, muscle paths, contact geometry and sensors are coherent. The two current bodies are references, not spliceable halves.
3. Validate untethered external load/contact mechanics and force/contact-to-afferent transfer before live neural selection.
4. Extend anatomy-derived muscle–tendon units and local afferents to all six legs.
5. Add active adhesion only after neural attachment/release timing and substrate mechanics are supported.
6. Replace the planar phase/traction scaffold only when the full force/contact/afferent loop qualifies; allow locomotion to emerge or fail.

Parallel evidence work remains valuable: raw front-leg force/FeCO traces, preparation-specific GCaMP/driver calibration, absolute extensor and unresolved-unit force, heterogeneous motor-neuron physiology, VNC local circuits and missing peripheral anatomy.

## Normal commands and release procedure

Use Node 20 or newer. Start with:

```bash
npm run docs:check
npm run validate
npm run smoke:full
```

The aggregate validation includes source/static checks, BANC integrity, front-leg gates, articulated and musculoskeletal Node qualifications, zero-safe/identity/reconciliation gates, locomotor honesty, 113 deterministic tests, a production build and both MuJoCo browser-Worker smokes. `smoke:full` separately exercises the full Balanced BANC graph in Chromium.

Before handoff or release:

1. Run `npm run docs:check` and `npm run validate`.
2. Run `npm run smoke:full`; run `npm run stress` when performance-sensitive code changed.
3. Audit `dist/` for file count, total bytes, largest file, Pages-special files and remote runtime dependencies; update `BUILD_REPORT.md` with observed facts.
4. Rebuild after any copied documentation changes and repeat the static audit.
5. Run `npm run release:manifest` as the final filesystem write.
6. After manifest generation, use read-only inspection only. Any edit or rebuild makes `RELEASE_MANIFEST.json` stale and requires regeneration.

See [`README.md`](README.md) for the full documentation map and [`CLOUDFLARE_PAGES.md`](CLOUDFLARE_PAGES.md) for the deployment contract.
