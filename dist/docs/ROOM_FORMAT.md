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
