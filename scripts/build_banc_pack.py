#!/usr/bin/env python3
"""Build a Cloudflare-Pages-compatible BANC v888 whole-CNS data pack.

This builder consumes the public Lee Lab compiled metadata and simple edge list.
It preserves every metadata neuron, filters only by an explicit minimum synapse
count, aggregates nothing beyond the source table, and writes gzip shards below
Cloudflare Pages' per-file limit.

Requires Python 3.10+:
    python -m pip install pyarrow numpy
    python scripts/build_banc_pack.py
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import struct
import urllib.request
from pathlib import Path

BASE = 'https://storage.googleapis.com/lee-lab_brain-and-nerve-cord-fly-connectome/compiled_data/banc_888'
META_URL = f'{BASE}/banc_888_meta.feather'
EDGE_URL = f'{BASE}/banc_888_edgelist_simple_v2.feather'
MAX_RECORDS_PER_SHARD = 400_000  # 4.8 MB raw; below Pages' 25 MiB asset cap
EXPECTED_NEURONS = 158_262
EXPECTED_CONNECTIONS_AT_3 = 3_037_361


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as file:
        while chunk := file.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, path: Path) -> None:
    if path.exists():
        print(f'using cached {path}')
        return
    print(f'downloading {url}')
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as src, path.open('wb') as dst:
        while chunk := src.read(1024 * 1024):
            dst.write(chunk)


def first_column(names, candidates):
    lower = {name.lower(): name for name in names}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    return None


def value(column, index, default=''):
    if column is None:
        return default
    item = column[index].as_py()
    return default if item is None else item


def unique_roots(column) -> list[int]:
    roots: list[int] = []
    seen: set[int] = set()
    for item in column:
        raw = item.as_py()
        if raw is None:
            continue
        root = int(raw)
        if root in seen:
            raise SystemExit(f'duplicate root ID in BANC metadata: {root}')
        seen.add(root)
        roots.append(root)
    return roots


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache-dir', type=Path, default=Path('.cache/banc'))
    parser.add_argument('--output-dir', type=Path, default=Path('public/data/banc'))
    parser.add_argument('--min-synapses', type=float, default=3.0,
                        help='Explicit aggregate-pair threshold; Codex defaults to 3 for BANC.')
    parser.add_argument('--strict-counts', action='store_true',
                        help='Fail rather than warn if current public table counts differ from the documented v888 snapshot.')
    args = parser.parse_args()
    try:
        import numpy as np
        import pyarrow.feather as feather
    except ImportError as error:
        raise SystemExit('Install build dependencies first: python -m pip install pyarrow numpy') from error

    meta_path = args.cache_dir / 'banc_888_meta.feather'
    edge_path = args.cache_dir / 'banc_888_edgelist_simple_v2.feather'
    download(META_URL, meta_path)
    download(EDGE_URL, edge_path)
    print('reading public BANC tables')
    meta = feather.read_table(meta_path, memory_map=True)
    edges = feather.read_table(edge_path, memory_map=True)
    edge_names, meta_names = edges.column_names, meta.column_names

    pre_name = first_column(edge_names, ['pre_root_id', 'pre', 'source', 'pre_id'])
    post_name = first_column(edge_names, ['post_root_id', 'post', 'target', 'post_id'])
    weight_name = first_column(edge_names, ['syn_count', 'synapse_count', 'weight', 'n_synapses', 'count'])
    root_name = first_column(meta_names, ['root_id', 'id', 'root_888'])
    if not pre_name or not post_name or not root_name:
        raise SystemExit(f'Unexpected schema. edge={edge_names}\nmeta={meta_names}')

    roots_column = meta[root_name].combine_chunks()
    roots = unique_roots(roots_column)
    id_to_index = {root: index for index, root in enumerate(roots)}

    pre = edges[pre_name].combine_chunks().to_numpy(zero_copy_only=False)
    post = edges[post_name].combine_chunks().to_numpy(zero_copy_only=False)
    weights = (edges[weight_name].combine_chunks().to_numpy(zero_copy_only=False)
               if weight_name else np.ones(len(pre), dtype=np.float32))
    weights = np.asarray(weights, dtype=np.float32)
    mask = np.asarray(weights, dtype=np.float64) >= args.min_synapses
    pre, post, weights = pre[mask], post[mask], weights[mask]
    print(f'{len(roots):,} metadata neurons; {len(pre):,} edge rows at threshold >= {args.min_synapses:g}')

    mismatch_messages = []
    if len(roots) != EXPECTED_NEURONS:
        mismatch_messages.append(f'neurons {len(roots):,} != documented snapshot {EXPECTED_NEURONS:,}')
    if args.min_synapses == 3 and len(pre) != EXPECTED_CONNECTIONS_AT_3:
        mismatch_messages.append(f'edge rows {len(pre):,} != documented snapshot {EXPECTED_CONNECTIONS_AT_3:,}')
    if mismatch_messages:
        message = 'BANC source snapshot differs: ' + '; '.join(mismatch_messages)
        if args.strict_counts:
            raise SystemExit(message)
        print('WARNING:', message)

    column_candidates = {
        'nt_type': ['nt_type_verified', 'nt_type', 'neurotransmitter', 'predicted_nt', 'top_nt', 'neurotransmitter_predicted'],
        'flow': ['flow'],
        'super_class': ['super_class'],
        'class': ['cell_class', 'class'],
        'sub_class': ['cell_sub_class', 'sub_class'],
        'cell_type': ['cell_type', 'type'],
        'side': ['side', 'soma_side'],
        'body_part': ['body_part', 'target', 'effector', 'peripheral_target_type'],
        'nerve': ['nerve', 'nerve_name', 'peripheral_nerve'],
        'function': ['function', 'functional_type', 'description'],
        'label': ['label', 'name'],
        'sensory_in': ['sensory_in', 'sensory_input'],
        'effector_out': ['effector_out', 'motor_output'],
        'neuromere': ['neuromere'],
        'hemilineage': ['hemilineage'],
        'marker': ['marker'],
    }
    selected = {key: first_column(meta_names, candidates) for key, candidates in column_candidates.items()}
    columns = {key: meta[name].combine_chunks() if name else None for key, name in selected.items()}
    row_of = {int(roots_column[index].as_py()): index for index in range(len(roots_column)) if roots_column[index].as_py() is not None}

    output = args.output_dir
    output.mkdir(parents=True, exist_ok=True)
    neurons_path = output / 'neurons.csv.gz'
    classification_path = output / 'classification.csv.gz'
    with gzip.open(neurons_path, 'wt', encoding='utf-8', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['root_id', 'nt_type'])
        for root in roots:
            index = row_of[root]
            writer.writerow([root, str(value(columns['nt_type'], index, '')).upper()])
    class_fields = ['flow', 'super_class', 'class', 'sub_class', 'cell_type', 'side', 'body_part', 'nerve', 'label', 'function', 'sensory_in', 'effector_out', 'neuromere', 'hemilineage', 'marker']
    with gzip.open(classification_path, 'wt', encoding='utf-8', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['root_id', *class_fields])
        for root in roots:
            index = row_of[root]
            writer.writerow([root, *(value(columns[field], index) for field in class_fields)])

    shard_specs = []
    edge_count = 0
    skipped_edges = 0
    shard_index = -1
    handle = None
    in_shard = 0
    try:
        for source, target, synapses in zip(pre, post, weights, strict=True):
            source_index = id_to_index.get(int(source))
            target_index = id_to_index.get(int(target))
            if source_index is None or target_index is None:
                skipped_edges += 1
                continue
            if handle is None or in_shard >= MAX_RECORDS_PER_SHARD:
                if handle:
                    handle.close()
                shard_index += 1
                name = f'edges-{shard_index:03d}.bin.gz'
                path = output / name
                handle = gzip.open(path, 'wb', compresslevel=9)
                in_shard = 0
                shard_specs.append({'local': f'./data/banc/{name}'})
            handle.write(struct.pack('<IIf', source_index, target_index, float(abs(synapses))))
            in_shard += 1
            edge_count += 1
    finally:
        if handle:
            handle.close()

    for spec in shard_specs:
        path = output / Path(spec['local']).name
        size = path.stat().st_size
        if size > 25 * 1024 * 1024:
            raise SystemExit(f'{path} exceeds Cloudflare Pages 25 MiB asset limit')
        spec['sha256'] = sha256(path)
        spec['compressedBytes'] = size

    manifest = {
        'id': 'banc-v888-whole-cns',
        'label': 'BANC v888 whole brain-and-nerve-cord connectome',
        'anatomy': 'adult female brain and ventral nerve cord',
        'neuronCount': len(roots),
        'edgeCount': edge_count,
        'graph': {'format': 'fcns-sharded-v1', 'minimumSynapses': args.min_synapses, 'shards': shard_specs},
        'neurons': {'local': './data/banc/neurons.csv.gz', 'sha256': sha256(neurons_path)},
        'classification': {'local': './data/banc/classification.csv.gz', 'sha256': sha256(classification_path)},
        'source': 'BANC v888 public Lee Lab GCS compiled tables',
        'sourceRelease': 'banc_888',
        'sourceUrls': {'meta': META_URL, 'edges': EDGE_URL},
        'sourceSha256': {'meta': sha256(meta_path), 'edges': sha256(edge_path)},
        'build': {'minimumSynapses': args.min_synapses, 'skippedEdgesMissingMetadata': skipped_edges, 'schemaColumns': selected},
        'edgeCoverage': f'{edge_count:,} weighted pairs with aggregate synapse count >= {args.min_synapses:g}.',
        'limitations': [
            'BANC lacks complete peripheral sensory transduction and has incomplete or damaged antennal inputs.',
            'Neuron dynamics, receptor kinetics, muscle physiology and the specimen\'s biological state are not recovered by electron microscopy.',
            'Chemical receptor identity and planar sensory geometry can still require disclosed proxy mappings.',
            'The 2D body transfer function remains engineered and inspectable.',
        ],
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {len(roots):,} neurons, {edge_count:,} edges, {len(shard_specs)} shards to {output}')
    if skipped_edges:
        print(f'WARNING: skipped {skipped_edges:,} edges whose source or target lacked metadata')


if __name__ == '__main__':
    main()
