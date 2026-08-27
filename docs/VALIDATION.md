# Validation

## Release philosophy

Fly Umwelt validates numerical correctness, causal boundaries, static deployment and regression behavior separately. None of these gates alone establishes biological accuracy.

The normal release entry point is `npm run validate`. It begins with `npm run docs:check`, then runs fixture generation, source/static validation, BANC integrity, all front-leg and body qualifications, the locomotor honesty audit, deterministic tests, the production build and both MuJoCo browser-Worker smokes. `npm run smoke:full` remains a separate full Balanced-BANC browser gate.

## Documentation gate

```bash
npm run docs:check
```

This gate resolves local Markdown links, verifies every documented `npm run` command, requires the current documentation index and next-developer handoff, checks frozen zero-safe/identity/reconciliation facts and requires historical reports to identify themselves near the top. It also rejects known stale current-release counts without altering historical records.

## Deterministic suite

```bash
npm test
```

The 3.8 release result is 113/113 passing tests, including articulated-boundary, zero-safe profile, identity-bridge and reconciliation regressions, and is recorded with the other final gates in `BUILD_REPORT.md`.

Coverage includes:

- no target-direction or food-seeking functions;
- no privileged room/object/camera/history fields in the neural protocol;
- zero neural leg output means zero body movement;
- broad descending activity alone cannot create traction;
- identified motor subthreshold evidence can create bounded output without allowing descending-only leakage;
- bilateral leg activation produces nearly straight motion;
- mirrored steering evidence produces mirrored rotation;
- all twelve fixture motor neurons are activated through graph paths;
- tripod phase relationships remain stable;
- contact alone cannot select reversal or turning, while explicit represented reverse output can clear an obstacle;
- tonic leg readiness without coordination cannot start gait, tonic motor asymmetry cannot steer and steering without traction cannot rotate;
- bare-floor proboscis output is an attempt/probe rather than feeding, and ingestion requires both matching mouth contact and neural output;
- save/restore preserves six smoothed leg outputs and physical body state;
- save/restore preserves all 72 detailed actuator filters;
- save/restore preserves all 30 femur–tibia motor-unit filters;
- exact motor-unit frame counts cross the brain/protocol boundary and are consumed once;
- identified flexor/extensor perturbations move the matching joint in opposite directions;
- slow/intermediate/fast recruitment order, strict fast gating and 8.5 ms half-response;
- zero neural evidence injects exactly zero active muscle force;
- claw position polarity, hook direction and bidirectional club response/decay;
- spike-count force scale/summation, probe torque bounds, loaded-joint force reconstruction and GCaMP sampling;
- 92-value subtype feedback reaches FeCO populations without invented signed roots, while 62/50-value packets remain accepted;
- zero-input Evoked silence;
- exact passive integration and refractory release;
- biological-time preservation of delayed events across timestep changes;
- JavaScript/WebAssembly spike and numerical parity;
- BANC selection semantics, transmitter policy and exact halt matching.

## Static/source gate

```bash
npm run check
```

The gate validates version coherence, required source/data/benchmark files, JavaScript syntax, UI controls, absolute-force evidence fields, one-shot motor-frame delivery, ARIA tabs, camera/editor behavior, observer-only history, neural display limitations, WebAssembly validity, causal protocol fields, BANC builder semantics, accessibility CSS, local runtime assets and the 25 MiB per-file limit.

The exact file/module count is emitted on every run and recorded for the release in `BUILD_REPORT.md`.

## Leg calibration gate

```bash
npm run calibration:leg
```

The validator compares every shared frozen constant with `public/data/calibration/front-leg-femur-tibia.json`, then executes the preregistered fit and held-out checks. The unchanged 3.6 limb model retains recruitment onsets at 0.082 / 0.322 / 0.702 normalized drive, an 8.6 ms discretized half-response, zero isolated-fast command, bidirectional FeCO responses, exact bilateral symmetry and exact save/restore continuation. The 3.5–3.7 benchmark artifacts remain historical records; 3.8 deliberately does not retune this subsystem.

## Exact-protocol experiment gate

```bash
npm run experiments:leg
```

This gate verifies the immutable evidence contract, reproduces the Mamiya swing/ramp-and-hold and Azevedo force protocols, and checks the current benchmark exactly. It succeeds while preserving biological failures. `npm run experiments:leg:strict` intentionally remains red because club and flexion-hook DSI disagree with the reported values.

Current experiment status: 17 pass, 2 fail, 1 expected limitation and 1 context record. Fit records are 6/6; held-out records are 11/13. The unchanged `front-leg-validation-baseline-3.5.0.json` is historical and cannot be rewritten after refinement; `front-leg-validation-3.8.0.json` records exact continuation of the 3.6 result under the current release identity.

## Spike–force bridge gate

```bash
npm run bridge:leg
```

The strict bridge gate verifies provenance and frozen constants, then checks four source-fitted constraints and five held-out implementation/causality consequences. Current status is 9/9. The held-outs establish unit consistency, zero-spike causality, lever-arm sensitivity, loaded FeCO closure and exact continuation; they are not independent biological recordings. `front-leg-spike-force-bridge-3.8.0.json` records unchanged continuation of the versioned 3.6 bridge described in `FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md`.

## BANC integrity gate

```bash
npm run check:banc
```

The validator:

- checks manifest schema and cumulative tier counts;
- verifies SHA-256 for neurons, classifications, audit and every edge shard;
- decompresses all 35 edge shards;
- checks 12-byte record alignment and record counts;
- checks every source and target index;
- rejects non-finite, zero or >1 normalized weights;
- parses the real Core graph;
- requires all six leg motor pools;
- requires 391 explicit motor neurons, 68 motor cell types, 17 targets and all six femur–tibia antagonist pairs;
- checks exact per-leg slow/unresolved/fast/SETi/FETi population counts;
- checks exact per-leg claw/hook/club populations and requires unsupported signed populations to remain absent;
- reports 5,214 explicit / 5,302 mapped leg afferents and modality counts;
- checks 167 left/right type conflicts, 26 missing transmitter calls and the 188-row uncertainty union;
- requires bilateral DNa01, DNa02 and DNg13;
- requires the false halt population to be zero;
- checks conservative transmitter classes.

## Causal behavior panel

```bash
npm run behavior
```

This is a diagnostic panel, not a claim about wild-fly behavior. It checks:

- zero-output immobility;
- symmetric bilateral walking;
- mirrored DNa steering;
- fixture closed-loop motor activation;
- contact causality: contact remains sensory/physical evidence and never selects a private body behavior.

## Articulated-body mechanics qualification

```bash
npm run body:articulated
npm run smoke:articulated
```

The Node qualification verifies SHA-256 and byte length for every pinned model, mesh, runtime and license file; checks that no controller/game asset is present; compiles the XML with the bundled MuJoCo WASM module; and verifies 70 bodies, 133 generalized coordinates, 42 actuators, six ordered leg-contact sensors, one free root, one neutral keyframe, 0.1 ms physics and 9,810 mm/s² gravity. It also audits all 72 action channels: two coordinate-mapped without a normalized activity gain, eight disabled structural hypotheses and two unresolved.

The deterministic mechanics probes record:

| Probe | Result |
|---|---|
| passive neutral settling | eight compiled contacts; all six leg sensors active; `2.08799 × 10⁻⁷ mm` drift over the final 100 ms |
| explicit root perturbation | measurable 10 ms displacement; `1.5303 × 10⁻⁷ mm/s` residual linear speed after 500 ms |
| explicit LF femur–tibia target | `+0.1 rad` target changes coordinate `1.371767522 → 1.413749087 rad` in 50 ms |
| all-leg coordinate sign | `+0.05 rad` coordinate decreases the geometry-derived anatomical angle by `0.05 rad` on all six legs: positive is flexion |
| resolved front fast-flexor torque | one spike supplies `2.9349294 µN·mm`; anatomical angle `1.746609594 → 1.649035309 rad` relative to zero-spike control while all position-actuator forces remain exactly zero |
| CNS-safe afferent boundary | 92 values; six local contact channels; physical spike flexion increases hook/club; no world position, normals/tangents, room geometry or object identity |
| normalized room compile | centred spawn plus z-yaw quaternion; four boundaries and normalized wall/shelter boxes preserve the 70-body/42-actuator/6-sensor contract; six probe colliders compile 330 explicit pairs against the pinned 55 contact-body geoms |
| room pair parameters | every compiled room pair matches FlyGym v2.1.0/browser-game friction `1 1 0.02 0.0001 0.0001`, `solref 0.0002 1`, `solimp 0.98 0.99 0.00001 0.5 3`, margin `0.001 mm` |
| explicit obstacle contact | `1.6 mm` root translation creates two wall–front-tarsus contacts; LF/RF local sensor counts each rise by one; `0.004407973758 mm` reaction over 20 ms |
| state round trip | exact `qpos`, `qvel`, `ctrl`, servo mode, applied torques and time; cross-room and unkeyed room restore rejected |
| adhesion boundary | exactly zero compiled adhesion actuators; no passive sticky feet or imported gait-phase command |

The browser form starts the ordinary module world Worker, initializes the default room, requests the explicit qualification-only body profile, loads every asset from the local origin and requires the same 70/42/6 contract plus its seven room colliders. The default world is not switched.

A green result qualifies asset integrity, compilation, state extraction, coordinate sign, direct generalized-force semantics, deterministic room mapping/explicit collision pairs, physics-profile state isolation, a privilege-stripped afferent vector and basic mechanics. The spike torque is explicitly the existing restrained-probe observation, not an internal moment arm or free-walking muscle model. Raw contact force is retained but its strain transfer remains disabled. Room collider height, boundary thickness, source-matched pair values and rigid/static behavior are engineering parameters because room JSON supplies only 2-D footprints. Adhesion is disabled because upstream attachment is actively gait-phase controlled and no supported neural bridge exists. It does **not** validate biological locomotion, position-actuator gains, adhesion/material mechanics, muscle/tendon routing or live neural control. Frozen output: `benchmarks/articulated-body-qualification-3.8.0.json`.

## Restrained musculoskeletal-body qualification

```bash
npm run body:musculoskeletal
npm run body:musculoskeletal:zero-safe
npm run bridge:flymimic-banc
npm run body:reconcile
npm run smoke:musculoskeletal
```

The Node gate verifies 74 tracked FlyMimic files and 14,022,871 bytes against pinned SHA-256 provenance, compiles the source model with bundled MuJoCo WASM, and freezes 73 bodies, 14 hinge coordinates, seven right-front equality locks, 15 one-state Hill actuators, 15 spatial tendons, 71 meshes, zero sensors, an anchored root and a 0.1 ms timestep. It rejects controller, policy, mocap, trajectory and reward assets.

The mechanics probe uses identical serialized starts and compares isolated `0.1` flexor/extensor excitation with a passive 10 ms continuation. `LFTibia_flex_93434` changes pitch by `+0.009386035493 rad` and generalized force by `+0.093617556367 µN·mm`; `LFTibia_extensor_93932` changes them by `−0.060441671826 rad` and `−0.358538798514 µN·mm`. Opposite sparse moment arms and force changes are frozen as compiled-mechanics evidence. A separate 300 ms minimum-excitation run stays finite, state round-trips exactly, and cross-profile restore is rejected.

This gate must also preserve a red result: requested all-zero excitation clamps to 15 values of `0.0001`, and eight muscles have nonzero passive force at the keyframe. `zeroNeuralEvidenceRule` and `automaticBancIntegration` therefore remain `false`. A green command means the negative result was reproduced and the unsafe bridge stayed disabled; it does not mean zero-safe neural control passed.

The separate zero-safe gate derives exactly 15 `[0, 1]` muscle ranges in memory and leaves the source XML byte-identical. It requires exact source/derived keyframe mechanics, exact zero control and activation from a zero state, preserved passive force, distinct physics-profile state and retained antagonist causality. It also freezes the honest post-activity result: after 500 ms at zero control, prior activation is a positive subnormal rather than finite-time mathematical zero. Frozen output: `benchmarks/musculoskeletal-zero-safe-qualification-3.8.0.json`.

The identity bridge checks exact bundled BANC fields and whole-runtime population membership for LF fast flexor and FETi, preserves SETi as a distinct slow unit, retains predicted-GABA/LR-conflict metadata and requires null excitation gain/timing plus disabled control. The reconciliation compiles both bodies, compares 64 normalized semantic labels and LF segment masses/inertias/frames, and blocks merging across the `2.435074809384×` mass, root, coordinate, actuator and contact/sensor discrepancies. Frozen outputs: `benchmarks/flymimic-banc-front-tibia-bridge-3.8.0.json` and `benchmarks/body-reconciliation-3.8.0.json`.

The browser gate starts the standard module world Worker and compiles the zero-safe profile from static same-origin URLs. It requires the 73/15/15 contract, zero-sensor anchored boundary, exact zero controls/activation, passive-force observation, derived-profile hash, preserved source failure and disabled neural bridge. It never selects this model as the live plant. The original source result remains in `benchmarks/musculoskeletal-body-qualification-3.8.0.json`.

## Actual-BANC locomotor honesty audit

```bash
npm run audit:locomotion
```

This aggregate release gate loads the real bundled Balanced graph, checks `locomotor-honesty-v1.json`, runs one declared fitting seed plus four held-out deterministic initial-condition seeds for 10 biological seconds, and adds a 30-second long-horizon run. Seeds are reproducible initial-condition replicates, not independent flies. It separates:

- causal/integrity gates, which must pass for aggregate validation;
- published active-bout speed and active joint-cycle envelopes;
- unresolved scientific qualification failures, which remain report data;
- the old 45 mm path, four-cell coverage and 30° turning cutoffs, which are retained only as reproducible visual heuristics because no cited experiment establishes them.

The causal gate requires zero-output and coordination-only immobility, tonic-readiness immobility without coordination, no steering from tonic leg asymmetry, traction-gated explicit steering, no plant-private contact behavior, exact save/restore continuation and contact-honest ingestion. The strict command is deliberately separate:

```bash
npm run competence:locomotion
```

It currently exits nonzero. That is the correct release result, not a broken test.

The resource coordinates are used only by the observer-side validator to score distance/contact. The CNS receives the ordinary sensory packet and no target coordinate, ideal action or food bearing.

| Seed | Role | Path | Active speed | Mean gait | 10 mm cells | Absolute turn | Mean leg drive |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | fit | 45.0549 mm | 12.2402 mm/s | 16.8927 Hz | 6 | 11.8304° | 0.827916 |
| 2 | held-out | 43.7396 mm | 11.8812 mm/s | 16.8463 Hz | 5 | 10.2374° | 0.812239 |
| 3 | held-out | 50.3658 mm | 12.3516 mm/s | 16.9123 Hz | 6 | 11.5326° | 0.825749 |
| 5 | held-out | 47.8359 mm | 11.9542 mm/s | 16.8684 Hz | 6 | 9.8073° | 0.815015 |
| 8 | held-out | 42.2228 mm | 12.1289 mm/s | 16.8561 Hz | 6 | 9.6121° | 0.819830 |

All contact-free realized active speeds lie inside the cited 7.2–44.7 mm/s bout envelope, and gait frequencies remain inside 10–20 Hz. However, exact DNa01/DNa02/DNg13 populations produce zero spikes in all five runs; small subthreshold asymmetries still yield only 9.61–11.83° absolute rotation. In the 30-second run the body remains in contact for 26.5 seconds, recruits zero represented reverse frames, and continues requesting 18.85 mm/s on average while realizing only 1.83 mm/s. Spontaneous steering, obstacle recovery and phasic bout/stop recruitment are therefore not qualified.

The report now audits phasic candidates independently of the broad coordination proxy. P9, BPN, oDN1, walking-DNg and exact halt populations have zero pinned BANC members under the conservative labels. The two DNp09s, four MDNs and two DNp42s are present but spike in zero frames; their peak normalized subthreshold activations remain only `0.0188–0.0329` across the five runs. Meanwhile, the heterogeneous broad descending pool reaches `2.27–2.42 Hz` and continues to drive the transitional coordination channel. This is direct evidence that the current gait start/continuation signal is a proxy, not represented phasic recruitment. The diagnostic does not turn any candidate into a start/stop command.

The geometry-only resource assay produced 81 food-contact frames and 81 contact-confirmed feeding frames, with zero false ingestion. Resource coordinates are used only by the validator for scoring; the CNS receives the normal sensory packet. Full deterministic output is frozen in `benchmarks/locomotor-honesty-3.8.0.json`. The historical 3.7 competence artifact is retained as evidence of the behavior that motivated this correction, not as a current qualification claim.

## Actual BANC closed-loop dynamics

```bash
npm run banc:dynamics -- --tier=core --seconds=5 --seeds=1,2,3
npm run banc:dynamics -- --tier=balanced --seconds=5 --seeds=1,2,3
```

The dynamics command remains a numerical stability/reporting diagnostic. It does not qualify turning or navigation. Use the locomotor honesty audit above for current causal boundaries and these commands for graph-tier stability.

Version 3.7's fitting diagnostic on Balanced seed 1 over 10 seconds recorded a 124.1700 mm empty-room path, 0.996573 straightness, 4.7969° signed rotation, mean population rate 0.251814 Hz and zero saturation. The matching default-room run recorded 118.0787 mm and extensive contact-induced turning. These are stability/context measurements, not independent biological validation.

Historical 3.6 values of 0.0917 mm Core and 0.1396 mm Balanced over five seconds are retained in the prior release report. They document the zero-spiking motor-pool failure that 3.7 corrects rather than being overwritten.

Historical 3.3 artifacts retained for comparison:

- `fly-umwelt-banc-core-dynamics-3.3.0.json`
- `fly-umwelt-banc-balanced-dynamics-3.3.0.json`

## Whole-engine performance

The Balanced graph benchmark uses 155,855 neurons and 3,730,893 pairs. Median results on the development machine:

| Neural step | JavaScript | WebAssembly | Spike parity |
|---:|---:|---:|---|
| 4 ms | 3.349× | 4.389× | identical |
| 2 ms | 2.008× | 2.673× | identical |
| 1 ms | 0.883× | 2.112× | identical |
| 0.5 ms | 0.650× | 1.271× | identical |

The Maximal graph (13,366,470 pairs) completed a 2 ms WebAssembly probe at about 1.60× biological real time. Performance is hardware-specific.

## Production build

```bash
npm run build
SERVE_DIST=1 npm run dev
```

The build contains only static files. A release check should fetch:

- `/`;
- `/data/banc/manifest.json`;
- one Core and one Maximal shard;
- `/wasm/lif-kernel.wasm`;
- a deliberately missing data URL, which must return 404 rather than HTML.

## Browser automation qualification

The container’s default Chromium policy blocks every URL, including localhost. For release validation the managed policy directory was temporarily isolated, the browser checks ran, and the original policy was restored immediately afterward.

Strict fixture smoke passed above the 15 FPS release floor and exercised all six observer views, camera controls, JS/WASM live switching, sampled neural field, bounded ethogram, transformed room editing, scientific conditions, Umwelt and persistence.

The final 3.8 browser results are recorded in `BUILD_REPORT.md`, including same-origin articulated and restrained-musculoskeletal compilation in the module world Worker. A deployed-origin check remains intentionally deferred.

A deployed origin should repeat these checks because browser, GPU and hosting behavior remain environment-dependent.

## Interpretation

A passing result means the code satisfies the stated engineering invariant. It does not mean:

- the graph is free of reconstruction errors;
- the LIF model is correct for every neuron;
- the live planar body, staged articulated mechanics or restrained musculoskeletal mechanics is a validated whole fly body;
- autonomous behavior is biologically accurate;
- consciousness or welfare is present or absent.
