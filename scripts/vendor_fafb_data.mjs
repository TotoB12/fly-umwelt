import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'public', 'data');
const manifest = JSON.parse(await readFile(resolve(out, 'manifest.json'), 'utf8'));
await mkdir(out, {recursive: true});

function gitBlobSha1(bytes) {
  const prefix = Buffer.from(`blob ${bytes.length}\0`);
  return createHash('sha1').update(prefix).update(bytes).digest('hex');
}

for (const [key, fallbackName] of [['graph','connectome.bin.gz'], ['neurons','neurons.csv.gz'], ['classification','classification.csv.gz']]) {
  const spec = manifest[key];
  const url = spec?.remote;
  const name = String(spec?.local || fallbackName).split('/').pop();
  const expected = spec?.gitBlobSha1 || spec?.sha;
  if (!url || !expected) throw new Error(`manifest ${key} is missing a pinned remote URL or Git blob hash`);
  console.log(`downloading ${name}`);
  const response = await fetch(url, {redirect:'follow'});
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`${name}: downloaded object is not gzip`);
  const actual = gitBlobSha1(bytes);
  if (actual !== String(expected).toLowerCase()) throw new Error(`${name}: expected Git blob ${expected}, received ${actual}`);
  await writeFile(resolve(out, name), bytes);
  console.log(`  verified ${actual} (${bytes.length.toLocaleString()} bytes)`);
}

console.log('FAFB data vendored into public/data with pinned Git-blob verification. Review THIRD_PARTY_NOTICES.md before redistribution.');
