# Fly Umwelt 3.0

Fly Umwelt is a static, embodied fruit-fly observatory. It is designed for quiet observation of an autonomous nonhuman agent rather than direct character control or dashboard operation.

The application combines:

- a persistent whole-connectome leaky integrate-and-fire model;
- a disclosed model of the missing ventral nerve cord and body reflexes;
- fly-like vision, bilateral odor sensing, touch, taste, light, airflow and internal physiology;
- walking bouts, pauses, finite steering saccades, reversals, ingestion and contact escape;
- a private, drifting path-integration memory;
- a live, state-preserving room editor;
- fly-centered and whole-room camera modes;
- observer-side Umwelt, sampled neural-field and ethogram views.

```text
room → local sensory signals → neural graph → neural evidence
     → modeled VNC/body → movement → changed sensory signals

                         observer-only displays
          camera · captions · neural field · ethogram/history
```

The neural worker never receives chamber coordinates, object lists, food positions, target bearings, camera state, ethogram history or an ideal action. The VNC layer never receives target coordinates either. Observer-side views are produced after model updates and never feed back into behavior.

This is an experimental embodied nervous-system model. It is not proof of biological life, consciousness, subjective experience or anatomical fidelity.

## Start

Node 20 or newer is required.

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

The app always starts. When the verified 139,255-neuron files are installed, it opens the full graph. Otherwise it immediately opens the bundled 96-neuron validation graph and labels it **demo graph**.

Install or refresh the full reference graph with:

```bash
npm run data:reference
```

Then reload. The same action is available as **Load full 139k graph** in the `•••` menu.

## Observation experience

### Camera

The chamber opens in **Follow** mode: a smoothly interpolated fly-centered view with enough nearby context to read behavior. Use **Overview** for the complete room and editing.

Available navigation:

- Follow and Overview buttons;
- explicit zoom-in, zoom-out and reset controls;
- mouse-wheel or trackpad zoom;
- pointer drag to pan after leaving Follow;
- two-pointer pinch and pan;
- arrow keys to pan, `+` and `-` to zoom, and `0` to reset.

Camera state is display-only. Editing uses the same screen-to-room transform at every zoom and pan position.

### Living status strip

The primary live readout is event-first:

1. current behavior and its observer-side explanation;
2. sampled neural activity;
3. compact energy and hydration state;
4. private memory state and the latest meaningful event.

Energy and hydration stay visible without displacing active behavioral evidence.

### World and Umwelt

**World** shows the fly, chamber geometry, resources, local light, environmental gradients, threats, shelter and recent locomotor trail.

**Umwelt** recomposes only the sensory values already present in the world snapshot: angular retinal brightness, motion, proximity and looming; bilateral odor; touch and taste; local light; self-motion; and disclosed memory guidance. It does not reveal room coordinates or object identities to the model.

### Observe panel

**Observe** opens one inspection surface with six keyboard-accessible views:

- **Now** — current behavior, explanation, physiology, memory confidence and recent events;
- **Umwelt** — spatial and textual sensory evidence;
- **Neural** — a decaying field of sampled firing-neuron indices grouped by the parser’s existing population mappings;
- **History** — a bounded rolling ethogram with behavior segments and sensory/event markers;
- **Memory** — the drifting private map and stored reward/threat traces;
- **Brain** — whole-network rate, activity-derived VNC evidence, interventions and neuron lookup.

The neural field is a sampled model-activity display. Group placement is diagrammatic; it is not a biological brain image, anatomical map or full recording. History is observer-side, bounded in memory and unable to influence future behavior.

## The three brain modes

The **Brain** selector changes assumptions around the same loaded graph.

### Natural — recommended

The full loaded graph runs with disclosed ongoing activity, physiology and a modeled VNC. The VNC generates walk/stop bouts, finite turns and tactile escape. A drifting memory cue can enter selected neural populations. This is the default autonomous hybrid.

### Connectome

The graph has less background activity, no spatial-memory input and fewer behavioral priors. It still needs the VNC/body plant because a brain-only volume does not contain the complete leg motor system. Behavior can be quieter and less competent.

### Evoked

A conservative zero-spontaneous-baseline condition inspired by published stimulation experiments. It uses narrow annotated outputs and can remain still until sensory or experimental stimulation reaches useful circuitry.

Switching mode resets numerical neural state while preserving the room.

## Room editing

Room editing remains live while the simulation runs. Entering the editor moves to World + Overview for spatial accuracy, then restores the previous observation context afterward.

You can add or modify:

- walls and shelters;
- food and water;
- light sources;
- moving threats.

Selection, dragging, keyboard movement, deletion, undo/redo, local save/load, JSON import/export and running-state preservation remain available. The **Pan** tool separates camera navigation from object manipulation on touch and pointer devices.

## Accessibility and motion

- Base text is 14 px and compact labels are at least 11 px.
- Color-coded evidence also has a textual label or value.
- Tabs follow standard keyboard navigation with arrow, Home and End keys.
- Camera, editor and history interactions have button or keyboard alternatives.
- Coarse-pointer controls expand to at least 44 px where practical.
- `prefers-reduced-motion` removes nonessential transitions and stabilizes visual movement.
- Forced-colors and visible focus states are supported.

## Save and restore

The `•••` menu can save and restore the complete current individual in IndexedDB. The saved state includes the room, neural arrays, physiology, memory, body state, simulation time and random-generator state.

Room-only persistence remains separate and supports local save/load plus JSON import/export.

## Build and Cloudflare Pages

A normal static build copies source, documentation and locally available data to `dist/`:

```bash
npm run build
```

To ensure the full reference pack is present first:

```bash
npm run build:full
```

Cloudflare Pages settings:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build:full` |
| Output directory | `dist` |
| Node | 20+ |

The deployed application needs no Pages Functions, account, telemetry, database or server-side component.

## Validation

```bash
npm run check
npm test
npm run build
npm run smoke
npm run preview:visual
npm run validate
```

Additional engineering checks:

```bash
npm run benchmark
npm run benchmark -- --full
npm run behavior -- --seconds=60
npm run stress
```

`npm run smoke:strict` requires Chromium to be allowed to navigate to the local development server. In managed environments that enforce a wildcard URL blocklist, the normal smoke command reports an explicit skip instead of claiming a browser pass.

The current redesign release validates 47 JavaScript modules, passes 39 deterministic tests, rebuilds the static site and generates six production-source visual previews. See `BUILD_REPORT.md`, `docs/VALIDATION.md` and `docs/REDESIGN_IMPLEMENTATION.md` for exact coverage and qualifications.

## Scientific sources

The design is grounded in, but does not claim to reproduce completely:

- FlyWire whole-brain connectome: <https://doi.org/10.1038/s41586-024-07558-y>
- whole-brain LIF model: <https://doi.org/10.1038/s41586-024-07763-9>
- NeuroMechFly v2 embodiment: <https://doi.org/10.1038/s41592-024-02497-y>
- stochastic walking odor navigation: <https://doi.org/10.7554/eLife.57524>
- BANC brain-and-VNC connectome: <https://doi.org/10.1038/s41586-026-10735-w>

## License

MIT. Data provenance and third-party notices are in `THIRD_PARTY_NOTICES.md` and `docs/DATA.md`.
