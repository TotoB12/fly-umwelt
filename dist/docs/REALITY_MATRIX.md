# Reality matrix

This table separates measured structure, derived annotations and engineering models in Fly Umwelt 3.8.

| Component | Current implementation | Evidence class | Major missing step |
|---|---|---|---|
| CNS neuron identities | 155,855 selected BANC objects | EM reconstruction + proofreading metadata | resolve remaining reconstruction and annotation uncertainty |
| Directed connectivity | Core/Balanced/Maximal aggregate BANC pairs | detected synapses, aggregated by neuron pair | synapse-location and compartment-aware dynamics |
| Edge magnitude | fraction of target's detected input | derived from BANC edge table | calibrated postsynaptic currents |
| Fast transmitter | verified-first, predicted fallback | classifier/manual annotations | postsynaptic receptors and co-transmission |
| Membrane dynamics | one global LIF model | published whole-brain precedent + engineering | heterogeneous spiking/graded conductances |
| Delay | one global nominal delay | published approximation | morphology and cell-type delays |
| Initial activity | sparse seeds + weak background in Natural/Causal | explicit boundary hypothesis | measured living-state distributions |
| Vision | 64-ray planar retina into available visual populations | modeled periphery + BANC annotations | missing lamina/ocellar reconstruction and retinotopy |
| Olfaction/taste | body-relative fields and receptor/proxy populations | mixed annotation + model | receptor kinetics, damaged antennal pathways |
| Touch | six leg-local contact channels | physical model + body-part annotations | sensor-resolved receptive fields |
| Proprioception | 92 values with claw position, hook direction and club dynamic envelope; separate provisional GCaMP observation | measured FeCO response classes + source subtypes + engineering filters | resolve two DSI failures, preparation-fitted fluorescence and high-rate vibration carrier |
| Leg outputs | 391 motor neurons → 72 action + 30 unit channels + exact identified frame spike counts | explicit BANC class/action/target/unit annotations | resolve 95 generic flexors and audit transmitter identity |
| Motor excitability | separate spike and identified-population subthreshold evidence; frozen saturating bridge | zero-spike BANC diagnosis + adult slow-unit physiology + engineering fit | cell-specific motor-neuron conductances and direct validation |
| Femur–tibia muscle | normalized body transfer plus discrete spike-count probe-equivalent flexor force | front-leg motor experiments, publisher-figure-derived medians + engineering twitch/fatigue | raw-trace fit, absolute extensor force and internal tendon geometry |
| Probe-loaded joint | measured force lever arm, spring, mass and drag + model-derived tibia rod inertia | restrained front-leg preparation + pinned FlyGym morphology prior | free-joint inertia, tendon paths, tarsi and independent load validation |
| Body femur–tibia joint | constrained range/rest + antagonist force + passive spring/damper | front-leg coordinate + engineering mechanics | replace with articulated mass, moment arms and load-dependent kinematics |
| Steering | traction-gated bilateral DNa02/DNa01/DNg13 evidence; tonic leg-pool asymmetry cannot steer | named cells + measured bilateral/stride roles + engineering gain | spike recruitment and validated downstream muscle transfer functions |
| Gait | coordination-gated shared tripod-compatible 10–20 Hz clock; frequency × 1.68 mm/cycle × stance traction speed bridge | Mendes/Azevedo/Wosnitza constraints + engineering model | identified phasic start/stop populations, VNC CPG and local circuit dynamics |
| Obstacle response | local contact unloading and CNS sensory return; no private reverse/turn timer | physical contact + Israel ascending-to-MDN pathway constraint | represented MDN recruitment and articulated contact mechanics; current 30 s assay remains pinned |
| Live body | planar traction scaffold + one joint per leg; no hidden collision behavior selector | engineering model | remove phase/traction scaffold after neural force routing qualifies |
| Staged articulated mechanics | pinned NeuroMechFly 70-body/127-joint morphology, 42 position actuators, 39 meshes, free root, normalized room collision and six contact sensors in MuJoCo WASM; qualification only | published morphology/model + pinned engineering mechanics | one coherent free-root muscle/contact construction, validated neural gains, live afferent closure and evidence-supported active adhesion |
| Restrained muscle mechanics | separate anchored FlyMimic body with 15 anatomy-derived LF Hill MTUs/tendons and causal flexor/extensor moment arms; source and zero-safe profiles remain qualification only | X-ray attachment/path data + estimated/optimized physiology; 15 exact in-memory zero-floor edits | preparation-compatible excitation gain/timing, external load/contact validation and all-leg MTUs |
| FlyMimic/BANC bridge | two exact LF fast-flexor/FETi correspondences, identity-only; SETi excluded; gain/timing null and automatic control disabled | BANC root/type identity + FlyMimic actuator role; conflicts preserved | direct or independently constrained preparation-matched excitation and timing transfer |
| Body reconciliation | 64 comparison-only names; 2.435074809384× mass mismatch plus incompatible root, segmentation, frames, actuators and sensors; merge/transfer blocked | same-runtime compiled comparison | reconstruct one explicit body contract rather than averaging or splicing the two qualifications |
| Feeding/drinking | raw attempt, strong free-air probe and matching-contact-confirmed ingestion are distinct | mixed annotation + embodied contact model | proboscis biomechanics and ingestion circuits |
| Physiology | hunger, thirst, fatigue, sleep, stress variables | explicit model | endocrine/metabolic circuit dynamics |
| Memory | drifting body-relative cue into neural populations | explicit model | mushroom-body/CX plasticity in-network |
| Observer | camera, captions, neural field, ethogram | display only | none; must remain causally isolated |
| Consciousness | not inferred or tested | unknown | no accepted decisive test |

## Reading the matrix

“Measured” does not mean perfect. EM segmentation, synapse detection and annotations contain uncertainty. “Modeled” does not mean useless; it means the mechanism was supplied by software and must be validated independently.

The project's goal is to move rows from broad engineering models toward experimentally constrained mechanisms without hiding the remaining assumptions.
