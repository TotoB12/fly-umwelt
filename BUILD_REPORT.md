# Fly Umwelt 3.0.0 — build report

Generated: 2026-08-18

## Release result

This release completes the planned deep UI/UX rebuild without changing the fly’s scientific claims or decision-making boundary. The production source now presents a fly-centered nocturnal observatory, an event-first status surface, six coherent inspection views, a sampled neural field, a bounded ethogram and camera-aware live editing.

The app remains a static site. The world and brain continue to run in separate module Workers, while camera state, explanatory text, neural particles and history remain observer-side.

## Verification summary

| Check | Result |
|---|---:|
| Static/source validation | Pass — 97 files, 47 JavaScript modules |
| Deterministic Node tests | Pass — 39 / 39 |
| Production static build | Pass |
| Production-source visual preview | Pass — 6 screenshots, 338 canvas frames, 10 ethogram segments, 14 px body text |
| Full local-page Chromium smoke | Environment-blocked — managed `URLBlocklist=["*"]`; no browser pass claimed |
| Fixture neural benchmark | 107.836× biological real time for 20 s |
| Vendored 139,255-neuron benchmark | 1.630× biological real time for 2 s |
| Synthetic 139,255-node scale test | 0.907× biological real time for 0.25 s |
| Deterministic behavior panel | Pass — 7 distinct endpoints, consumption in 5 / 7 runs |

Benchmark values describe this build environment and are not promises for every device. The synthetic scale test matches reference counts but is not biological validation. The full-pack benchmark exercises the vendored parser and neural engine; it is not a behavioral validation of the 139k graph.

## Implemented redesign coverage

### Camera, chamber and fly

- Follow is the default and uses soft interpolation around the fly.
- Overview shows the complete chamber and is used automatically for editing.
- Free camera navigation supports pointer pan, wheel zoom, two-pointer pinch/pan, explicit controls and keyboard alternatives.
- Screen-to-room and room-to-screen transforms are centralized in the renderer and used by the editor.
- The fly is larger and more legible, with heading, locomotor posture and subtle physiology cues that are explicitly illustrative rather than anatomical.
- Chamber geometry is visually quiet while resources, local light, threats and recent movement become readable environmental evidence.

### Living status and inspection hierarchy

- The largest live statement is current behavior plus an observer-side explanation.
- Neural activity, physiology, memory and meaningful recent events remain visible in a compact strip.
- Observe uses one inspection surface instead of nested card stacks.
- Now, Umwelt, Neural, History, Memory and Brain retain or expand all original information and controls.

### Umwelt

The main Umwelt canvas and Umwelt inspection view use only snapshot values already available to the observer: retinal brightness, motion, proximity and looming; bilateral odor; touch, taste, light and self-motion; and modeled memory guidance. No new privileged world fields were added to the neural packet.

### Sampled neural field

The worker already emitted up to 4,000 sampled firing-neuron indices per frame. The redesign now renders those indices as pooled, decaying particles. A compact `Uint8Array` atlas is built once from existing connectome population mappings and transferred with `brain-ready`.

The visualization is deliberately labeled as:

- sampled rather than complete;
- model activity rather than a biological recording;
- population-grouped rather than anatomical;
- diagrammatically placed rather than a reconstructed brain image.

### Ethogram/history

`EthogramHistory` records display-side behavior segments and sensory/event markers with bounded memory. Repeated states coalesce; old data is trimmed; duplicate rolling events are suppressed; and restoring an older simulation time clears display history. No history object is included in world-to-brain or brain-to-body packets.

### Editing and persistence

The editor remains live while the simulation runs. It supports transformed-coordinate selection, dragging and object creation; keyboard movement and deletion; undo/redo; room save/load; JSON import/export; and complete individual save/restore. Entering editing does not recreate either Worker or reset neural/body/memory state.

## Visual review

The production-source visual harness injects the real `index.html`, `src/styles.css`, `src/ui/renderer.js` and `src/ui/ethogram.js` into Chromium, supplies representative fixture state and captures:

- `docs/previews/desktop-world.png`
- `docs/previews/desktop-umwelt.png`
- `docs/previews/desktop-neural.png`
- `docs/previews/desktop-history.png`
- `docs/previews/narrow-world.png`
- `docs/previews/wide-edit.png`

It asserts readable typography, minimum interaction geometry, active canvas rendering and non-empty history. This harness validates visual composition and real renderer code, but it does not replace the full Worker/integration smoke test.

## Browser-smoke qualification

The real application smoke probe remains in `src/smoke-probe.js` and covers:

- initial graph readiness and simulation link;
- play, pause, step and speed;
- Natural, Connectome and Evoked modes;
- World/Umwelt switching and all six Observe tabs;
- Follow/Overview/zoom/reset camera controls;
- live room editing while running under a transformed camera;
- object creation, selection, movement, deletion, undo and redo;
- touch, airflow and light interventions;
- room save/load plumbing and complete fly save/restore;
- neural atlas, ethogram population and renderer frame progress.

This execution environment enforces Chromium policy `URLBlocklist=["*"]`, which blocks even local HTTP pages. Therefore `npm run smoke` reports an explicit skip, and `npm run smoke:strict` fails as designed. A release environment without that policy should run `npm run smoke:strict`; this report does not substitute the visual harness for a full integration pass.

## Deterministic behavior panel

A 60-second seven-seed panel using the bundled validation graph produced:

- 7 distinct rounded endpoints from 7 seeds;
- resource consumption in 5 of 7 runs;
- maximum boundary occupancy of 7.02%;
- maximum continuous high-turn interval of 0.76 s;
- walk, pause, saccade, reverse, drinking and feeding states rather than one continuous steering command.

Run it with:

```bash
npm run behavior -- --seconds=60
```

This validates the modeled body/VNC and software integration, not the behavior of the full connectome.

## Performance architecture

- body integration: 100 Hz;
- sensory/neural exchange: 20 Hz;
- worker snapshots: up to 25 Hz;
- display: `requestAnimationFrame` with snapshot interpolation;
- world and brain run off the main thread;
- sampled firing indices are bounded;
- the display atlas is transferred once;
- neural particles and ethogram history are pooled/trimmed on the observer side.

## Commands run

```bash
npm run check
npm test
npm run build
npm run smoke
npm run preview:visual
npm run benchmark
npm run benchmark -- --full
npm run behavior -- --seconds=60
npm run stress
```

`npm run validate` composes fixture generation, source validation, tests, build and non-strict smoke. Use `npm run smoke:strict` in an unrestricted browser environment before public release.
