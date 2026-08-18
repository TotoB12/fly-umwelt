# Validation

## Release commands

Run the handoff checklist independently:

```bash
npm run check
npm test
npm run build
npm run smoke
```

Run the composed local path with:

```bash
npm run validate
```

Add responsive visual review:

```bash
npm run preview:visual
```

For an unrestricted release environment, require the full browser pass:

```bash
npm run smoke:strict
```

## Current results — 2026-08-18

| Check | Result |
|---|---:|
| Source/static validation | 97 files and 47 JavaScript modules validated |
| Deterministic tests | 39 / 39 passed |
| Static build | Passed; `dist/` regenerated from source |
| Visual preview | Passed; six captures, 338 renderer frames, 10 ethogram segments, 14 px base type |
| Real local-page smoke | Skipped by explicit environment policy detection; Chromium has `URLBlocklist=["*"]` |
| Fixture benchmark | 107.836× biological real time for 20 s |
| Full-pack benchmark | 1.630× biological real time for 2 s |
| Synthetic reference-scale test | 0.907× biological real time for 0.25 s |

A skipped browser test is not a pass. The smoke code and strict mode remain part of the release, and strict execution is required where Chromium may navigate to localhost.

## Static/source validation

`npm run check` verifies:

- JavaScript syntax and required assets;
- all original control IDs plus the new camera and inspection controls;
- six correctly related ARIA tabs and keyboard navigation code;
- camera modes, gestures and coordinate-transform APIs;
- editor use of renderer transforms and restoration of prior camera state;
- bounded, observer-only ethogram implementation;
- sampled-spike atlas provenance and use of existing population mappings;
- protocol rejection of camera, history and privileged world fields;
- readable typography tokens;
- reduced-motion, coarse-pointer, focus and forced-colors behavior;
- static package/build identity.

## Deterministic model tests

`npm test` checks:

- absence of scripted target-direction or food-seeking functions;
- strict world-to-brain information boundaries;
- LIF decay, delay, transmitter sign and deterministic state;
- mode differences and conservative Evoked behavior;
- output decoding and neural serialization;
- connectome parser and population mapping behavior;
- display-atlas coverage for every neuron;
- bounded ethogram coalescing, markers and restored-time handling;
- finite saccades rather than continuous turn lock;
- tactile reverse-and-turn escape;
- bounded wall occupation across several seeds;
- varied trajectories and resource encounters;
- finite feeding/drinking bouts;
- live room changes without resetting time, physiology, VNC or depleted resources;
- deterministic save/restore and world trajectories.

## Full browser probe

`src/smoke-probe.js` is loaded only with `?smoke=1`. It uses real DOM controls and pointer/keyboard events to exercise:

- initial brain/world link and renderer progress;
- play, pause, step and speed changes;
- Natural, Connectome and Evoked modes;
- World and Umwelt views;
- opening/closing Observe and all six tabs;
- Follow, Overview, zoom and reset;
- live editing while running under non-default camera transforms;
- every object creation tool;
- selection, movement, resizing, deletion, undo and redo;
- touch, airflow and light interventions;
- room save/load plumbing;
- complete fly save/restore;
- neural atlas and ethogram population.

`scripts/smoke.mjs` launches the built app in headless Chromium over local HTTP and captures a screenshot only after the probe passes. It detects a managed wildcard URL policy before launch. Non-strict mode reports a skip; strict mode fails.

## Production-source visual review

`scripts/visual_preview.mjs` exists because the current managed Chromium can execute an `about:blank` document but cannot navigate to localhost. It injects the real production HTML, CSS, renderer and ethogram source, then supplies representative fixture state.

The harness captures:

- standard desktop World;
- standard desktop Umwelt;
- desktop Neural inspection;
- desktop History inspection;
- narrow World;
- wide room editing.

It asserts:

- body text of at least 13 px;
- compact labels of at least 11 px;
- interaction targets of at least 24 px in the tested desktop composition;
- multiple renderer frames;
- a populated ethogram;
- no browser exceptions or console errors.

This is a visual/layout test, not a substitute for Worker integration.

## Behavioral panel

The behavioral tests do not require every seed to find food. They require stronger anti-toy properties:

- different seeds produce different trajectories;
- turns are finite;
- no persistent maximum-turn circle;
- the fly does not spend most of a long run pressing against walls;
- contact creates a reverse-and-away sequence;
- at least some deterministic panel members encounter or consume resources.

The current 60-second seven-seed panel produced seven distinct rounded endpoints, resource consumption in five runs, 7.02% maximum wall occupancy and 0.76 seconds maximum continuous high-turn time.

## Engineering benchmarks

`npm run benchmark` measures the bundled validation graph. `npm run benchmark -- --full` parses and advances the vendored 139,255-neuron, 2,698,236-edge pack. `npm run stress` creates a synthetic graph with those counts to test allocation and stepping.

None of these performance checks establishes biological validity. The behavior panel validates the fixture + modeled VNC/body path, not the full graph.

## Manual release review

Before public deployment, review at narrow, standard and wide sizes and verify:

- every original control and inspection datum remains reachable;
- the fly is legible in Follow and the whole room is legible in Overview;
- pan/zoom does not break editor hit testing or creation;
- editing preserves the running state and can be undone/redone;
- save/load and import/export remain functional;
- Umwelt, neural and history views work in demo and full-graph states;
- reduced-motion produces a stable paused/readable presentation;
- limitation and information-boundary language remains visible;
- `dist/` is rebuilt rather than hand edited;
- `npm run smoke:strict` passes in an unrestricted Chromium environment.
