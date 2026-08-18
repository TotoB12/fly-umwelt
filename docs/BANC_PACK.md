# BANC pack

BANC joins the adult brain and ventral nerve cord and is the better long-term anatomical source for a whole-CNS simulation.

The included builder is:

```bash
python -m pip install numpy pyarrow
python scripts/build_banc_pack.py
```

It produces static metadata and edge shards compatible with the browser loader.

Important limitations remain:

- public schemas and snapshot locations can change;
- peripheral receptors, muscles and detailed biomechanics are still incomplete;
- a BANC graph does not provide neuron-specific dynamics or a living initial state;
- the current VNC behavior model is not replaced automatically by the anatomical graph.

The BANC publication is <https://doi.org/10.1038/s41586-026-10735-w>.
