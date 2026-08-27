# Fly Umwelt 3.5 — historical peripheral-loop implementation report

> Historical record: this report captures the qualified 3.5 state before the 3.6 exact-protocol and spike–force work. It is retained to prevent retrospective rewriting. For the current release, see `README.md`, `BUILD_REPORT.md`, `docs/FRONT_LEG_VALIDATION_3_6.md` and `docs/FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md`.

## Executive conclusion

Version 3.5 builds on the whole-CNS causal correction by turning the first joint-level loop into a falsifiable, experimentally constrained model. The decoder exposes 72 leg/action channels plus 30 femur–tibia unit channels. Finite-time muscle recruitment drives the antagonist joint, and stateful FeCO claw/hook/club signals return through source populations.

The new release bundles an audited 155,855-neuron BANC organism, exposes three structural graph tiers, maps six leg motor pools, removes hidden forward motion and stochastic saccades, and requires identified leg-effector activity for traction. It remains a fully static browser app suitable for Cloudflare Pages.

This is not a complete digital fly. The largest remaining gaps are independent raw-trace validation, resolution of generic motor/sensory identities, and force-based neural integration of the newly pinned articulated body so it can replace the transitional phase/traction scaffold.

## 1. Failure diagnosis

The original spiral was produced by several mechanisms:

1. Natural mode added a constant locomotor floor independent of leg-motor activity.
2. A stochastic saccade clock periodically rotated the body even without bilateral CNS asymmetry.
3. Loose output text matching interpreted `haltere` as `halt`, creating a false 461-cell brake population in the old pack.
4. A flow-field neuron filter admitted explicit glia, trachea, debris and `NOT_A_NEURON` objects.
5. Missing verified transmitter values could suppress available predicted evidence.
6. Raw aggregate contact counts were treated as direct synaptic weights, destabilizing heavily innervated targets.
7. Broad descending activity was allowed to create forward force, so the leg-motor graph could remain nearly irrelevant.

Version 3.3 fixed each cause and added a regression test for the corresponding invariant. Version 3.5 preserves those gates.

## 2. Audited organism boundary

The current public source tables contain 188,508 metadata objects. The builder selects 155,855 neuronal objects using proofreading state, explicit non-neuronal exclusions and `IS_REAL_NEURON` overrides.

```text
metadata rows                         188,508
proofread or roughly proofread        156,012
explicit non-neuronal candidates          170
IS_REAL_NEURON overrides                   13
excluded non-neuronal objects              157
simulated neuronal objects             155,855
```

The source file hashes are pinned in the manifest. The difference from the paper's strict 155,916 total is preserved as provenance; the paper itself notes proofread marks added to the public metadata after the strict snapshot.

## 3. Structural graph tiers

```text
Core      1,912,731 pairs  ≥5 contacts
Balanced  3,730,893 pairs  ≥3 contacts cumulative
Maximal  13,366,470 pairs  ≥1 contact cumulative
```

The source contains 13,620,865 aggregate rows. 254,395 rows are skipped because at least one endpoint is outside the selected neuronal set.

Every stored value is `count / target total input`. The browser applies a disclosed recurrent gain and a conservative fast transmitter channel.

## 4. Direct six-leg output

The conservative parser resolves 391 rows whose explicit BANC class is `leg_motor_neuron`:

```text
LF 69   LM 63   LH 63
RF 70   RM 63   RH 63
```

It also resolves one left and one right cell for DNa01, DNa02 and DNg13 in the current source. The exact halt population is zero.

Those rows preserve 68 cell types, 17 peripheral targets and 12 action labels. The decoder outputs six broad leg drives, a stable 72-channel `[leg][action]` array, a stable 30-channel `[leg][unit]` supplement, and separate steering/coordination evidence. The pinned unit mapping resolves 1 slow flexor, 95 unresolved flexors, 5 fast flexors and 6 each of SETi/FETi. Descending coordination can run a gait clock but cannot create force.

## 5. Six-leg planar plant

Each leg carries phase, amplitude, stance, load, lift, retraction, contact, body-local foot position and femur–tibia angle/velocity. Source-resolved evidence or the action fallback recruits slow/intermediate/fast flexor and slow/fast extensor activation. The model enforces fast/intermediate gating, finite response, measured relative force scale and zero active force without evidence. Passive mechanics and the 18–180° preparation range bound the joint. The visible leg drawing uses the same foot state.

Contact is local. A foot can contact an obstacle before the body does. Contact unloads that leg and returns through the ordinary sensory packet; it does not start a private reverse/turn reflex, preserve or alternate an escape side, or receive an ideal escape vector. Reverse and steering must return from represented neural outputs. The current long-horizon Balanced-BANC assay therefore remains pinned when MDN-related output is not recruited.

The body remains planar and partially articulated. Its force-to-angle mechanics, fatigue and passive parameters are engineering values; it does not yet model anatomical muscle/tendon geometry, the other joints, adhesion, mass distribution or 3-D terrain. Front-leg constraints are structurally extrapolated to five other legs.

## 6. Proprioceptive return

The body emits 92 values: body forward/yaw state plus femur–tibia angle/velocity, eight gait/contact fields and five FeCO fields per leg. Claw represents tonic position, hook phasic direction and club a bidirectional movement/impact envelope. Articulated 62-value and legacy 50-value inputs remain supported.

The pinned audit finds 5,214 explicitly leg-assigned afferents and 5,302 mapped after conservative inference, including 162 claw, 142 hook and 341 club roots. Generic BANC claw/hook annotations do not justify signed root identities, so the runtime uses a disclosed unsigned maximum-of-polarities fallback. The 100 Hz loop does not synthesize the measured 100–2,000 Hz club carrier.

## 7. Validation

The historical 3.5 release passed:

- 78 deterministic tests;
- frozen-source calibration consistency and preregistered constraint checks;
- static source and accessibility validation;
- all 35 BANC shard hashes and records;
- actual Core and Balanced closed-loop dynamics;
- JS/WASM parity;
- causal behavior diagnostics;
- synthetic stress and static build.

In symmetric five-second BANC runs, Core and Balanced both remain almost straight, with no saturation and low output conflict. Balanced mean straightness is 0.999997 and maximum absolute net rotation is 0.6766° across seeds 1–3.

Those measurements protect against persistent circling. They do not validate absolute gait, speed or firing rate.

## 8. Performance

On the development machine, Balanced runs at about 2.67× real time at 2 ms and 2.11× at 1 ms using WebAssembly. The Maximal graph completed a 2 ms probe at about 1.60×. Results are hardware-specific.

## 9. Static delivery

The production site contains all BANC tiers, metadata, rooms, source modules and the LIF WASM binary. No visitor-side Python, external account, Pages Function or server simulation is needed.

## 10. Next sequence

1. validate the frozen loop against independent raw force, kinematic and afferent traces;
2. continue the 260-row GABA audit and resolve generic motor/sensory identities only with evidence;
3. **completed foundation:** vendor and mechanics-qualify a pinned controller-free browser-local articulated fly body;
4. validate motor-unit/muscle/tendon force routing and body-derived afferent closure before making that body live;
5. map all supportable action classes and physical joint/contact/force feedback while preserving unresolved channels;
6. compare neural and kinematic outputs with independent experiments;
7. then add heterogeneous, receptor-aware and graded dynamics;
8. add WebGPU only after experiment-level parity is demonstrable.

NeuroMechFly's MuJoCo-WASM implementation is now pinned, bundled and compiled as a qualification-only 70-body profile. No upstream gait/controller code is included. The next integration must replace explicit position-target probes with BANC-derived motor-unit/muscle/tendon force rather than wrapping another scripted locomotor layer around the graph.

## 11. Ethical boundary

Nothing in this release establishes life, pain, welfare or consciousness. The project should periodically reassess moral uncertainty as dynamical and functional fidelity rises, but should not turn current engineering competence into a sentience claim.
