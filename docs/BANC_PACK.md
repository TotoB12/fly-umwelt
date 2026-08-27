# Bundled BANC v888 whole-CNS pack

## Why BANC is the default

BANC reconstructs a connected adult female brain and ventral nerve cord from one specimen. Its annotations explicitly connect sensory, ascending, descending, intrinsic, motor, visceral and endocrine pathways to body parts. This makes it a better structural basis for an embodied model than a brain-only graph.

Fly Umwelt bundles the processed BANC product. A visitor opens the static page and selects a tier; no Python process, account or external data source is required at runtime.

## Source products

The current pack was generated from:

```text
banc_888_meta.feather
banc_888_edgelist_simple_v3.feather
```

The manifest records SHA-256 hashes of both source files. The v888 identifier is the segmentation/metadata materialization. “v3” is the synapse-detector/edge-product version and must not be confused with the aggregate pair thresholds used by Fly Umwelt.

## Neuron selection

The emitted organism boundary is:

```text
(proofread OR roughly_proofread)
AND (
  not explicitly NOT_A_NEURON / GLIA / TRACHEA / DEBRIS
  OR status contains IS_REAL_NEURON
)
```

Audit counts:

| Item | Count |
|---|---:|
| Metadata objects | 188,508 |
| Currently proofread or roughly proofread | 156,012 |
| Explicit non-neuronal candidates | 170 |
| `IS_REAL_NEURON` overrides retained | 13 |
| Explicit non-neuronal objects excluded | 157 |
| Simulated neuronal objects | **155,855** |

The BANC paper reports 150,841 backbone-proofread plus 5,075 roughly-proofread neurons, or 155,916 total. It also notes that the live metadata table contains proofread marks added after the strict v888 snapshot. Fly Umwelt preserves its exact source hashes and current selection instead of deleting rows merely to reproduce a paper-era total.

## Transmitter evidence

The builder uses verified evidence first and falls back to predicted transmitter evidence when verified data is absent.

| Runtime class | Neurons | Fast channel |
|---|---:|---|
| Acetylcholine | 88,337 | positive |
| GABA | 21,309 | negative |
| Glutamate | 24,156 | negative approximation |
| Histamine | 4,634 | negative approximation |
| Modulatory | 10,936 | zero instantaneous fast gain |
| Conflict | 947 | zero instantaneous fast gain |
| Unknown | 5,536 | zero instantaneous fast gain |

Zero instantaneous gain means “not represented by the current fast LIF channel,” not “biologically inactive.” Postsynaptic receptor identity and slow modulation are not yet modeled.

## Edge tiers

The source contains 13,620,865 aggregate directed pairs. The builder skips 254,395 pairs with an excluded or absent endpoint, leaving 13,366,470 usable pairs.

| Tier | Component records | Cumulative pairs | Contact rule |
|---|---:|---:|---|
| Core | 1,912,731 | 1,912,731 | ≥5 |
| Balanced | 1,818,162 | 3,730,893 | add 3–4 |
| Maximal | 9,635,577 | 13,366,470 | add 1–2 |

Balanced is the default. The thresholds are not assertions that a three-contact pair is “real” and a two-contact pair is “false”; they expose a fidelity/uncertainty tradeoff.

## Weight semantics

Each stored value is the source edge table's normalized fraction:

```text
norm(pre → post) = aggregate contact count / total detected input to post
```

This avoids treating raw contact count as an absolute postsynaptic voltage. A disclosed global recurrent gain converts the dimensionless fraction into the current LIF synaptic-state approximation.

## Static layout

```text
public/data/banc/
  manifest.json
  audit.json
  edge-stats.json
  neurons.csv.gz
  classification.csv.gz
  edges-core-000.bin.gz …
  edges-balanced-000.bin.gz …
  edges-maximal-000.bin.gz …
```

There are 35 edge shards. Every shard includes a SHA-256, compressed byte count and record count in the manifest. The release gate verifies all of them.

## Rebuild command

Normal users do not need this. For source-audit work:

```bash
python -m pip install pyarrow numpy
npm run data:banc:strict
```

The deterministic builder sets gzip timestamps to zero. A rebuild against a changed live source may produce different hashes or counts; compare `audit.json` and source hashes before accepting it.

## Known anatomical limitations

BANC lacks:

- the lamina;
- the ocelli and ocellar ganglion;
- roughly 9,390 corresponding R1–R6/Lai/ocellar cells;
- complete neurons that arborize through those missing regions;
- undamaged left and right antennal nerves.

Electron microscopy also does not recover the living specimen's membrane parameters, receptor state, neuromodulatory state, muscle physiology or initial neural activity.
