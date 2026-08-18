# Architecture

## Overview

Fly Umwelt uses two module Workers, a display-rate renderer and observer-side inspection modules.

```text
main thread
  controls, camera, Canvas rendering, interpolation
  room editor, captions, neural particles, ethogram history
       │
       ├── world worker
       │     room physics, body, senses, physiology, memory, VNC
       │
       └── brain worker
             graph loading, LIF state, population evidence,
             bounded sampled firing-neuron indices
```

The Workers communicate through a dedicated `MessageChannel`. Camera state, inspector state and display history remain on the main thread.

## Timing

- body/world integration: **100 Hz** (`10 ms`);
- sensory and neural exchange: **20 Hz** (`50 ms`);
- state snapshots: up to **25 Hz**;
- display: `requestAnimationFrame`, normally **60 Hz** or the monitor refresh rate.

The renderer keeps two snapshots and interpolates position and heading. It does not wait for a new neural frame before drawing each display frame.

## Causal boundary

The world-to-brain packet contains only:

- angular retinal brightness, motion, looming and proximity;
- bilateral odor channels;
- touch and taste;
- airflow and temperature;
- self-motion and metabolic signals;
- an optional body-relative memory cue;
- elapsed neural duration.

It cannot contain coordinates, object lists, target bearings, paths, camera state, ethogram history or ideal actions. `src/core/protocol.js` rejects privileged fields at runtime.

The brain-to-body packet contains only activity-derived scalar evidence such as forward, reverse, turn, feeding, visual risk and odor bias. The VNC layer cannot inspect room objects or target locations.

## Observer-side display path

World snapshots can be read by the main thread for presentation. This does not grant the neural model access to the same fields.

```text
world snapshot ─┬─ renderer / Follow camera / chamber art
                ├─ observer-side behavior caption
                ├─ fly-relative Umwelt composition
                └─ bounded ethogram and event history

brain frame ────┬─ population-rate displays
                ├─ activity-derived evidence bars
                └─ sampled-spike neural field
```

Display modules do not post control messages to either Worker except in response to explicit user controls already present in the application.

## Camera and coordinate transforms

`LabRenderer` owns camera state and conversion methods:

- Follow — smoothly tracks the fly at a contextual scale;
- Overview — fits the chamber inside available UI insets;
- Free — preserves an explicitly panned/zoomed view;
- `worldToScreen` and `worldPoint` — shared coordinate transforms for drawing and editing.

The room editor never duplicates camera math. It asks the renderer to convert pointer positions to room coordinates, so selection and creation remain correct while zoomed or panned.

Entering room editing switches to World + Overview but does not stop or recreate Workers. The prior camera and inspector context are restored when editing ends.

## Sampled neural field

The neural engine already reports a bounded `sampleSpikes` list containing firing-neuron indices from the latest frame. The redesign consumes that stream without increasing the worker’s firing-state transfer.

`buildDisplayAtlas` derives a compact group ID per neuron from population mappings already produced by the connectome parser. The atlas is transferred once with `brain-ready`; subsequent frames transfer only the existing sampled indices and summary data.

The renderer:

- aggregates per-group counts;
- pools one particle per sampled neuron index;
- decays particles using display time;
- trims stale particles;
- uses a fixed diagrammatic layout rather than anatomical coordinates.

The textual UI states that the field is sampled model activity, not a biological image or full recording.

## Ethogram/history

`EthogramHistory` is bounded observer memory. It:

- coalesces repeated behavior snapshots into segments;
- records threshold-crossing sensory markers;
- deduplicates rolling world events;
- trims data outside the configured maximum window;
- clears if restored simulation time moves backward.

`EthogramView` draws and exposes the same information through hover, click, keyboard selection and a recent-segment list. Neither class mutates a world snapshot or contributes to future behavior.

## Why a VNC model is required

The ready FAFB graph is a brain reconstruction. It does not include a complete ventral nerve cord, every leg motor neuron, muscles or biomechanics. Directly treating tiny left/right graph differences as angular velocity produced endless circles and wall pushing.

`VncController` therefore supplies disclosed low-level functions:

- walk/stop bout timing;
- finite steering saccades;
- speed smoothing;
- tactile reverse and turn-away reflexes;
- ingestion posture when neural output and taste coincide.

It does not choose a food target.

## Memory

The memory model integrates self-motion with noise. Reward or threat events create traces in that drifting private coordinate frame. Guidance is converted to a body-relative cue before entering mapped neural populations.

The model never copies the authoritative room position into memory.

## Static build

`scripts/build.mjs` removes and regenerates `dist/` from source, documentation and `public/` assets. There is no bundler transform and no server runtime. Module Workers and all data are fetched from same-origin static files.

## Principal files

- `src/core/brain-engine.js` — persistent LIF graph.
- `src/core/connectome-data.js` — data parsing, population mapping and display atlas.
- `src/core/vnc-controller.js` — low-level body controller.
- `src/core/world-model.js` — room, body and sensors.
- `src/core/physiology-model.js` — modeled needs and arousal.
- `src/core/memory-model.js` — drifting path integration.
- `src/core/protocol.js` — strict sensory/evidence packet boundary.
- `src/workers/*.worker.js` — asynchronous world and neural loops.
- `src/ui/renderer.js` — interpolated rendering, camera, Umwelt and neural field.
- `src/ui/ethogram.js` — bounded observational history and timeline.
- `src/editor/room-editor.js` — live camera-aware room editing.
- `src/app.js` — controls, persistence and inspection orchestration.
