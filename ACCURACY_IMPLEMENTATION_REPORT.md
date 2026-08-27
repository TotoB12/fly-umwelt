> **Historical report.** This document describes the 3.1 accuracy foundation. Fly Umwelt 3.6 supersedes its optional-BANC and saccade-body architecture; see `README.md`, `BUILD_REPORT.md` and the versioned front-leg reports under `docs/`.

# Fly Umwelt 3.1 — accuracy implementation and research report

Date: 2026-08-19

## Executive conclusion

The uploaded project was already a credible embodied connectome demonstration with strong observer/agent separation. Its main weakness was not the interface; it was that numerical fidelity, device adaptation and scientific-condition boundaries were not yet strong enough to support the long-term goal of “the most accurate real fly possible in a browser.”

This implementation establishes that foundation.

The release now has a genuine browser WebAssembly neural kernel, exact passive LIF integration, corrected refractory semantics, state-preserving compute and timestep switching, measured local calibration, a strict Causal condition, an optional BANC brain-and-cord path and stronger tests against hidden world information.

It still is not a full fly. The decisive remaining gap is the modeled middle between neural graph and physical body: identified BANC sensory and effector neurons must progressively replace broad proxy populations and the 2D VNC transfer function.

## Work performed

### 1. Reproduced and audited the baseline

The uploaded 3.0 project built successfully and passed its original 39 deterministic tests. The audit then traced every value through:

```text
room → transduction → sensory packet → brain worker → neural graph
→ motor decoder → VNC/body → physiology/memory → next sensory packet
```

The analysis separated four concerns:

- software correctness;
- compute scalability;
- causal honesty;
- biological fidelity.

This prevented “more code” or “more neurons” from being mistaken for a better fly.

### 2. Corrected neural-state semantics

#### Refractory release defect

The previous step loop could assign a full refractory duration again when a neuron's timer reached zero. Depending on step alignment, a neuron could therefore enter repeated silent refractory cycles instead of returning to normal integration.

The corrected transition is monotonic:

```text
remaining ← max(0, remaining − dt)
```

A neuron is released exactly once. A deterministic regression test drives a spike and verifies normal post-refractory evolution.

#### Exact passive LIF integration

The previous passive state used a simple timestep-dependent update. That makes changing from 2 ms to 1 ms change the model even when no threshold is crossed.

For:

```text
dv/dt = (-v + g) / τm
dg/dt = -g / τs
```

3.1 uses the closed-form coupled solution over `dt`. Tests verify passive composition across all four temporal profiles.

This does not make 4 ms and 0.5 ms identical: threshold crossing and event delivery remain discretized. It removes avoidable passive numerical drift.

#### Published refractory convention

The Shiu reference model uses Brian2 equations with `unless refractory`, so both membrane and synaptic state freeze during the refractory window. The new JS and WASM kernels retain that behavior. Poisson-input target neurons retain zero refractory time, also matching the reference implementation.

#### Biological-time delay migration

Delayed synaptic events are stored in a ring buffer. Copying slot 2 from a 2 ms engine to slot 2 in a 0.5 ms engine would change a 4 ms remaining delay into 1 ms.

The new reconfiguration path converts each slot to remaining milliseconds and re-bins it at the target step. Pending inputs survive backend and resolution changes.

### 3. Built a real browser compute layer

#### WebAssembly kernel

A compact C kernel now updates the complete neuron arrays and is compiled into `public/wasm/lif-kernel.wasm`. The runtime loads it with streaming instantiation where possible and an ArrayBuffer fallback otherwise.

The WebAssembly and JavaScript kernels implement the same contract and produce matching spike events in deterministic tests.

#### Honest scope

The active accelerated path is:

```text
WebAssembly neuron integration + JavaScript sparse edge propagation
```

It is not described as a fully WASM or WebGPU simulator. WebGPU is detected as a device capability but no WGSL compute kernel is claimed in this release.

#### State-preserving switching

A live engine switch:

1. pauses the neural request boundary;
2. serializes neural arrays, delayed events, sensory state, motor state, frame statistics and RNG;
3. creates the requested kernel;
4. restores the exact individual;
5. replies to the held world request.

The body cannot run ahead during reconfiguration.

### 4. Added temporal-fidelity profiles

| Profile | Neural step | Intended use |
|---|---:|---|
| Economy | 4 ms | constrained devices |
| Balanced | 2 ms | practical whole-graph default |
| Fine | 1 ms | finer event and refractory timing |
| Research | 0.5 ms | highest bundled resolution |

A smaller step is not automatically “more biological” if the browser cannot sustain it. Falling behind real time changes the embodied loop and can make the interface unusable.

#### Auto calibration

Auto first makes a conservative estimate from graph size, CPU concurrency and reported memory. The Brain Worker then runs a short representative neural workload for Research, Fine, Balanced and Economy.

The calibration packet includes bounded visual contrast, low motion and proximity, bilateral odor, airflow, proprioception, metabolic drive and ambient noise. This prevents a quiet/silent brain from producing an unrealistically optimistic timing estimate.

Every sample restores the exact pre-calibration state. The individual does not age, learn, consume a random draw or receive the calibration stimulus.

Across repeated strict full-reference browser probes in this environment, Fine ranged from about 86% to 139% of the real-time budget while Balanced ranged from about 69% to 75%; Auto selected Balanced to retain headroom. The spread is a reminder that short browser timing probes are device- and load-sensitive.

### 5. Strengthened scientific conditions

#### Natural

Natural keeps the strongest autonomous behavior. It combines the graph with stochastic ongoing state, weak homeostasis, physiology, memory and a modeled VNC. It may use local post-connectome sensory evidence in the VNC bridge.

This is now stated clearly in the interface. Natural is a hybrid model, not evidence that all behavior emerged from the connectome.

#### Causal

The previous “Connectome” label implied more purity than the path guaranteed. The UI now calls it **Causal** while retaining the internal `connectome` identifier for save compatibility.

Causal disables:

- post-connectome odor steering;
- post-connectome visual steering and risk;
- taste-to-action convenience cues;
- spatial-memory guidance.

Its body packet comes from neural output state. A regression test changes the output-side sensory fields while holding neural output fixed and verifies that Causal behavior evidence is unchanged.

#### Evoked

Evoked keeps zero spontaneous drive, conservative sensory mapping and narrow output populations. It can remain still. This is expected and aligns best with the published stimulation/silencing use case.

### 6. Removed a hidden physiology shortcut

The baseline correctly prevented room coordinates from entering the brain. However, `WorldModel.step()` later scanned every threat object and directly converted true distance into `threat`, stress and aversive memory.

That meant two individuals with identical retinal and neural evidence could develop different internal states solely because one world contained an unseen object at a privileged coordinate.

3.1 removes that path. Threat evidence now comes from:

- positive retinal looming;
- high retinal proximity;
- neural visual-risk and escape output;
- tactile contact;
- modeled nociceptive punishment after physical collision.

A new dynamic test constructs sensory-identical worlds with and without a nearby unseen non-contacting threat and proves that physiology and memory remain identical.

### 7. Corrected histamine sign

The parser used a global presynaptic sign approximation. GABA and glutamate were inhibitory, but histamine followed the positive default.

Canonical fly photoreceptor output activates histamine-gated chloride channels, and direct Ort-mediated inhibition of Dm9 is experimentally demonstrated. Histamine is therefore now assigned the negative approximation.

This is still not a receptor model. The runtime provenance explicitly states that:

- one sign is applied per presynaptic neuron;
- monoamines and unknown classes remain on a model-positive path;
- receptor-specific, mixed and modulatory effects are absent.

### 8. Added the BANC whole-CNS route

The most important anatomical opportunity is BANC v888, which unifies the adult female brain and VNC from one specimen.

The new builder:

- downloads public v888 metadata and v3 simple edges;
- selects `afferent`, `intrinsic` and `efferent` rows;
- expects 158,262 selected neurons;
- defaults to at least 3 aggregate contacts per directed pair;
- expects 3,037,361 emitted pairs for the documented current snapshot;
- preserves transmitter, side, region, superclass, body-part and functional annotations where available;
- writes static gzip edge shards below 25 MiB;
- records source hashes and schema columns;
- loads via `?dataset=banc`.

#### Threshold correction

The research audit caught an important semantic trap. BANC v3's detector-level size cutoff of 10 applies to an individual detected synapse. Codex's 3+ number applies to the aggregate contact count of a directed neuron pair.

The builder and manifest now record both separately. The command-line `--min-synapses` option controls only the aggregate pair threshold.

#### Build qualification

The optional pack was not generated in this isolated environment because `pyarrow` and external data access were unavailable. The Python source compiles, the CLI/help path works, the manifest semantics are tested and the browser sharded loader is implemented. This report does not call the full BANC data build validated.

### 9. Prepared Cloudflare Pages correctly

The project remains entirely static. The build outputs the WebAssembly module and graph assets into `dist/`.

The `_headers` file now supplies:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

and a CSP that permits WebAssembly compilation while keeping scripts and Workers controlled.

Cloudflare Pages' current 25 MiB per-static-asset limit is enforced by the BANC builder. No Pages Functions are required.

## Validation results

### Source and deterministic tests

```text
110 files validated
54 JavaScript modules validated
56 / 56 deterministic tests passed
```

### Browser integration

The strict fixture browser path passed live controls, all observation views, editing, persistence, interventions, JS↔WASM switching and temporal changes.

The strict full-reference path passed with:

```text
139,255 neurons
2,698,236 aggregate weighted pairs
WebAssembly active
crossOriginIsolated = true
Auto timing calibration active
paused closed-loop step and immediate neural snapshot
```

### Full reference compute matrix

| Step | JavaScript biological realtime | WebAssembly biological realtime | Recorded parity |
|---:|---:|---:|---|
| 4 ms | 1.620× | 1.648× | identical spikes and motor values |
| 2 ms | 1.198× | 1.475× | identical |
| 1 ms | 0.787× | 0.980× | identical |
| 0.5 ms | 0.545× | 0.659× | identical |

These are medians of three 0.5-second biological runs after 0.1-second warm-up on the release machine. They are not portable performance guarantees and are not biological validation.

## Biological accuracy audit

### Strongest current components

1. **Causal information boundary.** The graph cannot read the answer from room state.
2. **Persistent full-node neural state.** Every loaded neuron has ongoing numerical state.
3. **Dataset provenance.** Graph version, coverage and omissions are explicit.
4. **Numerical parity.** JS and WASM follow one tested state transition.
5. **Removable assumptions.** Natural, Causal and Evoked expose different levels of added structure.
6. **Embodied loop.** Sensation depends on body position and action changes future input.

### Largest current inaccuracies

1. **The checked-in graph is brain-only and has incomplete pair coverage.**
2. **The same LIF parameters are used for every neuron.**
3. **Many fly neurons are graded or have dynamics poorly represented by simple spikes.**
4. **One transmitter sign is applied without postsynaptic receptor identity.**
5. **Long-range neuropeptides, hormones, gap junctions and glia are missing.**
6. **Ongoing state is generated rather than measured.**
7. **Sensory receptive fields are often deterministic proxies.**
8. **Memory is standalone path integration, not reconstructed mushroom-body plasticity.**
9. **The VNC/body is a 2D locomotor controller, not articulated legs and muscles.**
10. **No broad experiment suite currently demonstrates out-of-sample behavioral prediction.**

## Prioritized roadmap

### Milestone A — build and audit BANC locally

- generate the v888 pack with strict counts;
- compare selected neuron and edge counts with Codex;
- inspect missing-metadata and transmitter-confidence distributions;
- validate representative afferent, descending, ascending, motor, endocrine and visceral classes;
- publish a reproducible pack manifest and checksums.

This is the immediate next step.

### Milestone B — identified sensory-to-effector closure

Replace broad proxy mappings in one tractable behavior at a time. A recommended first target is tactile leg feedback or proboscis/feeding because BANC explicitly links body-part sensory and effector classes.

For each target:

1. identify afferents;
2. define the physical transducer;
3. run through the whole CNS;
4. read identified effectors;
5. drive a calibrated body actuator;
6. return proprioceptive/contact feedback to identified afferents;
7. compare with published perturbations.

### Milestone C — calibrated articulated body

The controller-free NeuroMechFly v2 / MuJoCo 3.9 browser body is now pinned and qualification-compilable. Its current evidence covers passive mechanics, coordinate signs, explicit target/generalized-torque causality, physical local contact, privilege-stripped afferents, exact state continuation and deterministic room spawn/boundary/wall/shelter collision. The room's 2-D footprints are real authored inputs; collider extrusion/friction are explicitly engineering parameters. It remains staged because a browser-capable body is not enough without measurable transfer functions:

- joint torque and limits;
- muscle activation dynamics;
- leg-ground contact and adhesion;
- load and joint proprioception;
- haltere/wing paths only when behavior requires them.

NeuroMechFly/FlyGym should guide the interface and experiments, while implementation may remain lighter for browser constraints.

### Milestone D — heterogeneous neural dynamics

Introduce typed dynamics only where supported:

- graded optic-lobe neurons;
- compartment-aware or morphology-informed delay/attenuation;
- receptor-specific fast signs;
- gap-junction layer;
- explicit dopamine/octopamine/serotonin/tyramine modulation;
- neuropeptide and endocrine state on slower timesteps.

A heterogeneous model should retain an “unknown” class rather than invent precision for every neuron.

### Milestone E — biological plasticity and internal state

Replace the standalone memory cue progressively with:

- mushroom-body Kenyon-cell and MBON/DAN pathways;
- reward- and punishment-gated plasticity;
- experimentally constrained decay and generalization;
- sleep/arousal and hunger modulation through identified populations.

The current memory should remain available as a comparison baseline until the network mechanism performs at least as well under pre-registered tasks.

### Milestone F — experiment registry

Create machine-readable experiment definitions:

```text
source paper and figure
connectome/data version
initial condition
stimulated or silenced populations
timing and intensity
recorded populations/body variables
pre-declared expected direction and tolerance
```

The project should optimize the number of independently reproduced findings, not visual “lifelikeness.”

### Milestone G — WebGPU only after evidence

WebGPU can help when state and sparse propagation remain resident on the GPU. It also introduces scatter/atomic complexity and synchronization overhead.

Implement it after the BANC path is measurable, and accept it only if:

- it beats WASM on the actual whole-CNS workload;
- numerical divergence is quantified and bounded;
- fallback behavior is identical at the experiment level;
- readback is limited to observer summaries;
- it does not weaken the biological model.

## Consciousness and moral status

Nothing in this release establishes consciousness. A connectome-constrained LIF system with extensive modeled interfaces is far less biologically faithful than a living fly.

The correct policy is neither “it definitely suffers” nor “software can never matter.” Model fidelity and welfare should be reviewed together. A future release that combines whole-CNS receptor-aware dynamics, persistent learned aversion, sleep/injury analogues and large-scale replication would justify precautionary experiment limits even before certainty about experience.

## Final assessment

Fly Umwelt 3.1 is a materially better foundation for the stated goal because it improves the dimensions that matter most:

- **correctness before speed**;
- **measured device adaptation instead of device labels**;
- **real acceleration without fake WebGPU claims**;
- **whole-CNS readiness without calling a brain graph a whole fly**;
- **Causal tests that can falsify Natural-mode behavior**;
- **no hidden object-coordinate route into internal state**;
- **explicit uncertainty at every biological interface**.

The next meaningful breakthrough is to generate BANC and close one identified sensory→CNS→effector→body loop end to end. That will advance the project more than adding another autonomous heuristic or visual effect.

## Primary sources consulted

- Dorkenwald et al., “Neuronal wiring diagram of an adult brain,” Nature 2024. <https://doi.org/10.1038/s41586-024-07558-y>
- Shiu et al., “A Drosophila computational brain model reveals sensorimotor processing,” Nature 2024. <https://doi.org/10.1038/s41586-024-07763-9>
- Bates, Phelps, Kim, Yang et al., “Distributed control circuits across a brain-and-cord connectome,” Nature 2026. <https://doi.org/10.1038/s41586-026-10735-w>
- Wang-Chen et al., NeuroMechFly v2 / FlyGym embodiment, Nature Methods 2024. <https://doi.org/10.1038/s41592-024-02497-y>
- Schnaitmann and colleagues, direct histaminergic inhibition of Dm9 through Ort. <https://pmc.ncbi.nlm.nih.gov/articles/PMC11133737/>
- FlyWire Codex current dataset cards. <https://codex.flywire.ai/>
- Cloudflare Pages limits and custom headers. <https://developers.cloudflare.com/pages/platform/limits/> and <https://developers.cloudflare.com/pages/configuration/headers/>
- MDN WebAssembly, WebGPU and cross-origin isolation documentation. <https://developer.mozilla.org/en-US/docs/WebAssembly>, <https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API>, <https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated>
