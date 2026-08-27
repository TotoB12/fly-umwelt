# Front-leg femur–tibia calibration

## Scope

Version 3.6 keeps the normalized body actuator from 3.5 and adds an experiment-specific absolute observation bridge for one adult *Drosophila melanogaster* front-leg femur–tibia preparation. The implementation remains narrower than a full leg: it covers recruitment, a restrained-probe spike/force/load model, bounded transitional body state and FeCO claw/hook/club transduction.

The public sources are `public/data/calibration/front-leg-femur-tibia.json` and `front-leg-spike-force-bridge-v1.json`. Browser-safe frozen constants are in `src/core/leg-calibration.js`. `npm run calibration:leg` checks the normalized transfer; `npm run bridge:leg` checks the discrete-spike absolute observation bridge. The scientific subsystem remains the frozen 3.6 model; `front-leg-spike-force-bridge-3.8.0.json` records its unchanged qualification under the current release identity, while the 3.5–3.7 artifacts remain historical.

## Evidence boundary

| Model element | Status | What is justified | What is not justified |
|---|---|---|---|
| Joint coordinate | measured preparation boundary | decreasing angle is flexion; controlled range 18–180°; approximately 90° rest | a hard anatomical limit for every fly and load |
| Walking range | reported observation | approximately 40–120° during straight walking | a published fitted distribution; the paper marks this observation unpublished |
| Flexor recruitment | measured | slow → intermediate → fast; fast accompanies intermediate | the normalized 0.08/0.32/0.70 thresholds |
| Slow/intermediate relation | measured with context | intermediate can occur without an immediately preceding slow spike in 110/3,082 events during rapid unloaded movement | permission to ignore the recruitment hierarchy in general |
| Spike-count flexor force | measured scalars + publisher-figure-derived medians | slow slope, fast/intermediate one-spike scale and 1.6× two-spike summation in the restrained probe preparation | raw-recording precision, unresolved-unit relabeling or free-walking force |
| External probe torque | measured lever arm | torque implied by measured force at `417 ± 7 µm` | internal tendon moment arm or tendon force |
| Loaded observation joint | measured probe spring/mass/drag + model-derived tibia inertia | deterministic restrained-preparation motion and force reconstruction | measured free-joint inertia, tarsal load or walking contact |
| Intermediate/fast response | measured | approximately 8.5 ms half-force time | identical kinetics across every unit, load and leg |
| Slow response | measured qualitative constraints | no peak within 500 ms; release effect on approximately 100 ms scale | the chosen single-exponential time constants as a unique fit |
| FeCO claw | measured response class | tonic position encoding, flexion/extension tuning and history dependence | a root-specific goniotopic map from generic BANC labels |
| FeCO hook | measured response class | phasic flexion/extension direction classes | a signed split of roots whose BANC labels are unsigned |
| FeCO club | measured response class | bidirectional motion/vibration; velocity response peaks near 400°/s | a 100–2,000 Hz carrier or tonotopic frequency code at 100 Hz runtime |
| Transitional body mechanics | engineering | stable, bounded browser joint | measured free-walking inertia, stiffness, damping, moment arms or force–length curve |
| GCaMP6f observation | engineering constrained by reported timing | direction-neutral filtering/saturation and exact 8.01 Hz sampling | preparation-specific fluorescence, driver overlap, noise or baseline |
| Fatigue | engineering | bounded activity-dependent weakening and recovery | a fit to a named motor unit or protocol |
| Other five legs | extrapolated | identical data schema and causal mechanism | experimentally calibrated middle/hind or contralateral parameters |

## Motor-unit mapping

The parser preserves source identity instead of assigning every femur–tibia motor neuron to a physiological class:

```text
accessory_tibia_flexor_A_slow → flexorSlow
tibia_flexor_Fast            → flexorFast
remaining flexors            → flexorUnresolved
tibia_extensor_SETi          → extensorSlow
tibia_extensor_FETi          → extensorFast
```

The pinned BANC pack contains 1 / 95 / 5 / 6 / 6 rows in those classes. Empty per-leg classes remain empty. Generic unresolved flexor evidence is decomposed into modeled slow and intermediate recruitment; this does not turn “intermediate” into a source annotation.

For aggregate drive `d`, unit command is a bounded linear ramp:

```text
command(d; threshold, width) = clamp01((d - threshold) / width)
```

The frozen thresholds are 0.08, 0.32 and 0.70 with width 0.18. These are engineering values. Fast command is set to zero unless intermediate command is at least 0.42 now or was so within the previous 30 ms. This encodes the strong fast/intermediate constraint while allowing the documented intermediate-without-immediately-preceding-slow events.

Activation uses an exact exponential approach for each body step:

```text
a(t + dt) = a(t) + (target - a(t)) × (1 - exp(-dt / tau))
```

Intermediate and fast rise time constants are 12.3 ms, producing a 8.6 ms discretized half-response in the 0.1 ms validator. Relative flexor force gains are 0.01, 0.1 and 1.0. The slow rise/release constants (348/43.4 ms), extensor gains, fatigue and recovery are disclosed model choices informed by qualitative/scale constraints, not direct curve fits.

No spontaneous muscle tone is injected. With no neural evidence, active flexor and extensor force are exactly zero. A displaced joint can still experience passive restoring force.

## Discrete spike and restrained-probe bridge

The brain engine preserves exact per-frame spike counts for resolved BANC motor-unit populations. The plant consumes each frame once. Resolved slow/fast counts feed a separate observation path; unresolved flexor spikes remain visibly unresolved and absolute extensor force is unavailable.

Slow additional-spike force is `0.013 n µN`. Fast/intermediate force uses `F(n) = F₁(1 − 0.6ⁿ)/(1 − 0.6)`, with publisher-figure-derived one-spike medians of `7.0382 µN` and `0.3687 µN`. Multiplication by the measured external probe lever arm supplies experiment-specific joint torque. The measured probe load is integrated at 0.1 ms, and only resulting physical angle/velocity enters FeCO. See `FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md` for equations, hashes and claim boundaries.

## FeCO transfer

Joint angle is represented relative to the 90° boundary and carried as separate non-negative channels. Claw approaches a flexion or extension position target with a small disclosed history term. Hook approaches a signed direction target whose magnitude saturates with speed. Club uses a bidirectional speed envelope:

```text
u = |velocity| / 400°s⁻¹
movement envelope = clamp01(u × exp(1 - u))
```

Contact changes contribute a low-rate impact envelope. This term helps represent dynamic peripheral evidence but is not a vibration waveform.

The pinned source populations are:

| Leg | Claw | Hook | Club |
|---|---:|---:|---:|
| LF | 27 | 27 | 59 |
| LM | 34 | 20 | 53 |
| LH | 38 | 22 | 56 |
| RF | 25 | 26 | 47 |
| RM | 13 | 23 | 55 |
| RH | 25 | 24 | 71 |

BANC supplies no signed claw/hook identity for these generic roots. The brain therefore sends the maximum modeled polarity into the exact unsigned population and labels the route `unsigned`. It uses separate signed populations only if a future source explicitly provides them. No root-ID parity or array-position split is allowed.

## Frozen validation gates

The calibration validator checks:

- constants and public JSON agree numerically;
- slow, intermediate and fast recruit in order;
- fast begins no earlier than 0.70 aggregate drive;
- isolated fast source evidence produces zero command;
- intermediate-accompanied fast evidence passes;
- fast activation reaches half response within 0.4 ms of 8.5 ms;
- zero neural evidence gives exactly zero active force;
- claw polarities oppose one another;
- hook distinguishes 180°/s flexion and extension ramps;
- club responds to both ramp directions;
- a triangular drive recruits and releases fast activation;
- matched six-leg histories remain equal to `1e-12`;
- save/restore produces an exact next state with active muscle and FeCO filters.

These gates falsify implementation drift and several biological contradictions. The absolute bridge qualifies a restrained-probe observation, not walking kinematics or internal tendon mechanics. Independent raw traces, free-joint geometry/load, preparation-specific GCaMP calibration and the two failed DSI metrics remain the next evidence gates.

## Primary sources

- Azevedo et al., “A size principle for recruitment of Drosophila leg motor neurons,” *eLife* (2020), <https://doi.org/10.7554/eLife.56754>. Data: <https://doi.org/10.5061/dryad.76hdr7stb>. The approximately 48.8 GB raw repository is referenced, not vendored.
- Mamiya et al., “Neural Coding of Leg Proprioception in Drosophila,” *Neuron* (2018), <https://doi.org/10.1016/j.neuron.2018.09.009>.
- Chen et al., “Functional architecture of neural circuits for leg proprioception in Drosophila,” *Current Biology* (2021), <https://doi.org/10.1016/j.cub.2021.09.035>.
- Phelps et al., “Reconstruction of motor control circuits in adult Drosophila using automated transmission electron microscopy,” *Cell* (2021), <https://doi.org/10.1016/j.cell.2020.12.013>.
- Lesser et al., “Synaptic architecture of leg and wing premotor control networks in Drosophila,” *Nature* (2024), <https://doi.org/10.1038/s41586-024-07600-z>.
