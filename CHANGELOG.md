# Changelog

## 3.8.0 — 2026-08-26

Locomotor causal-honesty correction and staged articulated-body foundation.

### Documentation and handoff

- Added an authoritative documentation index and current next-developer/agent handoff that distinguish the live planar plant, staged free-root mechanics and restrained FlyMimic qualification body.
- Updated architecture, reality matrix, roadmap, validation, quickstart and Cloudflare Pages documentation for the zero-safe profile, identity-only bridge and blocking reconciliation result; marked pre-3.8 redesign and whole-CNS reports explicitly historical.
- Added `npm run docs:check` to the aggregate release gate to verify local Markdown links, documented package commands, frozen current-state facts, historical banners and known stale metrics.
- Included the root current and historical Markdown records in `dist/` so the deployed documentation index has no broken parent links.

### Restrained musculoskeletal foundation

- Vendored the Özdil et al. / FlyMimic front-leg musculoskeletal model from exact FlyGym and FlyMimic commits: byte-identical XML, 71 versioned meshes, metadata, Apache-2.0 license and 74-file SHA-256 provenance.
- Excluded the source PPO policy, motion-capture clips, imitation reward, tasks/environments and preprogrammed gait/adhesion timing.
- Added a same-origin `MujocoMusculoskeletalBody` wrapper for explicit 15-muscle excitation, activation/force/tendon/joint state, sparse moment arms, fixed stepping and exact physics-profile state. It accepts no motor packet, policy, trajectory, phase or contact command.
- Froze the compiled anchored contract: 73 bodies, 14 hinge coordinates, seven RF equality locks, 15 one-state Hill muscles, 15 spatial tendons, 71 meshes, zero sensors and 0.1 ms physics.
- Added identical-state antagonist probes. Isolated `LFTibia_flex_93434` increases femur–tibia pitch/generalized force relative to passive continuation; isolated `LFTibia_extensor_93932` decreases both, consistent with their opposite compiled moment arms.
- Preserved the blocking negative result: every source control has lower bound `0.0001`, requested zero is clamped, passive force is nonzero in eight keyframe muscles, and no BANC identity/excitation bridge is enabled.
- Froze the separate-model mass discrepancy: FlyMimic compiles to `2.494271478 mg` versus `1.02431 mg` for the free-root viewer body; no silent morphology merge is made.
- Added a qualification-only browser-Worker hook and smoke test. Ordinary sessions do not load the assets or select this restrained model as the plant.
- Added a separate zero-safe physics profile that derives exactly 15 `[0, 1]` muscle ranges in memory while leaving the pinned public XML and original failed qualification unchanged. Keyframe mechanics match exactly, source/derived states cannot cross-restore, and passive elastic force remains visible.
- Froze the zero-state and post-activity numerical distinction: zero-initial activation stays exactly zero, while prior `0.5` activation decays to a positive IEEE-754 subnormal after 500 ms; no hidden epsilon clamp was added.
- Added an exact BANC identity bridge for LF fast flexor root `720575941481179066` and FETi root `720575941639281525`. SETi and unresolved/accessory flexors remain excluded; predicted-GABA/LR-conflict metadata remain visible; gain, timing and automatic control are null/disabled.
- Added a full-runtime population validator proving both roots occupy the expected one-cell fast motor-unit populations and the excluded SETi root remains in its distinct slow-extensor population.
- Added a read-only compiled body reconciliation. It records 64 comparison-only canonical matches but blocks merging because mass differs `2.435074809384×`, root/coordinate/actuator/sensor contracts differ, and front trochanter/femur segmentation, frames, masses and inertias are incompatible.
- Updated the browser-Worker muscle smoke to compile the zero-safe profile from lazy same-origin static assets while also exposing the source profile's preserved negative result and disabled neural bridge.

### Articulated-body foundation

- Vendored the official controller-free FlyGym 2.1 / NeuroMechFly v2 browser body at pinned source and browser-asset commits, plus MuJoCo 3.9.0 WebAssembly and Apache-2.0 license texts.
- Added frozen SHA-256 provenance for 39 meshes, XML/model metadata, runtime binaries and licenses. No CPG, tripod controller, preprogrammed step or game behavior is bundled.
- Added a same-origin `MujocoArticulatedBody` wrapper with neutral reset, 100-substep world stepping, explicit position targets, actuator-ordered generalized torques, body-derived contact/proprioception/anatomical knee angles, perturbation, and exact state/servo/torque serialization.
- Added an explicit qualification-only world-Worker loading hook so ordinary sessions do not pay the 9.14 MB WASM load and the planar live body is not silently replaced.
- Classified every stable motor action conservatively. Femur–tibia flex/extend are coordinate-mapped without a normalized activity gain; eight actions are disabled structural hypotheses; long-tendon and unknown movement remain unresolved.
- Corrected the femur–tibia sign from compiled geometry: positive coordinate/torque is flexion on all six legs. The earlier name-based sign assumption was reversed.
- Added a torque-only front-leg qualification that disables every position servo, preserves zero spike → zero applied torque and maps one already-qualified resolved fast-flexor twitch to `2.9349294 µN·mm` using the measured external probe lever arm. No internal tendon moment arm or other-leg transfer is claimed.
- Added a CNS-safe 92-value articulated afferent boundary. Physical knee motion and binary local contact close claw/hook/club and tactile-compatible channels without exposing world geometry; raw contact force is retained while unsupported strain gain remains disabled.
- Added deterministic normalized-room physics for the qualification body: centred spawn translation and heading, four chamber boundaries, static wall/shelter colliders and obstacle-aware six-leg subtree sensors. Food, water, light and threat remain nonblocking.
- Added a causal wall intervention: a direct root translation creates compiled left/right front-tarsus contacts, raises both matching local sensor counts and changes subsequent motion while the CNS-safe state remains free of room coordinates, normals and object identity.
- Replaced the broad room collision-mask bridge with source-matched explicit pairs against exactly the 55 FlyGym contact-body geoms. Every collider pair uses the pinned v2.1.0/browser-game friction, solver and margin values while source geom masks and the original ground pairs remain unchanged.
- Added canonical physics-profile identity to articulated snapshots/serialization. Exact same-profile restore remains stable; missing identity and cross-room restore are rejected, while nonblocking food/water/light/threat changes do not alter physical identity.
- Froze the room-only 5 mm extrusion, 1 mm boundary thickness and source-matched contact/solver values as disclosed engineering assumptions; object IDs never enter derived XML.
- Audited upstream tarsal adhesion. The viewer has zero adhesion actuators; the official game adds six but commands stance/swing attachment from baked CPG/preprogrammed phase. Fly Umwelt enables neither passive sticky feet nor imported gait-phase adhesion.
- Extended the mechanics-only qualification report across the compiled 70-body/42-position-actuator/0-adhesion-actuator/6-sensor contract, passive settling, root perturbation, coordinate signs, explicit position/torque causality, 330 probe-room pairs, profile-isolated save/restore and the disabled-adhesion boundary. This is not biological locomotion validation.

### Body/CNS boundary

- Removed continuous yaw from raw tonic left/right leg-pool imbalance. Only bilateral DNa02, DNa01 and DNg13 evidence can now steer, and yaw is gated by stance traction.
- Removed plant-private contact reverse/turn timers, deterministic ambiguous-contact alternation and all associated serialized state. Contact now unloads the local leg and returns through the normal sensory packet.
- Required separate coordination evidence before tonic leg readiness can start the transitional gait clock; slow-unit postural readiness is no longer interpreted as walking.
- Kept reversal dependent on represented neural output and preserved obstacle fixation when the current BANC dynamics fail to recruit it.
- Tightened `oDN1` and walking-DNg population parsing so unrelated DN1 types and generic DNg cells are not silently promoted to locomotor channels.

### Honest qualification

- Added source-pinned Yang, Rayshubskiy, Braun and Israel locomotor evidence and froze the resulting causal decisions in `locomotor-honesty-v1.json`.
- Corrected active speed from requested plant velocity to realized body displacement and excluded contact-limited frames from the Mendes straight/uninterrupted-bout comparison.
- Replaced the aggregate “competence” gate with a reproducibility/integrity audit. The strict scientific command remains red and reports zero exact steering-DN spikes, 26.5 seconds of unrecovered contact and continued locomotor command while pinned.
- Reclassified the former 45 mm path, four-cell coverage and 30° turning thresholds as reported-only visual heuristics rather than biological constraints.
- Added long-horizon regressions proving that contact cannot privately choose reverse/turn behavior, tonic asymmetry cannot steer and steering evidence cannot rotate an unpowered body.
- Preserved unobstructed active walking at 11.88–12.35 mm/s and 16.85–16.91 Hz, plus 81 contact-confirmed feeding frames and zero false ingestion in the corridor assay.
- Bumped plant serialization to version 6; legacy collision-controller fields are ignored on restore.

## 3.7.0 — 2026-08-25

Locomotor competence and contact-honest ingestion.

### Whole-CNS motor bridge

- Recorded Mendes, Azevedo and Wosnitza walking constraints in a machine-readable calibration artifact with source hashes and explicit claim boundaries.
- Diagnosed zero spikes in every identified BANC leg-motor pool and replaced the mismatched population-average rate transfer with a disclosed, saturating motor-subthreshold excitability bridge.
- Preserved exact zero-output and coordination-only immobility; no forward floor, target bearing, food coordinate, ideal action or anti-circling correction was added.
- Made planar speed frequency-dependent using the reported 10–20 Hz active joint range and a derived 1.68 mm representative advance per cycle, still multiplied by measured stance traction.
- Removed false yaw caused by the two-versus-one side count of alternating tripod stance; steering now uses cycle-scale bilateral stride traction.

### Feeding semantics

- Split activity-derived `feedAttempt`/`drinkAttempt` from contact-confirmed `feed`/`drink` fulfillment.
- Added a distinct free-air proboscis-probing state and retained weak attempt evidence in the observer without rendering it as continuous feeding.
- Required matching mouth taste/contact for the renderer, ethogram, interpretation, physiology, reward memory and resource depletion to report ingestion.

### Qualification

- Added three ingestion regressions and a motor-excitability causality regression, expanding the deterministic suite to 98 passing tests.
- Added an actual Balanced-BANC competence gate with one declared fitting seed and four held-out initial-condition seeds.
- Qualified 107–121 mm paths over 10 s, 11.4–12.6 mm/s active speed, 16.9–17.5 Hz gait frequency, meaningful turning/coverage, zero saturation and zero false-ingestion frames.
- Added a sensory-only geometry resource assay that reached mouth contact and produced 75 contact-confirmed feeding frames without sending resource coordinates to the CNS.
- Kept the project static, same-origin and ready for a `dist` Cloudflare Pages output with no Functions or runtime service.

## 3.6.0 — 2026-08-25

Exact-protocol front-leg validation and experiment-specific spike–force bridge.

### Experimental evaluation

- Added machine-readable Mamiya/Azevedo protocols, immutable fit/held-out roles and frozen 3.5 baseline/current 3.6 reports.
- Corrected three evidence-supported FeCO response-shape defects while retaining the diagnostics used for refinement as fit evidence.
- Preserved two current DSI failures and the 100–2,000 Hz carrier limitation instead of adding arbitrary channel mixing.

### Spike–force–observation bridge

- Preserved discrete spike counts from identified BANC femur–tibia motor-unit populations across the neural frame boundary.
- Added published slow/fast/intermediate spike-count force curves, experiment-specific torque at the measured probe lever arm and visible lever-arm uncertainty.
- Added the measured probe spring–mass–drag load, a separately labeled FlyGym-derived tibia inertia prior, 0.1 ms integration and force reconstruction.
- Drove FeCO from physical angle/velocity and added a provisional GCaMP6f filter sampled at 8.01 Hz.
- Kept unresolved flexor spikes, extensor force, tendon geometry, free-walking load and other-leg transfer explicitly unresolved.

### Qualification and observer

- Added the strict 9/9 bridge gate, deterministic provenance/physics/causality/continuation tests and main-validator coherence checks.
- Resolved all three Azevedo force observations in the experiment report; the current suite is 17 pass, 2 fail, 1 expected limitation and 1 context record.
- Exposed resolved absolute flexor force, probe-implied torque, unresolved spike counts and evidence mode in the live joint observer.

## 3.5.0 — 2026-08-25

Experimentally constrained front-leg femur–tibia motor/proprioceptor release.

### Motor-unit transfer

- Added a stable 30-channel `[leg][unit]` supplement without changing the 72 action channels.
- Preserved slow, unresolved, fast, SETi and FETi source identities where BANC annotations support them.
- Added ordered recruitment, a strict fast/intermediate gate, finite activation/release, measured relative force scaling and disclosed engineering fatigue.
- Preserved predicted BANC transmitter signs inside the CNS without interpreting predicted GABA as direct inhibitory muscle action.

### FeCO feedback

- Fixed reversed claw/hook broad subtype matching.
- Preserved exact claw/hook/club populations and signed identities only when source annotations provide them.
- Added stateful claw position, hook direction and club movement/impact-envelope transduction.
- Expanded proprioception from 62 to 92 values while preserving 62/50-value compatibility.

### Calibration and validation

- Added a public provenance-rich front-leg calibration artifact and frozen browser constants.
- Added a preregistered calibration validator and versioned benchmark output.
- Expanded deterministic coverage from 68 to 78 tests, including unit gating, response time, FeCO polarity/dynamics and state continuation.
- Extended BANC qualification with exact unit/subtype populations and explicit absence of fabricated signed roots.
- Updated the observer to show modeled slow/intermediate/fast activation and joint angle in degrees.

## 3.4.0 — 2026-08-25

Peripheral identity and first articulated-loop release.

### Annotation-resolved periphery

- Restricted the BANC leg-motor boundary to 391 explicit `leg_motor_neuron` rows.
- Preserved 68 motor cell types, 17 peripheral targets, 12 motor action labels and 72 leg/action channels.
- Added compact motor leg/action/target arrays, afferent leg/modality masks and inspectable uncertainty bits.
- Pinned validation for 167 left/right type conflicts, 26 missing transmitter calls and 188 uncertain motor rows.
- Corrected the leg-afferent inventory to 5,214 explicit and 5,302 mapped rows.

### Identified joint loop

- Added independent femur–tibia flexor/extensor decoding for every leg.
- Added bounded antagonist active acceleration, passive stiffness/damping and joint limits.
- Made joint state change physical foot placement while retaining the disclosed transitional gait scaffold.
- Expanded proprioception from 50 to 62 values with joint angle and velocity.
- Routed articulated feedback preferentially to exact joint-angle, movement-direction and strain populations while retaining legacy packet support.
- Preserved all 72 smoothed actuator values across save/restore and compute changes.

### Static reliability

- Added a portable Python launcher for Unix and Windows builder scripts.
- Changed sharded graph loading to consume and release one decompressed shard at a time, followed by deterministic in-place CSR grouping.
- Added graph-only load budgets to every BANC tier.
- Made Auto choose Core when browser device memory is unknown and avoided aggressive temporal selection without a memory hint.

### Validation and documentation

- Expanded the deterministic suite from 60 to 68 tests.
- Extended the real-BANC gate with peripheral, uncertainty, modality and load-budget checks.
- Added `docs/PERIPHERAL_MAPPING.md` and `docs/DEVELOPMENT_ROADMAP.md`.
- Documented the unresolved 260-row GABA motor-transmitter conflict and separated annotation facts from engineering joint dynamics.

## 3.3.0 — 2026-08-20

Whole-CNS, direct-effector and anti-circling release.

### Bundled BANC organism

- Rebuilt BANC from the cached public v888 metadata and v3 aggregate edge products.
- Selected 155,855 proofread/roughly-proofread neuronal objects using explicit non-neuronal exclusions and `IS_REAL_NEURON` overrides.
- Added auditable source hashes, selection counts and transmitter evidence in `public/data/banc/audit.json`.
- Bundled three cumulative graph tiers: Core 1,912,731 pairs, Balanced 3,730,893 and Maximal 13,366,470.
- Replaced raw contact-count weights with the source `count / postsynaptic total input` normalization.
- Added 35 independently hashed static edge shards, all below 25 MiB.

### Causal neural-output path

- Added six separate leg motor populations: LF, LM, LH, RF, RM and RH.
- Added bilateral DNa02, DNa01 and DNg13 output channels.
- Changed broad descending activity from a forward-force source into coordination timing only.
- Made translation require mapped leg-effector activation.
- Added output-conflict reporting and six-leg observer bars.
- Preserved all six smoothed leg outputs across save/restore and compute switching.
- Replaced loose `halt` substring matching with exact supported output-type matching, eliminating the `haltere → halt` defect.

### Conservative fast synapses

- Acetylcholine remains the positive fast channel.
- GABA, glutamate and histamine use the negative fast approximation.
- Dopamine, octopamine, serotonin, tyramine, other modulatory calls, transmitter conflicts and unknown calls have zero instantaneous fast gain until receptor-aware dynamics exist.

### Embodiment

- Replaced the stochastic saccade controller and constant forward floor with a deterministic six-leg planar plant.
- Added a moving tripod-compatible gait clock, six neural amplitudes, stance/swing, load, lift, retraction and foot positions.
- Added physical left/right traction and body yaw from leg asymmetry.
- Added local foot contact before body collision and a finite tactile escape reflex that preserves its escape side until contact clears.
- Added 50 body-derived proprioceptive values and mapped them into leg-specific position, movement, vibration, load and tactile afferent classes.
- Tied visible leg rendering directly to physical plant state.
- Moved taste sampling to a mouth point instead of the body center.

### UI and static delivery

- Made bundled BANC the default dataset; FAFB remains a brain-only comparison.
- Added Auto/Core/Balanced/Maximal graph-tier selection.
- Auto chooses Core on constrained devices and Balanced otherwise; Maximal is never automatic.
- Removed user-facing instructions to fetch or enable BANC outside the page.
- Updated the neural-output inspector for six leg pools and named steering channels.
- Kept the app fully static and same-origin for Cloudflare Pages.
- Made the browser graph loader reject remote fallbacks; source URLs remain provenance/build metadata only.

### Validation

- Expanded the deterministic suite to 60 passing tests.
- Added a full BANC pack integrity validator covering every shard, hash, endpoint and normalized weight.
- Added actual BANC closed-loop dynamics tests for zero-input silence, stability, conflict and persistent curvature.
- Added causal behavior diagnostics for zero-output immobility, symmetric walking, mirrored steering, fixture motor activation and obstacle release.
- Added real BANC Core, Balanced and Maximal whole-engine benchmark paths.

## 3.1.0 — 2026-08-19

Accuracy and browser-compute foundation. This historical release added the WebAssembly LIF kernel, exact passive integration, refractory and delayed-event corrections, state-preserving compute switching, Causal/Evoked conditions and the first optional BANC builder. Version 3.3 supersedes its optional-data and saccade-body architecture.

## 3.0.0 — 2026-08-18

Presentation and observatory redesign. This historical release introduced the six observation tabs, camera system, room editor, ethogram, neural field and persistence surfaces.
