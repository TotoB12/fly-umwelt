# Restrained musculoskeletal body qualification — 3.8

## Outcome

Fly Umwelt now bundles the anatomy-derived FlyMimic front-leg muscle model and compiles it with the same browser-local MuJoCo 3.9 runtime used by the staged articulated body. This closes a real missing-mechanics gap: the qualification model contains 15 spatial muscle–tendon routes and 15 stateful Hill-type muscle actuators for the left front leg.

It is deliberately a separate qualification body. It is anchored, has no external contact sensors or adhesion, and does not replace either the live planar organism or the free-root NeuroMechFly viewer body. No BANC activity is connected to it.

The most important result is partly negative. Every source actuator has `ctrlrange="0.0001 1"`. A requested all-zero excitation vector therefore becomes 15 values of `0.0001`, and passive force is nonzero in eight muscles at the keyframe. That violates Fly Umwelt's rule that zero neural evidence must produce exactly zero active drive. Automatic neural integration remains disabled.

## Primary evidence and provenance

The model is from Özdil et al., “Musculoskeletal simulation of limb movement biomechanics in *Drosophila melanogaster*,” ICLR 2026, arXiv `2509.06426v2`. The paper describes the first 3-D data-driven fly leg musculoskeletal model in OpenSim and MuJoCo. It uses high-resolution X-ray scans from multiple fixed specimens to initialize attachment sites and representative fiber paths, then optimizes uncertain muscle parameters across locomotion and antennal grooming.

The exact vendored XML is byte-identical in:

- FlyGym source commit `ca65a510c2afe6ac61c51df4f274c8d190c2f95f`;
- FlyMimic commit `9ea1131626cd76f7203b74076ef8f0e9cab30bef`.

Its SHA-256 is `04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531`. The 71 meshes come from the pinned EPFL bucket prefix `flygym_assets/neuromechfly_musculoskeletal_meshes_20260623a`. Vendoring verifies the complete bucket listing, individual sizes and ETags, metadata, XML identity and Apache-2.0 license before writing any asset provenance.

The runtime bundle contains only the model XML, 71 STL meshes, mesh metadata, provenance and license. It excludes FlyMimic's PPO policy, motion-capture clips, imitation reward, training/task code and preprogrammed gait/adhesion timing. The public bucket and Git repositories are vendoring-time sources only; the browser makes same-origin requests and has no runtime dependency on them.

Primary sources:

- paper: <https://arxiv.org/abs/2509.06426v2>;
- FlyMimic: <https://github.com/gizemozd/FlyMimic>;
- FlyGym: <https://github.com/NeLy-EPFL/flygym>.

## What is anatomical and what is fitted

| Component | Evidence status |
|---|---|
| front-leg meshes, attachment sites and representative paths | initialized from X-ray morphology across multiple fixed specimens |
| 15 MTUs | seven thoracic, six coxal and two femoral units; 12 of 19 anatomical muscle groups represented |
| femur–tibia units | fast tibia flexor and extensor selected as dominant force generators |
| maximum isometric force | estimated from CT-derived physiological cross-sectional area and a literature-derived specific tension, then scaled during optimization |
| maximum contraction velocity | estimated from X-ray movement video, then scaled during optimization |
| optimal fiber/tendon length and paths | anatomy-initialized, then allowed bounded optimization |
| activation and passive dynamics | partly literature/experiment initialized and multi-behavior optimized |
| external forces and untethered demand | not validated; paper explicitly identifies omitted contact forces as a limitation |

The source behavior was recorded from tethered flies on an air-supported spherical treadmill. The paper warns that maximum isometric force and contraction velocity were not directly measured, and that omitting body–body/body–environment contact can make inferred activation inaccurate for untethered locomotion. Fly Umwelt carries those statements as qualification boundaries, not footnotes.

## Compiled contract

The pinned browser build freezes:

| Quantity | Value |
|---|---:|
| bodies | 73 |
| hinge coordinates / velocities | 14 / 14 |
| left-front functional degrees of freedom | 7 |
| right-front equality locks | 7 |
| Hill muscle actuators / activation states | 15 / 15 |
| spatial tendons | 15 |
| meshes / geometries | 71 / 72 |
| keyframes / sensors | 1 / 0 |
| timestep | 0.1 ms |
| free root | none; thorax anchored |
| total compiled mass | 2.494271478 mg |

The separate NeuroMechFly viewer qualification body compiles to 1.02431 mg. The 1.469961478 mg difference and `2.435074809384×` ratio are frozen in the report. These two bodies have different meshes/model construction and must not be treated as interchangeable whole-fly mass estimates.

The wrapper exposes only explicit 15-value excitation, muscle/tendon/joint state, sparse moment arms, fixed-step integration and exact-profile serialization. It has no neural decoder, motor packet, policy, reference trajectory, reward, gait phase, target bearing, contact response or adhesion command.

## Causal mechanics probe

The antagonist test starts from one serialized state after 200 ms at minimum excitation. Three 10 ms continuations use that exact state: passive continuation, isolated flexor excitation `0.1`, and isolated extensor excitation `0.1`. Reported changes are intervention minus the passive continuation, so initial drift and passive mechanics are not mistaken for active effect.

| Isolated unit | pitch change | velocity change | generalized-force change | stimulated-force change |
|---|---:|---:|---:|---:|
| `LFTibia_flex_93434` | `+0.009386035493 rad` | `+1.64095835619 rad/s` | `+0.093617556367 µN·mm` | `−6.707439226203 µN` |
| `LFTibia_extensor_93932` | `−0.060441671826 rad` | `−9.023065090541 rad/s` | `−0.358538798514 µN·mm` | `−10.25318815515 µN` |

The flexor and extensor moment arms at the passive endpoint are `−0.014822478478 mm` and `+0.034779270293 mm`. MuJoCo muscle force is tensile/negative in this convention, so those opposite moment-arm signs produce the observed opposite generalized forces. This establishes a causal antagonist mechanics path inside this compiled model. It does not establish which BANC motor rows should drive the two actuators or at what gain.

A separate 300 ms minimum-excitation run remains finite. It is a numerical hold test, not evidence that the model reaches a biological resting equilibrium. Exact generalized state round-trips, and restore with a different physics-profile identity is rejected.

## Zero-evidence failure

At the source keyframe, requested excitation is zero and activation state is initially zero, but the source control lower bound is `0.0001`. Eight actuators already report nonzero passive muscle/tendon force; the largest examples include:

- `LFC_sternal_anterior_rotator`: `−11.602353587621 µN`;
- `LFTibia_extensor_93932`: `−10.524517051641 µN`;
- `LFC_pleural_promotor`: `−1.485626313492 µN`.

Passive force is physically distinct from active neural force, and neither should be erased. However, the nonzero control floor means the current source interface cannot represent exact absence of excitation. Before BANC can be connected, a new source-audited actuator formulation must permit zero active excitation while preserving passive elastic force separately. Then the project still needs a cell-type identity audit and a measured or independently constrained spike/subthreshold-to-excitation transfer.

The promising actuator labels `LFTibia_flex_93434` and `LFTibia_extensor_93932` match the paper's modeled fast femur–tibia flexor/extensor roles and pass the compiled antagonist test. Names and mechanics alone are not enough to promote a BANC mapping.

## Subsequent zero-safe and identity audit

The source failure above remains frozen. A separate `zero-safe` physics profile now derives XML in memory by changing exactly the 15 muscle ranges to `[0, 1]`; the public source XML is not modified. Its frozen derivative SHA-256 is `47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e`. Keyframe coordinates, mass, tendons, lengths, moment arms and passive forces match the source profile exactly. From the zero keyframe, controls and activation remain exact zero while passive force stays inspectable. Source/derived states are mutually incompatible by profile identity.

After prior nonzero activation, zero control approaches but does not reach mathematical zero in finite time: the 500 ms probe leaves a positive subnormal near `1.91e-291`. The implementation retains this numerical result and uses no hidden epsilon threshold; exact zero is restored by the source keyframe reset.

BANC v888 supports two identity-only correspondences: LF `tibia_flexor_Fast` root `720575941481179066` to `LFTibia_flex_93434`, and LF `tibia_extensor_FETi` root `720575941639281525` to `LFTibia_extensor_93932`. The separate SETi root is not substituted. Both mapped rows retain predicted-GABA metadata, FETi retains its LR-type conflict, and neither call is treated as muscle-action sign. Excitation gain and timing remain null, so automatic neural control remains disabled.

The read-only body reconciliation finds a `2.435074809384×` mass difference, different root/coordinate/actuator/sensor contracts, different LF frames and masses, and incompatible trochanter/femur segmentation. It therefore blocks mass, inertia, contact and muscle-route transfer. Full evidence is in `MUSCULOSKELETAL_INTEGRATION_3_8.md`.

## Static/browser qualification

`npm run body:musculoskeletal` verifies all 74 tracked files and 14,022,871 bytes, compiles the model with bundled MuJoCo WASM, freezes its exact contract, runs passive/antagonist/state probes and requires the negative zero-rule result.

`npm run body:musculoskeletal:zero-safe`, `npm run bridge:flymimic-banc` and `npm run body:reconcile` qualify the derived profile, exact identities and separate-body boundary. `npm run smoke:musculoskeletal` builds the static site, starts the normal module world Worker and lazily compiles the zero-safe profile from same-origin URLs. Ordinary sessions do not request the MuJoCo runtime or FlyMimic assets. The qualification hook never assigns the model as the live plant.

The new files remain far below Cloudflare Pages' current 25 MiB per-asset limit, and the complete site remains far below the current 20,000-file Free-plan limit. There are no Pages Functions, remote runtime fetches or bindings.

Frozen numerical output: `docs/benchmarks/musculoskeletal-body-qualification-3.8.0.json`.

## Next gate

The next defensible integration sequence is:

1. constrain spike/subthreshold-to-excitation amplitude and timing against independent force or EMG/calcium evidence;
2. choose and validate one geometry/frame/mass construction that can carry both free-root contact and muscle routes; the comparison proves the existing bodies cannot be averaged or spliced directly;
3. qualify external contact, load and force-to-afferent transfer in an untethered preparation;
4. extend anatomy-derived MTUs beyond the left front leg before claiming whole-fly muscle actuation;
5. add adhesion only when attachment/release control and substrate mechanics have a defensible neural/physical source.

No imitation policy, mocap replay, gait controller, motion floor or target trajectory belongs in that sequence.
