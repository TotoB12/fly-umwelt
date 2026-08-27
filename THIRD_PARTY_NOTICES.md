# Third-party notices

## BANC data

Fly Umwelt bundles a derived static pack generated from public BANC v888 compiled metadata and the v3 aggregate edge table hosted by the Lee Lab project. Source URLs and SHA-256 hashes are recorded in `public/data/banc/manifest.json` and `audit.json`.

Primary paper: Bates, Phelps, Kim, Yang et al., *Nature* (2026), DOI `10.1038/s41586-026-10735-w`.

Static archive: Harvard Dataverse DOI `10.7910/DVN/7WTH1N`.

The Nature article is open access under CC BY 4.0. Preserve source attribution and review the dataset/archive terms before redistributing data independently of Fly Umwelt.

## FlyWire / FAFB data

The optional brain-comparison manifest references public data objects packaged by `snedea/flybrain` at pinned commit:

```text
9191824d17871b7851645782d53d23f213ddb938
```

Those objects are derived from FlyWire FAFB v783. The runtime verifies pinned hashes where provided. Fly Umwelt does not reuse the reference project's simulation or behavior source code.

Reference repository: <https://github.com/snedea/flybrain>.

Primary paper: Dorkenwald et al., *Nature* 634, 124–138 (2024), DOI `10.1038/s41586-024-07558-y`.

## Neural model parameters

Global LIF parameters and the whole-connectome modeling precedent are based on Shiu et al., *Nature* (2024), DOI `10.1038/s41586-024-07763-9`.

## FlyGym / NeuroMechFly v2 morphology

Fly Umwelt bundles the controller-free flattened browser model and 39 STL meshes published with FlyGym `v2.1.0` under Apache-2.0.

- source release commit: `ca65a510c2afe6ac61c51df4f274c8d190c2f95f`;
- official browser-asset commit: `0884af08981994543634563d95e9b1eb49945082`;
- project: <https://github.com/NeLy-EPFL/flygym>;
- primary paper: Wang-Chen et al., *Nature Methods* 21, 2353–2362 (2024), DOI `10.1038/s41592-024-02497-y`;
- vendored license: `public/vendor/licenses/flygym-v2.1.0-LICENSE`.

File-level sources, hashes and byte counts are frozen in `public/data/morphology/neuromechfly-v2.1.0/provenance.json`. Fly Umwelt does not bundle FlyGym's CPG, rule-based controller, tripod gait, preprogrammed steps, game behavior or Python runtime. The older front-tibia inertia prior remains separately attributed history.

## MuJoCo WebAssembly

Fly Umwelt bundles `@mujoco/mujoco` `3.9.0` JavaScript/WebAssembly from the official FlyGym browser viewer. MuJoCo is copyright Google DeepMind and contributors and is licensed under Apache-2.0.

- project: <https://github.com/google-deepmind/mujoco>;
- package: <https://www.npmjs.com/package/@mujoco/mujoco>;
- vendored license: `public/vendor/licenses/mujoco-3.9.0-LICENSE`.

The runtime is used for local articulated dynamics and contact only. Upstream position-actuator gains, friction and solver settings are retained as engineering model parameters, not claimed as measured fly physiology.

## Front-leg physiology and observation sources

Azevedo et al., *eLife* (2020), DOI `10.7554/eLife.56754`, is CC BY 4.0. Fly Umwelt transcribes reported probe/motor scalars and bundles a compact derived coordinate product from publisher Figure 4D. Those coordinates are labeled publisher-figure-derived and are not represented as raw recordings.

Mamiya et al., *Neuron* (2018), DOI `10.1016/j.neuron.2018.09.009`, supplies reported FeCO protocols and observations. Public GPL-3.0 analysis repositories were inspected as methodology but no GPL source is copied into the MIT runtime.

Chen et al., *Nature* (2013), DOI `10.1038/nature12354`, PMCID `PMC3777791`, supplies factual GCaMP6f timing context only. The provisional browser filter is original project code and is not claimed as a preparation-specific fit.

## Project source

The application, neural engine, Workers, body plant, parser, data builders, tests and documentation in this release are implemented in this repository and licensed under MIT, except for the separately attributed data products above.
