# Whole-fly execution program

## Purpose and claim boundary

Fly Umwelt is pursuing the most biologically constrained embodied *Drosophila melanogaster* simulation that can run locally in an ordinary browser and ship as a fully static site. The target is not a persuasive animation. It is a causal model in which measured anatomy and experiments increasingly determine what the simulated animal can sense, how its nervous system evolves, which muscles produce force, and what behavior follows.

There is no scientifically defensible finish line called “alive” for this software. The project can improve emulation fidelity and compare predictions with living flies; it cannot infer life, consciousness or specimen identity from graph size, visual plausibility or behavioral complexity. “As accurate as possible” therefore means:

1. maximize experimentally constrained causal coverage inside the static-browser envelope;
2. expose every unsupported assumption and missing structure;
3. prefer mechanisms that predict held-out observations over mechanisms that merely look plausible;
4. retain negative results and uncertainty;
5. never let observer, room-object identity or target coordinates become hidden control signals.

## Non-negotiable deployment envelope

Every milestone must preserve all of the following:

- static HTML, CSS, JavaScript, Web Workers, WebAssembly and same-origin data only;
- `npm run build` produces the complete `dist/` artifact;
- no Pages Functions, Worker, database, binding, login, telemetry or mandatory network request at runtime;
- all runtime data are licensed or redistribution-compatible, provenance-recorded, integrity-pinned and compact;
- large data products are reduced to the smallest scientifically sufficient derived representation and sharded below the hosting per-file limit;
- experiments are deterministic from saved model version, parameters, initial-state seed, room and intervention log;
- Core remains usable on conservative browser memory budgets; higher-fidelity modes degrade explicitly rather than silently changing the organism;
- `_headers`, `_redirects`, WebAssembly loading, cross-origin isolation and same-origin rejection remain release gates;
- deployment itself remains outside local development and requires the owner’s later authorization.

No server feature is currently scientifically necessary. Adding one would make the free static artifact less reproducible and is out of scope.

## Current baseline: version 3.8

The present system has an audited 155,855-object BANC whole-CNS graph, persistent LIF dynamics, exact or explicitly proxied sensory populations, 391 identified leg motor neurons, 72 leg/action channels, 30 femur–tibia unit channels, exact identified frame spike counts and one dynamic antagonist joint on each live planar leg. Claw, hook and club FeCO classes close the first identified proprioceptive loop. A separate restrained-preparation bridge carries spikes to absolute probe-equivalent flexor force, measured-lever torque, loaded motion, FeCO and provisional GCaMP observation. A disclosed motor-excitability bridge permits active movement from spike-silent actual-BANC leg pools, but version 3.8 no longer labels the resulting organism locomotor-competent. Translation requires mapped leg-effector plus coordination evidence, steering requires explicit steering-DN evidence and traction, and contact never selects a private escape behavior. Neither observer state nor room coordinates cross the neural boundary. A staged, controller-free NeuroMechFly/MuJoCo profile contributes pinned 70-body mechanics, 42 actuators, six contact sensors, geometry-validated femur–tibia signs and a servo-disabled generalized-torque probe. A separate restrained FlyMimic profile contributes 15 anatomy-derived LF muscle/tendon routes. Its zero-safe derivative and two identity-only BANC correspondences are qualified, but gain/timing remain null and a compiled reconciliation blocks merging the anchored muscle body with the free-root contact body. Both remain qualification-only until one coherent muscle/contact plant and neural excitation transfer exist.

This is a strong structural and software foundation. It is still a partial animal model because:

- homogeneous point-neuron dynamics replace heterogeneous graded/spiking cells, receptor kinetics, electrical coupling and compartment structure;
- the present absolute leg evidence constrains one restrained adult front-leg joint preparation; internal tendon mechanics, extensor force, free load and the other five legs remain uncalibrated;
- only the femur–tibia coordinate is dynamic; ten other mapped leg action classes are not yet physical effectors;
- a shared tripod-compatible phase clock and planar traction equations still supply most gait geometry;
- the periphery lacks complete receptive fields and mechanics for strain, touch, halteres, wings, antennae, proboscis and high-frequency vibration;
- hunger, thirst, sleep, stress and memory remain substantially external state variables or inputs;
- the experiment suite retains two failed FeCO direction-selectivity metrics, while bridge held-outs establish implementation causality rather than independent-animal prediction.

For planning only, the project is close to static release engineering but early-to-middle stage as a whole-fly emulation. Percentages must never be presented as measured biological completeness. The operative progress measure is completion of the falsifiable gates below.

## Evidence and experiment contract

Every calibration or validation observation must be machine-readable and contain:

| Field | Requirement |
|---|---|
| Stable ID | Never reused after publication |
| Source | DOI plus figure/panel, table, methods section or exact reported paragraph |
| Evidence class | `reported-scalar`, `publisher-figure-digitized`, `raw-derived`, `connectome-derived` or `engineering` |
| License | License and redistribution status of both source and derived artifact |
| Preparation | Species, life stage, sex when known, leg/joint, restraint and relevant intervention |
| Protocol | Stimulus waveform, speed, acceleration, duration, repeats, interval, sampling and units |
| Observation model | What was physically measured and any transformation between model state and measurement |
| Values | Data in explicit units; no coordinates inferred from a plot may be described as raw data |
| Uncertainty | SEM/SD/CI, digitization tolerance, sample count and known systematic mismatch |
| Role | `fit`, `held-out`, `audit-only` or `context`; immutable after a fitting run starts |
| Metric | Formula, normalization and aggregation across trials/individuals |
| Failure rule | Frozen threshold and direction before held-out evaluation |
| Extraction | Script/manual method, source asset hash and reviewer notes |

Fit and held-out records must never be pooled. If no defensible observation model connects a browser state to the experimental measurement, the result is `not-evaluable`; it is not silently treated as a pass. Version 3.6 now has an explicit restrained-probe spike/force bridge, but it does not license free-joint tendon claims. Its declared GCaMP6f layer is provisional and cannot be called preparation-fitted fluorescence.

Parameter changes require a before/after report. A parameter set is frozen before held-out evaluation and must be used across all relevant assays. Per-trial retuning is a failed model, not successful calibration.

## Program dependency chain

```text
independently validate one identified joint loop
  -> articulate the complete six-leg body and all mapped effectors
     -> make body-to-CNS sensing transducer-resolved
        -> add evidence-supported heterogeneous neural physiology
           -> move motivation and learning into circuits
              -> qualify one frozen organism across multiple held-out assays
                 -> repeat static release qualification
```

Workstreams can overlap in research and tooling, but no later visual success may substitute for an earlier causal or validation gate.

## Workstream 1 — independently validate the current limb loop

### Scientific question

Can one frozen femur–tibia motor/muscle/joint/FeCO model reproduce observations it was not tuned to, under the experimenters’ actual protocols?

### Program

1. Finish the unresolved BANC leg-motor transmitter audit, including the 260 GABA-labelled rows, against annotation semantics and adult neuromuscular evidence. Preserve uncertainty rather than forcing a convenient sign.
2. Encode the Mamiya et al. swing protocol: 180° to 18° and back at 360°/s, five seconds between directions, three repetitions and five-second inter-trial intervals. Preserve the reported 8.01 Hz calcium imaging and 200 Hz joint tracking as separate observation rates.
3. Encode the ramp-and-hold protocol: 18° steps between 18° and 180° at 240°/s, 3-second holds, both starting directions, two repeats and 72,000°/s² commanded acceleration; preserve the 180 Hz tracking and reported 5° interpolation.
4. Evaluate reported scalar observations first: club and hook direction-selectivity indices, repetition ratios, claw midpoint silence/approximately linear position response/hysteresis, club velocity peak, vibration bands and motor-unit timing/relative-force constraints.
5. Acquire raw data through normal publisher/repository access when feasible. If access is unavailable, use exact article-reported values and carefully digitized publisher figures with explicit pixel-to-data calibration and uncertainty. Never bypass access controls and never label plot-derived points raw.
6. Add compact force-versus-spike and FeCO response references. Preserve source assets outside the runtime unless redistribution and scientific value justify vendoring them; ship only the derived JSON required for the browser evaluator.
7. Retain the unchanged 3.5 baseline recorded before fitting. Missing unit bridges and representation mismatches remain historical findings.
8. Fit declared engineering parameters on the fit subset with a reproducible bounded search. Freeze one parameter file, then run the held-out subset once.
9. Report normalized error, signed bias, peak/timing error, DSI error, repetition ratios, sensitivity and failure modes. Retain the baseline and final reports.

### Exit gate

A versioned report must show predictions and failures against independent force, kinematic and afferent observations. At minimum:

- every record satisfies the evidence contract;
- protocol generators reproduce all stated positions, speeds, holds, repeats and sample rates within numerical tolerance;
- fit and held-out IDs are disjoint and machine-checked;
- direction selectivity and adaptation are evaluated under the published window definition;
- claw position and history metrics use both motion directions;
- absolute-force metrics are either supported by an explicit unit bridge or marked `not-evaluable`;
- the frozen model passes preregistered numerical thresholds on held-out observations without per-assay changes;
- negative results remain visible in the benchmark artifact and documentation.

### Version 3.6 outcome

The protocol/evidence contract, historical baseline and current report are complete. The spike–force bridge makes all three Azevedo force observations evaluable for the restrained preparation. Current scores are 17 pass, 2 DSI failures, 1 expected high-frequency limitation and 1 context record. The bridge is 9/9 on fitted source constraints plus implementation/causality held-outs. Workstream 1 remains open for raw-trace, preparation-specific GCaMP, internal tendon/extensor and free-load validation; these are not prerequisites for beginning Workstream 2, but they remain prerequisites for calling the limb quantitatively qualified in free behavior.

### Version 3.7 outcome

The actual BANC motor boundary was diagnosed rather than masked: all identified leg-motor pools were spike-silent despite active descending coordination. The release adds a source-pinned provisional motor-excitability bridge, frequency-dependent traction and a fit/held-out multi-seed competence report. It also makes ingestion contact-confirmed and keeps free-air proboscis output as an attempt. This restores useful organism-level locomotion but does not complete articulated neural-force integration or validate motor-neuron intrinsic physiology.

### Post-3.7 locomotor finding and scope decision

Longer observation shows that the provisional plant can produce a robot-like `persistent curve → contact → fixed reverse/turn → persistent curve` loop. The failure follows from continuous tonic-to-stride conversion, continuous yaw from small bilateral mismatch, fixed contact timers and an alternating ambiguous-contact fallback. It invalidates any interpretation of the 3.7 competence report as behavioral-naturalism evidence; that report establishes movement, active-bout scale, causal leg dependence and contact-honest ingestion only.

Version 3.8 completed the bounded correction: tonic leg readiness cannot start gait without coordination, raw tonic side imbalance cannot steer, and contact cannot start reverse/turn timers or choose an escape side. Long-horizon anti-shortcut regressions now enforce those boundaries. The result exposes a 26.5-second unrecovered obstacle contact with no represented reverse recruitment and continued plant command while pinned. Exact steering populations are also spike-silent. Those failures remain visible; no stochastic body-saccade generator, behavioral action selector or extensively fitted planar exploration model was added. Implementation effort therefore returns to the dependency chain: articulated mechanics, complete effector routing and physical sensory closure first; spontaneous trajectory calibration afterward.

## Workstream 2 — articulated morphology and mechanics

### Scientific question

Can the mapped motor system move a fly-shaped body without a commanded gait?

### Acquisition decision

The morphology/runtime selection is complete: FlyGym 2.1 source and official browser commits, NeuroMechFly XML/39 meshes, MuJoCo 3.9 WASM and Apache-2.0 texts are pinned. The 12.87 MB package deploys statically, compiles in a world Worker, and its geometry affects collision/inertia rather than decoration. No upstream locomotion controller is included. Coordinate sign and direct generalized-force feasibility are now qualified: positive femur–tibia torque flexes every leg, and one restrained-preparation resolved fast spike flexes the front joint while all position servos exert zero force. The open question is no longer solver or torque-interface feasibility; it is biological internal motor-unit/muscle/tendon/force routing and sensory closure.

### Program

1. Extend the existing explicit body schema with evidence-supported tendon paths, moment arms, feet/claws and contact surfaces; do not infer absent attachments from mesh appearance.
2. Add coxa, trochanter, femur, tibia and tarsal coordinates for all six legs. Represent wing, haltere, antenna and proboscis attachment frames even before their mechanics are enabled.
3. Convert all 12 mapped leg actions into physical effectors where anatomy supports a mapping. Unknown or generic channels remain visible unknowns.
4. Separate neural command, motor-unit recruitment, activation, force-length/force-velocity effects, tendon transmission and joint torque.
5. Add gravity, mass/inertia, collision, friction, compliant ground contact and fly-relevant attachment/adhesion. Each coefficient must be measured, fitted or explicitly engineering.
6. Add deterministic fixed-step integration, energy/penetration diagnostics and exact serialization. Physics must be independent of render frame rate.
7. Disable the shared gait phase clock. Descending neurons may modulate actual VNC circuitry or gains only through documented mappings; they may not prescribe foot trajectories.
8. Test standing, unloaded movement, supported stepping and free walking before visually complex terrain.

### Exit gate

- no phase variable, ideal foot path, commanded tripod order or velocity target creates locomotion;
- zero mapped muscle force produces no active movement;
- all contact impulses and body motion can be traced to physical state and effectors;
- locomotion either emerges from represented circuits or is reported as a biological failure;
- basic kinematics and force distributions are compared with held-out fly data;
- the default model remains real-time on a documented mainstream browser profile, with an explicit slower research mode if required;
- static build limits, same-origin loading and deterministic save/restore continue to pass.

## Workstream 3 — VNC-emergent gait and all motor actions

The body and controller work are coupled but separately falsifiable. Reconstruct and simulate candidate VNC premotor/central-pattern-generating populations from BANC connectivity and published perturbations. Preserve descending populations as inputs to this circuit rather than a replacement for it. Map stance, swing, inter-leg coordination, grooming, reaching and flight-related outputs only when evidence permits.

Exit requires phase relationships and perturbation recovery to arise from neural/local feedback dynamics, match multiple walking speeds and survive removal/silencing tests. A clock with biologically named variables does not satisfy this gate.

## Workstream 4 — complete the sensory periphery

### Program

- FeCO: progress from class envelopes to evidence-supported root/cell tuning, goniotopy and a separate high-rate carrier/envelope representation for club vibration.
- Strain: drive campaniform sensilla from local cuticular force/strain, not stance labels.
- Touch/taste/nociception: represent individual receptive fields, body location, direction and receptor class.
- Vision: restore missing periphery or explicitly model retinal/lamina transfer while preserving BANC omissions, retinotopy, spectral channels, motion latency and ocellar uncertainty.
- Olfaction: receptor-specific transduction, bilateral antennal geometry, airflow/advection and damaged-pathway flags.
- Halteres/wings: articulated mechanosensation and aerodynamic/gyroscopic signals, not heading shortcuts.
- Antennae/Johnston’s organ: sound, wind, gravity and touch mechanics with appropriate frequency representation.
- Proboscis/internal sensors: biomechanics, ingestion, gut stretch and nutrient/osmotic sensing.

### Exit gate

Every active transducer has a physical measurement, transfer function, sample bandwidth, exact/proxy neural target, evidence class, uncertainty, perturbation test and held-out response metric. No stance, object type or hidden world state masquerades as receptor output.

## Workstream 5 — heterogeneous and receptor-aware physiology

### Program

1. Build a neuron-class registry that can select graded, spiking or hybrid dynamics without changing identities.
2. Replace transmitter-only edge sign with postsynaptic receptor-aware sign and kinetics where evidence exists; preserve unknown receptor effects as unknown.
3. Add co-transmission, gap junctions, compartment delay and morphology-aware integration first in circuits where they change registered predictions.
4. Add neuromodulators, peptides, glial/homeostatic effects and endocrine coupling on appropriate slow timescales.
5. Replace a single arbitrary initial state with evidence-constrained ensembles and report sensitivity across them.
6. Preserve JS/WASM parity or document any backend-specific research mode.

### Exit gate

Each added mechanism improves preregistered neural or behavioral prediction relative to the simpler model across more than one experiment. Complexity that only increases realism vocabulary or produces attractive dynamics is rejected.

## Workstream 6 — internal state and learning in circuit

Move hunger, thirst, sleep, arousal/stress, fatigue and reproductive context from external scalar scaffolds toward endocrine, interoceptive and recurrent circuits. Implement mushroom-body and central-complex learning from connectome and plasticity evidence. Sensory cues may be egocentric and receptor-derived; object identity, global coordinates, correct actions and rewards inferred from room metadata may not enter the CNS.

Exit requires learning and state-dependent choice to persist with the external associative map disabled, generalize to held-out room layouts, and fail in the direction predicted by circuit silencing. State variables retained for engineering must remain visible and ablatable.

## Workstream 7 — multi-assay behavioral validation

Create versioned, static assay rooms and preregistered metrics for:

- free and tethered walking kinematics;
- optomotor turning and visual motion;
- looming escape;
- odor gradient orientation and plume intermittency;
- tactile obstacle negotiation and grooming;
- feeding, drinking and proboscis extension;
- geotaxis and mechanosensory stabilization where supported;
- sleep/wake, deprivation recovery and circadian modulation;
- associative learning and memory retention;
- named-neuron activation, silencing and lesion experiments.

Use distributions across initial-state ensembles, not one favorable seed. Compare the frozen organism with explicit null and engineering-controller baselines. Maintain separate dashboards for data integrity, numerical correctness, neural predictions, biomechanics and behavior.

Exit requires one parameterized organism to outperform declared baselines on multiple held-out assays while retaining failures and uncertainty. Success in one task cannot license a general “fly-like behavior” claim.

## Workstream 8 — static release and long-term reproducibility

At every milestone:

1. validate source/data schemas, hashes, licenses and exact population counts;
2. run unit, causal-boundary, protocol, experiment, deterministic continuation and JS/WASM parity tests;
3. run Core/Balanced whole-CNS dynamics and representative browser smoke tests;
4. build `dist/` locally and prove there are no Functions, external runtime imports or missing-asset HTML fallbacks;
5. audit file count, individual file sizes, total transfer, decompression peak and browser memory;
6. test narrow/wide layouts, keyboard access, reduced motion and observer causal isolation;
7. regenerate the release manifest and make all reports refer to the same model/data version;
8. update the reality matrix, scientific model, validation report, claims, third-party notices and change log.

Release qualification does not deploy or contact Cloudflare. It proves that the folder is ready for the owner’s later static Pages deployment.

## Prioritization and stop rules

Choose work in this order:

1. remove false claims, hidden shortcuts or unit/category errors;
2. add evidence that can falsify a currently implemented causal link;
3. close an identified body–CNS link;
4. replace a scripted scaffold with physical or circuit dynamics;
5. improve held-out prediction;
6. improve static reliability/performance;
7. add presentation only when it reveals causal state, evidence or uncertainty.

Stop or reconsider a feature when it cannot be distinguished from a scripted controller, lacks a deployable evidence path, consumes prohibitive browser resources for no measured prediction gain, or requires misrepresenting a proxy as anatomy. Missing data should produce a visible unknown, not invented precision.

## Near-term release sequence

| Milestone | Primary deliverable | Gate |
|---|---|---|
| 3.6 | Exact-protocol front-leg suite and restrained-probe spike–force bridge | complete with two preserved DSI failures; raw-trace/free-load gate remains open |
| 3.7 | Provisional actual-BANC locomotor bridge and contact-honest ingestion | historical; useful movement scale, but its behavioral competence claim is superseded |
| 3.8 | Locomotor causal-honesty correction | complete; spontaneous steering, obstacle recovery and bout control remain unqualified |
| 4.0 | Browser-native articulated six-leg body | no phase-clock locomotion; all motion force-traceable |
| 4.x | Sensor-resolved periphery and VNC gait refinement | transducer and perturbation gates |
| 5.x | Heterogeneous/receptor-aware circuit dynamics | improves preregistered multi-experiment predictions |
| 6.x | In-circuit internal state and learning | external cognitive scaffold removable |
| 7.x | Multi-assay frozen-organism qualification | held-out behavioral distributions beat baselines |
| Release candidate | Unified static qualification | self-contained `dist/`, matching hashes/reports and browser budgets |

The program is deliberately open-ended: public connectomes and physiology will improve, and a maximally honest model must be able to replace old assumptions. Completion of a milestone means its gate is satisfied, not that the organism is “finished.”
