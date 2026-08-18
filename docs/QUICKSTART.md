# Quick start

## 1. Run it

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

The page starts with either:

- **139,255 neurons** when the full pack is installed; or
- **demo graph** when only the bundled validation graph is available.

The demo is intentional and fully functional. Install or refresh the full pack with:

```bash
npm run data:reference
```

Then reload.

## 2. Start the fly

Press Play. The default **Natural** mode produces modeled walking bouts, pauses and short body turns. It is normal for the fly to pause, explore a wall, miss food or revisit an area.

Use the speed selector for slow motion or accelerated observation. The displayed achieved speed reports biological simulation time divided by wall-clock time.

## 3. Follow or survey

The chamber starts in **Follow** mode so the fly remains legible. Use **Overview** for room context.

- Scroll or use `+` / `-` to zoom.
- Drag to pan after leaving Follow.
- Use two fingers to pinch and pan on touch devices.
- Use arrow keys to pan and `0` to reset.
- Press Follow at any time to return to the fly.

Camera movement never changes the simulation.

## 4. Read the living strip

The bottom strip prioritizes:

- current behavior and why the observer interprets it that way;
- sampled neural activity;
- compact energy and hydration;
- private memory and the latest meaningful event.

Captions are generated after model updates and never control the fly.

## 5. Inspect the organism

Press **Observe**. The panel contains:

- **Now** — behavior, explanation, body state and recent events;
- **Umwelt** — retinal, odor, contact, taste, light and memory-guidance evidence;
- **Neural** — sampled firing indices grouped by existing population mappings;
- **History** — a rolling ethogram with selectable segments and event markers;
- **Memory** — a drifting internal estimate, not the real room map;
- **Brain** — network activity, output evidence, interventions and neuron lookup.

Use Left/Right arrows, Home and End to move across the tabs. The neural-field layout is diagrammatic and the ethogram is observer-only.

## 6. Edit while it lives

Press **Edit room**. The simulation does not reset or pause, and the camera moves to Overview.

- Select and drag existing objects.
- Use **Pan** when you need to move the camera without moving an object.
- Add walls, shelters, food, water, lights and threats.
- Move a selected object with arrow keys; hold Shift for a larger step.
- Delete with the Delete or Backspace key.
- Undo or redo edits.
- Change values in the selected-object panel.

Press **Finish editing** to restore the previous observation camera.

## 7. Try the three modes

- **Natural:** recommended autonomous hybrid.
- **Connectome:** less modeled guidance and a quieter baseline.
- **Evoked:** conservative stimulation condition; may remain still.

Switching modes resets numerical brain state but preserves the room.

## 8. Save

The `•••` menu can save and restore the complete current individual in IndexedDB. The saved state includes the room, neural arrays, physiology, memory, body state and random-generator state.

Room-only save/load and JSON import/export are available separately.
