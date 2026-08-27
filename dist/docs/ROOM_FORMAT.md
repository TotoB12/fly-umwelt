# Room format

Rooms are JSON objects.

```json
{
  "version": 1,
  "name": "Calm chamber",
  "width": 120,
  "height": 80,
  "ambientLight": 0.46,
  "temperature": 0.5,
  "spawn": {"x": 54, "y": 43, "heading": 0.2},
  "objects": []
}
```

Supported object kinds:

- `wall`: rectangle with `x`, `y`, `w`, `h`;
- `shelter`: rectangle with `x`, `y`, `w`, `h`;
- `food`: circle with `x`, `y`, `r`, `amount`, `odor`;
- `water`: circle with `x`, `y`, `r`, `amount`, `odor`;
- `light`: circle with `x`, `y`, `r`, `strength`;
- `threat`: circle with `x`, `y`, `r`, `speed`, `heading`, `odor`.

Imports are normalized and bounded. Unknown fields are discarded. Room changes preserve the current fly state.

Coordinates and dimensions use the project's millimetre-scale planar convention, with the JSON origin at the top-left. The live planar plant remains authoritative in ordinary sessions.

The explicit articulated-body qualification profile converts this format into a centred MuJoCo frame (`x − width/2`, `y − height/2`), retains the pinned NeuroMechFly neutral-root offset and applies `spawn.heading` around the vertical axis. It adds four outer boundaries and treats `wall` and `shelter` rectangles as rigid static collision footprints. Each collider receives explicit contact pairs against exactly the 55 fly geoms selected by FlyGym's pinned ground model; source geom collision masks and ground pairs are unchanged. `food`, `water`, `light` and `threat` remain nonblocking and do not affect the physics-profile identity.

Room version 1 has no z dimension or material fields. The articulated profile therefore freezes a `5 mm` collider extrusion, `1 mm` outer-boundary thickness and the FlyGym v2.1.0/browser-game explicit-pair values: friction `1 1 0.02 0.0001 0.0001`, `solref 0.0002 1`, `solimp 0.98 0.99 0.00001 0.5 3`, margin `0.001 mm`. These are disclosed engineering parameters, not measured chamber or substrate properties. Object IDs are never interpolated into model XML; deterministic numeric collider names are used instead. Serialized articulated state carries an exact physics-profile identity and cannot be restored into different collider/spawn mechanics or into a room profile without that identity.
