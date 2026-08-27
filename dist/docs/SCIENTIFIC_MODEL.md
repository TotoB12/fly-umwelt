# Scientific model

## Scope

Fly Umwelt 3.8 is a connectome-constrained dynamical model in a closed browser-local environment. It is designed to make every non-measured bridge visible and replaceable.

It is not a digital twin of the living BANC specimen and does not claim unrestricted behavioral prediction.

## Neuron dynamics

The engine follows the simplified whole-brain LIF precedent using relative membrane voltage `v` and a decaying synaptic state `g`:

```text
dv/dt = (-v + g) / tau_m
dg/dt = -g / tau_s
```

Default disclosed parameters include:

| Parameter | Value |
|---|---:|
| Rest-relative reset | 0 mV |
| Threshold above rest | 7 mV |
| Membrane time constant | 20 ms |
| Synaptic time constant | 5 ms |
| Refractory period | 2.2 ms |
| Nominal synaptic delay | 1.8 ms |

The passive coupled system is integrated analytically over 4, 2, 1 or 0.5 ms. Membrane and synaptic state freeze during the modeled refractory interval, matching the published approximation. Explicit Poisson-input target populations use zero refractory time.

These global parameters do not imply that all fly neurons spike or share one physiology. Graded transmission, cell morphology, dendritic compartments and heterogeneous conductances remain major omissions.

## Connectivity

For BANC:

```text
stored edge = pair contacts / target's total detected synaptic input
fast event = stored edge × recurrent gain × transmitter channel
```

The recurrent gain is an engineering parameter. It is not a measured postsynaptic potential.

The graph has fixed delay and a single state channel per neuron. It does not yet represent synapse location, morphology-dependent propagation, receptor subtype, gap junctions or release dynamics.

## Fast transmitter policy

- acetylcholine: positive;
- GABA: negative;
- glutamate: negative approximation following the whole-brain LIF precedent;
- histamine: negative approximation for canonical chloride-channel visual transmission;
- dopamine, octopamine, serotonin, tyramine, other modulators: zero instantaneous fast gain;
- conflicting/unknown: zero instantaneous fast gain.

The sign is applied presynaptically to all represented outputs. This is a disclosed simplification; biological effects depend on postsynaptic receptors and context.

## Initial and ongoing state

The connectome does not provide the fly's living voltage state. Natural and Causal therefore add explicit boundary hypotheses:

- deterministic subsets of non-output central neurons receive sparse stochastic seed events;
- the broader central population receives weak background synaptic events;
- a homeostatic multiplier keeps mean activity bounded around a low target.

Evoked sets these sources to zero. The three conditions therefore answer different questions and should not be compared as if only one switch changed.

## Sensory transduction

The room creates body-relative measurements only.

### Vision

A 64-ray, 270° planar retina measures brightness, motion, looming and obstacle proximity. BANC is missing the lamina and ocellar system, so this is an explicit peripheral front end mapped to available visual populations. Exact ommatidial retinotopy is not known in the aggregate metadata; sector mapping is deterministic and labeled as a proxy.

### Chemicals

Food, water/humidity and aversive odor channels are sampled at two antenna positions. Taste is sampled near the mouth. Receptor-specific annotations are used when available; deterministic partitions are allowed only in modes that disclose proxy chemical mapping.

### Touch and proprioception

Touch is leg-specific. The body sends 92 proprioceptive values:

```text
forward speed, yaw velocity,
then for LF/LM/LH/RF/RM/RH:
femur–tibia angle, femur–tibia angular velocity,
phase sin, phase cos, phase velocity, amplitude,
load, stance, contact, lift,
claw flexion, claw extension,
hook flexion, hook extension, club dynamic envelope
```

BANC annotations are separated into leg-specific tactile, joint-angle, movement-direction, vibration, strain, nociceptive and gustatory populations. FeCO annotations are additionally retained as claw, hook or club. Claw is a stateful tonic position code around the 90° boundary; hook is a signed phasic direction code; club is a bidirectional movement/impact envelope whose speed response is maximal around the reported 400°/s population peak.

The pinned BANC metadata contains no justified flexion/extension split for its generic claw and hook roots. The engine therefore routes the maximum of the two modeled polarities into the exact unsigned population and labels that fallback in the stimulation ledger. Signed populations are used only when a source annotation actually supplies them. The 100 Hz body loop cannot reproduce the measured 100–2,000 Hz club carrier, so it never claims a vibration waveform or tonotopic frequency map.

### Internal state

Hunger, thirst, fatigue, sleep pressure and stress remain physiology variables. They enter annotated or proxy endocrine/interoceptive populations. They do not directly choose a target or action.

### Memory

Natural can provide a drifting body-relative left/forward/right cue to disclosed central-complex/memory populations. The cue contains no world coordinate or object identity. Causal and Evoked disable it.

## Neural output

The decoder measures spiking and, when enabled, bounded subthreshold state from:

- six leg motor pools;
- DNa02 left/right;
- DNa01 left/right;
- DNg13 left/right;
- MDN/reverse-associated populations;
- feeding, drinking, startle and exact halt populations;
- broad descending populations for coordination only.

In parallel, the decoder preserves 12 BANC action labels for every leg as a stable 72-value array. A stable 30-value supplement retains five femur–tibia unit classes per leg: slow flexor, unresolved flexor ensemble, fast flexor, SETi extensor and FETi extensor. It also preserves exact per-frame spike counts for these identified populations. The pinned annotations identify only one explicit slow flexor row, five fast flexor rows and six each of SETi/FETi; 95 flexor rows remain unresolved. Missing classes stay empty rather than being synthesized.

DNa02 is modeled as the faster/higher-gain steering component and DNa01 as slower/sustained, based on electrophysiological evidence. Their exact transfer gains into the planar body are engineering values.

### Motor-neuron excitability bridge

Actual Balanced-BANC diagnostics found zero spikes in all six identified leg-motor pools over 30 seconds, despite persistent subthreshold activation, descending coordination and a rising global homeostatic multiplier. Azevedo et al. report that the adult slow flexor fires at approximately 30 Hz at rest while fast and intermediate units are silent, demonstrating that the homogeneous 7 mV whole-CNS LIF boundary is not a faithful motor-neuron physiology model.

The same release audit separates exact phasic candidates from the broad coordination pool. Conservatively labeled P9, BPN, oDN1, walking-DNg and halt populations are absent in the pinned table. Present DNp09, MDN and DNp42 populations spike in zero frames. Broad descending spikes still occur and feed the transitional coordination proxy. No absent label is synthesized, and no small tonic activation is promoted into a start/stop event.

Natural and Causal therefore preserve two distinct motor evidence terms:

```text
spike evidence = 1 − exp(−(identified population rate × output gain) / 4.2 Hz)
analog evidence = 1 − exp(−(identified normalized membrane activation × configured analog gain × output gain) / 0.16)
leg evidence = 1 − (1 − spike evidence)(1 − analog evidence)
```

The `0.16` saturation scale is an engineering parameter fit on declared seed 1 and frozen before evaluating seeds 2, 3, 5 and 8. It compensates for missing motor-neuron-specific excitability; it is not a measured membrane transfer. The input is still the identified motor population only. Exactly zero motor state produces exactly zero drive, and broad descending activity cannot enter this equation.

## Femur–tibia motor transfer

The adult front-leg preparation constrains:

- slow → intermediate → fast flexor recruitment;
- fast activity only with intermediate activity;
- relative force-per-spike scale below 0.1 / approximately 1 / approximately 10 µN;
- approximately 8.5 ms half-force response for intermediate and fast units;
- much slower slow-unit buildup and release.

Source-resolved unit activity is used when present. The generic annotated flexor ensemble is decomposed into slow and intermediate recruitment; the stable action channel provides a compatibility fallback when no unit evidence is active. A 30 ms intermediate gate prevents isolated fast evidence from producing normalized body force. Unit activation rises and falls with finite time constants. Normalized thresholds, extensor gains, fatigue and transitional joint mechanics are engineering parameters. Zero neural evidence produces exactly zero active force. Passive joint restoration is separate and may be nonzero when displaced.

In the separate restrained-preparation observation path, discrete resolved spikes produce absolute probe-equivalent flexor force. Slow force is linear at `0.013 µN` per additional spike; fast/intermediate force uses `F(n)=F₁(1−0.6ⁿ)/(1−0.6)` with publisher-figure-derived one-spike medians. Force becomes torque at the measured external `417 ± 7 µm` probe lever arm. That is not a tendon moment arm. A 0.1 ms model integrates the measured probe spring/mass/drag plus a labeled FlyGym-derived tibia rod inertia. Physical angle/velocity drives FeCO and a provisional direction-neutral GCaMP6f layer sampled at 8.01 Hz. Unresolved flexor spikes and extensor activity do not receive invented absolute units.

BANC predicted transmitter labels remain authoritative for signs inside the CNS graph. They are not reinterpreted as direct inhibitory action on an annotated muscle: peripheral action sign comes from the source effector identity and experimental motor role. This preserves the source conflict instead of silently relabeling 260 GABA-predicted motor rows.

## Body plant

The **live** body is a six-leg planar causal plant with one articulated femur–tibia degree of freedom per leg, not a complete articulated fly.

Broad descending activity supplies a transitional coordination signal, but tonic leg readiness cannot start the shared phase clock by itself. Each leg's identified motor-pool activity sets transitional stride amplitude. Active frequency is bounded to the Azevedo 10–20 Hz walking range. Mendes et al. report a representative 28 mm/s bout near a 60 ms step plateau; the derived `1.68 mm/cycle` planar advance scale is multiplied by gait frequency and actual stance traction. Thus neither a running clock nor coordination activity produces translation without leg evidence.

Unit activation produces opposing flexor/extensor forces at the femur–tibia joint; passive stiffness, damping and the measured 18–180° preparation range keep it bounded around a 90° rest angle. Joint state materially changes foot placement and closes the FeCO loop. Only right-left DNa02/DNa01/DNg13 evidence can produce yaw, with disclosed stride-gain signs and a traction-gated engineering angular gain. Raw tonic left/right motor-pool imbalance cannot steer. Local contact unloads struck legs and returns through touch/proprioceptive feedback; it never chooses reversal, a turn side or a timed escape program. Reverse motion requires represented MDN/DNp42/backward-motor output. The current BANC dynamics do not recruit that output in the long-horizon obstacle assay.

## Ingestion semantics

`feed` and `drink` in the neural packet are activity-derived proboscis attempts. The body retains them as `feedAttempt` and `drinkAttempt`. Fulfilled feeding or drinking requires matching food or water taste at the mouth point on the same embodied step. Strong unmatched output is labeled `probe`; weaker evidence remains visible in the neural observer but is not rendered as sustained proboscis extension. Resource depletion, physiology and reward memory consume only fulfilled contact-gated behavior.

Removed from the runtime:

- constant forward movement;
- stochastic body saccades;
- target bearings;
- post-connectome odor/visual/memory steering;
- anti-circling corrections;
- obstacle-coordinate escape commands.

The angular range and rest coordinate are preparation evidence, while the transitional body's acceleration, stiffness, damping, normalized force conversion and 3,200°/s numerical cap are engineering values. The measured probe-loaded model is not substituted into free walking. The remaining stride geometry, traction gain, tripod phase, swing fraction and steering gains are also disclosed approximations. Front-leg structural constraints are extrapolated to the other five legs, but absolute force is not.

## Staged NeuroMechFly mechanics

A separate qualification profile now compiles the controller-free NeuroMechFly v2 body in MuJoCo WebAssembly. It contributes a pinned 70-body hierarchy, 127 joints, 42 active leg coordinates, measured/model masses, 39 segment meshes, a free root and six leg-contact sensors. The model's coherent units are millimetres, grams and seconds; its total mass is 1.02431 mg and its force unit is µN. The 0.1 ms model timestep requires 100 physical substeps per live 10 ms world frame.

The qualification body causally settles under gravity, reports physical ground contacts, responds to an explicit root perturbation and an explicit femur–tibia position target, and restores exact generalized state. A finite compiled-geometry audit corrects the coordinate convention: increasing every femur–tibia pitch coordinate decreases the anatomical angle, so positive coordinate/torque means flexion and negative means extension. Those are mechanics implementation checks. The upstream neutral position controls, actuator stiffness, friction, solver settings and adhesion/contact formulation are not treated as measured muscle physiology.

Only the femur–tibia flex/extend action pair is mapped to a model coordinate and numeric sign, and normalized neural activity still has no angle or torque gain. A qualification-only intervention disables all 42 position servos, confirms zero position-actuator force and applies the existing adult front-leg resolved-spike twitch as direct generalized torque. At the 50 ms fast-unit peak, `7.0382 µN` through the measured external `417 µm` probe lever gives `2.9349294 µN·mm`; it flexes the geometry-derived joint relative to a zero-spike/zero-torque control. This does not establish an internal tendon moment arm, free-walking load, absolute extensor force or transfer to any other leg. Eight action classes remain disabled structural hypotheses. Long-tendon pull and unknown movement remain unresolved. Therefore the profile never accepts a neural motor packet and is not the default body. Body-derived contact and joint observations are not yet injected into the CNS loop.

A qualification-only afferent boundary now converts the physical joint state into the existing 92-value subtype schema. It carries anatomy-derived angle/velocity, binary local contact and stateful claw/hook/club signals, while stripping world position, collision normals/tangents, object identity and room geometry. The spike-torque intervention causally increases flexion-hook and club evidence. Raw contact-force magnitude remains auditable in µN, but its strain field is exactly zero because no contact-force-to-campaniform gain is pinned. The vector is not yet selected by the live world loop.

The explicit qualification profile can now derive chamber collision from normalized room JSON without changing the pinned public XML. It centres the room's top-left x/y coordinates, retains the upstream neutral root offset, maps spawn heading to a vertical quaternion, and adds four boundaries plus static boxes for wall and shelter footprints. Rather than changing collision masks on all fly geoms, it follows FlyGym's explicit-pair construction: each collider is paired with exactly the 55 fly geoms selected by the pinned ground model, using the v2.1.0/browser-game friction, solver and margin values. Fly self-collision and room–room collision remain disabled and the original ground pairs remain intact. The six leg-subtree sensors then include both ground and obstacle contacts; a wall intervention is compiled-contact- and sensor-causal while the safe afferent state still excludes room/object evidence. Exact physics-profile identity prevents a serialized state from being restored into different room mechanics. The JSON has no height or material measurements, so 5 mm extrusion, 1 mm boundary thickness, rigid/static behavior and even the source-matched pair parameters remain engineering assumptions. Food, water, light and threat remain nonblocking. This profile is still qualification-only and supplies no collision behavior, target bearing or gait command.

Adhesion remains explicitly unresolved. FlyGym models it with six active tarsus5 normal-attraction actuators, not passive sticky contact. The controller-free viewer body bundled here has none; the official game adds them but switches each one from baked gait phase (off in swing, on in stance). Adding passive adhesion or importing that CPG/preprogrammed timing would introduce unsupported mechanics or a gait controller. Fly Umwelt therefore reports exactly zero adhesion actuators until a defensible neural attachment/release and surface-mechanics bridge exists.

The controller-free NeuroMechFly viewer XML still has no internal muscle geometry. Vaxenburg et al. (2025, DOI `10.1038/s41586-025-09029-4`) warn that non-wing position controls are not biologically meaningful and describe muscle actuation plus identified origins/insertions as future extensions. Fly Umwelt does not infer wrapping sites or moment arms from those viewer meshes.

## Separate restrained FlyMimic muscle mechanics

Özdil et al. (ICLR 2026, arXiv `2509.06426v2`) now provide a distinct data-driven musculoskeletal front-leg model. Fly Umwelt pins byte-identical FlyGym/FlyMimic XML, 71 X-ray-aligned meshes and 15 spatial Hill-type muscle–tendon routes, while excluding the source PPO policy, motion-capture clips and imitation reward. The thorax is anchored; seven left-front hinge coordinates are functional, seven right-front coordinates are equality-locked, and there are no external-contact sensors or adhesion actuators. This is a restrained qualification preparation, not a muscle retrofit of the free-root viewer body.

The paper supports anatomy-derived representative paths but not exact physiology: maximum isometric forces and contraction velocities were estimated and optimized rather than directly measured, the behavior data came from tethered flies, and external contact forces were omitted. The compiled body mass is `2.494271478 mg`, `2.435074809384×` the separate viewer body's `1.02431 mg`; the models are not silently treated as one morphology.

From an identical serialized state, isolated `0.1` excitation of `LFTibia_flex_93434` raises femur–tibia pitch and generalized force relative to passive continuation, while `LFTibia_extensor_93932` lowers both. Their compiled moment arms have opposite signs. This closes the existence and causal direction of an internal antagonist route in that model, not a BANC cell-type or excitation-gain mapping.

Every source actuator clamps control to `[0.0001, 1]`. Requested zero therefore becomes `0.0001`, and passive muscle/tendon force is nonzero in eight actuators at the keyframe even though activation state starts at zero. Passive force is retained as physical evidence, but the control floor violates the project's exact zero-neural-evidence rule. The wrapper exposes explicit engineering excitation only; automatic BANC integration is disabled. Full evidence, numerical probes and the required replacement sequence are in `MUSCULOSKELETAL_BODY_3_8.md`.

A distinct `zero-safe` qualification profile now derives exactly 15 `[0, 1]` muscle ranges in memory without changing the public XML. It preserves keyframe mass, coordinates, tendons, moment arms and passive force exactly and uses a separate state identity. Zero-initial activation stays mathematically zero under zero control; after prior activation, the integrator decays only to a positive subnormal in finite time, which remains disclosed rather than thresholded away.

Exact bundled annotations support identity-only LF fast-flexor and FETi correspondences to the two FlyMimic tibia actuators. The predicted-GABA calls and FETi LR-type conflict remain visible; SETi remains distinct. No excitation gain or timing transfer is available, and the Azevedo external probe force is not equated with internal tendon force. A compiled reconciliation further shows incompatible mass, root, segment-frame, actuator and contact/sensor contracts between the restrained muscle body and free-root viewer. No merge or live neural control is promoted. See `MUSCULOSKELETAL_INTEGRATION_3_8.md`.

## What biological validation means

A convincing animation is not validation. Progress should be measured by pre-registered experiments:

- activate or silence identified populations;
- reproduce the same sensory conditions;
- compare downstream neural activity, leg outputs and kinematics;
- require one parameter set to explain multiple independent experiments;
- report failures rather than retuning every experiment separately.

## Highest-priority replacements

1. validate the front-leg bridge against accessible raw traces, resolve the two DSI failures and resolve receptor-aware BANC motor transmitter semantics;
2. constrain the two identity-matched FlyMimic spike/subthreshold-to-excitation gains and timing against preparation-compatible evidence without importing its imitation policy;
3. construct and validate one mechanically coherent free-root morphology that reconciles frames, centres of mass, inertias, external contact and muscle routes, then extend measured joint/contact/force state across all legs and identified afferents;
4. add receptor-aware and graded dynamics where data support them;
5. add gap junctions, compartment delays and slow modulation;
6. reconstruct missing visual periphery explicitly;
7. move associative memory and internal state progressively into circuits.
