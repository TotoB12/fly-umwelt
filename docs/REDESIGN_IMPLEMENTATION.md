# Redesign implementation record

> **Historical record:** this document describes the presentation-focused 3.0 redesign and its 39-test release gate. For current 3.8.0 status, start with [`README.md`](README.md), [`NEXT_DEVELOPER_HANDOFF.md`](NEXT_DEVELOPER_HANDOFF.md), [`../README.md`](../README.md) and [`../BUILD_REPORT.md`](../BUILD_REPORT.md). The 3.1 scientific/compute stage remains preserved in [`../ACCURACY_IMPLEMENTATION_REPORT.md`](../ACCURACY_IMPLEMENTATION_REPORT.md).

## Scope

The redesign changes presentation and observation, not the fly’s scientific model. It preserves the static deployment, existing simulation controls, three brain modes, room editing, persistence, causal packet boundary and disclosed hybrid VNC/body assumptions.

The intended emotional loop is now implemented directly in the interface:

```text
notice a small living event → infer what the fly may be sensing →
inspect neural/body evidence → return to quiet observation
```

## Design translation

### A protagonist rather than a cursor

The previous whole-room framing made the fly too small. Follow mode now tracks a larger fly silhouette with soft interpolation and environmental context. Overview remains one explicit action away and is mandatory during editing, so narrative focus does not remove spatial control.

The body art communicates heading, current locomotion and subtle modeled state. It intentionally avoids anatomical-detail claims.

### Light as evidence

The palette uses near-black indigo surfaces and reserves brighter cyan, violet, organic resource accents and restrained amber/coral for live evidence. Borders are sparse and containment is communicated primarily through value, spacing and hierarchy.

Neural cores, resource proximity, selected controls and important state changes earn luminance. Static chrome stays quiet.

### Event-first hierarchy

The living strip gives the most space and typographic weight to current behavior and its reason. Neural activity is second. Energy, hydration and memory remain continuously available but no longer dominate slowly changing space.

Long scientific explanations are moved into panel introductions, details and the claims dialog rather than competing with observation.

### One inspection surface

Observe is one drawer/bottom sheet with six sibling views rather than cards inside cards. Tabs use the WAI-ARIA tab roles and relationships, one roving tab stop, arrow-key navigation, Home/End and explicit panel focusability.

Because every panel is already local and can be displayed instantly, arrow-key focus automatically activates the adjacent tab. This follows the APG allowance for automatic activation when panel display has no perceptible latency; tab changes remain observer-side and create no model work or behavioral input.

### Unified pointer and non-drag interaction

The camera and editor use Pointer Events so mouse, pen and touch share one state machine. A second pointer transfers control from object editing to camera pinch/pan. Explicit Follow, Overview, zoom and reset controls remain available, and keyboard alternatives cover camera navigation and object movement/deletion.

This avoids making a drag gesture the only way to perform an essential operation.

### Motion tied to state

Motion communicates model events: soft camera tracking, fly locomotion, fading sampled spikes and ethogram progression. CSS transitions are disabled or reduced under `prefers-reduced-motion`; canvas animation also reads the preference and maintains a stable paused view.

### Ethogram as an observational instrument

The history view treats behavior as labeled temporal segments, following the established ethogram convention of representing categorical action over time. It also overlays sparse event markers so behavior can be interpreted against touch, taste, visual risk, odor change and memory guidance.

History is deliberately bounded and display-side. It is not training data, policy state or a behavior controller.

## Technical implementation map

| Workstream | Implemented in | Result |
|---|---|---|
| Layout and controls | `index.html`, `src/app.js`, `src/styles.css` | Persistent transport, event-first strip, six-view inspector, responsive observatory shell |
| Camera/chamber/fly | `src/ui/renderer.js` | Follow/Overview/Free camera, transforms, gestures, enriched chamber and fly art |
| Neural field | `src/core/connectome-data.js`, `src/workers/brain.worker.js`, `src/ui/renderer.js`, `src/app.js` | Parser-derived display atlas + bounded sampled-spike particles and text equivalents |
| Umwelt | `index.html`, `src/app.js`, `src/ui/renderer.js`, `src/styles.css` | Main fly-relative composition and detailed inspection from existing snapshot fields |
| Ethogram/history | `src/ui/ethogram.js`, `src/app.js` | Bounded segments, markers, detail selection, recent list and rolling windows |
| Editor compatibility | `src/editor/room-editor.js`, `src/editor/history.js`, renderer transforms | Correct hit testing/creation under pan and zoom; live state preserved |
| Validation | `scripts/validate.mjs`, `src/smoke-probe.js`, `scripts/visual_preview.mjs`, tests | Static assertions, 39 deterministic tests, expanded smoke and responsive screenshots |
| Static output | `scripts/build.mjs`, `dist/` | Regenerated same-origin static deployment |

## Data and causal integrity

No camera, canvas, history or observer-caption field was added to the world-to-brain packet. `src/core/protocol.js` still rejects coordinates, object lists, targets and ideal actions.

The neural field consumes only:

- existing `sampleSpikes` firing-neuron indices;
- parser-derived population mappings;
- observer-side display time.

The Umwelt view consumes only fields already present in the world snapshot. The ethogram reads snapshots but never mutates them. Editing sends the same room-update messages as before and never recreates the workers.

## Accessibility decisions

- 14 px default body type; 11 px minimum compact labels.
- Textual values accompany all color-coded evidence.
- Visible focus states and a skip link.
- ARIA tabs with keyboard navigation and associated tabpanels.
- Camera keyboard controls and explicit buttons.
- Editor keyboard movement/deletion and a separate Pan tool.
- Coarse-pointer targets expand to 44 px where space permits.
- Reduced-motion and forced-colors handling.
- Narrow layouts keep transport, modes, editing and Observe reachable.

## Design-research references

The implementation was checked against these primary or authoritative interaction sources:

- WAI-ARIA Authoring Practices — Tabs Pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>
- WAI-ARIA manual-activation tabs example: <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/>
- W3C Pointer Events Level 3: <https://www.w3.org/TR/pointerevents3/>
- WCAG 2.2 Understanding 2.5.7, Dragging Movements: <https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html>
- WCAG 2.2 Understanding 2.5.8, Target Size (Minimum): <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- WCAG Understanding 2.3.3, Animation from Interactions: <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>
- Bohnslav et al., *DeepEthogram*, eLife 2021: <https://doi.org/10.7554/eLife.63377>

These sources informed interaction structure and representation only. They do not add scientific claims about the fly model.

## Visual artifacts

Generated from the production HTML/CSS/renderer/ethogram source:

- `docs/previews/desktop-world.png`
- `docs/previews/desktop-umwelt.png`
- `docs/previews/desktop-neural.png`
- `docs/previews/desktop-history.png`
- `docs/previews/narrow-world.png`
- `docs/previews/wide-edit.png`

Regenerate them with:

```bash
npm run preview:visual
```
