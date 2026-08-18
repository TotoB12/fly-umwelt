import {mkdir, readFile, stat, writeFile, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'public', 'data');
const manifest = JSON.parse(await readFile(resolve(dataDir, 'manifest.json'), 'utf8'));
const skip = process.env.FLY_UMWELT_SKIP_DATA === '1' || process.env.FLY_CNS_SKIP_DATA === '1';
const optional = process.argv.includes('--optional');
const timeoutMs = optional ? 12_000 : 45_000;

function gitBlobSha1(bytes) {
  const prefix = Buffer.from(`blob ${bytes.length}\0`);
  return createHash('sha1').update(prefix).update(bytes).digest('hex');
}
async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
async function verified(path, expected) {
  if (!await exists(path)) return false;
  const bytes = await readFile(path);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return false;
  return gitBlobSha1(bytes) === String(expected).toLowerCase();
}
function sources(spec) {
  return [...new Set([spec?.remote, ...(Array.isArray(spec?.remotes) ? spec.remotes : [])].filter(Boolean))];
}
async function downloadVerified(url, expected, controller) {
  const timeout = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  try {
    const response = await fetch(url, {redirect:'follow', signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('response was not gzip data');
    const actual = gitBlobSha1(bytes);
    if (actual !== String(expected).toLowerCase()) throw new Error(`integrity mismatch (${actual})`);
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

async function firstVerifiedSource(urls, expected, name) {
  const controllers = urls.map(() => new AbortController());
  const failures = new Array(urls.length);
  let winner = -1;
  const attempts = urls.map((url, index) => (async () => {
    // Stagger mirrors: avoid three full parallel downloads when the primary is healthy,
    // but do not make a blocked primary delay startup for tens of seconds.
    if (index) await sleep(index * 1200, undefined, {signal:controllers[index].signal});
    const bytes = await downloadVerified(url, expected, controllers[index]);
    winner = index;
    return {bytes, url, index};
  })().catch(error => {
    failures[index] = `${new URL(url).hostname}: ${error?.message || error}`;
    throw error;
  }));

  try {
    const result = await Promise.any(attempts);
    controllers.forEach((controller, index) => { if (index !== result.index) controller.abort(); });
    return result;
  } catch {
    throw new Error(`${name}: all ${urls.length} verified sources failed (${failures.filter(Boolean).join('; ')})`);
  } finally {
    if (winner < 0) controllers.forEach(controller => controller.abort());
  }
}

await mkdir(dataDir, {recursive:true});
const assets = [['graph','connectome.bin.gz'],['neurons','neurons.csv.gz'],['classification','classification.csv.gz']];

async function ensureAsset([key, fallback]) {
  const spec = manifest[key] || {};
  const name = String(spec.local || fallback).split('/').pop();
  const destination = resolve(dataDir, name);
  const expected = spec.gitBlobSha1 || spec.sha;
  const urls = sources(spec);
  if (!expected || !urls.length) throw new Error(`public/data/manifest.json: ${key} must define remotes and gitBlobSha1`);
  if (await verified(destination, expected)) { console.log(`data ready: ${name}`); return true; }
  if (skip) { console.log(`data skipped: ${name} (FLY_UMWELT_SKIP_DATA=1)`); return false; }

  console.log(`fetching and verifying ${name}…`);
  try {
    const {bytes, url} = await firstVerifiedSource(urls, expected, name);
    const temporary = `${destination}.partial`;
    await writeFile(temporary, bytes);
    await rm(destination, {force:true});
    await rename(temporary, destination);
    console.log(`verified ${name} (${bytes.length.toLocaleString()} bytes, ${new URL(url).hostname})`);
    return true;
  } catch (error) {
    if (!optional) throw error;
    console.warn(`warning: ${error.message}`);
    return false;
  }
}

// Independent assets are fetched concurrently. This script is explicit: the
// normal demo build does not call it, while build:full requires all assets.
const results = await Promise.all(assets.map(ensureAsset));
const unavailable = results.filter(ready => !ready).length;
if (unavailable) {
  const message = `Reference data is not local (${unavailable} missing file${unavailable===1?'':'s'}).`;
  if (!skip && !optional) throw new Error(message);
  console.warn(`${message} This was explicitly allowed by ${skip ? 'FLY_UMWELT_SKIP_DATA=1' : '--optional'}.`);
} else console.log('FAFB reference pack is ready.');
