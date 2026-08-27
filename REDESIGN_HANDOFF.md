# Fly Umwelt — UI/UX Redesign Handoff

> **Historical pre-implementation plan (3.0):** the redesign described here was subsequently completed. Do not use its future-tense status as the current project handoff. Start with [`docs/README.md`](docs/README.md), [`docs/NEXT_DEVELOPER_HANDOFF.md`](docs/NEXT_DEVELOPER_HANDOFF.md), [`README.md`](README.md) and [`BUILD_REPORT.md`](BUILD_REPORT.md).

## Status and scope

This document records the design direction agreed on **18 August 2026** before implementation began. At that historical point, the project was being redesigned locally only. Its static Cloudflare Pages and no-service/account/telemetry/database/server constraints remain current.

The redesign must keep the model, data, causal boundaries, simulation controls, room editor, persistence, and existing capabilities. It is a new presentation and observation experience, not a change to the fly's scientific claims or decision-making model.

Implementation had not begun when this historical handoff was written, except for the local screenshot helper at `scripts/shot.mjs`. The redesign was later completed; see `docs/REDESIGN_IMPLEMENTATION.md` for that record and the current handoff links above for present status.

## Product intent

Fly Umwelt should feel like observing an autonomous, nonhuman organism rather than operating a game character or reading an engineering dashboard. The main emotional loop is:

```text
notice a small living event → infer what the fly may be sensing →
inspect its neural/body evidence → return to quiet observation
```

The fly is the protagonist. The interface should make it legible and compelling without implying that the model is conscious, fully biological, or aware of the room's ground-truth coordinates.

## Decisions already made

| Area | Decision |
| --- | --- |
| Visual language | **Bioluminescent, deep dark**: a calm nocturnal observatory, with light used sparingly to show live signals. |
| Scope of redesign | **Deep rebuild + new views**, while retaining all existing controls and capabilities. |
| New data visualizations | Render the existing neural `sampleSpikes` data as a neural field; add camera zoom/pan/follow; add a behavior ethogram/history; enrich the fly and chamber rendering. |
| Deployment | Continue to ship as static files; preserve the existing Cloudflare Pages path. |
| Scientific posture | Keep the existing limitations, data provenance, and information-boundary language visible and intact. |

## Audit findings driving the redesign

1. The whole-room camera makes the fly a tiny visual speck, even though it is the point of the app.
2. The brain worker emits up to 4,000 actual firing-neuron indices per frame as `sampleSpikes`, but the renderer does not visualize them. The live connectome is therefore reduced to a small population-rate sparkline.
3. Much of the typography is roughly 7–9 px and is not comfortably readable.
4. The most visible bottom-strip space is allocated to slowly changing energy and hydration, while current behavior gets too little emphasis.
5. The Umwelt screen is visually sparse although it should be the signature view of the organism's perception.
6. The Observe area has too many nested bordered cards and little hierarchy.
7. The existing cool clinical green and warm brown fly do not form a coherent visual system.

## Design system

### Mood and palette

Use a near-black blue/indigo base rather than pure black. Surfaces should be subtle value shifts, not opaque card stacks. The chamber is mostly implied through dim geometry, particulate light, and environmental gradients.

- Background: midnight blue-black / deep indigo.
- Primary live signal: restrained cyan-teal bioluminescence.
- Neural spikes: blue-violet with short-lived bright cores.
- Food and water: distinct muted organic accents that remain discernible from threat cues.
- Threat/risk: warm amber to restrained coral, reserved for meaningful alerts.
- Text: cool off-white with deliberately lower-contrast secondary labels.
- Borders: low-contrast, used only to communicate containment or an active state.

Do not use neon everywhere. Light is evidence: an active neuron, a nearby cue, a selected mode, or an important state change should earn brightness.

### Typography and hierarchy

- Establish a readable default body size (at least 13–14 px) and comfortable labels (11–12 px minimum).
- Use one strong current-behavior statement as the primary live readout.
- Treat explanatory/scientific text as optional, expandable context rather than competing chrome.
- Prefer grouped labels, spacing, and background contrast over many boxed cards.

### Motion and interaction

- Animation should reflect model events, not decorate the app: pulsing neural activity, fading ethogram segments, and soft camera interpolation.
- Respect reduced-motion preferences and provide a stable, readable paused state.
- Every color-coded signal needs a textual value or label available in the interface.
- Preserve keyboard, touch, and existing smoke-test control behavior.

## Proposed information architecture

### Persistent top bar

Keep the existing play/pause, step, speed, and Brain mode controls readily available. Make run state and the selected mode clear at a glance. Move secondary actions into an unobtrusive overflow/menu, retaining access to loading the full graph and room operations.

### Main observation canvas

The main canvas is the primary place to watch the animal. It should support:

- **Follow** mode as the default: a modest, smoothly interpolated fly-centered camera with enough nearby context to understand behavior.
- **Overview** mode: the whole room, for spatial context and room editing.
- Pointer/wheel or touch gestures for pan and zoom, with an explicit reset/follow control.
- A larger, more expressive fly silhouette with heading, locomotion, and subtle body-state cues; it must still be an honest visualization rather than a claim of anatomical fidelity.
- Chamber lighting, odor/food/water/threat cues, and shelter/wall geometry rendered as quiet environmental evidence.

Editing should continue to use a clear whole-room context. The live editor, undo/redo, persistence, import/export, and running-state preservation must remain unchanged.

### Living status strip

Replace the present equal-weight metric strip with an event-first, compact strip:

1. Current behavior and why it is happening (largest, e.g. “walking — odor-loss reorientation”).
2. A compact neural activity indicator.
3. Small physiology/memory indicators, available for expansion rather than dominating the screen.
4. Time/run context and an activity log entry only when useful.

Energy and hydration remain accessible and visible, but should not crowd out an active behavioral event.

### Observe drawer / inspection views

Use one clear inspection surface with tabs or segmented views, avoiding cards inside cards.

- **Now**: behavior, current explanation, physiology, memory confidence, and a concise event log.
- **Umwelt**: the signature perceptual view. Show bilateral odor evidence, compound-eye/proximity/brightness cues, touch/taste, light, and memory guidance as a spatial/temporal sensory composition rather than a mostly blank technical trace.
- **Neural field**: display activity derived from the existing `sampleSpikes`, grouped by the real metadata/population mappings available in the app. Make explicit that it is a sampled visualization, not a literal full-brain recording or anatomical map.
- **History**: an ethogram timeline of walk, pause, saccade, reverse, feeding, escape, and relevant sensory events, with hover/selection details and a short rolling window.
- **Memory and brain detail**: retain the current memory, brain evidence, and intervention information, reorganized under the same hierarchy.

## Technical implementation map

| Workstream | Likely files | Notes |
| --- | --- | --- |
| Layout, HTML, controls | `index.html`, `src/app.js`, `src/styles.css` | Preserve existing DOM IDs unless tests and scripts are intentionally updated together. |
| Main camera/chamber/fly rendering | `src/ui/renderer.js` | Add camera state, follow/overview modes, coordinate transforms, gestures, fly art, and environmental rendering. Do not feed camera/UI data back into the model. |
| Neural visualization | `src/ui/renderer.js`, `src/app.js`, `src/core/brain-engine.js`, `src/core/connectome-data.js` | Consume existing `sampleSpikes` and available group metadata. Avoid raising worker-transfer or render costs unnecessarily; pool/decay particles or aggregate bins. |
| Umwelt view | `index.html`, `src/app.js`, `src/styles.css`, possibly `src/ui/renderer.js` | Recompose data already sent in world snapshots. Do not add privileged world information to the brain packet. |
| Ethogram/history | `src/app.js`, possibly a small new `src/ui/` module | Record display-side snapshots/events with bounded memory. The history is observational only and must never influence behavior. |
| Room editing compatibility | `src/editor/room-editor.js`, `src/editor/history.js`, renderer transforms | Ensure screen-to-room conversion works at every zoom and panned position. |
| Static output | `scripts/build.mjs`, `dist/` | Continue rebuilding `dist` from source; do not hand-edit generated output. |

## Recommended delivery sequence

1. Establish design tokens, responsive typography, page-level spacing, and accessible contrast in `src/styles.css`.
2. Rebuild the main renderer around camera transforms, then restore/editor-test all pointer coordinate conversions.
3. Make the fly and chamber immediately readable in both follow and overview modes.
4. Restructure the top bar, primary status strip, and Observe layout without removing controls.
5. Build the Umwelt screen from existing sensory snapshot fields.
6. Add the neural field using sampled spikes and available populations; document exactly what the rendering represents.
7. Add a bounded ethogram/event history and inspection details.
8. Tune visual motion, reduced-motion behavior, narrow viewport layout, and empty/demo/full-graph states.
9. Rebuild the static site and run the validation suite before release.

## Guardrails

- Do not add target coordinates, room-object lists, or ideal actions to the neural or VNC inputs. `src/core/protocol.js` is the boundary to protect.
- Do not convert neural left/right evidence directly into continuous arcade steering; retain the disclosed VNC locomotion model.
- Do not make visualization claims beyond the documentation: the neural field is a visualization of sampled model activity, not a biological brain image.
- Keep Natural, Connectome, and Evoked modes, their labels, and their differing assumptions.
- Keep the room editor live and state-preserving while the simulation runs.
- Preserve static hosting and keep the full graph optional/bundled according to the current build flow.
- Do not sacrifice usability at small viewports for the desktop visual composition.

## Verification checklist

Before handoff, run:

```bash
npm run check
npm test
npm run build
npm run smoke
```

For the full release path, use `npm run validate` (and, when the reference data is installed, the project’s existing full/stress commands). Review screenshots at narrow, standard desktop, and wide desktop sizes. Specifically verify:

- all original main controls and Observe information remain reachable;
- editing, undo/redo, save/load, import/export, and running-state preservation still work with pan/zoom;
- the fly is legible at default scale and overview still provides spatial context;
- neural/Umwelt/history views remain correct in demo and full-graph modes;
- the causal-boundary and limitation language remains accurate;
- `dist/` is regenerated from source and remains deployable to Cloudflare Pages.

## Open design details to decide during implementation

The overarching direction is decided. These are implementation-level choices that can be tuned from live screenshots without changing the brief:

- Exact degree of default follow-camera zoom and the transition to overview while editing.
- Whether neural activity is shown as a field, constellation, radial population map, or a combination at different scales, based on the available metadata and frame budget.
- The final balance between a persistent ethogram strip and a History inspection tab on smaller screens.
- Final color values after contrast and color-vision testing.
