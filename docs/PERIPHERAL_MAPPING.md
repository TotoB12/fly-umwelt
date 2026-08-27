# Peripheral mapping audit

## Purpose and claim boundary

This document records how the pinned BANC annotations become browser data structures and where measured anatomy ends. It distinguishes three layers:

1. **Annotation-derived identity:** neuron, leg, action label, motor-unit class, peripheral target, sensory/FeCO subtype and uncertainty flag.
2. **Experimentally constrained transfer:** recruitment order, discrete spike-count force, response time, probe lever/load, joint coordinate range and FeCO response class.
3. **Engineering transfer:** normalized body thresholds, activity smoothing, fatigue, transitional passive mechanics, morphology-derived inertia and Poisson gain.
4. **Experimental validation:** exact protocols and an experiment-specific observation bridge exist, but two DSI failures and raw-trace/free-load gaps remain. A passing code test establishes only its declared scope.

The exact counts below belong to the hashes in `public/data/banc/manifest.json`. A rebuilt source snapshot may legitimately change them and must trigger review.

## Pinned BANC inventory

The conservative motor boundary requires `class == leg_motor_neuron`; adjacent broadly motor-labelled classes are not silently included.

| Item | Pinned count |
|---|---:|
| Explicit leg motor neurons | 391 |
| Motor cell types | 68 |
| Peripheral target labels | 17 |
| Mapped motor action rows | 391 |
| Motor action labels | 12 |
| Stable leg/action channels | 72 |
| Stable femur–tibia unit channels | 30 |
| Explicitly leg-assigned afferents | 5,214 |
| Total afferents mapped after conservative inference | 5,302 |

The earlier working estimate of 5,188 leg afferents was not reproduced by the pinned-table audit and is superseded by the explicit/mapped distinction above.

## Motor action dictionary

The runtime preserves the BANC `function_detailed` vocabulary:

| Runtime ID | Source label | Current physical use |
|---|---|---|
| `coxaTrochanterExtend` | `extend_coxa_trochanter_joint` | preserved only |
| `femurTibiaExtend` | `extend_femur_tibia_joint` | joint extensor |
| `tibiaTarsusExtend` | `extend_tibia_tarsus_joint` | preserved only |
| `coxaTrochanterFlex` | `flex_coxa_trochanter_joint` | preserved only |
| `femurTibiaFlex` | `flex_femur_tibia_joint` | joint flexor |
| `tibiaTarsusFlex` | `flex_tibia_tarsus_joint` | preserved only |
| `coxaAnterior` | `move_coxa_anterior` | preserved only |
| `coxaMedial` | `move_coxa_medial` | preserved only |
| `coxaPosterior` | `move_coxa_posterior` | preserved only |
| `coxaPosteriorLateral` | `move_coxa_posterior_lateral` | preserved only |
| `longTendonPull` | `pull_long_tendon` | preserved only |
| `unknownLegMovement` | `unknown_leg_movement` | preserved, never assigned a direction |

The motor packet is a flat `[leg][action]` array ordered by `LEG_IDS` and `LEG_MOTOR_ACTION_SPECS`. This representation is stable across Workers and save files. Only the femur–tibia antagonist pair currently affects a joint; the other channels must not be described as simulated muscles yet.

## Femur–tibia unit supplement

The v2 peripheral atlas retains five supplemental classes per leg. The flat `[leg][unit]` packet is stable, but source populations may legitimately be empty:

| Unit class | Pinned rows | Runtime interpretation |
|---|---:|---|
| `flexorSlow` | 1 | explicit `accessory_tibia_flexor_A_slow` annotation |
| `flexorUnresolved` | 95 | generic and accessory flexors lacking a justified physiological class |
| `flexorFast` | 5 | explicit `tibia_flexor_Fast` annotation |
| `extensorSlow` | 6 | explicit SETi annotation |
| `extensorFast` | 6 | explicit FETi annotation |

The unresolved flexor ensemble is decomposed by the engineering recruitment transfer into slow and intermediate commands. That modeled intermediate command is not claimed to be a source-authored motor-neuron identity. Fast source activity is gated unless intermediate recruitment is concurrently present or occurred within the previous 30 ms.

## Afferent modality dictionary

Each mapped afferent receives a bit mask, so overlapping source annotations remain inspectable rather than forced into one class.

| Modality | Pinned mapped rows | Present physical input |
|---|---:|---|
| tactile | 4,348 | local contact |
| proprioception, broad | 1,167 | amplitude/body-yaw proxy |
| joint angle | 501 | modeled femur–tibia angle and FeCO claw state |
| movement direction | 157 | modeled joint direction and FeCO hook state |
| vibration | 421 | FeCO club movement/impact envelope |
| strain | 69 | stance/load proxy |
| nociception | 36 | annotation preserved; no dedicated transducer yet |
| gustatory | 900 | annotation preserved; leg taste transducer not yet separated |

Counts overlap because a row can carry multiple modality bits. The present Poisson rates are explicit non-negative transfer functions, not reconstructed spike tuning.

### FeCO source populations

| Leg | Claw | Hook | Club |
|---|---:|---:|---:|
| LF | 27 | 27 | 59 |
| LM | 34 | 20 | 53 |
| LH | 38 | 22 | 56 |
| RF | 25 | 26 | 47 |
| RM | 13 | 23 | 55 |
| RH | 25 | 24 | 71 |

The front-leg total is 52 claw, 53 hook and 106 club roots. These counts are exact parser results for the pinned BANC table, not estimates of the complete biological organ. The generic BANC labels do not supply a defensible signed split: all pinned `legClawFlexion*`, `legClawExtension*`, `legHookFlexion*` and `legHookExtension*` populations are therefore empty. The runtime uses explicit unsigned maximum-of-polarities routing and records it in its stimulation labels. It never partitions roots by ID or array position.

## Side resolution and uncertainty

Explicit `side` wins. Nerve side is used only when explicit side is missing. The runtime stores four uncertainty bits per motor neuron:

| Bit | Meaning | Pinned rows |
|---:|---|---:|
| 1 | `LR_TYPE_CONFLICT` | 167 |
| 2 | source `SIDE_CONFLICT` or side/nerve disagreement | reported by validator |
| 4 | unresolved `TRACING_ISSUE` | reported by validator |
| 8 | missing transmitter evidence | 26 |

There are 188 unique motor rows with one or more flags. Flags can overlap, so their sum is not the uncertainty union.

## Transmitter problem

The source calls for the 391 motor rows are:

| Call | Rows |
|---|---:|
| GABA | 260 |
| acetylcholine | 81 |
| glutamate | 11 |
| modulatory | 13 |
| unknown | 26 |

This is in tension with adult leg neuromuscular evidence and may reflect annotation semantics, prediction limitations or a biological distinction not captured by a direct-muscle interpretation. The project preserves these calls for the CNS fast-sign model. Peripheral action sign comes from the annotated effector and experimental motor role; predicted GABA is not treated as inhibitory action on the named muscle. A future audit must compare root IDs, neuromuscular targets and experimental transmitter evidence; it must not overwrite the source merely to make the model move.

## Current joint bridge

For each leg, source-unit evidence or the stable action fallback recruits finite-time normalized flexor/extensor activation. The model preserves slow → intermediate → fast order and blocks isolated fast commands. A passive spring/damper returns the transitional body joint toward 90°, and the 18–180° preparation range bounds the angle. Smaller angle means flexion.

Separately, exact identified frame spikes feed the 3.6 restrained-probe bridge. It supplies absolute probe-equivalent slow/fast flexor force, torque at the measured external lever arm, measured probe loading and body-derived FeCO state. Unresolved flexors and extensors retain no absolute-force claim. Tendon geometry, free-load mechanics, force–length curves and substrate loading remain unfitted. Zero neural evidence always produces zero **active** force; passive force may remain if displaced. Full provenance is in `FEMUR_TIBIA_CALIBRATION.md` and `FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md`.

## Remaining calibration experiment

Version 3.6 freezes exact protocols, the historical 3.5 baseline, the current response refinements and the spike–force bridge. The next defensible step is to evaluate the frozen parameters against independent raw kinematic, force and afferent traces without per-trial retuning:

- stimulus or perturbation protocol;
- expected flexion/extension sign and latency;
- joint-angle and velocity measurement units;
- neural output and afferent response windows;
- parameters fitted on one condition;
- held-out conditions used for validation;
- failure criteria that prohibit per-experiment retuning.

Relevant anchors include the adult leg motor reconstruction, motor-unit size principle, premotor organization and leg proprioceptive pathway studies listed in `docs/RESEARCH_AUDIT.md`.
