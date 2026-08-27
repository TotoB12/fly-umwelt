# Musculoskeletal integration audit — 3.8

This increment advances three prerequisites for a biologically defensible muscle body without pretending they complete a walking fly. It introduces an in-memory zero-safe actuation profile, freezes two BANC-to-FlyMimic identity correspondences, and compares the restrained muscle body with the separate free-root contact body. No automatic neural control or model merge is enabled.

## Exact zero-safe profile

The public FlyMimic XML remains byte-identical at SHA-256 `04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531`. `deriveZeroSafeMusculoskeletalXml` replaces exactly 15 occurrences of `ctrlrange="0.0001 1"` with `ctrlrange="0 1"` in memory immediately before MuJoCo compilation. The derived XML is 49,595 bytes with SHA-256 `47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e`; it is not stored as a competing morphology asset.

The source and derivative have different physics-profile keys and reject each other's serialized states. The qualification establishes exact equality of keyframe qpos, qvel, activation, tendon state, muscle–tendon lengths, sparse moment arms, passive actuator force and total mass. Only the 15 muscle control lower bounds differ.

From a zero-activation keyframe, requested zero is applied as 15 exact zeros and activation stays exactly zero over 50 ms. Passive elastic force remains nonzero and inspectable; it is not erased to manufacture a neural zero. Identical-state `0.1` flexor and extensor interventions retain opposite femur–tibia pitch and generalized-force effects.

One numerical boundary is deliberately red. Starting all activation states at `0.5` and applying exact zero control for 500 ms leaves a maximum positive subnormal activation of about `1.91e-291`; the integrator approaches zero but does not reach mathematical zero in finite time. A keyframe reset restores exact zero. The runtime does not add a hidden epsilon clamp.

The original source qualification remains unchanged: its zero request still clamps to `0.0001`, so `zeroNeuralEvidenceRule` and `automaticBancIntegration` remain `false` in `musculoskeletal-body-qualification-3.8.0.json`.

## Identity-only BANC bridge

The bundled BANC v888 classification supports two exact left-front correspondences:

| BANC root | BANC type | Runtime population | FlyMimic actuator | Status |
|---|---|---|---|---|
| `720575941481179066` | `tibia_flexor_Fast` | `legMotorUnitLFFlexorFast` | `LFTibia_flex_93434` | identity only |
| `720575941639281525` | `tibia_extensor_FETi` | `legMotorUnitLFExtensorFast` | `LFTibia_extensor_93932` | identity only |

The validator parses the gzip classification with the browser CSV parser, checks every frozen field, constructs the runtime population mapping over all 155,855 bundled neurons, and proves that each population contains exactly the recorded root. The distinct SETi root `720575941478577231` remains in `legMotorUnitLFExtensorSlow` and is excluded from the paper's fast-extensor correspondence. Accessory and unresolved flexors are also excluded.

Both mapped rows carry predicted GABA calls near 0.55 confidence; FETi additionally carries `LR_TYPE_CONFLICT`. These fields remain visible but are not reinterpreted as inhibitory muscle action. A presynaptic transmitter prediction does not specify neuromuscular receptor effect, actuator sign or gain.

`excitationGain`, `timingTransfer` and automatic control are all null/disabled. The Azevedo `7.0382 µN` value is an external restrained-probe force at a 417 µm lever. FlyMimic exposes internal actuator/tendon force in another preparation. Equating them would conflate physical quantities and is forbidden as gain calibration.

## Body reconciliation result

Both bodies compile under the same MuJoCo 3.9.0 runtime, but they are not mechanically interchangeable:

| Contract | Free-root viewer | Restrained FlyMimic |
|---|---:|---:|
| source mesh assets | 39 | 71 |
| bodies | 70 | 73 |
| qpos / qvel | 133 / 132 | 14 / 14 |
| actuator semantics | 42 position actuators | 15 stateful Hill muscles |
| activation states / tendons | 0 / 0 | 15 / 15 |
| contact sensors | 6 | 0 |
| total mass | 1.02431 mg | 2.494271478 mg |
| gravity | −9810 mm/s² | −9801 mm/s² |
| root | free | anchored |

Comparison-only name normalization finds 64 common semantic body labels, but the viewer combines each leg's trochanter and femur while FlyMimic separates the front-leg trochanter and femur and uses different segmentation elsewhere. Directly matched LF segments have different masses, diagonal inertias and keyframe frames. Even the thorax mass differs by about 2.49×. Separate-body diagonal inertias cannot be combined without frame rotations, centres of mass and the parallel-axis theorem.

The viewer base XML uses 55 explicit ground pairs and six contact sensors despite zero geom collision masks; its free-root passive contact and room-derived obstacle contact are separately qualified. FlyMimic compiles 72 collision-mask-enabled geoms and a floor, but has no explicit pairs or sensors, remains anchored, and lacks external-contact validation in the source paper. Collision-capable geometry is not evidence for validated external load transfer.

The reconciliation decision is therefore negative: no mass/inertia transfer, contact transfer, muscle-route transplant, live-plant replacement or silent model merge is allowed.

## Reproduction

```bash
npm run body:musculoskeletal
npm run body:musculoskeletal:zero-safe
npm run bridge:flymimic-banc
npm run body:reconcile
npm run smoke:musculoskeletal
```

Frozen machine-readable results are:

- `docs/benchmarks/musculoskeletal-zero-safe-qualification-3.8.0.json`
- `public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json`
- `docs/benchmarks/flymimic-banc-front-tibia-bridge-3.8.0.json`
- `docs/benchmarks/body-reconciliation-3.8.0.json`

The browser qualification loads the zero-safe profile lazily from same-origin static files. The source XML, derived-profile code, bridge artifact and reports are copied into `dist`; there are no Pages Functions, remote runtime fetches, server state or mandatory external requests.

## Next evidence gates

1. Obtain direct or independently constrained spike/activation-to-excitation and timing evidence for the matched preparation.
2. Reconcile geometry frames, centres of mass and inertias against one explicit morphology rather than averaging incompatible bodies.
3. Validate untethered external load/contact mechanics before adding FlyMimic contact or active adhesion.
4. Extend anatomy-derived muscle/tendon routes and local force/joint/contact afferents to all legs.
5. Keep passive mechanics separate from neural excitation and preserve failures when any gate remains unsupported.
