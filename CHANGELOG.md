# Changelog

## 3.0.0 — 2026-08-18

Completed the deep visual and observational redesign while preserving the model, causal boundaries, controls, editor, persistence, data flow and static deployment architecture.

### Observation experience

- Rebuilt the product as a bioluminescent deep-dark observatory with restrained evidence-driven light.
- Made the fly the visual protagonist through a larger expressive silhouette, heading cues, body-state cues and a smoothly interpolated Follow camera.
- Added Overview and free-camera states, wheel zoom, pointer pan, pinch gestures, explicit zoom/reset controls and keyboard navigation.
- Reworked chamber rendering with quiet geometry, environmental gradients, particulate light, resources, shelter, threats and recent locomotor trail.
- Added a signature fly-relative Umwelt composition using only existing snapshot sensory fields.
- Replaced the equal-weight metric strip with an event-first living status strip led by behavior and its observer-side explanation.

### Inspection views

- Reorganized Observe into one hierarchy with six ARIA tabs: Now, Umwelt, Neural, History, Memory and Brain.
- Visualized the existing `sampleSpikes` stream as a decaying neural field.
- Added a compact display atlas derived from the parser’s existing population mappings and transferred once at brain initialization.
- Added explicit provenance copy: the field is sampled, diagrammatic and neither anatomical nor a full-brain recording.
- Added a bounded observer-side ethogram for walk, pause, saccade, reverse, feeding, drinking and related sensory/event markers.
- Added hover, click and keyboard inspection plus selectable 30/60/120/180-second history windows.
- Retained physiology, memory, network evidence, interventions and neuron lookup under the new hierarchy.

### Editor and compatibility

- Rebuilt editor pointer handling around camera transforms so selection, creation and movement remain correct at every zoom and pan.
- Added a dedicated Pan tool and two-pointer gesture handoff.
- Preserved live editing, undo/redo, keyboard movement, deletion, room save/load, JSON import/export and complete-fly persistence.
- Preserved worker state and the running simulation while editing; entering edit mode uses whole-room context and restores the prior camera afterward.

### Accessibility and responsive design

- Raised base type to 14 px and compact labels to at least 11 px.
- Added standard keyboard behavior for the six-tab inspection surface.
- Added visible focus treatment, forced-colors support, coarse-pointer sizing and non-drag alternatives.
- Added reduced-motion behavior and a stable paused state.
- Reworked narrow, standard and wide layouts without removing controls.

### Validation and release engineering

- Expanded source validation to 97 required files and 47 JavaScript modules.
- Expanded deterministic tests from 35 to 39, including neural display-atlas and bounded-ethogram coverage.
- Expanded the browser smoke probe to exercise camera modes, all six views and editing under transformed coordinates.
- Added a production-source Chromium visual harness with six responsive screenshots and layout assertions.
- Made the smoke runner report managed wildcard URL policies explicitly rather than hanging or claiming a pass.
- Made validation-fixture gzip output byte-for-byte reproducible.
- Rebuilt `dist/` from source; no generated file is intended for hand editing.

## 2.0.0

Whole-connectome from-scratch architecture and strict worker boundary.

## 1.1.0

Corrected live editing, control races, obstacle sensing and the original synthetic controller.
