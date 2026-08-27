# Development roadmap

## End state

Fly Umwelt aims for the most biologically constrained embodied *Drosophila* simulation that can run entirely as a static browser application. “Real” means that increasingly many causal links are derived from measured fly structure and experiments, with uncertainty exposed. It does not mean claiming life, consciousness or specimen-level identity.

The deployment envelope is non-negotiable:

- static HTML, JavaScript, Web Workers, WASM and same-origin assets;
- no server simulation or mandatory account;
- deterministic, serializable experiments;
- build output ready for Cloudflare Pages, without deploying during local development;
- every large asset sharded, integrity-pinned and covered by a load budget.

## Current position: 3.8

Completed foundations:

- audited 155,855-neuron BANC whole-CNS pack with three structural tiers;
- actual persistent LIF state in JavaScript and WASM;
- strict world-to-brain epistemic boundary;
- no hidden forward command or stochastic body saccade;
- 391 explicit leg motor neurons mapped to 72 leg/action channels;
- 30 supplemental femur–tibia motor-unit channels with source-resolved classes where annotations permit;
- experimentally constrained recruitment, fast/intermediate gating, response time and relative force scale;
- one bounded 18–180° femur–tibia antagonist joint per leg, using a front-leg calibration structurally extrapolated to the other legs;
- 92-value feedback with stateful claw, hook and club transduction plus 62/50-value compatibility;
- exact FeCO source populations and explicit unsigned routing where BANC lacks signed root identity;
- a machine-checkable calibration artifact, frozen constants and preregistered constraint/held-out validator;
- exact Mamiya/Azevedo protocol evaluators with a frozen 3.5 baseline, current 3.6 report and two preserved DSI failures;
- exact identified motor-unit frame counts and a qualified restrained-probe spike → absolute force → torque → loaded-joint → FeCO/GCaMP observation path;
- a source-pinned locomotor-honesty artifact, disclosed motor-neuron excitability compensation and actual Balanced-BANC audit with preserved negative results;
- contact-honest ingestion semantics separating proboscis attempt, visible probing and successful feeding/drinking;
- deterministic save/restore and causal perturbation tests;
- streamed shard parsing and conservative memory-unknown tier selection.
- pinned FlyGym 2.1 / NeuroMechFly v2 controller-free browser assets and MuJoCo 3.9 WASM, including file hashes and licenses;
- a compiled 70-body, 42-actuator, six-contact-sensor qualification profile with passive, perturbation, actuator and exact-state probes;
- a conservative 72-channel body bridge that enables no automatic neural control and preserves disabled/unresolved mappings.
- pinned FlyMimic/FlyGym restrained front-leg musculoskeletal assets: 15 anatomy-derived Hill MTUs, 15 spatial tendons and 71 meshes, with policies/mocap/rewards excluded;
- compiled antagonist moment arms and identical-state flexor/extensor interventions, exact state isolation and a frozen negative zero-excitation result;
- a separate deterministic zero-safe muscle profile with exact source/derived mechanics comparison, exact zero from the zero keyframe, retained passive force and a disclosed post-activity subnormal residual;
- exact identity-only LF fast-flexor/FETi BANC correspondences with SETi separation, transmitter conflicts retained and excitation gain/timing disabled;
- a compiled free-root/restrained body reconciliation that records 64 semantic matches but blocks transfer across mass, frame, segmentation, root, actuator and contact/sensor incompatibilities;

The current organism is therefore a connectome-constrained observatory with a partial identified peripheral loop. It is not a whole-fly emulation yet.

## Locomotor causal-honesty outcome — 2026-08-26

Long-horizon observation of 3.7 exposed a structural defect in the transitional plant: the fly followed a persistent curve until contact, executed a stereotyped response, and repeated. This was not evidence of animal-like exploration. Version 3.8 removed its identified causes:

- tonic identified leg-pool membrane activity still supplies disclosed postural/traction readiness, but cannot start gait without separate coordination evidence;
- small persistent left/right leg-pool differences no longer produce yaw;
- obstacle contact no longer starts fixed-duration reverse or turn intervals;
- ambiguous contacts no longer choose or alternate an escape side.

The bounded correction is complete. Long-horizon regressions prove the private curve/contact/repeat loop is gone while preserving exact zero-output, coordination-only and tonic-readiness immobility, deterministic continuation, the world-to-brain boundary and contact-honest ingestion. Parser fixes also prevent unrelated DN1 types and generic DNg populations from supplying locomotor evidence.

The honest result is less behaviorally capable. All five unobstructed active-bout estimates remain inside the cited speed envelope, but exact DNa01/DNa02/DNg13 populations do not spike. In the 30-second default-room assay the fly remains in contact for 26.5 seconds without represented reversal, while the provisional plant continues requesting locomotion. Spontaneous steering, obstacle recovery and phasic bout/stop control are explicitly not qualified.

Do **not** turn this cleanup into a hand-authored natural-behavior controller. In particular, do not add cosmetic random turns, scripted bout or pause schedules, target bearings, anti-circling corrections, preferred path geometry, a hidden action FSM or another constant motion floor. Tuning the planar phase/traction scaffold until its trajectories merely look natural would optimize an acknowledged transitional approximation and delay the more important causal work.

Phase 2 is now in progress. The provenance-pinned browser body, segment geometry, joint hierarchy, model mass/inertia, passive mechanics and six local contact readouts compile in a real world Worker. Femur–tibia sign is validated from compiled geometry, a servo-disabled direct-torque probe closes the existing restrained front-leg resolved-spike observation without promoting it to free walking, and a normalized-room derivative qualifies spawn pose, chamber boundaries and wall/shelter contact through FlyGym-matched explicit pairs plus exact physics-profile state isolation. A separate restrained FlyMimic body supplies 15 anatomy-derived muscle/tendon routes and demonstrates causal LF flexor/extensor antagonism. Its byte-identical source profile retains the blocking `0.0001` floor; a distinct zero-safe profile now establishes exact zero from the zero keyframe without erasing passive force. Two BANC roots are qualified only as LF fast-flexor/FETi identities, with excitation gain/timing disabled. A compiled reconciliation records the `2.435074809384×` mass and root/frame/segmentation/actuator/contact incompatibilities and blocks direct transfer or averaging. External contacts were omitted from FlyMimic source validation, and the adhesion audit likewise preserves a negative boundary. The remaining critical path is preparation-compatible gain/timing → one mechanically coherent free-root muscle/contact body → measured untethered load/afferent/adhesion mechanics. Both qualification profiles exclude FlyGym locomotion controllers. Locomotion must still emerge or fail from represented neural, muscular and mechanical state.

Behavioral distribution fitting becomes authoritative only after that physical loop exists. Short planar-plant checks remain causal regression tests, not evidence that the organism is behaviorally natural or close to a living fly.

## Phase 1 — qualify one limb loop (experiment-specific bridge complete; biological validation open)

Goal: turn the present topologically closed loop into a quantitatively testable model.

- continue the unresolved 260-row GABA audit against source semantics and adult neuromuscular evidence;
- obtain manageable raw force/kinematic/afferent traces through normal access and derive hash-pinned train/held-out products;
- fit only explicitly declared engineering parameters on a training subset;
- evaluate the frozen model on independent stimulus trains, angular trajectories and loads;
- quantify prediction error and sensitivity instead of checking only direction and order;
- retain negative results without per-experiment retuning.

Current outcome: the exact-protocol report exists and the restrained-probe bridge closes the unit/observation category gap, but the held-out set still has two DSI failures and the bridge held-outs are implementation checks rather than independent animals. Exit still requires preparation-specific trace validation, free-load/tendon evidence and no per-assay retuning. A visually plausible bend is insufficient.

## Phase 2 — replace the transitional gait scaffold (mechanics foundation complete; live force loop open)

Goal: remove the hardcoded planar tripod/body-reflex assumptions.

- **complete:** choose/license pinned FlyGym 2.1 / NeuroMechFly v2 morphology and MuJoCo 3.9 browser runtime;
- **complete:** vendor only the controller-free runtime, model, 39 meshes and notices with frozen hashes;
- **complete:** compile 70 bodies, 127 joints, 42 active leg coordinates, free root and six contact sensors in Node and a browser world Worker;
- **complete:** qualify passive settling, explicit perturbation, explicit actuator response and exact state continuation without biological claims;
- **complete:** validate all six femur–tibia coordinate signs from compiled geometry (`+` = flexion) and add a generalized-torque interface whose state is exactly serializable;
- **complete within the restrained front-leg scope:** disable all position servos, preserve zero spike → zero torque, and show that one resolved fast-flexor twitch produces physical flexion with zero servo force;
- **complete as an engineering geometry qualification:** map normalized spawn pose, four chamber boundaries and static wall/shelter footprints into MuJoCo through 55-contact-geom explicit pairs; prove obstacle contact enters the matching local leg sensors, state cannot cross physics profiles, and neither geometry nor profile identity reaches the CNS;
- **complete in a separate restrained LF qualification:** pin 15 anatomy-derived FlyMimic Hill MTUs/spatial tendons; prove opposite femur–tibia moment arms and identical-state flexor/extensor responses; exclude policy, mocap and imitation assets;
- **preserved source-profile blocking result:** all source FlyMimic controls clamp zero to `0.0001` while passive forces remain nonzero;
- **complete prerequisite:** derive and hash-verify a separate zero-safe profile with exactly 15 in-memory edits, exact zero from the zero keyframe, passive-mechanics preservation, profile isolation and the post-activity subnormal boundary;
- **complete as identity only:** map exact LF fast-flexor/FETi BANC roots to the two matching FlyMimic actuators while excluding SETi, retaining conflicts and leaving gain/timing/control disabled;
- **complete as a blocking comparison:** reconcile both compiled bodies, record 64 comparison-only names and incompatible mass/root/frame/segmentation/actuator/contact contracts, and prohibit merging or parameter transfer;
- expose coxa, trochanter, femur, tibia, tarsus and long-tendon effectors;
- map all 12 action classes, preserving unknown channels as unknown;
- constrain excitation gain and timing for the two identity-matched LF femur–tibia routes using preparation-compatible evidence; do not equate external probe force with internal tendon force;
- build one mechanically coherent free-root morphology from explicitly reconciled frames, centres of mass and inertias; the current 2.494271478 mg/1.02431 mg comparison blocks direct transfer or averaging;
- extend anatomy-derived, load-qualified muscle/tendon routing beyond the restrained left-front leg;
- replace frozen room extrusion/source-matched contact parameters with assay-specific measured substrate and obstacle mechanics, and derive active tarsal adhesion commands from defensible neural/biomechanical evidence rather than gait phase;
- route model joint/contact/force observations into exact/disclosed afferent populations;
- require neural/muscle evidence for force; do not import a baked locomotion controller;
- keep observer rendering causally separate from physics.

Exit gate: the phase clock can be disabled without replacing it with commanded gait, and locomotion emerges or fails from the represented circuits and body.

## Phase 3 — complete peripheral sensing

Goal: make the body-to-CNS side sensor-resolved.

- extend the present hook/claw/club model from population class to root-resolved tuning where source evidence permits;
- separate signed direction and goniotopic tuning only when experiments or annotations justify it;
- map campaniform strain to forces rather than stance proxies;
- distinguish tactile bristles, gustatory bristles and nociceptors by receptive field;
- add haltere, wing, antenna and proboscis mechanics;
- represent missing/damaged peripheral anatomy explicitly rather than filling it invisibly.

Exit gate: each transducer reports its measurement, transfer function, target roots, uncertainty and validation evidence.

## Phase 4 — improve neural physiology

Goal: replace homogeneous LIF only where evidence supports a better mechanism.

- cell-class-specific spiking versus graded models;
- postsynaptic receptor-aware sign and kinetics;
- co-transmission, electrical synapses and compartment delays;
- morphology-aware integration for priority circuits;
- slow neuromodulators, peptides and endocrine state;
- measured or constrained initial-state ensembles.

Exit gate: added complexity improves pre-registered neural or behavioral predictions across multiple experiments and maintains numerical parity across supported compute backends.

## Phase 5 — move state and learning into circuits

Goal: shrink external cognitive/physiological scaffolds.

- move hunger, thirst, sleep and stress from scalar variables toward endocrine and recurrent circuits;
- implement mushroom-body and central-complex plasticity where connectome and physiology permit;
- replace the external associative map with in-network learning;
- preserve the rule that no world coordinates or object identities enter the brain.

Exit gate: disabling the external scaffold leaves circuit-derived state with documented limitations, rather than silently degrading into scripted navigation.

## Phase 6 — behavioral validation program

Goal: evaluate the animal, not merely the code.

- build versioned assay rooms for optomotor, looming, odor gradient, tactile escape, feeding, walking and sleep paradigms;
- pre-register metrics and parameter freezes;
- compare distributions across seeds/initial-state ensembles;
- report negative results and sensitivity;
- maintain engineering, neural and behavioral validation as separate dashboards.

Exit gate: one parameterized organism explains multiple held-out assays better than explicit baselines.

## Phase 7 — static release qualification

Goal: make the folder itself deployment-ready.

- run deterministic, integrity, behavior, BANC dynamics and JS/WASM parity gates;
- produce a fresh production build from a clean local dependency install;
- confirm no Pages Functions, remote runtime dependencies or HTML fallback for missing assets;
- check every asset against the host per-file limit and verify `_headers`, `_redirects` and WASM;
- measure Core/Balanced/Maximal load and memory on representative browsers;
- repeat accessibility and cross-origin-isolation smoke tests;
- update release manifest, notices, claims and benchmark provenance.

Exit gate: `dist/` is a self-contained static site and all release evidence refers to the same version and asset hashes. Deployment remains a separate user-authorized action.

## Priority rule

Choose work in this order:

1. remove a false biological claim or hidden causal shortcut;
2. close or calibrate a measured sensorimotor link;
3. add a validation assay that can falsify the model;
4. improve static reliability and reproducibility;
5. improve performance without changing experiment results;
6. add presentation only when it reveals model state or uncertainty.

This keeps the project aimed at an animal model rather than a persuasive animation.
