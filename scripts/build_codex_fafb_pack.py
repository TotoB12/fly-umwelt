#!/usr/bin/env python3
"""Build a browser-ready FAFB v783 data pack from official Codex downloads.

The output is a static, sharded representation consumed by Fly Umwelt. It
contains every neuron found in the selected neuron metadata product and every
weighted neuron-pair connection surviving the chosen synapse threshold.

No behavioural labels are invented. Missing annotations remain empty.

Recommended online use:
    python scripts/build_codex_fafb_pack.py

Offline / reproducible use with files already downloaded from Codex:
    python scripts/build_codex_fafb_pack.py \
      --connections-file connections_princeton.csv.gz \
      --neurons-file all_neuron_data.csv.gz \
      --cell-types-file consolidated_cell_types.csv.gz

The Codex FAQ documents the public download endpoints and the two stable product
names ``connections_princeton`` and ``consolidated_cell_types``. Product names
for the all-neuron metadata table can change; this script discovers available
products and also accepts explicit overrides.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import struct
import sys
import tempfile
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Iterable, Iterator, Mapping

CATALOG_URL = "https://codex.flywire.ai/api/download?dataset=fafb"
RESOURCE_URL = "https://codex.flywire.ai/api/download_resource"
DEFAULT_CONNECTION_PRODUCT = "connections_princeton"
DEFAULT_CELL_TYPE_PRODUCT = "consolidated_cell_types"
MAX_RECORDS_PER_SHARD = 350_000  # 4.2 MB raw, comfortably below Pages' 25 MiB limit
USER_AGENT = "Fly-CNS-Lab-data-builder/1.0 (+static research pack builder)"

ROOT_COLUMNS = ("root_id", "root_783", "id", "root")
PRE_COLUMNS = ("pre_root_id", "pre", "source", "presynaptic_root_id", "pre_pt_root_id")
POST_COLUMNS = ("post_root_id", "post", "target", "postsynaptic_root_id", "post_pt_root_id")
WEIGHT_COLUMNS = ("syn_count", "synapse_count", "weight", "n_synapses", "count")
NT_COLUMNS = ("nt_type", "neurotransmitter", "predicted_nt", "top_nt", "neurotransmitter_predicted")
ANNOTATION_COLUMNS = (
    "root_id", "label", "name", "nt_type", "nt_type_verified", "flow",
    "super_class", "class", "sub_class", "cell_type", "resolved_type",
    "side", "neuromere", "hemilineage", "nerve", "body_part", "function",
    "sensory_in", "effector_out", "connectivity_tag", "marker",
)



def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()

def request(url: str):
    return urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/csv,application/gzip,application/octet-stream,text/html;q=0.8,*/*;q=0.5",
        },
    )


def download(url: str, path: Path, *, force: bool = False) -> Path:
    if path.exists() and path.stat().st_size and not force:
        print(f"using cached {path}")
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}")
    with urllib.request.urlopen(request(url), timeout=120) as src, path.open("wb") as dst:
        shutil.copyfileobj(src, dst, 1024 * 1024)
    if not path.stat().st_size:
        raise RuntimeError(f"empty download: {url}")
    return path


def resource_url(product: str, dataset: str = "fafb") -> str:
    return RESOURCE_URL + "?" + urllib.parse.urlencode({"data_product": product, "dataset": dataset})


def discover_products(cache: Path, force: bool = False) -> list[str]:
    """Best-effort discovery. The endpoint may return JSON or an HTML portal."""
    catalog = download(CATALOG_URL, cache / "download-catalog.response", force=force)
    raw = catalog.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    products: set[str] = set()
    try:
        payload = json.loads(text)
        stack = [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                for key, value in item.items():
                    if key in {"data_product", "product", "id", "name", "key"} and isinstance(value, str):
                        products.add(value)
                    else:
                        stack.append(value)
            elif isinstance(item, list):
                stack.extend(item)
    except json.JSONDecodeError:
        pass
    products.update(re.findall(r"data_product(?:=|%3D)([A-Za-z0-9_.-]+)", text))
    return sorted(p for p in products if re.fullmatch(r"[A-Za-z0-9_.-]+", p))


def choose_neuron_product(products: Iterable[str]) -> str | None:
    products = list(products)
    preferred = (
        "all_neuron_data", "neuron_data", "neurons", "consolidated_neuron_data",
        "cell_data", "proofread_neurons", "neuron_annotations",
    )
    lower = {p.lower(): p for p in products}
    for name in preferred:
        if name in lower:
            return lower[name]
    ranked = [p for p in products if "neuron" in p.lower() and "connection" not in p.lower()]
    ranked.sort(key=lambda p: ("all" not in p.lower(), "data" not in p.lower(), len(p)))
    return ranked[0] if ranked else None


def open_text(path: Path):
    raw = path.open("rb")
    head = raw.read(2)
    raw.seek(0)
    stream = gzip.GzipFile(fileobj=raw) if head == b"\x1f\x8b" or path.suffix == ".gz" else raw
    return io.TextIOWrapper(stream, encoding="utf-8-sig", newline="")


def normalized_header(fieldnames: Iterable[str] | None) -> dict[str, str]:
    return {str(name).strip().lower(): str(name) for name in (fieldnames or []) if name is not None}


def pick(header: Mapping[str, str], candidates: Iterable[str], *, required: bool = False, label: str = "column") -> str | None:
    for candidate in candidates:
        value = header.get(candidate.lower())
        if value is not None:
            return value
    if required:
        raise RuntimeError(f"could not find {label}; columns={list(header.values())}")
    return None


def clean(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_int(value, *, label: str) -> int:
    text = clean(value)
    if not text:
        raise ValueError(f"empty {label}")
    return int(float(text))


def parse_float(value, default: float = 0.0) -> float:
    try:
        return float(clean(value))
    except (TypeError, ValueError):
        return default


def read_metadata(path: Path, *, source_label: str) -> dict[int, dict[str, str]]:
    print(f"reading metadata: {path}")
    out: dict[int, dict[str, str]] = {}
    with open_text(path) as handle:
        reader = csv.DictReader(handle)
        header = normalized_header(reader.fieldnames)
        root_col = pick(header, ROOT_COLUMNS, required=True, label=f"root ID in {source_label}")
        canonical = {name: header.get(name) for name in ANNOTATION_COLUMNS}
        canonical["nt_type"] = canonical.get("nt_type") or pick(header, NT_COLUMNS)
        for row_number, row in enumerate(reader, 2):
            try:
                root = parse_int(row.get(root_col), label="root ID")
            except (TypeError, ValueError):
                continue
            target = out.setdefault(root, {})
            for name, actual in canonical.items():
                if actual:
                    value = clean(row.get(actual))
                    if value and not target.get(name):
                        target[name] = value
            # Preserve extra high-value columns from newer Codex exports.
            for name in ("gene", "dimorphism", "group", "input_neuropils", "output_neuropils"):
                actual = header.get(name)
                if actual:
                    value = clean(row.get(actual))
                    if value and not target.get(name):
                        target[name] = value
    print(f"  {len(out):,} metadata rows from {source_label}")
    return out


def merge_metadata(base: dict[int, dict[str, str]], overlay: Mapping[int, Mapping[str, str]]) -> None:
    for root, fields in overlay.items():
        dst = base.setdefault(root, {})
        for key, value in fields.items():
            if value and not dst.get(key):
                dst[key] = value


def aggregate_connections(path: Path, db_path: Path, min_synapses: float) -> tuple[set[int], int, dict[int, str]]:
    """Aggregate neuropil-split rows into one weighted pair using SQLite."""
    print(f"aggregating weighted pairs: {path}")
    if db_path.exists():
        db_path.unlink()
    db = sqlite3.connect(db_path)
    db.execute("PRAGMA journal_mode=OFF")
    db.execute("PRAGMA synchronous=OFF")
    db.execute("PRAGMA temp_store=FILE")
    db.execute("CREATE TABLE edges(pre INTEGER NOT NULL, post INTEGER NOT NULL, weight REAL NOT NULL, PRIMARY KEY(pre,post)) WITHOUT ROWID")
    roots: set[int] = set()
    nt_by_pre: dict[int, str] = {}
    batch: list[tuple[int, int, float]] = []
    rows_seen = 0
    with open_text(path) as handle:
        reader = csv.DictReader(handle)
        header = normalized_header(reader.fieldnames)
        pre_col = pick(header, PRE_COLUMNS, required=True, label="presynaptic root ID")
        post_col = pick(header, POST_COLUMNS, required=True, label="postsynaptic root ID")
        weight_col = pick(header, WEIGHT_COLUMNS, required=True, label="synapse count")
        nt_col = pick(header, NT_COLUMNS)
        for row in reader:
            try:
                pre = parse_int(row.get(pre_col), label="pre root")
                post = parse_int(row.get(post_col), label="post root")
                weight = parse_float(row.get(weight_col))
            except (TypeError, ValueError):
                continue
            if weight <= 0:
                continue
            roots.add(pre); roots.add(post); rows_seen += 1
            if nt_col:
                nt = clean(row.get(nt_col)).upper()
                if nt and pre not in nt_by_pre:
                    nt_by_pre[pre] = nt
            batch.append((pre, post, weight))
            if len(batch) >= 50_000:
                db.executemany(
                    "INSERT INTO edges(pre,post,weight) VALUES(?,?,?) ON CONFLICT(pre,post) DO UPDATE SET weight=weight+excluded.weight",
                    batch,
                )
                db.commit(); batch.clear()
    if batch:
        db.executemany(
            "INSERT INTO edges(pre,post,weight) VALUES(?,?,?) ON CONFLICT(pre,post) DO UPDATE SET weight=weight+excluded.weight",
            batch,
        )
        db.commit()
    db.execute("DELETE FROM edges WHERE weight < ?", (float(min_synapses),))
    db.commit()
    edge_count = int(db.execute("SELECT COUNT(*) FROM edges").fetchone()[0])
    db.close()
    print(f"  {rows_seen:,} table rows -> {edge_count:,} weighted pairs at threshold {min_synapses:g}")
    return roots, edge_count, nt_by_pre


def write_metadata(out: Path, roots: list[int], metadata: Mapping[int, Mapping[str, str]], nt_from_edges: Mapping[int, str]) -> None:
    with gzip.open(out / "neurons.csv.gz", "wt", encoding="utf-8", newline="", compresslevel=9) as handle:
        writer = csv.writer(handle)
        writer.writerow(["root_id", "nt_type"])
        for root in roots:
            fields = metadata.get(root, {})
            writer.writerow([root, clean(fields.get("nt_type")) or clean(nt_from_edges.get(root))])

    columns = list(ANNOTATION_COLUMNS)
    with gzip.open(out / "classification.csv.gz", "wt", encoding="utf-8", newline="", compresslevel=9) as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for root in roots:
            fields = metadata.get(root, {})
            writer.writerow([root if name == "root_id" else clean(fields.get(name)) for name in columns])


def write_edge_shards(out: Path, db_path: Path, index_of: Mapping[int, int]) -> tuple[list[dict[str, str]], int]:
    db = sqlite3.connect(db_path)
    specs: list[dict[str, str]] = []
    handle = None
    in_shard = 0
    edge_count = 0
    shard_index = -1
    try:
        for pre, post, weight in db.execute("SELECT pre,post,weight FROM edges ORDER BY pre,post"):
            pre_i = index_of.get(int(pre)); post_i = index_of.get(int(post))
            if pre_i is None or post_i is None:
                continue
            if handle is None or in_shard >= MAX_RECORDS_PER_SHARD:
                if handle:
                    handle.close()
                shard_index += 1
                name = f"edges-{shard_index:03d}.bin.gz"
                handle = gzip.open(out / name, "wb", compresslevel=9)
                specs.append({"local": f"./data/fafb-official/{name}"})
                in_shard = 0
            handle.write(struct.pack("<IIf", pre_i, post_i, float(abs(weight))))
            in_shard += 1; edge_count += 1
    finally:
        if handle:
            handle.close()
        db.close()
    for spec in specs:
        name = Path(spec["local"]).name
        path = out / name
        size = path.stat().st_size
        if size > 25 * 1024 * 1024:
            raise RuntimeError(f"{name} exceeds Cloudflare Pages' 25 MiB per-file limit")
        spec["sha256"] = sha256(path)
        spec["compressedBytes"] = size
    return specs, edge_count


def main() -> None:
    parser = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/codex-fafb"))
    parser.add_argument("--output-dir", type=Path, default=Path("public/data/fafb-official"))
    parser.add_argument("--connections-product", default=DEFAULT_CONNECTION_PRODUCT)
    parser.add_argument("--neuron-product", default="auto", help="Codex all-neuron metadata product or 'auto'")
    parser.add_argument("--cell-types-product", default=DEFAULT_CELL_TYPE_PRODUCT)
    parser.add_argument("--connections-file", type=Path)
    parser.add_argument("--neurons-file", type=Path)
    parser.add_argument("--cell-types-file", type=Path)
    parser.add_argument("--min-synapses", type=float, default=5.0)
    parser.add_argument("--expected-neurons", type=int, default=139_255)
    parser.add_argument("--expected-connections", type=int, default=3_732_460)
    parser.add_argument("--strict-counts", action="store_true")
    parser.add_argument("--force-download", action="store_true")
    args = parser.parse_args()

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    products: list[str] = []
    if not args.connections_file or (not args.neurons_file and args.neuron_product == "auto"):
        try:
            products = discover_products(args.cache_dir, args.force_download)
            if products:
                print("discovered Codex products:", ", ".join(products))
        except Exception as exc:
            print(f"warning: product discovery failed: {exc}", file=sys.stderr)

    connections = args.connections_file or download(
        resource_url(args.connections_product),
        args.cache_dir / f"{args.connections_product}.csv.gz",
        force=args.force_download,
    )

    neuron_product = None if args.neuron_product in {"", "none"} else args.neuron_product
    if neuron_product == "auto":
        neuron_product = choose_neuron_product(products)
    neurons = args.neurons_file
    if not neurons and neuron_product:
        try:
            neurons = download(resource_url(neuron_product), args.cache_dir / f"{neuron_product}.csv.gz", force=args.force_download)
        except Exception as exc:
            print(f"warning: could not download all-neuron product '{neuron_product}': {exc}", file=sys.stderr)
            neurons = None

    cell_types = args.cell_types_file
    if not cell_types:
        try:
            cell_types = download(resource_url(args.cell_types_product), args.cache_dir / f"{args.cell_types_product}.csv.gz", force=args.force_download)
        except Exception as exc:
            print(f"warning: cell-type table unavailable: {exc}", file=sys.stderr)
            cell_types = None

    with tempfile.TemporaryDirectory(prefix="fly-cns-fafb-") as temp:
        db_path = Path(temp) / "edges.sqlite"
        connected_roots, aggregated_count, nt_from_edges = aggregate_connections(connections, db_path, args.min_synapses)
        metadata: dict[int, dict[str, str]] = {}
        if neurons:
            merge_metadata(metadata, read_metadata(neurons, source_label=neuron_product or "neuron table"))
        if cell_types:
            merge_metadata(metadata, read_metadata(cell_types, source_label=args.cell_types_product))

        roots_set = set(metadata) if metadata else set()
        roots_set.update(connected_roots)
        roots = sorted(roots_set)
        if not roots:
            raise RuntimeError("no neurons found")
        index_of = {root: index for index, root in enumerate(roots)}
        out = args.output_dir
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True, exist_ok=True)
        write_metadata(out, roots, metadata, nt_from_edges)
        shards, edge_count = write_edge_shards(out, db_path, index_of)

    count_messages = []
    if len(roots) != args.expected_neurons:
        count_messages.append(f"loaded {len(roots):,} neurons; current Codex tile reports {args.expected_neurons:,}")
    if edge_count != args.expected_connections:
        count_messages.append(f"built {edge_count:,} weighted pairs; current Codex tile reports {args.expected_connections:,}")
    if count_messages:
        message = "; ".join(count_messages)
        if args.strict_counts:
            raise RuntimeError(message)
        print("warning:", message, file=sys.stderr)

    manifest = {
        "id": "fafb-v783-codex-static",
        "label": "FlyWire FAFB v783 official Codex static pack",
        "anatomy": "adult female central brain and optic lobes",
        "neuronCount": len(roots),
        "edgeCount": edge_count,
        "graph": {"format": "fcns-sharded-v1", "minimumSynapses": args.min_synapses, "shards": shards},
        "neurons": {"local": "./data/fafb-official/neurons.csv.gz", "sha256": sha256(args.output_dir / "neurons.csv.gz")},
        "classification": {"local": "./data/fafb-official/classification.csv.gz", "sha256": sha256(args.output_dir / "classification.csv.gz")},
        "source": "Codex static FAFB downloads",
        "sourceUrls": {
            "catalog": CATALOG_URL,
            "connections": resource_url(args.connections_product),
            "neurons": resource_url(neuron_product) if neuron_product else None,
            "cellTypes": resource_url(args.cell_types_product) if cell_types else None,
        },
        "edgeCoverage": f"{edge_count:,} weighted neuron-pair connections after aggregating neuropil rows and applying a {args.min_synapses:g}-synapse threshold.",
        "sourceSha256": {
            "connections": sha256(connections),
            "neurons": sha256(neurons) if neurons else None,
            "cellTypes": sha256(cell_types) if cell_types else None,
        },
        "builder": {
            "connectionsProduct": args.connections_product,
            "neuronProduct": neuron_product,
            "cellTypesProduct": args.cell_types_product if cell_types else None,
            "minSynapses": args.min_synapses,
        },
        "limitations": [
            "The graph aggregates multiple synaptic contacts into weighted neuron-pair edges.",
            "FAFB contains the brain but not the complete ventral nerve cord, peripheral receptors, muscles, or the scanned fly's instantaneous neural state.",
            "Cell types and neurotransmitters are annotations or predictions and may be incomplete or revised.",
            "Sensory transduction, ongoing activity and the planar effector remain explicit model hypotheses.",
        ],
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {len(roots):,} neurons, {edge_count:,} weighted pairs, {len(shards)} shards to {args.output_dir}")


if __name__ == "__main__":
    main()
