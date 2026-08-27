# Front-leg spike–force–observation bridge — version 3.6

## Result and claim boundary

Version 3.6 closes one previously missing causal link for a restrained adult *Drosophila* front leg:

```text
identified additional motor-unit spikes
  → probe-equivalent flexor force
  → torque at the measured external probe lever arm
  → measured probe spring–mass–drag load + model-derived tibia inertia
  → physical femur–tibia angle and angular velocity
  → FeCO claw / hook / club transduction
  → provisional GCaMP6f observation
```

The bridge is deterministic, browser-safe and part of the same-origin static build. It does **not** establish free-walking tendon mechanics. The torque is the torque implied by force at the experiment's external probe lever arm; that lever arm is not a muscle tendon moment arm. Absolute extensor force, free-joint load, other-leg transfer and preparation-specific fluorescence remain unresolved.

## Reproducible artifacts

| Artifact | Role |
|---|---|
| `public/data/calibration/front-leg-spike-force-bridge-v1.json` | provenance, measurements, derivations, qualification contract and limitations |
| `src/core/leg-calibration.js` | frozen browser constants |
| `src/core/front-leg-biophysics.js` | spike–force, torque, loaded-joint, FeCO and fluorescence implementation |
| `src/core/front-leg-bridge-validation.js` | browser-safe evaluator |
| `scripts/validate_front_leg_bridge.mjs` | integrity/report drift gate |
| `docs/benchmarks/front-leg-spike-force-bridge-3.6.0.json` | frozen 9-metric result |
| `tests/front-leg-biophysics.test.mjs` | provenance, physics, causality and continuation regression tests |

Run the strict bridge gate with:

```bash
npm run bridge:leg
```

The current bridge report passes 4/4 fit constraints and 5/5 held-out implementation/causality checks. The latter are not an independent biological dataset.

## Evidence

### Motor force and probe

Azevedo et al. (2020), DOI `10.7554/eLife.56754`, CC BY 4.0, reports the restrained front-leg preparation and supplies:

- probe spring `0.2234 N/m`;
- effective probe mass `0.17 mg`;
- probe drag `0.14 × 10⁻³ kg/s`;
- external probe lever arm `417 ± 7 µm`, `n = 8`;
- slow force slope `0.013 µN` per additional spike;
- fast/intermediate two-spike to one-spike force of approximately `1.6`;
- fast/intermediate half-response near `8.5 ms`;
- `50 ms` optogenetic flash and `170 fps` force video.

Fast and intermediate one-spike medians, `7.0382 µN` and `0.3687 µN`, come from the compact color-segmented Figure 4D product already shipped in `data/calibration/azevedo-force-figure4d-v1.json`. They are **publisher-figure-derived coordinates**, not raw recordings, sample means or confidence intervals. The bridge retains digitization uncertainty and the visible distribution spread separately.

The article XML used for the audit had SHA-256 `30ce4178d9c93b15607c8a1d90c640c0736358091c0b87f96291f807181c07fa`. It is not redistributed or required by the browser.

### Morphology prior

Two front-tibia scalars were transcribed from FlyGym 2.1 morphology at commit `38c8ec61034cd59bc5ba0de20688d4a3c0000d60`, Apache-2.0:

- mass `2.07 × 10⁻⁹ kg`;
- length `5.18000894825482 × 10⁻⁴ m`.

The shipped inertia prior

```text
I_tibia = m L² / 3 = 1.8514419965760005 × 10⁻¹⁶ kg·m²
```

approximates the tibia as a uniform slender rod about one end. This is model-derived engineering, not a measured free-joint inertia. It omits tibial shape, tarsi, joint tissue and individual variation. No FlyGym controller, Python runtime, MuJoCo runtime or mesh is imported.

### Indicator timing

Chen et al. (2013), DOI `10.1038/nature12354`, PMCID `PMC3777791`, reports that GCaMP6f can resolve spikes separated by approximately `50–75 ms` in mouse cortical somata. That result constrains only the order of the provisional indicator filter. It is not a fit to the Mamiya fly-axon preparation.

## Force and twitch equations

For slow additional spikes:

```text
F_slow(n) = 0.013 n µN
```

For fast and intermediate units:

```text
F(n) = F₁ (1 - qⁿ) / (1 - q),  q = 0.6
```

This makes `F(2) / F(1) = 1.6` exactly and produces a saturating count curve. It is a compact constraint model, not a raw-trace fit.

Each burst follows a normalized exponential rise to its declared 50 ms peak, followed by exponential decay. The rise time constant is `12.603899189325862 ms`, chosen so that the normalized rise reaches half of the 50 ms peak at 8.5 ms. The 25 ms fall constant is disclosed engineering pending accessible raw twitches.

## Probe torque and load

Probe-equivalent force becomes joint torque by:

```text
τ = F r_probe
```

where `r_probe = 417 µm`. One spike therefore implies central observation torques of:

- fast: `2.9349294 × 10⁻⁹ N·m`;
- intermediate: `1.537479 × 10⁻¹⁰ N·m`;
- slow increment: `5.421 × 10⁻¹² N·m`.

The UI and API retain torque bounds from `r_probe ± 1 SD`. Crucially, this equation says what torque the measured external force implies about the restrained joint. It does not identify tendon path, tendon force or internal muscle moment arm.

At small angles, the measured translational probe terms become rotational terms:

```text
I_probe = m_probe r²
K_probe = k_probe r²
C_probe = c_probe r²
I_total = I_probe + I_tibia
I_total q̈ = τ_active - K_probe q - C_probe q̇
```

The resulting central values are:

- `I_probe = 2.956113 × 10⁻¹⁴ kg·m²`;
- `I_total = 2.97462741996576 × 10⁻¹⁴ kg·m²`;
- `K_probe = 3.88468026 × 10⁻⁸ N·m/rad`;
- `C_probe = 2.434446 × 10⁻¹¹ N·m·s/rad`.

The loaded preparation integrates at `0.1 ms` with semi-implicit Euler. The force-reconstruction check independently recombines spring, drag and inertia terms and requires less than 1% relative error. Joint angle and velocity—not a directly injected sensory command—then drive the existing FeCO transducers.

## Provisional GCaMP6f observation

Each FeCO channel passes through a direction-neutral low-pass and saturation layer:

```text
rise τ = 50 ms
fall τ = 150 ms
ΔF/F proxy = filtered_drive / (0.75 + filtered_drive)
sample rate = 8.01 Hz
```

This represents indicator filtering and the experiment's reported imaging cadence. It does not yet include fly-axon calibration, baseline fluorescence, expression level, neuropil, noise or genetic-driver overlap. It is deliberately forbidden from adding arbitrary cross-channel leakage to repair direction-selectivity scores.

## Live whole-CNS path

The BANC engine now preserves exact per-frame spike counts for its identified femur–tibia motor-unit populations. Packets include `motorUnitSpikeCounts`, `motorFrameId` and `motorFrameDurationMs`. The 100 Hz plant consumes a motor frame once, so a packet held across body steps cannot replay the same spikes.

The pinned annotations currently resolve slow and fast flexor populations but do not cleanly identify the Azevedo intermediate unit. The live observer therefore reports:

- resolved slow/fast probe-equivalent flexor force and torque;
- unresolved flexor spike count, visibly separate;
- `absoluteForceEvidence`, describing whether the displayed quantity is experiment-specific evidence or unavailable.

The existing normalized joint model remains the body actuator. The measured probe-loaded preparation is a separate experimental model because substituting the restrained load into free walking would be biologically wrong. Extensor output also remains relative.

## Qualification semantics

The four fit metrics encode source facts used to choose equations: slow slope, fast and intermediate 2:1 summation, and half-rise. They are reproduction checks, not validation.

The five held-out checks test implementation consequences:

1. the applied force can be reconstructed from the declared load;
2. zero spikes create exactly zero active torque;
3. lever-arm uncertainty changes torque by the declared amount;
4. physical flexion drives hook/club state without sensory injection;
5. serialized state continues exactly under identical inputs.

They test unit consistency and causal closure. They are not held-out animals or recordings.

## Remaining negative results and next gate

The experiment suite now scores 17 pass, 2 fail, 1 expected limitation and 1 context record. All 6 fit records pass; 11 of 13 held-out records pass. The two preserved failures are:

- club DSI: predicted `−0.032471818`, reported `0.117`;
- flexion-hook DSI: predicted `1.0`, reported `0.811`.

The 100–2,000 Hz vibration carrier remains an expected limitation of the 100 Hz body loop. Raw FeCO/force traces, preparation-specific GCaMP parameters and driver overlap are still needed.

The geometry-compilation part of that gate has since advanced. Version 3.8 qualifies a controller-free free-root NeuroMechFly body and, separately, a restrained FlyMimic body with anatomy-derived internal tendon paths. It also freezes a zero-safe actuation profile, two identity-only BANC correspondences and a negative reconciliation proving that the two bodies cannot be merged directly. The open gate is now preparation-compatible excitation gain/timing plus one coherent free-root muscle/contact body and live afferent closure—still without importing a baked FlyGym/NeuroMechFly locomotion controller.
