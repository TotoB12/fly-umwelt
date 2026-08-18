# Data

## Bundled graph

The repository includes a deterministic 96-neuron validation graph so the interface, Workers, editor and behavioral systems always start offline.

It is visibly labelled **demo graph**.

## Reference FAFB pack

`public/data/manifest.json` pins three compressed files from the referenced browser export:

- `connectome.bin.gz`;
- `neurons.csv.gz`;
- `classification.csv.gz`.

The manifest expects:

- 139,255 neuron nodes;
- 2,698,236 weighted neuron-pair records.

Each remote object is checked against its pinned Git blob SHA-1 before decompression. The downloaded files are cached by the browser or can be vendored locally.

Install them with:

```bash
npm run data:reference
```

## Why the full files are not silently required

The large graph should not make the normal interface fail or wait through several network timeouts. If local verified files are absent, the application opens the demo immediately. Loading the full graph is an explicit, observable operation.

## Coverage limitation

The reference browser export has all listed neuron nodes but fewer weighted connection records than newer Codex summaries. It is useful for the browser engine but should not be presented as the maximum current FAFB edge export.

## Advanced builders

- `scripts/build_codex_fafb_pack.py` builds a sharded current FAFB pack from compatible Codex tables.
- `scripts/build_banc_pack.py` builds a BANC brain-and-VNC pack from compatible public tables.

Generated packs record source and output hashes. They are advanced workflows and are not exposed as normal interface choices until built.
