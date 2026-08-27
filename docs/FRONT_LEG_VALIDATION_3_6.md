# Front-leg experimental validation — version 3.6

## Outcome

Version 3.6 adds the first exact-protocol, independently scored experiment layer around Fly Umwelt’s existing femur–tibia loop. The unchanged 3.5 model passed 8 of 13 designated held-out observations and was falsified on five. Three response-shape defects were then corrected from primary-study evidence; the current model passes 11 of 13. Two direction-selectivity discrepancies remain visible. A separate experiment-specific bridge now resolves the three Azevedo spike/force observations without claiming free-walking tendon mechanics.

This is progress toward quantitative validation, not completion of the limb-loop phase. The release does not claim that the provisional indicator output is preparation-fitted GCaMP6f fluorescence, that probe torque reveals tendon moment arms, or that a front-leg preparation calibrates the other five legs.

## Artifacts

| Artifact | Purpose |
|---|---|
| `public/data/calibration/front-leg-validation-v1.json` | protocols, source facts, uncertainty, observation models, immutable 3.5 fit/held-out split and failure rules |
| `src/core/leg-validation.js` | browser-safe protocol generators, FeCO experiment runner and metrics |
| `docs/benchmarks/front-leg-validation-baseline-3.5.0.json` | frozen pre-refinement baseline |
| `docs/benchmarks/front-leg-validation-3.6.0.json` | current result, including failures, expected limitation and context records |
| `public/data/calibration/azevedo-force-figure4d-v1.json` | compact CC BY publisher-figure-derived force envelopes |
| `scripts/digitize_azevedo_figure4d.py` | optional reproducible figure-coordinate extractor; not used by the browser build |
| `scripts/validate_leg_experiments.mjs` | evidence/report drift gate |
| `public/data/calibration/front-leg-spike-force-bridge-v1.json` | reported force/probe facts, morphology prior, equations and claim boundary |
| `docs/FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md` | detailed force/torque/load/FeCO/GCaMP audit |

The validation data are copied into `dist/data/calibration/` by the existing static build. The evaluator uses no Node API and can be reused in a future in-browser experiment panel. The Python digitizer and source JPEG are not runtime dependencies.

## Research audit

### Mamiya et al. proprioception

Primary article: Mamiya et al., *Neuron* (2018), DOI `10.1016/j.neuron.2018.09.009`, PMCID `PMC6481666`.

The experiment artifact transcribes the exact reported protocols:

- swing from 180° to 18° and back at 360°/s;
- five seconds between flexion and extension;
- three repetitions and five-second inter-trial intervals;
- ramp-and-hold in 18° steps at 240°/s with three-second holds;
- both starting histories, two repeats each and 72,000°/s² commanded acceleration;
- calcium imaging at 8.01 Hz;
- tibia tracking at 200 Hz for swing and 180 Hz for ramp-and-hold;
- direction-selectivity maxima within six calcium frames after movement onset.

The authors’ public GPL-3.0 analysis repositories were inspected as methodology, not copied into the MIT runtime:

- `MamiyaA/NeuralCodingOfLegProprioception_CalciumImagingAnalyses`;
- `MamiyaA/NeuralCodingOfLegProprioception_LegTrackingAndSynching`.

They confirm that ΔF/F used the lowest moving baseline window and that movement onsets came from tracked angle-change thresholds synchronized to imaging frames. The repositories do not contain the recordings needed for an independent trace fit. Therefore the current DSI comparison is deliberately labeled a transducer-drive proxy rather than simulated fluorescence.

The relevant exact reported observations are:

- club DSI `0.117 ± 0.022`, 25 regions from 15 flies;
- flexion-hook DSI `0.811 ± 0.028`, 37 regions from 23 flies;
- club repetition ratios `1.058 ± 0.038`, `0.997 ± 0.021` for flexion and `1.015 ± 0.036`, `0.975 ± 0.046` for extension;
- hook flexion ratios `0.971 ± 0.017`, `0.984 ± 0.019`;
- claw activity is near-minimal around 90°, approximately linear away from that point and retains directional hysteresis at the end of the hold;
- club movement responses are slightly larger around 90° and weaker at full extension;
- hook calcium-response slope is similar across the tested velocity range;
- club response peaks around 400°/s;
- club detects 100–2,000 Hz tibia vibration, with population peaks at 400 Hz for 0.9 µm and 800 Hz for 0.054 µm vibration.

The last observation cannot be simulated by a 100 Hz body loop. Version 3.6 keeps it as an expected, machine-visible limitation instead of passing a low-rate envelope off as the carrier.

### Azevedo et al. motor units

Primary article: Azevedo et al., *eLife* (2020), DOI `10.7554/eLife.56754`, CC BY 4.0. Raw repository: Dryad DOI `10.5061/dryad.76hdr7stb`, CC0. Analysis code: Zenodo DOI `10.5281/zenodo.4527659`, MIT.

The source repository is approximately 48.8 GB and its current public download endpoint presented an automated-access challenge. No access control was bypassed. The analysis code and CC BY article provide these exact boundaries:

- force-probe spring constant `0.2234 N/m`;
- slow linear force slope `0.013 µN` per additional spike;
- approximate one-spike scale below `0.1 / 1 / 10 µN` for slow/intermediate/fast units;
- fast and intermediate two-spike force approximately `1.6×` one-spike force;
- fast/intermediate half response approximately `8.5 ms`;
- slow force did not peak in 500 ms and hyperpolarization acted on an approximately 100 ms scale.

The high-resolution eLife Figure 4 was normally downloaded and hash-pinned outside the project. A small derived JSON records color-segmented Figure 4D class envelopes. Its trace spread is not a confidence interval, and the points are always labeled `publisher-figure-digitized`. The 604,327-byte source image is not shipped because the browser needs only the derived coordinates.

### Chen et al. dataset

Chen et al., *Current Biology* (2021), DOI `10.1016/j.cub.2021.09.035`, supplies a compact 11.2 MB CC0 Dryad archive (`10.5061/dryad.rfj6q57bm`) of downstream calcium traces. Repository metadata and SHA-256 were verified, but the same automated-access challenge prevented a normal download. The file was not vendored. If normal access becomes available, a small provenance-pinned train/held-out subset—not the archive—should be derived for circuit validation.

## Exact protocol implementation

The swing generator represents the reported constant-speed command because the paper does not state a swing acceleration. It does not invent one. The ramp-and-hold generator uses a trapezoidal 240°/s command with 72,000°/s² acceleration: each 18° move has 3.333 ms acceleration, 71.667 ms cruise and 3.333 ms deceleration. It returns to the starting angle and generates all four history/repetition combinations.

Transducers are integrated at 1 ms for the benchmark. Equilibration at the initial angle is an observation operation and is not inserted into the source protocol. Direction-selectivity uses the paper’s six-frame window, or `6 / 8.01 = 0.7491 s`. Ramp metrics use end-of-hold state, which is essential because the published claw hysteresis is steady-state rather than merely a movement transient.

## Unchanged 3.5 baseline

| Observation | Published constraint | 3.5 prediction | Result |
|---|---:|---:|---|
| Club DSI | 0.117 | 0 | fail |
| Flexion-hook DSI | 0.811 | 1 | fail |
| Six repetition ratios | near 1 with reported SEM | approximately 1 | six pass |
| Claw midpoint response | ≤0.15 normalized gate | 0 | pass |
| Claw position linearity | R² ≥0.90 engineering gate | 1.000 | pass |
| Steady-state claw hysteresis | positive ≥0.01 gate | 0 | fail |
| Club center/full-extension response | >1.02 gate | 1.000 | fail |
| Hook velocity max/min | ≤1.25 gate | 1.454 | fail |

The baseline exposed a real implementation error: `clawHistoryGain` depended on instantaneous velocity. At the end of a three-second hold velocity is zero, so both movement histories converged and the model had no steady-state hysteresis despite claiming one.

## Evidence-supported 3.6 refinement

Three changes were made only after the baseline was frozen:

1. The claw transducer retains last movement direction through a hold. The existing 0.10 engineering gain now produces the kind of steady-state history dependence the source actually measured.
2. The hook motion response saturates on a 20°/s engineering scale instead of a 100°/s scale. This represents the reported weak velocity dependence over ordinary swing speeds; it is not a fitted biophysical half-speed.
3. Club movement drive is attenuated by at most 8% at full extension. The sign follows the reported angle dependence; the magnitude is a small disclosed engineering value because no raw curve was available.

These diagnostics improve as follows:

| Observation | 3.5 | 3.6 |
|---|---:|---:|
| Claw end-of-hold hysteresis | 0.000 | 0.100 |
| Club center/extension ratio | 1.000 | 1.064 |
| Hook velocity max/min | 1.454 | 1.096 |
| Claw position R² | 1.000 | 0.994 |

The three observations used to diagnose these changes are retained under their original locked 3.5 roles so the historical report cannot be rewritten. They must not be advertised as untouched post-refinement validation. The eight repetition/position observations that were not used to choose these response-shape changes continue to pass.

## Remaining failures and why they were not hidden

The current club DSI is `−0.032` rather than `0.117`; flexion-hook DSI is `1.000` rather than `0.811`. Adding arbitrary opposite-direction leakage or mixing hook activity into club would make the scalar scores look better, but it would confound at least three things:

- intrinsic FeCO transduction;
- impurity/overlap of genetic driver regions in the imaging preparation;
- BANC’s generic unsigned claw/hook root annotations.

The article itself discusses possible population contamination. Without raw traces or a root-resolved mapping, forcing those means into intrinsic transducers would add unjustified precision. Version 3.6 therefore reports both failures.

The force observations are now evaluable through an explicit restrained-preparation bridge. Identified BANC motor-unit frame counts drive discrete spike-count curves; force is converted to torque at the measured external probe lever arm and applied to the measured spring–mass–drag load. The bridge passes the slow slope, fast/intermediate one-spike scale and two-spike summation checks. This remains probe-equivalent flexor force: the intermediate BANC identity, extensor calibration, tendon geometry, free-walking load and other-leg transfer are unresolved.

## Commands and interpretation

```text
npm run calibration:leg
npm run experiments:leg
npm run experiments:leg:strict
npm run bridge:leg
npm test
```

The ordinary experiment gate checks evidence integrity and exact reproduction of the current report. It succeeds even when a biological observation fails, because silently deleting a negative result would be worse than a red scientific metric. The optional strict command fails while any designated held-out result fails; it currently fails on the two DSI observations by design.

## Next scientific gate

The limb-loop phase remains open. Its next defensible evidence increment is one of:

1. obtain normally accessible raw FeCO/force traces and derive a compact hash-pinned fit/held-out product;
2. fit the provisional GCaMP6f observation layer against preparation-specific trace timing, driver overlap and baseline fluorescence;
3. obtain internal tendon geometry and absolute extensor measurements so probe torque can become a free-joint muscle/tendon model;
4. validate under independent loads and angular trajectories.

That 3.6 next milestone has since advanced: 3.8 now includes a qualified controller-free free-root articulated body and a separate restrained 15-MTU FlyMimic body, plus zero-safe, identity-only and reconciliation audits. They remain staged/disconnected because preparation-compatible excitation gain/timing and one coherent free-root muscle/contact construction are still missing. The present planar joint must not be called a quantitatively qualified free-walking joint until these evidence gaps close.
