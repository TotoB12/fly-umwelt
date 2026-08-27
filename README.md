# Fly Umwelt 3.8

Fly Umwelt is a fully static, browser-local observatory for an embodied *Drosophila melanogaster* nervous-system model. Its long-term target is the most biologically constrained whole-fly emulation that current public data and consumer browsers can support—not a scripted game agent, and not a claim that software is alive or conscious.

Version 3.8 removes an artificial source of behavioral competence from the transitional body. Tonic left/right leg-pool imbalance no longer creates yaw, contact no longer starts private reverse/turn timers or chooses an escape side, and tonic slow-unit readiness cannot start the gait clock by itself. Steering and reversal must return from represented DNa01/DNa02/DNg13 and MDN-related neural outputs. When the present homogeneous BANC dynamics fail to recruit those outputs, the fly can remain pinned at an obstacle; that negative result is reported rather than repaired with a hidden reflex.

Unobstructed walking and contact-honest feeding remain functional. The five Balanced-BANC release runs produce 11.88–12.35 mm/s realized, contact-free active-bout speed and 16.85–16.91 Hz mean joint-cycle frequency, inside the cited experimental envelopes. This is an engineering and causal result, not a claim of spontaneous locomotor competence.

The next embodiment foundation is now bundled as a staged research profile: the official controller-free NeuroMechFly v2 browser body and MuJoCo 3.9 WebAssembly runtime compile entirely from same-origin static assets. The pinned body has 70 bodies, 42 leg position actuators, 39 meshes and six ground-contact sensors. It is not yet the default locomotor plant: no neural-activity-to-joint amplitude is justified, and no FlyGym gait/controller code is included. See `docs/ARTICULATED_BODY_3_8.md`.

A second, separate qualification body pins the Özdil et al. / FlyMimic left-front-leg musculoskeletal model: 15 anatomy-derived Hill muscle–tendon units, 15 spatial tendons and 71 meshes. Identical-state probes confirm causal flexor/extensor antagonism. The byte-identical source profile preserves its failed `0.0001` zero clamp; a separate in-memory profile now removes exactly those 15 floors while preserving passive mechanics and exact profile isolation. Two LF fast motor-neuron/actuator correspondences are validated as identity-only, with predicted-GABA conflicts retained and gain/timing null. A compiled body comparison proves that the anchored 2.494271478 mg muscle model is not mechanically mergeable with the free-root 1.02431 mg contact body. Automatic integration remains disabled. See `docs/MUSCULOSKELETAL_BODY_3_8.md` and `docs/MUSCULOSKELETAL_INTEGRATION_3_8.md`.

```text
room physics
  → retina / odor / taste / touch / leg state / physiology
  → identified or explicitly proxied sensory populations
  → BANC whole-CNS graph
  → 391 explicit leg motor neurons → 72 action + 30 femur–tibia unit channels + exact frame spike counts
  → normalized body actuation + separately qualified absolute probe-equivalent flexor force/torque
  → claw / hook / club proprioceptive transduction
  → traction, rotation, contact and ingestion
  → changed sensory input

camera · captions · neural field · ethogram · editor = observer only
```

The neural worker never receives room coordinates, object arrays, target positions, ideal actions, camera state or observer history. Broad descending activity can coordinate gait timing, but **cannot create translation**. The body moves only when mapped leg-effector populations are active.

## What 3.8 changes

- removes raw tonic leg-pool asymmetry as a steering command; yaw now depends only on explicit bilateral DNa02, DNa01 and DNg13 evidence and physical traction;
- removes plant-private collision reversal, turn timers and deterministic alternating escape sides; contact only unloads the struck leg and returns through sensory feedback;
- requires separate CNS coordination evidence before tonic leg readiness can start the shared transitional gait clock;
- corrects the locomotor audit to measure realized displacement rather than requested plant speed and excludes physical-contact frames from straight uninterrupted bout-speed comparisons;
- records three preserved scientific failures: zero steering-DN spikes, no represented reversal during 26.5 seconds of obstacle contact, and continued locomotor command while realized motion is contact-limited;
- now reports exact phasic recruitment instead of inferring it from the broad descending pool: P9, BPN, oDN1, walking-DNg and halt populations are absent under the pinned BANC labels, while the two DNp09s, four MDNs and two DNp42s remain spike-silent in every release run; the broad descending proxy nevertheless reaches 2.27–2.42 Hz;
- separates published biological envelopes, causal/integrity gates and old visual heuristics. The former 45 mm path, four-cell coverage and 30° turning thresholds remain observations only;
- preserves exact immobility for zero output, coordination-only output and tonic leg readiness without coordination;
- keeps contact-confirmed ingestion: the geometry-only assay records 81 food-contact and 81 feeding frames with zero false ingestion;
- corrects `oDN1` and walking-DNg parsing so unrelated DN1 types and 840 generic DNg cells are not admitted as locomotor populations;
- keeps all 3.6/3.7 front-leg protocol, force/probe and preserved-negative-result work unchanged.
- vendors hash-pinned FlyGym 2.1 / NeuroMechFly v2 morphology, MuJoCo 3.9 browser WASM and both Apache-2.0 license texts without any upstream gait or game controller;
- adds a controller-free articulated wrapper with exact generalized-state, servo-mode and applied-torque serialization, six-leg contact extraction, 42-joint proprioception, geometry-derived femur–tibia angles and an explicit world-Worker qualification hook;
- classifies all 72 motor channels: only femur–tibia flex/extend are coordinate-mapped, eight actions remain disabled structural hypotheses, and long-tendon/unknown movement remain unresolved;
- corrects the compiled femur–tibia sign from direct geometry (`+` coordinate/torque is flexion), disables all position servos for a torque-only probe, and routes one already-qualified resolved front fast-flexor twitch as `2.9349294 µN·mm` with exactly zero servo force;
- adds a 92-value CNS-safe articulated afferent vector with physical angle/velocity, local contact and claw/hook/club closure, while stripping world geometry and leaving unsupported contact-force→strain gain disabled;
- freezes compiled-body, passive-settling, root-perturbation, coordinate-sign, explicit-position-target and restrained-probe-equivalent torque results in `articulated-body-qualification-3.8.0.json` without calling them locomotor validation.
- vendors the pinned, policy/mocap/reward-free FlyMimic front-leg muscle model and freezes its 73-body/15-Hill-muscle/15-tendon anchored contract;
- proves opposite LF tibia flexor/extensor moment arms and intervention effects from one serialized start while preserving the failed zero-excitation rule and disabled BANC bridge.
- adds a distinct zero-safe FlyMimic profile through exactly 15 deterministic in-memory XML edits; zero-initial activation remains exact zero while passive elastic force is preserved, and cross-profile restore is rejected;
- validates exact BANC roots `720575941481179066`/`720575941639281525` as identity-only fast flexor/FETi correspondences, excludes SETi, keeps excitation gain/timing null and forbids external probe force as tendon-force calibration;
- freezes a read-only 70-body/73-body reconciliation that exposes the 2.435× mass, root, segmentation, frame, actuator and contact/sensor mismatches and blocks a silent merge.

The broader foundation still:

- bundles an audited BANC v888 whole-CNS data product inside the static site;
- retains **155,855** proofread/roughly-proofread neuronal objects after explicit glia, trachea, debris and `NOT_A_NEURON` exclusions;
- bundles Core, Balanced and Maximal graph tiers with **1,912,731**, **3,730,893** and **13,366,470** directed pairs;
- stores each edge as its fraction of the postsynaptic neuron's total detected input, rather than raw contact count;
- uses conservative fast transmitter channels: acetylcholine positive; GABA, glutamate and histamine negative; modulatory, conflicting and unknown calls zero instantaneous fast gain;
- preserves 391 explicit leg motor neurons, 68 cell types, 17 peripheral targets and 12 action labels across all six legs;
- maps every leg/action combination to a stable 72-channel actuator packet;
- adds a stable 30-channel motor-unit supplement for slow, unresolved and fast flexor evidence plus SETi/FETi extensor evidence;
- preserves discrete identified motor-unit spike counts through the brain/decoder/protocol/plant boundary without replaying a held frame;
- converts resolved slow/fast flexor spikes to absolute probe-equivalent force and torque using published force constraints and the measured external lever arm;
- includes a separate 0.1 ms restrained-probe load with measured spring, mass and drag plus a labeled model-derived tibia inertia;
- drives FeCO only from the resulting physical angle/velocity and supplies a provisional, direction-neutral GCaMP6f observation at 8.01 Hz;
- runs a versioned experiment suite: 17 pass, 2 preserved DSI failures, 1 expected high-frequency limitation and 1 context record;
- implements slow → intermediate → fast recruitment, a strict fast/intermediate gate, finite activation/release, measured relative force scale and disclosed engineering fatigue for the transitional body actuator;
- drives one bounded femur–tibia antagonist joint per leg over the measured 18–180° preparation range;
- maps FeCO claw position, hook direction and club movement/impact envelopes into exact annotation-derived populations without fabricating signed root identities;
- keeps DNa02, DNa01 and DNg13 bilateral steering evidence separate;
- replaces stochastic saccades and the constant forward floor with a deterministic six-leg planar plant;
- returns 92 body-derived proprioceptive values, while accepting articulated 62-value and legacy 50-value packets;
- fixes the `haltere → halt` substring error structurally;
- preserves all six smoothed leg outputs across save/restore and compute switching;
- keeps WebAssembly and deterministic JavaScript neural kernels with selectable 4, 2, 1 and 0.5 ms timesteps;
- parses decompressed graph shards incrementally, records tier load budgets and uses Core when browser memory is unknown;
- keeps every runtime asset same-origin and suitable for a future Cloudflare Pages deployment.

WebGPU capability may be displayed for future work, but 3.8 does **not** claim a WebGPU neural backend. WebAssembly integrates whole-population neuron state; sparse spike propagation remains deterministic JavaScript in the brain Worker.

## Start locally

Node 20 or newer is required. There are no runtime package dependencies and no visitor-side Python step.

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

The default page loads bundled BANC with Auto graph-tier and compute selection. Useful query parameters are:

```text
?dataset=banc                 BANC whole CNS (default)
?dataset=fafb                 FAFB brain-only comparison
?tier=core                    BANC ≥5-contact pairs
?tier=balanced                Core + 3–4-contact pairs
?tier=maximal                 every usable 1+-contact pair
?engine=wasm                  force WebAssembly
?engine=js                    force JavaScript
?resolution=economy          4 ms
?resolution=balanced         2 ms
?resolution=fine             1 ms
?resolution=research         0.5 ms
```

Auto graph selection uses Core on constrained devices and whenever `navigator.deviceMemory` is unavailable; reported higher-memory devices use Balanced. Maximal is never selected automatically because its 1–2-contact pairs combine plausible weak biology with greater detector uncertainty and memory cost.

## Scientific conditions

### Natural

The whole loaded graph runs with disclosed stochastic ongoing state, weak background drive, homeostatic stabilization, modeled physiology and a body-relative associative-memory input. Sensory and memory information must enter neural populations before it can affect locomotion. Natural has the most assumptions, but no post-connectome target steering or random body saccades.

### Causal

Causal reduces spontaneous drive and disables memory input. It retains the same direct six-leg effector rule and is the preferred closed-loop condition for testing whether behavior survives a stricter boundary.

### Evoked

Evoked uses zero spontaneous baseline, conservative annotated sensory mappings and narrow outputs. It is intended for stimulation/silencing experiments and can remain completely silent and stationary.

Changing dataset, graph tier or scientific condition starts a new individual. Changing compute backend or timestep preserves neural arrays, pending delayed events, six leg-output filters, body, physiology, memory, room and random state.

## Bundled BANC tiers

| Tier | Directed pairs | Inclusion | Intended use |
|---|---:|---|---|
| Core | 1,912,731 | at least 5 contacts | constrained devices, conservative structure |
| Balanced | 3,730,893 | Core plus 3–4 contacts | default whole-CNS model |
| Maximal | 13,366,470 | every usable 1+-contact pair | explicit high-memory research runs |

Graph-only load budgets are embedded in the manifest. Final CSR storage is about 15.9 MB / 30.5 MB / 107.6 MB for Core / Balanced / Maximal; the streamed loader's graph-array peak is about 24.2 MB / 46.0 MB / 161.6 MB. Actual browser use is higher because annotations, neural state, delayed events, rendering and browser overhead are outside this budget.

The public v3 edge product contains 13,620,865 aggregate pairs. The pack skips 254,395 pairs whose source or target is not in the selected neuronal set. All 35 compressed edge shards are hashed, checked for valid endpoints and kept below Cloudflare Pages' 25 MiB per-file limit.

The build script remains in the repository for reproducibility, but visitors never run it. `public/data/banc/manifest.json` and `audit.json` record source hashes, selection rules and exact counts.

## Browser compute

The neural model uses relative membrane voltage and one decaying synaptic state per neuron:

```text
dv/dt = (-v + g) / tau_m
dg/dt = -g / tau_s
```

The passive coupled system is integrated analytically. Threshold, reset, refractory duration and synaptic delay follow the disclosed whole-brain LIF approximation. This is a testable numerical model, not evidence that all fly neurons are identical spiking LIF units.

Measured on the current development machine with the real Balanced graph:

| Timestep | JavaScript | WebAssembly |
|---:|---:|---:|
| 4 ms | 3.35× real time | 4.39× |
| 2 ms | 2.01× | 2.67× |
| 1 ms | 0.88× | 2.11× |
| 0.5 ms | 0.65× | 1.27× |

The Maximal graph completed a 2 ms WebAssembly whole-engine probe at about 1.60× biological real time on the same machine. These are hardware-specific engineering measurements, not biological validation.

## Build for Cloudflare Pages

```bash
npm run build
```

Cloudflare Pages settings:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 20+ |
| Pages Functions | None |

The simulation has no server-side compute, database, telemetry or external runtime dependency. `_headers` enables WebAssembly under CSP and sends COOP/COEP isolation headers. The app, BANC data, fixture, rooms and WASM kernel are static same-origin files. The browser graph loader rejects non-local asset URLs instead of silently retrieving missing data from another host.

## Validation

```bash
npm run docs:check
npm run validate
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
npm run behavior
npm run stress
npm run build
npm run smoke
npm run smoke:articulated
npm run smoke:musculoskeletal
npm run smoke:full
npm run banc:dynamics -- --tier=balanced --seconds=5 --seeds=1,2,3
```

`npm run validate` is the normal aggregate release gate; it includes documentation, source/static, BANC, front-leg, articulated-body, musculoskeletal, zero-safe, identity-bridge, body-reconciliation, locomotor-honesty, deterministic-test, build and two MuJoCo browser-Worker checks. The deterministic suite covers protocol compatibility, spike-frame delivery, motor-unit recruitment/gating, the loaded probe, FeCO/GCaMP observations, state continuation and causal body behavior. The BANC integrity gate decompresses and verifies all 35 shards, parses the real Core graph, checks the 391-neuron peripheral boundary, exact motor-unit and FeCO population counts, and the absence of unsupported signed claw/hook roots. The calibration, experiment and bridge gates preserve fit/held-out roles and negative results. `npm run audit:locomotion` is the reproducibility/integrity gate used by aggregate validation; `npm run competence:locomotion` is intentionally strict and currently exits nonzero because the preserved biological failures remain unresolved. `npm run smoke:full` is the separate full Balanced-BANC browser check. Fresh final qualification results are recorded in `BUILD_REPORT.md` and `docs/VALIDATION.md`.

## Scientific limits

A connectome constrains but does not determine a functioning animal. Version 3.8 still lacks neuron-specific membrane parameters, postsynaptic receptor distributions, many graded and electrical interactions, neuropeptide and hormone dynamics, glia and the specimen's initial molecular state. A provenance-pinned articulated body compiles and passes mechanics-only probes, but it is not the live neural body. The separate restrained FlyMimic source profile supplies 15 anatomy-derived LF tendon routes but still clamps zero excitation to `0.0001`; a distinct in-memory zero-safe profile removes exactly those 15 floors while preserving passive mechanics and the original negative result. Its force/velocity physiology includes estimates and optimization, and it lacks untethered contact validation. Two BANC/actuator correspondences are identity-only with null gain/timing and disabled automatic control. Reconciliation has been performed and produced a blocking result: the anchored muscle body and free-root contact body have incompatible mass, root, segmentation, frame, actuator and sensor contracts and may not be merged or used for parameter transfer. The motor bridge compensates for missing heterogeneous motor excitability; it is not an intracellular motor-neuron or muscle-excitation fit. Absolute probe force/torque remains preparation-specific and is not transferred to FlyMimic, free walking or the other five legs. The live plant still has only one dynamic joint per leg; eight additional action classes are disabled structural hypotheses and long-tendon/unknown channels remain unresolved. The 100 Hz loop carries a club movement/impact envelope, not the measured 100–2,000 Hz vibration carrier. Two FeCO direction-selectivity comparisons still fail. Exact steering DNs and MDNs do not spike in the release assays, and broad descending coordination remains a transitional proxy rather than a validated start/stop pathway.

BANC also lacks the lamina, ocelli and ocellar ganglion—about 9,390 visual cells—and has damage around both antennal nerves. Those omissions are represented as limitations, not silently called complete.

Fly Umwelt does not establish biological life, pain, welfare, consciousness or subjective experience. Behavioral competence and connectome scale do not settle those questions.

## Documentation

- `docs/README.md` — authoritative documentation index and historical/current boundary
- `docs/NEXT_DEVELOPER_HANDOFF.md` — exact current state, constraints, open dependencies and release procedure
- `BUILD_REPORT.md` — latest complete qualification and artifact facts
- `docs/ARCHITECTURE.md` — worker, graph and body architecture
- `docs/ARTICULATED_BODY_3_8.md` — pinned morphology/runtime, qualification and conservative motor bridge
- `docs/MUSCULOSKELETAL_BODY_3_8.md` — pinned restrained muscle/tendon model, causal probes and blocking zero-rule result
- `docs/PERIPHERAL_MAPPING.md` — exact BANC leg mapping and uncertainty audit
- `docs/FEMUR_TIBIA_CALIBRATION.md` — measured constraints, engineering choices and falsification gates
- `docs/FRONT_LEG_VALIDATION_3_6.md` — exact-protocol experiment results and preserved failures
- `docs/FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md` — force/torque/load/observation equations and claim boundary
- `docs/DEVELOPMENT_ROADMAP.md` — staged research and implementation program
- `docs/BANC_PACK.md` — selection, tiers and provenance
- `docs/SCIENTIFIC_MODEL.md` — equations and modeled biology
- `docs/VALIDATION.md` — release gates and measured results
- `docs/REALITY_MATRIX.md` — measured versus modeled components
- `docs/CLAIMS_AND_ETHICS.md` — claim and welfare boundaries
- `WHOLE_CNS_IMPLEMENTATION_REPORT.md` — historical 3.5 implementation record; not current status

## Primary references

- Dorkenwald et al., adult fly whole-brain connectome, *Nature* (2024): <https://doi.org/10.1038/s41586-024-07558-y>
- Shiu et al., connectome-constrained whole-brain LIF model, *Nature* (2024): <https://doi.org/10.1038/s41586-024-07763-9>
- Bates, Phelps, Kim, Yang et al., BANC brain-and-cord connectome, *Nature* (2026): <https://doi.org/10.1038/s41586-026-10735-w>
- Rayshubskiy et al., DNa01/DNa02 steering control, *eLife* (2025): <https://doi.org/10.7554/eLife.102230>
- Yang et al., fine-grained descending steering control, *Cell* (2024): <https://doi.org/10.1016/j.cell.2024.08.033>
- Braun et al., context-dependent descending population control, *Nature* (2024): <https://doi.org/10.1038/s41586-024-07523-9>
- Israel et al., ascending touch pathways and MDN-mediated reversal, *Current Biology* (2022): <https://doi.org/10.1016/j.cub.2022.01.035>
- Wang-Chen et al., NeuroMechFly v2, *Nature Methods* (2024): <https://doi.org/10.1038/s41592-024-02497-y>
- Azevedo et al., leg motor-unit size principle, *eLife* (2020): <https://doi.org/10.7554/eLife.56754>
- Mamiya et al., leg proprioceptive coding, *Neuron* (2018): <https://doi.org/10.1016/j.neuron.2018.09.009>

## License

MIT for project code. Data provenance, attribution and redistribution cautions are in `docs/DATA.md` and `THIRD_PARTY_NOTICES.md`.
