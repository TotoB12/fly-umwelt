#!/usr/bin/env python3
"""Build Fly Umwelt's bundled BANC v888 whole-CNS static graph.

The visitor never runs this script. It is a repository-maintenance tool that
turns the public BANC metadata and v3 aggregate edge table into deterministic,
Cloudflare-Pages-compatible assets. The site then runs entirely in the browser.

Selection policy
----------------
Keep proofread or roughly-proofread objects, exclude explicit
NOT_A_NEURON/GLIA/TRACHEA/DEBRIS objects, and preserve explicit IS_REAL_NEURON
overrides. This is stricter and more auditable than treating a non-empty `flow`
field as proof of neuronal identity.

Structural tiers
----------------
Core     : >= 5 aggregate contacts
Balanced : Core plus 3-4 contacts (default)
Maximal  : Balanced plus 1-2 contacts

All edge records store the source/target neuron index and BANC's `norm` value
(`count / postsynaptic total input`), not raw contact count.

Requires Python 3.10+ with `numpy` and `pyarrow` in the *developer* environment.
No Python dependency is shipped to or required by the browser app.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import re
import shutil
import urllib.request
from collections import Counter
from contextlib import contextmanager
from pathlib import Path

BASE = "https://storage.googleapis.com/lee-lab_brain-and-nerve-cord-fly-connectome/compiled_data/banc_888"
META_URL = f"{BASE}/banc_888_meta.feather"
EDGE_VERSION = "v3"
EDGE_URL = f"{BASE}/banc_888_edgelist_simple_{EDGE_VERSION}.feather"
MAX_RECORDS_PER_SHARD = 400_000
PAGES_LIMIT = 25 * 1024 * 1024
KNOWN_SOURCE_SHA256 = {
    "meta": "701ea207d85cbb34593fba4e58f5c680d97bfe3a679c694bdc0abd0d270f96a7",
    "edges": "8c296e946f3c69a8c7222f30ad75fa8a98eeb189124fec6df829c9125f4be64b",
}
KNOWN_COUNTS = {
    "metadataRows": 188_508,
    "selectedNeurons": 155_855,
    "skippedMissingEndpoint": 254_395,
    "core": 1_912_731,
    "balanced": 3_730_893,
    "maximal": 13_366_470,
}
FAST_CANON = {
    "acetylcholine": "ACETYLCHOLINE", "ach": "ACETYLCHOLINE",
    "gaba": "GABA", "glutamate": "GLUTAMATE", "glut": "GLUTAMATE",
    "histamine": "HISTAMINE", "his": "HISTAMINE",
}
MODULATORY = {
    "dopamine", "da", "octopamine", "oa", "serotonin", "ser",
    "tyramine", "tyr", "nitric_oxide", "nitric oxide", "no",
}
BAD_OBJECT_TOKENS = {"NOT_A_NEURON", "GLIA", "TRACHEA", "DEBRIS"}
META_COLUMNS = [
    "banc_888_id", "root_id", "proofread", "roughly_proofread", "status",
    "side", "root_region", "region", "hemilineage", "nerve", "tract",
    "neuromere", "flow", "super_class", "cell_class", "cell_sub_class",
    "cell_type", "cns_network", "body_part_sensory", "body_part_effector",
    "peripheral_target_type", "cell_function", "cell_function_detailed",
    "neurotransmitter_predicted", "neurotransmitter_score",
    "neurotransmitter_verified", "neuropeptide_verified", "sexually_dimorphic",
]
CLASS_FIELDS = {
    "root_id": "banc_888_id", "flow": "flow", "region": "region",
    "root_region": "root_region", "super_class": "super_class",
    "class": "cell_class", "sub_class": "cell_sub_class",
    "cell_type": "cell_type", "side": "side",
    "body_part_sensory": "body_part_sensory",
    "body_part_effector": "body_part_effector",
    "peripheral_target_type": "peripheral_target_type", "nerve": "nerve",
    "tract": "tract", "function": "cell_function",
    "function_detailed": "cell_function_detailed", "cns_network": "cns_network",
    "neuromere": "neuromere", "hemilineage": "hemilineage",
    "proofread": "proofread", "roughly_proofread": "roughly_proofread",
    "status": "status", "sexually_dimorphic": "sexually_dimorphic",
    "neurotransmitter_verified": "neurotransmitter_verified",
    "neuropeptide_verified": "neuropeptide_verified",
    "neurotransmitter_predicted": "neurotransmitter_predicted",
    "neurotransmitter_score": "neurotransmitter_score",
    "nt_type": "nt_type", "nt_source": "nt_source",
    "nt_confidence": "nt_confidence",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, path: Path) -> None:
    if path.exists():
        print(f"using cached {path}")
        return
    print(f"downloading {url}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as source, path.open("wb") as target:
        shutil.copyfileobj(source, target, 1024 * 1024)


def first_column(names: list[str], candidates: list[str]) -> str | None:
    lower = {name.lower(): name for name in names}
    return next((lower[candidate.lower()] for candidate in candidates if candidate.lower() in lower), None)


def scalar_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return scalar_text(value).upper() in {"TRUE", "1", "YES", "Y"}


def status_tokens(raw) -> set[str]:
    return {item.strip().upper() for item in re.split(r"[,;|]+", scalar_text(raw)) if item.strip()}


def split_tokens(raw) -> list[str]:
    text = scalar_text(raw).lower().replace("-", "_")
    return [item.strip() for item in re.split(r"[,;|]+", text) if item.strip()]


def classify_nt(verified, predicted, score) -> tuple[str, str, float]:
    verified_tokens = split_tokens(verified)
    fast = sorted({FAST_CANON[token.replace(" ", "_")] for token in verified_tokens if token.replace(" ", "_") in FAST_CANON})
    try:
        confidence = max(0.0, min(1.0, float(score))) if scalar_text(score) else 0.0
    except ValueError:
        confidence = 0.0
    if verified_tokens:
        if len(fast) == 1:
            return fast[0], "verified", 1.0
        if len(fast) > 1:
            return "CONFLICT", "verified-conflict", 0.0
        return "MODULATORY", "verified-nonfast", 1.0
    predicted_tokens = split_tokens(predicted)
    if not predicted_tokens:
        return "UNKNOWN", "missing", 0.0
    token = predicted_tokens[0].replace(" ", "_")
    if token in FAST_CANON:
        return FAST_CANON[token], "predicted", confidence
    if token in MODULATORY or "peptide" in token:
        return "MODULATORY", "predicted-nonfast", confidence
    return "UNKNOWN", "predicted-unknown", confidence


@contextmanager
def deterministic_gzip_text(path: Path):
    raw = path.open("wb")
    compressed = gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0)
    import io
    text = io.TextIOWrapper(compressed, encoding="utf-8", newline="")
    try:
        yield text
    finally:
        text.flush(); text.detach(); compressed.close(); raw.close()


class ComponentWriter:
    def __init__(self, output: Path, component: str, max_records: int):
        self.output = output; self.component = component; self.max_records = max_records
        self.shards: list[dict] = []; self.edge_count = 0; self._file = None; self._gzip = None; self._in_shard = 0

    def _open(self):
        self.close()
        name = f"edges-{self.component}-{len(self.shards):03d}.bin.gz"
        path = self.output / name
        self._file = path.open("wb")
        self._gzip = gzip.GzipFile(filename="", mode="wb", fileobj=self._file, compresslevel=9, mtime=0)
        self._in_shard = 0
        self.shards.append({"path": path, "records": 0})

    def write(self, source, target, weight, np):
        offset = 0
        while offset < len(source):
            if self._gzip is None or self._in_shard >= self.max_records:
                self._open()
            take = min(len(source) - offset, self.max_records - self._in_shard)
            record = np.empty(take, dtype=[("pre", "<u4"), ("post", "<u4"), ("weight", "<f4")])
            record["pre"] = source[offset:offset+take]
            record["post"] = target[offset:offset+take]
            record["weight"] = weight[offset:offset+take]
            self._gzip.write(record.tobytes())
            self._in_shard += take; self.edge_count += take; self.shards[-1]["records"] += take; offset += take

    def close(self):
        if self._gzip is not None:
            self._gzip.close(); self._file.close(); self._gzip = None; self._file = None


def asset_spec(path: Path) -> dict:
    size = path.stat().st_size
    if size > PAGES_LIMIT:
        raise SystemExit(f"{path} exceeds Cloudflare Pages' 25 MiB static-asset limit")
    return {"local": f"./data/banc/{path.name}", "sha256": sha256(path), "compressedBytes": size}


def main() -> None:
    parser = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/banc"))
    parser.add_argument("--output-dir", type=Path, default=Path("public/data/banc"))
    parser.add_argument("--strict-known-source", action="store_true", help="Fail if source hashes or known current counts differ.")
    parser.add_argument("--max-records-per-shard", type=int, default=MAX_RECORDS_PER_SHARD)
    args = parser.parse_args()
    try:
        import numpy as np
        import pyarrow.feather as feather
    except ImportError as error:
        raise SystemExit("Developer build dependencies are missing: python -m pip install numpy pyarrow") from error

    meta_path = args.cache_dir / "banc_888_meta.feather"
    edge_path = args.cache_dir / f"banc_888_edgelist_simple_{EDGE_VERSION}.feather"
    download(META_URL, meta_path); download(EDGE_URL, edge_path)
    source_hashes = {"meta": sha256(meta_path), "edges": sha256(edge_path)}
    known_source = source_hashes == KNOWN_SOURCE_SHA256
    if args.strict_known_source and not known_source:
        raise SystemExit(f"Public BANC tables changed: {source_hashes}")

    print("reading public BANC metadata")
    meta = feather.read_table(meta_path, columns=META_COLUMNS, memory_map=True).combine_chunks()
    columns = {name: meta[name].to_pylist() for name in META_COLUMNS}
    selected_rows: list[int] = []
    excluded_reason = Counter(); explicit_candidates = 0; overrides = 0; proofread_count = 0
    class_fields = ("super_class", "cell_class", "cell_sub_class", "cell_type")
    for index in range(meta.num_rows):
        proof = truthy(columns["proofread"][index]) or truthy(columns["roughly_proofread"][index])
        if not proof:
            continue
        proofread_count += 1
        statuses = status_tokens(columns["status"][index])
        class_text = " ".join(scalar_text(columns[name][index]).lower() for name in class_fields)
        class_bad = bool(re.search(r"(?:^|\s)(?:not_a_neuron|glia|trachea|debris)(?:\s|$)", class_text))
        status_bad = bool(statuses & BAD_OBJECT_TOKENS)
        explicit_bad = class_bad or status_bad
        override = "IS_REAL_NEURON" in statuses
        if explicit_bad:
            explicit_candidates += 1
            for token in BAD_OBJECT_TOKENS:
                if token in statuses or re.search(rf"(?:^|\s){token.lower()}(?:\s|$)", class_text): excluded_reason[token] += 1
        if explicit_bad and override:
            overrides += 1
        if not explicit_bad or override:
            if columns["banc_888_id"][index] is None:
                raise SystemExit("selected metadata row has no banc_888_id")
            selected_rows.append(index)
    roots = np.asarray([int(columns["banc_888_id"][i]) for i in selected_rows], dtype=np.uint64)
    if len(np.unique(roots)) != len(roots):
        raise SystemExit("duplicate selected BANC root IDs")
    selected_count = len(roots)
    output = args.output_dir; output.mkdir(parents=True, exist_ok=True)
    for path in output.glob("edges-*.bin.gz"):
        path.unlink()

    nt_rows=[]; transmitter_classes=Counter(); transmitter_evidence=Counter()
    for index in selected_rows:
        nt_type, nt_source, confidence = classify_nt(columns["neurotransmitter_verified"][index], columns["neurotransmitter_predicted"][index], columns["neurotransmitter_score"][index])
        nt_rows.append((nt_type,nt_source,confidence)); transmitter_classes[nt_type]+=1; transmitter_evidence[nt_source]+=1
    neurons_path=output/"neurons.csv.gz"; classification_path=output/"classification.csv.gz"
    with deterministic_gzip_text(neurons_path) as handle:
        writer=csv.writer(handle); writer.writerow(["root_id","nt_type","nt_source","nt_confidence","nt_verified_raw","nt_predicted_raw"])
        for row_index,meta_index in enumerate(selected_rows):
            nt_type,nt_source,confidence=nt_rows[row_index]
            writer.writerow([int(roots[row_index]),nt_type,nt_source,f"{confidence:.6f}",scalar_text(columns["neurotransmitter_verified"][meta_index]),scalar_text(columns["neurotransmitter_predicted"][meta_index])])
    with deterministic_gzip_text(classification_path) as handle:
        writer=csv.writer(handle); writer.writerow(CLASS_FIELDS.keys())
        for row_index,meta_index in enumerate(selected_rows):
            derived={"nt_type":nt_rows[row_index][0],"nt_source":nt_rows[row_index][1],"nt_confidence":f"{nt_rows[row_index][2]:.6f}"}
            writer.writerow([derived.get(source,scalar_text(columns[source][meta_index])) for source in CLASS_FIELDS.values()])

    audit = {
        "schema":"fly-umwelt-banc-audit-v1", "metadataRows":meta.num_rows,
        "proofreadOrRoughlyProofread":proofread_count, "explicitNonNeuronalCandidates":explicit_candidates,
        "isRealNeuronOverrides":overrides, "excludedExplicitNonNeuronal":explicit_candidates-overrides,
        "selectedNeurons":selected_count,
        "selection":"(proofread OR roughly_proofread) AND (not explicitly NOT_A_NEURON/GLIA/TRACHEA/DEBRIS OR status IS_REAL_NEURON)",
        "excludedReasonOccurrences":dict(excluded_reason), "transmitterClasses":dict(transmitter_classes),
        "transmitterEvidence":dict(transmitter_evidence), "sourceSha256":source_hashes,
    }
    audit_path=output/"audit.json"; audit_path.write_text(json.dumps(audit,indent=2)+"\n",encoding="utf-8")
    print(f"selected {selected_count:,} neuronal objects from {meta.num_rows:,} metadata rows")

    print("reading aggregate BANC edge table")
    edges = feather.read_table(edge_path, columns=["pre","post","count","norm"], memory_map=True).combine_chunks()
    pre=np.asarray(edges["pre"].to_numpy(zero_copy_only=False),dtype=np.uint64)
    post=np.asarray(edges["post"].to_numpy(zero_copy_only=False),dtype=np.uint64)
    count=np.asarray(edges["count"].to_numpy(zero_copy_only=False),dtype=np.int32)
    norm=np.asarray(edges["norm"].to_numpy(zero_copy_only=False),dtype=np.float32)
    order=np.argsort(roots); sorted_roots=roots[order]
    pre_pos=np.searchsorted(sorted_roots,pre); post_pos=np.searchsorted(sorted_roots,post)
    pre_clip=np.minimum(pre_pos,max(0,len(sorted_roots)-1)); post_clip=np.minimum(post_pos,max(0,len(sorted_roots)-1))
    valid=(pre_pos<len(sorted_roots))&(post_pos<len(sorted_roots))&(sorted_roots[pre_clip]==pre)&(sorted_roots[post_clip]==post)&np.isfinite(norm)&(norm>0)
    source_index=order[pre_clip].astype(np.uint32,copy=False); target_index=order[post_clip].astype(np.uint32,copy=False)
    skipped=int((~valid).sum()); invalid=int((~np.isfinite(norm)).sum()); zero_norm=int((norm<=0).sum())
    writers={name:ComponentWriter(output,name,args.max_records_per_shard) for name in ("core","balanced","maximal")}
    chunk=1_000_000
    for start in range(0,len(pre),chunk):
        end=min(len(pre),start+chunk); okay=valid[start:end]; contacts=count[start:end]
        for name,mask in (
            ("core",okay&(contacts>=5)),
            ("balanced",okay&(contacts>=3)&(contacts<5)),
            ("maximal",okay&(contacts>=1)&(contacts<3)),
        ):
            if mask.any(): writers[name].write(source_index[start:end][mask],target_index[start:end][mask],norm[start:end][mask],np)
        print(f"packed {end:,}/{len(pre):,} source pairs",end="\r",flush=True)
    print()
    for writer in writers.values(): writer.close()
    core=writers["core"].edge_count; balanced=core+writers["balanced"].edge_count; maximal=balanced+writers["maximal"].edge_count
    edge_stats={
        "sourceRows":len(pre),"selectedRoots":selected_count,"skippedMissingEndpoint":skipped,
        "invalidRows":invalid,"zeroNormRows":zero_norm,
        "components":{name:{"edgeCount":writer.edge_count,"shardCount":len(writer.shards)} for name,writer in writers.items()},
        "tiers":{"core":core,"balanced":balanced,"maximal":maximal},
    }
    (output/"edge-stats.json").write_text(json.dumps(edge_stats,indent=2)+"\n",encoding="utf-8")

    components={}
    ranges={"core":">=5","balanced":"3-4","maximal":"1-2"}
    for name,writer in writers.items():
        components[name]={"edgeCount":writer.edge_count,"contactRange":ranges[name],"shards":[asset_spec(item["path"])|{"records":item["records"]} for item in writer.shards]}
    def load_budget(component_names, edge_count):
        compressed=sum(spec["compressedBytes"] for name in component_names for spec in components[name]["shards"])
        return {"schema":"fly-umwelt-load-budget-v1","compressedGraphBytes":compressed,
                "uncompressedGraphBytes":edge_count*12,
                "runtimeCsrBytes":edge_count*8+(selected_count+1)*4,
                "streamingLoaderGraphPeakBytes":edge_count*12+(selected_count+1)*8,
                "scope":"Graph arrays only; excludes decompressed CSV text, annotation strings, neural state, browser and GPU overhead."}
    manifest={
        "schema":"fly-umwelt-connectome-manifest-v2","id":"banc-v888-whole-cns-tiered-v3",
        "label":"BANC v888 whole CNS","shortLabel":"BANC whole CNS","anatomy":"adult female brain and ventral nerve cord",
        "dataClass":"whole-cns","neuronCount":selected_count,"edgeCount":balanced,"defaultGraphTier":"balanced",
        "graph":{"format":"fcns-tiered-sharded-v2","recordBytes":12,"weightSemantics":"count / postsynaptic total input","components":components,"tiers":{
            "core":{"label":"Core","description":"Pairs with at least 5 detected contacts.","components":["core"],"edgeCount":core,"minimumAggregateContactsPerPair":5,"loadBudget":load_budget(["core"],core)},
            "balanced":{"label":"Balanced","description":"Core plus pairs with 3-4 contacts. Default compromise between structural coverage and detector uncertainty.","components":["core","balanced"],"edgeCount":balanced,"minimumAggregateContactsPerPair":3,"loadBudget":load_budget(["core","balanced"],balanced)},
            "maximal":{"label":"Maximal","description":"Every usable aggregate pair, including 1-2-contact pairs. High memory; weak pairs include both biology and detector uncertainty.","components":["core","balanced","maximal"],"edgeCount":maximal,"minimumAggregateContactsPerPair":1,"loadBudget":load_budget(["core","balanced","maximal"],maximal)},
        }},
        "neurons":asset_spec(neurons_path),"classification":asset_spec(classification_path),"audit":asset_spec(audit_path),
        "source":"BANC v888 public Lee Lab compiled tables","sourceRelease":"banc_888",
        "sourceSynapseDetector":{"version":EDGE_VERSION,"individualSynapseSizeCutoff":10},
        "sourceUrls":{"meta":META_URL,"edges":EDGE_URL},"sourceSha256":source_hashes,
        "build":{"neuronSelection":audit["selection"],"metadataRows":meta.num_rows,"proofreadOrRoughlyProofread":proofread_count,
                 "excludedExplicitNonNeuronal":audit["excludedExplicitNonNeuronal"],"isRealNeuronOverrides":overrides,
                 "skippedEdgesMissingMetadata":skipped,"sourceDirectedPairs":len(pre),
                 "fastWeightPolicy":"Normalized pair input fraction; conservative presynaptic fast channel applied in the browser parser."},
        "edgeCoverage":f"{balanced:,} default weighted pairs; {maximal:,} usable pairs bundled.",
        "limitations":[
            "BANC lacks the lamina and ocellar ganglion and contains damaged peripheral inputs, including antennal-nerve damage.",
            "Electron microscopy recovers structure, not membrane parameters, receptor state, neuromodulatory state, muscle physiology or the specimen's lived neural state.",
            "Only a supported single fast transmitter produces instantaneous current; modulatory, conflicting and unknown calls remain structurally present with zero instantaneous fast gain.",
            "One- and two-contact pairs in Maximal can include both weak biological connections and detector uncertainty.",
            "Sensory transduction, internal state and the browser body remain explicit models under progressive replacement.",
        ],
    }
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    actual={"metadataRows":meta.num_rows,"selectedNeurons":selected_count,"skippedMissingEndpoint":skipped,"core":core,"balanced":balanced,"maximal":maximal}
    if known_source and actual!=KNOWN_COUNTS:
        message=f"known source produced unexpected counts: {actual} != {KNOWN_COUNTS}"
        if args.strict_known_source: raise SystemExit(message)
        print("WARNING:",message)
    elif not known_source:
        print("WARNING: public source hashes differ from the known audited snapshot; review audit.json before release")
    print(json.dumps({**actual,"shards":sum(len(item["shards"]) for item in components.values())},indent=2))

if __name__ == "__main__":
    main()
