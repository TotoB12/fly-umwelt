# Architecture

## Design objective

The architecture is organized around one rule: the observer may inspect the animal, but only body-relative sensory and internal signals may change it.

```text
main thread: UI, renderer, editor, observer history
                         │
                         │ control and snapshots
                         ▼
world Worker: room physics, physiology, memory, six-leg body
                         │ strict sensory packet
                         ▼
brain Worker: graph loading, sensory transduction, LIF state, output decoder
                         │ sanitized neural-effector packet
                         └──────────────────────────────► world Worker
```

No server participates after static asset delivery.

## Main thread

`src/app.js` coordinates:

- dataset and graph-tier selection;
- compute backend and timestep selection;
- scientific condition;
- Worker lifecycle and state-preserving reconfiguration;
- save/restore;
- room editing;
- observer tabs and accessible textual equivalents.

`src/ui/renderer.js` draws the room, body, Umwelt and neural summaries. The six visible legs come from `PlanarHexapodPlant` state; they are not an independent cosmetic animation.

The CNS-output inspector shows broad leg evidence, femur–tibia flexor/extensor action bars, modeled slow/intermediate/fast flexor activation and joint angle in degrees for every leg. This is observer-only display of existing Worker snapshots and never feeds back into either Worker.

`src/ui/ethogram.js` is bounded observer-side history. It never enters either simulation Worker.

## World Worker

`src/core/world-model.js` owns:

- room geometry and moving threats;
- retinal ray casting, chemical fields, taste and touch;
- physiology and associative memory;
- the six-leg body plant;
- contact, resource consumption and body motion;
- world serialization.

The body runs at 100 Hz. Sensory and motor packets are exchanged at 20 Hz. Snapshots are sent at up to 25 Hz.

### Six-leg plant

`src/core/hexapod-plant.js` tracks LF, LM, LH, RF, RM and RH separately. Each leg contains:

- phase and phase velocity;
- neural drive and smoothed amplitude;
- stance/swing state;
- load, lift and retraction;
- femur–tibia angle and velocity;
- source-resolved or action-fallback motor-unit commands, activation and fatigue;
- independent flexor/extensor force and active/passive joint summaries;
- one-shot identified motor-unit frame counts plus resolved absolute probe-equivalent flexor force/torque;
- stateful FeCO claw, hook and club outputs;
- contact;
- body-local foot position.

A shared transitional gait clock provides a tripod-compatible phase relation. Separate descending coordination evidence is required to start it; tonic leg readiness alone cannot. Coordination contributes **no force**. Stance traction is computed only from the six mapped leg drives. Yaw comes only from bilateral DNa02/DNa01/DNg13 evidence and is gated by stance traction; raw tonic left/right leg-pool imbalance cannot steer. Contact unloads a local leg and returns through sensory feedback but never starts a reverse/turn timer or chooses an escape side.

`src/core/muscle-unit-model.js` applies recruitment, the fast/intermediate gate and the normalized transitional body transfer. `src/core/front-leg-biophysics.js` separately converts discrete resolved spikes to probe-equivalent force/torque, integrates the measured restrained-probe load and drives FeCO plus provisional GCaMP observation from physical angle/velocity. `src/core/feco-transduction.js` applies tonic position, phasic direction and bidirectional dynamic transduction in both paths. Internal tendon mechanics, absolute extensor force, fatigue, free load and unmeasured filter terms remain disclosed unknowns or engineering choices. The plant still has no anatomical muscle geometry, other articulated joints, substrate adhesion or 3-D mass distribution.

## Brain Worker

`src/core/connectome-data.js` loads and validates compressed metadata and graph shards, then builds:

- sensory populations;
- six leg-motor populations;
- a v2 peripheral atlas with leg, action, muscle-target, femur–tibia motor-unit, FeCO subtype, modality and uncertainty codes;
- bilateral DNa01, DNa02 and DNg13 populations;
- feeding, reverse, startle and halt outputs;
- observer display groups;
- provenance describing every fallback.

`src/core/brain-engine.js` owns persistent neuron arrays, delayed-event buffers, sensory input, spontaneous-state assumptions, perturbations, output statistics and serialization.

`src/core/motor-decoder.js` converts population activity into a bounded neural-effector packet. It does not receive room objects or target vectors.

## Strict protocol

The world-to-brain packet permits only:

```text
retinaBrightness · retinaMotion · retinaLoom · retinaProximity
odorLeft · odorRight
touch · taste · airflow · temperature
proprioception · metabolic · memoryCue · ambientNoise · dtMs
```

The 92-value proprioceptive vector contains body speed/yaw plus 15 values for each leg: femur–tibia angle/velocity, phase sine/cosine/velocity, amplitude, load, stance, contact, lift, claw flexion/extension, hook flexion/extension and club dynamic envelope. The brain accepts the articulated 62-value and older 50-value formats for save/test compatibility; those formats cannot recover subtype state.

The brain-to-world packet contains:

```text
coordinationDrive · locomotorDrive
legs[LF, LM, LH, RF, RM, RH]
actuators[6 legs × 12 BANC action labels]
motorUnits[6 legs × 5 femur–tibia source classes]
DNa02 L/R · DNa01 L/R · DNg13 L/R
reverse · feed · drink · escape · halt
confidence · conflict
```

`locomotorDrive` is an observer summary of leg activation. The plant does not use it as a force command. The 72 action channels remain stable for compatibility; the 30 unit channels preserve source identities otherwise lost by action-pool averaging. `motorUnitSpikeCounts`, `motorFrameId` and `motorFrameDurationMs` preserve exact identified spikes. The plant consumes a frame once even though the world may hold a neural packet across multiple 10 ms body steps.

Natural/Causal decode leg spikes and identified-pool subthreshold state separately. The provisional subthreshold saturation scale compensates for the homogeneous LIF model's demonstrated zero-spiking motor pools; it never consumes broad descending activity or world state. The plant converts the resulting six leg amplitudes into stance traction only when coordination evidence permits the phase clock to run. Gait frequency is bounded to 10–20 Hz and target speed is `frequency × 1.68 mm/cycle × stance traction`, so zero leg evidence, coordination alone and tonic leg readiness alone remain exactly immobile. Represented `reverse` output selects direction; physical contact does not.

The neural `feed`/`drink` fields are attempts at this boundary. The body returns `feedAttempt`/`drinkAttempt` unchanged for observation, but fulfilled `feed`/`drink` require matching mouth taste/contact. Only fulfilled behavior reaches consumption, physiology and reward memory.

## Graph representation

Each graph tier is stored as cumulative components of fixed 12-byte records:

```text
uint32 presynaptic index
uint32 postsynaptic index
float32 normalized input fraction
```

The loader consumes each decompressed shard into a preallocated COO/CSR accumulator and releases that shard before fetching the next. A deterministic in-place counting sort then builds CSR arrays:

```text
rowPtr: Uint32Array[N + 1]
post:   Uint32Array[E]
weight: Float32Array[E]
```

The BANC edge value is `pair contact count / target total detected input`. Presynaptic transmitter evidence determines whether the browser parser applies a positive, negative or zero instantaneous fast channel.

## Neural kernels

Both backends implement the same neuron-state update:

- `JavaScriptLifKernel` — compatibility/reference;
- `WasmLifKernel` — C-compiled WebAssembly integration.

The passive coupled linear system is integrated exactly over each timestep. Sparse edge propagation remains JavaScript in both backends, which keeps one deterministic graph path and simplifies parity testing.

State-preserving backend/timestep switches serialize:

- membrane and synaptic arrays;
- refractory arrays;
- delayed-event buffers in biological time;
- PRNG and perturbations;
- sensory packet;
- decoder scalars, six smoothed leg outputs, 72 action filters and 30 motor-unit filters;
- body, physiology, memory and room state.

## Structural profiles

BANC graph tiers are cumulative:

```text
Core     = core component
Balanced = core + balanced component
Maximal  = core + balanced + maximal component
```

Auto chooses Core when device memory is absent or reported constraints are low, and Balanced on devices with sufficient reported memory. Maximal is explicit only. Manifest load budgets distinguish compressed bytes, uncompressed graph bytes, final CSR bytes and the graph-only streaming-loader peak; they deliberately exclude CSV strings, neural state and browser overhead.

## Static deployment

`scripts/build.mjs` copies HTML, source modules, docs, rooms, BANC shards and WASM into `dist/`. `_headers` supplies CSP and cross-origin isolation. There are no Pages Functions or external runtime scripts. The runtime graph loader accepts only a manifest’s bundled `local` entries and verifies that every resolved URL remains on the application origin.

## Next architecture boundary

The first half of the next body boundary now exists beside, but does not yet replace, the planar plant:

```text
current:
BANC motor annotations → 72 action + 30 unit channels → muscle-unit model → six femur–tibia joints
joint state → claw/hook/club transducers → exact or disclosed unsigned BANC populations
broad leg pools + transitional phase scaffold → planar traction

staged:
BANC motor packet -/-> unresolved motor gain
explicit 42-value position target → MuJoCo 3.9 WASM → NeuroMechFly 70-body mechanics
normalized room → in-memory static boundaries/wall/shelter geoms → physical contact
MuJoCo qpos/qvel/contact → serialized qualification state

target:
BANC motor neurons → mapped muscles/joints → articulated body
joint/contact/force sensors → identified BANC afferents
```

`src/core/mujoco-articulated-body.js` asynchronously loads only same-origin assets, writes the pinned XML/meshes into MuJoCo's virtual filesystem, compiles the model, resets its neutral keyframe and exposes finite serialized state. An optional normalized room produces a deterministic in-memory XML variant: centred spawn/yaw, four boundaries and static wall/shelter boxes. Every collider is explicitly paired with the same 55 fly geoms selected by FlyGym's source ground-contact model; source collision masks and ground pairs remain unchanged. User object IDs never enter XML and the public pinned source stays unchanged. Serialized state includes a canonical physics-profile identity derived only from spawn/collider/contact mechanics, so cross-room or unkeyed room restore is rejected and nonblocking objects do not contaminate physics identity. A 10 ms world frame is exactly 100 physics substeps at the model's 0.1 ms step. The wrapper exposes explicit position targets or actuator-ordered generalized torques, switchable position servos, six 16-value local contact sensors, 42 actuator-coordinate/force observations and six geometry-derived femur–tibia angles. A separate 92-value afferent vector retains local angle/velocity, contact and claw/hook/club state but strips world geometry and profile identity; physical contact force remains raw audit evidence because strain gain is unresolved. The wrapper has no neural packet decoder, gait phase or target-pose generator.

The world Worker recognizes `articulated-body-qualification` before normal world initialization. Loading is lazy so ordinary sessions neither download the 9.14 MB runtime nor silently change their body. If the world has been initialized, the qualification load receives its normalized room; room update/reset/restore invalidates the compiled profile rather than retaining stale collision geometry. The response records the compiled contract and neutral state only. `articulated-body-dispose` releases the WASM model/data objects. This hook exists to prove the static browser/Worker boundary before live integration.

`articulated-body-bridge-v1.json` is the action, room-physics and adhesion review boundary. Only femur–tibia flex/extend have a coordinate and sign; no population-to-angle gain exists. Eight plausible action-to-coordinate relationships are disabled structural hypotheses. Long-tendon pull, unknown movement, thorax–coxa pitch and coxa–trochanter/femur roll remain unbridged. Room height, boundary thickness, rigid behavior and source-matched explicit-pair parameters are likewise engineering values, not inferred measurements. The viewer model has zero adhesion actuators; the upstream game's six active tarsal adhesion commands are not copied because their on/off timing comes from the excluded CPG/preprogrammed-step controller.

### Restrained FlyMimic qualification body

`src/core/mujoco-musculoskeletal-body.js` loads a second, independent MuJoCo model from same-origin static assets. It compiles 15 anatomy-derived spatial tendons and 15 stateful Hill muscles for the anchored left-front leg, exposes sparse actuator moment arms plus muscle/tendon/joint state, accepts only an explicit 15-value engineering excitation vector and serializes exact generalized/control/activation state with a fixed physics-profile identity. It contains no BANC decoder, policy, motion target, gait phase, contact behavior or adhesion command.

The world Worker recognizes `musculoskeletal-body-qualification` without initializing `WorldModel`. Loading is lazy; ordinary sessions do not download its 71 meshes or the shared WASM runtime. The Worker explicitly requests `profile: 'zero-safe'`, verifies both the public source XML hash and deterministic derived XML hash in-browser, and returns the compiled contract, exact zero controls/activation, passive-force evidence and the preserved source-profile clamp result. `musculoskeletal-body-dispose` releases its model/data separately from the free-root articulated qualification object. Neither object can become the selected plant through these hooks.

The wrapper exposes two cryptographically distinct profiles. `source` compiles the byte-identical public XML and preserves its blocking `0.0001` minimum-control failure. `zero-safe` changes exactly 15 `ctrlrange="0.0001 1"` strings to `ctrlrange="0 1"` in memory immediately before compilation. The source SHA-256 is `04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531`; the derived SHA-256 is `47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e`. Profile identity is part of serialized physics state, so source and zero-safe states cannot cross-restore.

From the zero keyframe, the zero-safe profile keeps all controls and activation exactly zero while retaining nonzero passive elastic force as physical evidence. After prior activation, zero control decays to a positive subnormal rather than mathematical zero in finite time (`~1.91e-291` after the frozen 500 ms probe); no hidden epsilon clamp is added. A reset to the keyframe restores exact zero.

The two labeled femur–tibia actuators have opposite compiled moment arms and causal pitch/force effects. A frozen identity-only bridge now maps BANC root `720575941481179066` (`tibia_flexor_Fast`) to `LFTibia_flex_93434` and root `720575941639281525` (`tibia_extensor_FETi`) to `LFTibia_extensor_93932`. SETi remains distinct; transmitter/type conflicts remain visible. `excitationGain`, `timingTransfer` and automatic control are null/disabled. The Azevedo external probe force cannot calibrate FlyMimic internal tendon force.

A compiled read-only reconciliation compares the 1.02431 mg free-root viewer with the 2.494271478 mg anchored muscle model. Sixty-four normalized body labels are useful only for comparison; root topology, coordinates, segmentation, frames, mass/inertia, actuator semantics and contact/sensor contracts remain incompatible. The `2.435074809384×` mass ratio is evidence of mismatch, not a scale factor. The report blocks mechanical merge, parameter/contact transfer and live-plant replacement. See `MUSCULOSKELETAL_BODY_3_8.md` and `MUSCULOSKELETAL_INTEGRATION_3_8.md`.

NeuroMechFly/FlyGym morphology, FlyMimic restrained muscle assets, official browser assets and MuJoCo-WASM are now pinned and bundled. No upstream locomotion controller is integrated. The older two-scalar tibia inertia prior remains confined to the separately labeled restrained-probe path. Zero-safe actuation, two motor identities and the negative reconciliation are complete prerequisites, not live integration. The next architecture work is preparation-compatible excitation gain/timing followed by one explicitly reconstructed free-root body with coherent muscle routes, frames, centres of mass, inertias, external contact and afferent transfer. Making either qualification body the default would be premature.
