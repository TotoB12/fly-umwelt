# Research audit

## Locomotor causality — 3.8

Azevedo et al. show that slow motor neurons can fire tonically at rest and support low-force posture; this does not justify turning tonic population readiness into unconditional walking. Yang et al. (2024, DOI `10.1016/j.cell.2024.08.033`) distinguish VNC-generated rhythmic limb patterns from descending start/stop/modulation and report that right-left DNa01, DNa02 and DNg13 differences correlate with rotational velocity. DNa02 attenuates ipsilateral strides, while DNg13 lengthens contralateral strides. Rayshubskiy et al. (2025, DOI `10.7554/eLife.102230`) further distinguish transient high-gain DNa02 from sustained lower-gain DNa01 and report that both hyperpolarize during stops.

Braun et al. (2024, DOI `10.1038/s41586-024-07523-9`) show that DNp09 recruits a broader descending network and can yield walking, stopping or freezing depending on context. It is therefore not evidence for a scalar forward gate. Israel et al. (2022, DOI `10.1016/j.cub.2022.01.035`) trace touch-evoked backward walking through ascending mechanosensory neurons to MDNs. Contact should enter the CNS; it does not justify a private plant collision program.

The bundled BANC audit finds exact bilateral pairs for DNa01, DNa02 and DNg13, four MDNs and the DNp09 pair. None spikes in the current homogeneous-LIF default runs; decoded steering comes only from small subthreshold activation. The audit also found that the old optional-`o` `oDN1` expression admitted three unrelated DN1 types and that a generic DNg expression admitted 840 cells. Version 3.8 makes both parsers exact enough to avoid those false locomotor populations.

The frozen locomotor report now separates exact phasic candidates from the broad descending proxy. Conservative P9, BPN, oDN1, walking-DNg and halt populations are absent in the pinned BANC table. DNp09 (2), MDN (4) and DNp42 (2) are present but spike in zero frames in every 10-second seed and the 30-second run, with only small subthreshold activation. Broad descending activity reaches roughly 2.27–2.42 Hz. Therefore no source-supported exact start/stop population can replace the proxy yet; doing so by label guess or tonic threshold would invent the missing recruitment mechanism.

Consequently, raw tonic leg-pool asymmetry no longer produces yaw, tonic readiness cannot start gait without separate coordination evidence, contact cannot start body-private reverse/turn timers, and reversal comes only from represented neural output. The 30-second assay then remains pinned for 26.5 seconds without MDN-related reversal. This is a preserved negative result. Source hashes, decisions and engineering constants are frozen in `public/data/calibration/locomotor-honesty-v1.json`; deterministic output is in `docs/benchmarks/locomotor-honesty-3.8.0.json`.

## Locomotion and motor excitability — 3.7

Mendes et al. (2013, DOI `10.7554/eLife.00231`) constrain active uninterrupted straight-bout averages to 7.2–44.7 mm/s, with 28 mm/s most represented and a roughly 60 ms step-period plateau near 30 mm/s. Azevedo et al. (2020, DOI `10.7554/eLife.56754`) report 10–20 Hz front femur–tibia cycles during walking and approximately 30 Hz resting activity in the slow flexor, while intermediate/fast units are silent at rest. Wosnitza et al. (2013, DOI `10.1242/jeb.078139`) identify step frequency as the dominant walking-speed control.

The release diagnosis found zero spikes in every identified BANC leg-motor population over 30 seconds; all prior tiny movement came from a rate-scaled population-average subthreshold decoder. Version 3.7 adds a separate saturating transfer for actual identified-pool membrane state and makes speed frequency × derived representative advance/cycle × stance traction. The `0.16` transfer scale is explicitly engineering, fit on seed 1 and held fixed for seeds 2/3/5/8. This is not a cell-specific physiology model, and tonic slow-unit evidence is not converted into an unconditional velocity.

Retrieved-source hashes, equations, fit split and limitations are frozen in `public/data/calibration/locomotor-competence-v1.json`; results are in `docs/benchmarks/locomotor-competence-3.7.0.json`.

## BANC whole CNS

Bates, Phelps, Kim, Yang et al. describe a unified adult-female brain-and-cord connectome and find that the strongest influences on effector neurons are generally local sensory signals, with ascending and descending neurons coordinating distributed feedback modules. This directly motivates Fly Umwelt's move away from a centralized action selector and toward leg-local sensory–effector loops.

The paper reports 150,841 backbone-proofread and 5,075 roughly-proofread neurons. It also notes that the public metadata can contain proofread marks added after the strict snapshot. Fly Umwelt therefore pins source hashes and audits the current table rather than treating one remembered count as a filter specification.

The same paper reports missing lamina, ocelli and ocellar ganglion, about 9,390 associated cells, and bilateral antennal-nerve damage. These limitations constrain any “complete fly” claim.

Primary source: <https://doi.org/10.1038/s41586-026-10735-w>

## Whole-brain dynamical precedent

Shiu et al. showed that a whole-brain connectome-constrained LIF model can make useful predictions in several sensorimotor circuits. The model also exposes why a connectome is insufficient: global neuron parameters, zero baseline, transmitter assumptions and omitted morphology/receptors/modulation limit fidelity.

Fly Umwelt retains the simplified dynamics as a falsifiable starting point, not as a claim that all fly neurons are identical LIF units.

Primary source: <https://doi.org/10.1038/s41586-024-07763-9>

Reference implementation: <https://github.com/philshiu/Drosophila_brain_model>

## Steering populations

Electrophysiology links right-left differences in DNa01 and DNa02 activity to rotational velocity. DNa02 is recruited earlier, is higher-gain and predicts more transient steering; DNa01 predicts smaller, slower and more sustained steering. Fly Umwelt therefore exposes these channels separately instead of combining them into one generic turn number.

Yang et al. additionally show DNa02-linked ipsilateral stride attenuation and DNg13-linked contralateral stride lengthening. The current planar body preserves these signs but does not prove its gains. They remain engineering transfer functions until validated against leg kinematics, and yaw is gated by traction so neural activity cannot rotate an inactive body.

Primary sources:

- <https://doi.org/10.7554/eLife.102230>
- <https://doi.org/10.1016/j.cell.2024.08.033>

## Leg motor and premotor organization

Adult leg motor-circuit reconstruction shows that motor identity is muscle- and joint-specific, while motor-unit studies constrain recruitment and force production beyond a binary flexor/extensor label. Premotor work further shows structured convergence and local organization rather than a single scalar command per leg. These results motivate preserving individual BANC motor rows, peripheral targets and action classes before attempting a body transfer function.

Version 3.6 keeps the stable 72 action and 30 source-unit channels and additionally preserves exact identified population spike counts per motor frame. The pinned BANC table resolves one slow flexor, five fast flexors and six each of SETi/FETi; 95 femur–tibia flexors remain physiologically unresolved. Azevedo et al. constrain recruitment, count-dependent force and response timing. Resolved slow/fast counts yield absolute probe-equivalent flexor force and torque for the restrained preparation. The live runtime still lacks a BANC-connected internal muscle/tendon route, absolute extensor force and a free-walking load. The broad six-leg traction channel remains transitional.

The cited motor study also reports 110 of 3,082 intermediate spikes without an immediately preceding slow spike during rapid unloaded movement. Accordingly, the normalized body model does not require an instantaneous slow spike for every intermediate event, while still requiring intermediate evidence for fast recruitment. The separate bridge encodes the reported approximately 1.6× two-spike summation and saturating count curve. BANC does not cleanly resolve the Azevedo intermediate identity, so unresolved population spikes are not relabeled to make the comparison pass.

Primary sources:

- adult leg motor circuit reconstruction: <https://doi.org/10.1016/j.cell.2020.12.013>
- leg motor-unit size principle: <https://doi.org/10.7554/eLife.56754>
- premotor architecture: <https://doi.org/10.1038/s41586-024-07600-z>

## Leg proprioception and sensory pathways

Leg chordotonal organs and downstream pathways distinguish joint position, movement and vibration with subtype-specific tuning. Recent whole-leg sensory work also emphasizes parallel tactile, strain, nociceptive and gustatory routes. A single unsigned “proprioception” rate therefore cannot be the end state.

Version 3.6 preserves exact claw, hook and club source populations. Mamiya et al. constrain claw as tonic position, hook as phasic movement direction and club as bidirectional movement/vibration; the reported club population velocity response peaks near 400°/s. The model implements stateful polarity and a club movement/impact envelope, then offers a provisional GCaMP6f observation at 8.01 Hz. It does not invent a signed split or driver mixing; current club and flexion-hook DSI comparisons fail. Its 100 Hz body loop cannot resolve the measured 100–2,000 Hz carrier.

Primary sources:

- proprioceptive organization: <https://doi.org/10.1016/j.cub.2021.09.035>
- FeCO position/direction/vibration coding: <https://doi.org/10.1016/j.neuron.2018.09.009>
- leg sensory pathways: <https://doi.org/10.1038/s41467-025-59302-3>

## Embodiment

NeuroMechFly v2 provides a micro-CT-based adult fly body and an experimentally grounded embodiment framework. FlyGym 2.1 additionally publishes an official MuJoCo WebAssembly browser viewer, making a browser-local articulated body possible without visitor-side Python. FlyGym's official model-composition tutorial explicitly uses millimetres and grams so computed force is in µN; this resolves the native mass-unit interpretation of the compiled `0.00102431 g` body.

Fly Umwelt now pins FlyGym 2.1 source commit `ca65a510c2afe6ac61c51df4f274c8d190c2f95f`, official browser-asset commit `0884af08981994543634563d95e9b1eb49945082` and MuJoCo 3.9.0. It bundles the controller-free XML, 39 meshes, browser runtime and licenses as same-origin assets with file hashes. It deliberately excludes FlyGym CPG, rule-based, preprogrammed-step and game behavior. The compiled contract and mechanics probes are frozen in `articulated-body-qualification-3.8.0.json`.

The staged body is not the live locomotor plant. Only the femur–tibia antagonist pair has a coordinate/sign mapping, with no normalized population-to-angle/torque gain; other plausible mappings are disabled and long-tendon/unknown channels remain unresolved. The compiled-geometry audit found that the earlier sign statement was reversed: increasing the pitch coordinate decreases the anatomical angle on all six legs, so positive coordinate/torque is flexion and negative is extension. This is now a deterministic qualification gate rather than a naming assumption.

MuJoCo documents `qfrc_applied` as a direct generalized-force input summed with passive and actuator forces. The new torque-only probe disables all upstream position-actuator gain/bias terms, verifies exact zero actuator force and applies one already-qualified resolved fast-flexor twitch to the left-front joint. At 50 ms, the measured-probe bridge supplies `2.9349294 µN·mm`, producing physical flexion relative to a zero-spike control. This is an experiment-specific external-lever observation, not an internal tendon model, free-walking calibration or neural motor-packet connection.

The same physical motion now reaches a privilege-stripped afferent boundary. Geometry-derived anatomical angle/velocity and binary local contact drive the existing stateful claw/hook/club transduction; the spike intervention raises flexion-hook and club output relative to the zero-spike control. The 92-value vector contains no world position, contact normal/tangent, object identity or room geometry. Raw contact force remains visible in µN for audit, but its campaniform/strain transfer is zero because the literature reviewed here does not establish a quantitative gain. This is qualification closure, not yet the sensory vector selected by the live BANC loop.

The normalized room now has a separate physics qualification. An in-memory XML derivative maps the authored millimetre room frame and spawn heading into MuJoCo, adds four chamber boundaries plus static `wall`/`shelter` boxes, and changes the six leg-subtree sensors from ground-only to all local physical contact. Source inspection corrected the first collision-mask implementation: FlyGym constructs explicit pairs only for its 55 selected contact-body geoms. The room derivative now does the same for every collider and copies the pinned v2.1.0/browser-game pair values (`friction 1 1 0.02 0.0001 0.0001`, `solref 0.0002 1`, `solimp 0.98 0.99 0.00001 0.5 3`, margin `0.001 mm`) while leaving every source geom mask and ground pair unchanged. A direct body translation produces compiled wall–front-tarsus contacts and increases the matching LF/RF sensor counts; exact physics-profile identity rejects cross-room or unkeyed state restore, while the afferent boundary remains free of room geometry and object identity. This closes an implementation gap, not a material-science claim: room JSON has only 2-D footprints, so 5 mm extrusion, 1 mm boundary thickness, rigid behavior and even source-matched contact values are engineering assumptions. Food, water, light and threat remain nonblocking.

Upstream adhesion research establishes another important negative boundary. FlyGym's `add_leg_adhesion` creates six actively controlled normal-attraction actuators on tarsus5 with a 0–1 command. The pinned controller-free viewer body has none. The official browser game adds six, but its JavaScript sets adhesion off during swing and on during stance from baked CPG/preprogrammed-step phase. NeuroMechFly v2 likewise presents adhesion timing with preprogrammed/CPG stepping. Fly Umwelt does not import those commands, synthesize a neural adhesion channel or make the feet passively sticky. Adhesion remains disabled until an experimentally defensible neural/biomechanical bridge exists.

The controller-free viewer body's absence of tendons remains source-supported. Vaxenburg et al. (2025, DOI `10.1038/s41586-025-09029-4`) use position actuators for non-wing joints, warn against interpreting their controls biologically, and call muscle actuation plus identified origin/insertion geometry a future increase in realism. Fly Umwelt therefore still does not infer attachment or wrapping sites from the viewer meshes.

A separate source now supplies a stronger restrained mechanics substrate. Özdil et al. (ICLR 2026, arXiv `2509.06426v2`) construct 15 front-leg MTUs from multiple high-resolution X-ray datasets, retaining seven thoracic, six coxal and two femoral units. The paper explicitly distinguishes anatomy-initialized attachments/paths from uncertain physiology: maximum isometric force uses CT-derived PCSA plus a literature tension prior, contraction velocity is estimated from X-ray movement video, and several terms are multi-behavior optimized. Its limitation section states that maximum force and velocity were not directly measured and that omitted external contact can make activation inaccurate for untethered locomotion.

Fly Umwelt pins the byte-identical FlyGym/FlyMimic XML and all 71 meshes but excludes policy, mocap, rewards and training code. The compiled anchored body exposes 15 Hill muscles, 15 spatial tendons, seven LF DoFs and seven RF equality locks. Identical-state interventions confirm opposite `joint_LFTibia_pitch` effects for `LFTibia_flex_93434` and `LFTibia_extensor_93932`. However, all 15 source-profile controls have a `0.0001` lower bound, passive forces remain nonzero, and the compiled `2.494271478 mg` body disagrees materially with the viewer body's `1.02431 mg`. Thus it remains a separate qualification body with no automatic BANC control. Position-actuator, passive-joint, friction, solver and neutral-posture parameters in the viewer remain engineering; the older tibia inertia prior and external probe lever remain restricted to their preparation paths.

A later bounded audit keeps that source failure intact and creates a separate zero-safe profile through exactly 15 in-memory control-range edits. From the zero keyframe, control and activation remain exact zero while passive force, tendons, moment arms, coordinates and mass match the source. After prior activity, activation reaches only a positive floating-point subnormal in finite time; no hidden cutoff is applied. Exact bundled rows support two identity-only correspondences—LF `tibia_flexor_Fast` and FETi—to the two FlyMimic tibia actuators. Their predicted-GABA calls and FETi LR conflict remain unresolved; SETi remains distinct; excitation gain/timing and automatic control remain disabled. A full compiled comparison finds 64 semantic body matches but confirms incompatible mass, free/anchored root, trochanter/femur segmentation, frames, actuator semantics and contact sensors. Therefore the two models still cannot be spliced, averaged or treated as one plant.

Primary source: <https://doi.org/10.1038/s41592-024-02497-y>

Whole-body actuation boundary: <https://doi.org/10.1038/s41586-025-09029-4>

Musculoskeletal front-leg model: <https://arxiv.org/abs/2509.06426v2>

Generalized-force semantics: <https://mujoco.readthedocs.io/en/3.3.3/computation/>

Repository: <https://github.com/NeLy-EPFL/flygym>

## Transmitter policy

The whole-brain LIF precedent treats GABA and glutamate as inhibitory. Canonical fly photoreceptor transmission uses histamine-gated chloride channels, supporting a negative fast approximation for histamine. Monoamines and neuropeptides cannot responsibly be forced through one ordinary fast excitatory channel without postsynaptic receptor/context information.

Version 3.6 therefore gives modulatory, conflicting and unknown calls zero instantaneous fast gain. This sacrifices apparent activity to avoid inventing a fast sign.

### Leg-motor transmitter conflict

The pinned BANC table labels the 391 explicit leg motor rows as 260 GABA, 81 acetylcholine, 11 glutamate, 13 modulatory and 26 unknown. Adult fly leg neuromuscular physiology makes the large GABA assignment scientifically suspect as a direct muscle sign. Version 3.6 preserves and reports the source evidence for CNS graph signs, while muscle action sign follows annotated effector identity. This is not a resolution of the transmitter conflict and must not be presented as one.

## Data-selection audit

The earlier BANC builder used `flow ∈ {afferent, intrinsic, efferent}` as the organism boundary. That admitted non-neuronal objects and omitted legitimate neurons without the expected flow annotation. The current rule uses proofreading plus explicit object identity and `IS_REAL_NEURON` overrides.

A second parser defect searched for `halt` as a substring, causing `haltere` sensory annotations to become a halting output population. Exact output-type matching and a zero-halt regression test now prevent recurrence.

## Locomotor audit

The earlier body had a constant forward floor and a stochastic finite-saccade clock. Consequently, it could look autonomous while the neural graph contributed little causal motor information.

Version 3.6 retains that boundary and adds an exact peripheral route. The pinned local table contains 391 explicit leg motor neurons, 68 cell types, 17 peripheral targets and 12 joint-action labels. It has 5,214 explicitly leg-assigned sensory rows; the parser maps 5,302 after side/body annotation inference. These counts supersede an earlier 5,188 estimate.

Femur–tibia source-unit activity drives finite normalized activation before the transitional body joint. In parallel, resolved spikes yield experiment-specific absolute force/torque and a measured-probe-loaded FeCO observation. This closes the unit bridge for one preparation, but free mechanics, tendon geometry, non-front-leg transfer and Poisson sensory gain remain engineering hypotheses.

## Compute audit

WebAssembly is a real backend and integrates all neuron state. JavaScript remains the fallback and handles sparse graph propagation in both paths. JS/WASM parity is checked at every supported timestep.

WebGPU is not implemented. It should be added only if it preserves experiment-level results and materially improves the measured whole-CNS workload.

## Research conclusion

One limb-loop model is experimentally constrained and machine-auditable, with negative DSI results retained. The separate FlyMimic substrate now supplies anatomy-derived restrained LF routes, and its zero-safe/identity/reconciliation prerequisites are machine-audited. Neural/free-walking integration is still blocked by missing preparation-compatible excitation gain/timing, incompatible body mechanics and absent untethered external-contact validation. The highest-value next milestone is evidence-constrained gain plus a single mechanically reconciled free-root muscle body alongside independent trace-level validation:

```text
measured leg contact / joint / load state
  → identified BANC afferents
  → BANC and VNC circuitry
  → identified motor neurons
  → constrained motor units, muscles and joints
  → changed physical state
```

The frozen bridge should be compared with accessible held-out raw traces while the restrained muscle routes are reconciled with the free-root articulated body's mass, contacts and afferents. New degrees of freedom require physical provenance and may not import a baked controller. That milestone outranks another navigation heuristic, observer animation or unvalidated performance backend.
