# Articulated-body foundation — 3.8

## Outcome

Fly Umwelt now bundles and compiles a real controller-free NeuroMechFly v2 body in the browser. The qualification profile also derives a static MuJoCo chamber from normalized room JSON: spawn translation/heading, four boundaries, wall/shelter collision and obstacle-aware leg contacts. This is a mechanics foundation, not a replacement claim for the live planar plant. The default organism still runs `PlanarHexapodPlant`; the articulated body is available through an explicit qualification hook in the world Worker while its neural-to-muscle transfer remains unresolved.

The selection is:

- FlyGym `v2.1.0`, source commit `ca65a510c2afe6ac61c51df4f274c8d190c2f95f`;
- official FlyGym browser-asset commit `0884af08981994543634563d95e9b1eb49945082`;
- MuJoCo WebAssembly `3.9.0`;
- NeuroMechFly v2 primary source DOI `10.1038/s41592-024-02497-y`;
- Apache-2.0 for FlyGym and MuJoCo, with vendored license texts.

The runtime/model/mesh download is reproducible through `scripts/vendor_neuromechfly_browser_assets.mjs`. Every copied file has a frozen SHA-256 in `public/data/morphology/neuromechfly-v2.1.0/provenance.json`. No CPG, tripod controller, preprogrammed step, game behavior or FlyGym action policy is copied.

## Why this body and solver

NeuroMechFly supplies measured adult-fly morphology, segment hierarchy, masses, joint axes, collision geometry and a published embodiment model. MuJoCo supplies deterministic articulated dynamics, constraints and contact in a maintained browser-WASM implementation. Reimplementing those features in a project-local rigid-body solver would add large, weakly testable engineering uncertainty without adding biological evidence.

The upstream position actuators are retained only as an explicit mechanics interface. Their gains, friction, solver settings and neutral posture are model parameters; they are not treated as measured motor physiology. A second qualification interface can disable every position-actuator gain and bias and apply actuator-ordered generalized torque directly through MuJoCo's documented `qfrc_applied` input. FlyGym's gait generators and task controllers are excluded because their commands would answer the locomotor question outside the BANC/VNC loop.

## Compiled contract

`npm run body:articulated` verifies the downloaded hashes and compiles the XML with the bundled MuJoCo module. The frozen 3.8 qualification records:

| Item | Compiled value |
|---|---:|
| Bodies | 70 |
| Generalized coordinates / velocities | 133 / 132 |
| Joints | 127 |
| Position actuators | 42 |
| Adhesion actuators | 0 |
| Contact sensors | 6, 96 values total |
| Meshes | 39 |
| Free roots / neutral keyframes | 1 / 1 |
| Physics timestep | 0.1 ms |
| World-step substeps | 100 per 10 ms |
| Gravity | 9,810 mm/s² |
| Total model mass | 0.00102431 g = 1.02431 mg |

The pinned source model has 70 geoms (ground plus 69 fly geoms), but FlyGym explicitly qualifies only 55 fly geoms for ground contact. A room-derived model adds four boundary boxes and one deterministic box per normalized `wall` or `shelter`, then creates one explicit pair between every collider and each of those same 55 fly geoms. It adds no bodies, joints, actuators or sensors. The default room therefore compiles seven additional static colliders and 385 explicit room pairs while preserving the 70/42/6 core contract.

MuJoCo is unitless and requires a coherent model convention. FlyGym's official model-composition tutorial states that this fly uses millimetres and grams; force readout is consequently g·mm·s⁻², or µN. The mass must not be labeled kilograms.

## Mechanics probes

The qualification is intentionally limited to implementation-level mechanics:

- neutral reset begins above the substrate with zero contacts;
- after 0.6 s passive settling, the model has eight compiled contacts distributed across all six leg sensors;
- root-position drift over the last 100 ms is `2.08799 × 10⁻⁷ mm`;
- an explicit root-velocity perturbation causes measurable displacement and dissipates to `1.5303 × 10⁻⁷ mm/s` after 500 ms;
- an explicit `+0.1 rad` left-front femur–tibia position target changes that coordinate from `1.371767522` to `1.413749087 rad` after 50 ms;
- finite `+0.05 rad` coordinate perturbations decrease the geometry-derived anatomical femur–tibia angle by `0.05 rad` on every leg, establishing that positive coordinate/torque is flexion and negative is extension;
- with all position servos disabled and their measured actuator force exactly zero, one resolved fast-flexor spike's measured-probe-equivalent twitch applies `2.9349294 µN·mm` at 50 ms and changes the left-front anatomical angle from `1.746609594` to `1.649035309 rad` relative to the zero-spike control;
- a CNS-safe 92-value afferent boundary carries local anatomical angle/velocity, contact, and stateful claw/hook/club signals for all six legs while excluding world position, contact normal/tangent, object identity and room geometry; spike-driven flexion raises flexion-hook `0.521654519 → 0.862371900` and club `0.142053607 → 0.674930339` relative to control;
- serialized `qpos`, `qvel`, `ctrl`, applied torque, actuator mode and time restore exactly.
- a centred `40 × 30 mm` room probe retains the upstream neutral root offset, maps a `π/2` spawn heading to the exact z-axis quaternion, and compiles four boundaries plus one wall and one shelter;
- an explicit `1.6 mm` root translation into the wall creates two compiled wall–front-tarsus contacts, increases both front-leg local sensor counts by one, and produces a `0.004407973758 mm` wall reaction over 20 ms;
- the room collision state restores exactly; state missing a physics-profile identity and state from a physically different room are both rejected before restore, while changes to nonblocking objects leave that identity unchanged;
- the obstacle intervention does not add world position, normal/tangent, object identity, the physics-profile identity or room geometry to the CNS-safe afferent state.

These results show that geometry, mass, joints, controls, direct generalized torque and contact participate causally. The spike-torque probe is valid only as the already-qualified restrained front-leg observation: it uses the measured external probe lever arm, not an internal tendon moment arm. It does not demonstrate biological gait, free-walking muscle force, adhesion accuracy or locomotor competence.

## Conservative 72-channel bridge

`articulated-body-bridge-v1.json` classifies every stable `[leg][action]` channel without pretending that a named action supplies a muscle gain:

| Status | Actions | Runtime consequence |
|---|---|---|
| coordinate mapped | femur–tibia flex / extend | compiled geometry establishes `+` coordinate/torque = flexion and `−` = extension; normalized population gain unresolved |
| structural hypothesis | coxa–trochanter flex/extend; tibia–tarsus flex/extend; coxa anterior/posterior; coxa medial/posterior-lateral | candidate coordinate recorded; control disabled |
| unresolved | long-tendon pull; unknown leg movement | no body coordinate assigned |

The thorax–coxa pitch and coxa–trochanter/femur roll body actuators also lack unique stable BANC action channels. They remain unbridged rather than being driven from a neighboring population.

The wrapper accepts explicit 42-value position targets or 42 actuator-ordered generalized torques. It has no method that accepts a motor packet and contains no phase clock, action sequencer, foot trajectory or random behavior. Torque qualification disables all upstream position-servo gain/bias terms and requires zero `actuator_force`; passive joint stiffness and damping remain disclosed upstream mechanics. The world Worker loads the body only on `articulated-body-qualification`; ordinary sessions do not download the 9.14 MB WASM file. When a world exists, the explicit hook compiles its current normalized room and invalidates that model on room reset/update/restore so stale obstacle geometry cannot be reused.

Only the already measured adult front-leg resolved-spike twitch is converted to torque in the qualification script. The model's millimetre–gram–second convention makes one generalized torque unit `1 µN·mm = 10⁻⁹ N·m`. The Azevedo external `417 µm` probe lever arm provides the observed joint torque. No equivalent absolute extensor force, unresolved-unit force, other-leg transfer or free-walking load is asserted.

The afferent boundary retains physical contact-force magnitude in µN for audit but sends zero on the CNS vector's strain/load field. There is no source-supported contact-force-to-campaniform gain, so turning that value into spikes would be an invented calibration. Binary local contact and physical femur–tibia state do reach the existing tactile and FeCO-compatible fields in qualification; the live world still uses the planar body's sensory vector.

## Normalized room physics

Room coordinates are already expressed in the project's millimetre-scale planar convention. The derived MuJoCo frame uses `x = room x − width/2` and `y = room y − height/2`; it then retains the upstream neutral root offset (`[0.496, 0, 2.1] mm`) and converts spawn heading to a z-axis quaternion. Rectangle IDs and names never enter XML: colliders receive deterministic numeric names, all numbers pass through room normalization plus a finite bound, and the pinned source XML remains byte-for-byte untouched in public assets.

Collision filtering is deliberately narrow and now follows FlyGym's own formulation. Room boxes remain `contype=0, conaffinity=0`, every fly geom retains its pinned collision mask, and the derived XML creates a named explicit MuJoCo pair from each room collider to each of the 55 fly geoms already selected by the upstream ground pairs. This preserves disabled fly self-collision and room–room collision without broadening contact to all 69 fly geoms. The 55 original ground pairs remain unchanged. Removing the ground-only selector from each leg-subtree sensor makes the same six channels observe ground or obstacle contact; raw compiled contact identities remain privileged audit data and never enter `afferentState()`.

Each new explicit pair uses FlyGym v2.1.0 `ContactParams` and the pinned official browser game's obstacle values: friction `1 1 0.02 0.0001 0.0001`, `solref 0.0002 1`, `solimp 0.98 0.99 0.00001 0.5 3`, and `0.001 mm` margin. The JSON format still has no z dimension or material record. Collider height (`5 mm`), outer-boundary thickness (`1 mm`), rigid/static behavior and these source-matched contact parameters are therefore frozen engineering assumptions, not measured chamber materials. `wall` and `shelter` rectangles block; food, water, light and threat do not. Shelter collision is a conservative extrusion of its footprint and does not yet model a roof, clearance, compliance or surface texture.

## Adhesion boundary

FlyGym adhesion is not passive friction: `add_leg_adhesion` creates an actively controlled normal-attraction actuator on each tarsus5, with control range 0–1. The pinned controller-free viewer XML has 42 position actuators and exactly zero adhesion actuators. The official browser game has six additional adhesion actuators, but its JavaScript explicitly switches them off during swing and on during stance using baked CPG/preprogrammed-step phase.

Importing that timing would import the gait answer, while leaving an adhesion actuator continuously active would create passive sticky feet. Fly Umwelt does neither. Adhesion stays disabled until an experimentally defensible neural attachment/release command and biomechanical surface model exist. This is a preserved limitation, not a claim that real flies walk without adhesion.

This boundary is supported by a second primary source. Vaxenburg et al. (2025, DOI `10.1038/s41586-025-09029-4`) likewise use position actuators for non-wing joints, explicitly warn that their control signals are not biologically meaningful, and identify muscle actuation plus origin/insertion incorporation as future work. Their new confocal data may support such geometry later, but the published body does not currently justify inventing leg muscle paths or moment arms here.

Özdil et al. subsequently provide a separate restrained FlyMimic front-leg model with 15 anatomy-derived MTUs. Fly Umwelt qualifies it independently in `MUSCULOSKELETAL_BODY_3_8.md`; it is not copied into this free-root viewer because its mass/morphology differ, its physiology includes fitted estimates, external contact is not validated and every muscle control has a nonzero `0.0001` floor. The two models must be reconciled before their mechanics can be combined.

## Static deployment

All assets are same-origin files copied to `dist/`. The complete 46-file vendored morphology/runtime/license package is 12,880,415 bytes. The largest file is `mujoco.wasm` at 9,139,270 bytes, below Cloudflare Pages' current 25 MiB per-file limit. There are no Pages Functions, remote imports or runtime CDN requests. The articulated browser smoke starts the normal world Worker and compiles the body there.

## Next falsifiable gates

The live plant must not switch until all of these are met:

1. make the restrained FlyMimic muscle boundary exactly zero-safe, audit its LF identities/gains against BANC, then reconcile its internal paths and `2.494271478 mg` body with this free-root `1.02431 mg` morphology/contact model;
2. validate coordinate signs and moment arms for every additionally promoted action and keep unresolved channels inactive;
3. select the qualified body-derived joint/contact vector in the live loop and establish source-supported force/strain gains; world coordinates and collision normals must remain excluded;
4. replace the engineering room extrusion/contact parameters with assay-specific measured substrate, wall and shelter mechanics, and establish a neural/biomechanical bridge for active tarsal adhesion;
5. pass exact causal intervention, serialization and Worker timing tests at 100 physics substeps per body frame;
6. disable the planar phase/traction scaffold and report whether locomotion emerges or fails;
7. only then compare gait, speed, turning, contact recovery and bout distributions with experiments.

The frozen output is `docs/benchmarks/articulated-body-qualification-3.8.0.json`.
