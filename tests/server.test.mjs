import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function waitFor(url, timeout=4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await fetch(url); if (r.ok) return r; } catch {}
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error(`server did not start: ${url}`);
}

test('dev server mounts public at web root and never HTML-fallbacks missing data', async t => {
  const port = 43000 + Math.floor(Math.random()*1000);
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {cwd:root, env:{...process.env, PORT:String(port), HOST:'127.0.0.1'}, stdio:'ignore'});
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  await waitFor(`${base}/`);

  const manifest = await fetch(`${base}/data/manifest.json`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type') || '', /application\/json/);
  assert.equal(manifest.headers.get('cross-origin-opener-policy'),'same-origin');
  assert.equal(manifest.headers.get('cross-origin-embedder-policy'),'require-corp');
  assert.equal((await manifest.json()).neuronCount, 139255);

  const wasm = await fetch(`${base}/wasm/lif-kernel.wasm`);
  assert.equal(wasm.status,200);
  assert.equal(wasm.headers.get('content-type'),'application/wasm');
  assert(WebAssembly.validate(await wasm.arrayBuffer()));

  const mujocoWasm = await fetch(`${base}/vendor/mujoco-3.9.0/mujoco.wasm`);
  assert.equal(mujocoWasm.status,200);
  assert.equal(mujocoWasm.headers.get('content-type'),'application/wasm');
  assert.ok(Number(mujocoWasm.headers.get('content-length'))<25*1024*1024);

  const morphology = await fetch(`${base}/data/morphology/neuromechfly-v2.1.0/provenance.json`);
  assert.equal(morphology.status,200);
  assert.equal((await morphology.json()).modelContract.bodies,70);

  const muscles = await fetch(`${base}/data/morphology/flymimic-frontleg-20260623a/provenance.json`);
  assert.equal(muscles.status,200);
  const muscleProvenance=await muscles.json();
  assert.equal(muscleProvenance.sourceContract.muscleActuators,15);
  assert.equal(muscleProvenance.sourceContract.minimumExcitation,.0001);

  const muscleMesh=await fetch(`${base}/data/morphology/flymimic-frontleg-20260623a/model/meshes/stl/LFTibia.stl`);
  assert.equal(muscleMesh.status,200);
  assert.equal((await muscleMesh.arrayBuffer()).byteLength,53684);

  const room = await fetch(`${base}/rooms/default.json`);
  assert.equal(room.status, 200);
  assert.match(room.headers.get('content-type') || '', /application\/json/);
  assert.ok((await room.json()).objects);

  const missing = await fetch(`${base}/data/definitely-missing.json`);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /<!doctype/i);
});
