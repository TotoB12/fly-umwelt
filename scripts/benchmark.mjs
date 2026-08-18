import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {parseConnectomePack} from '../src/core/connectome-data.js';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {modelConfigFor, RETINA_RAYS} from '../src/core/constants.js';

const root = resolve(import.meta.dirname, '..');
const full = process.argv.includes('--full');
const secondsArg = process.argv.find((arg) => /^--seconds=/.test(arg));
const biologicalSeconds = Math.max(0.2, Number(secondsArg?.split('=')[1]) || (full ? 2 : 20));
const base = resolve(root, 'public', 'data');
const graphName = full ? 'connectome.bin.gz' : 'fixture.bin.gz';
const neuronName = full ? 'neurons.csv.gz' : 'fixture-neurons.csv.gz';
const className = full ? 'classification.csv.gz' : 'fixture-classification.csv.gz';

for (const name of [graphName, neuronName, className]) {
  if (!existsSync(resolve(base, name))) {
    throw new Error(`${name} is missing. Run npm run fixture, or npm run data:reference before --full.`);
  }
}

const [graphGz, neuronsGz, classesGz] = await Promise.all([
  readFile(resolve(base, graphName)),
  readFile(resolve(base, neuronName)),
  readFile(resolve(base, className)),
]);
const graph = gunzipSync(graphGz);
const neurons = gunzipSync(neuronsGz).toString('utf8');
const classes = gunzipSync(classesGz).toString('utf8');
const data = parseConnectomePack(neurons, classes, graph.buffer.slice(graph.byteOffset, graph.byteOffset + graph.byteLength), {});
const engine = new WholeConnectomeEngine(data, modelConfigFor('natural', {warmupMs:0}), 0x51f1e);
const packet = {
  retinaBrightness: Array.from({length:RETINA_RAYS}, (_,i) => i < RETINA_RAYS/2 ? 0.33 : 0.27),
  retinaMotion: Array(RETINA_RAYS).fill(0),
  retinaLoom: Array(RETINA_RAYS).fill(0),
  retinaProximity: Array(RETINA_RAYS).fill(0),
  odorLeft:[0.08,0.01,0], odorRight:[0.12,0.01,0],
  touch:[0,0,0,0,0,0], taste:[0,0,0], temperature:0.5,
  proprioception:[0,0], metabolic:[0.7,0.8,0.2,0.3,0], memoryCue:[0,0,0,0], ambientNoise:0.02, dtMs:50,
};
const bodySteps = Math.ceil(biologicalSeconds / 0.05);
const start = performance.now();
let spikes = 0;
for (let i=0;i<bodySteps;i++) spikes += engine.advance(50, packet).stats.spikes;
const wallSeconds = (performance.now()-start)/1000;
console.log(JSON.stringify({
  pack:full?'vendored-full-reference':'fixture', neurons:data.N, edges:data.E,
  biologicalSeconds:bodySteps*0.05, wallSeconds:Number(wallSeconds.toFixed(3)),
  achievedBiologicalRealtime:Number((bodySteps*0.05/wallSeconds).toFixed(3)), spikes,
  model:'natural', brainDtMs:engine.config.brainDtMs,
}, null, 2));
