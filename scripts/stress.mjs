import {performance} from 'node:perf_hooks';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {modelConfigFor, OUTPUT_FLAGS, RETINA_RAYS} from '../src/core/constants.js';

// Engineering stress test only. This has the node/edge count of the pinned
// reference pack, but deterministic synthetic connectivity and annotations.
const N = 139_255;
const E = 2_698_236;
const stepsArg = process.argv.find(arg => /^--body-steps=/.test(arg));
const bodySteps = Math.max(1, Math.min(50, Number(stepsArg?.split('=')[1]) || 5));
const rowPtr = new Uint32Array(N + 1);
const post = new Uint32Array(E);
const weight = new Float32Array(E);
let edge = 0;
const base = Math.floor(E / N), extra = E % N;
for (let pre = 0; pre < N; pre++) {
  rowPtr[pre] = edge;
  const count = base + (pre < extra ? 1 : 0);
  for (let k = 0; k < count; k++, edge++) {
    post[edge] = (Math.imul(pre + 1, 131071) + Math.imul(k + 1, 8191)) % N;
    weight[edge] = ((pre + k) % 11 === 0 ? -1 : 1) * (1 + ((pre + k) % 5));
  }
}
rowPtr[N] = edge;

const centralEnd = N - 4_000;
const central = Uint32Array.from({length:centralEnd}, (_, i) => i);
const descending = Uint32Array.from({length:3_581}, (_, i) => N - 3_581 + i);
const descendingProxyLeft = descending.slice(0, Math.ceil(descending.length / 2));
const descendingProxyRight = descending.slice(Math.ceil(descending.length / 2));
const outputFlags = new Uint32Array(N);
for (const idx of descendingProxyLeft) outputFlags[idx] = OUTPUT_FLAGS.DESCENDING | OUTPUT_FLAGS.PROXY_LEFT;
for (const idx of descendingProxyRight) outputFlags[idx] = OUTPUT_FLAGS.DESCENDING | OUTPUT_FLAGS.PROXY_RIGHT;
const small = (start, count) => Uint32Array.from({length:count}, (_, i) => start + i);
const visual = small(0, 11_487);
const olfactory = small(11_487, 2_281);
const mech = small(13_768, 1_927);
const endocrine = small(15_695, 80);
const retinaSectors = Array.from({length:RETINA_RAYS}, (_, sector) => {
  const values=[];
  for(let i=sector;i<visual.length;i+=RETINA_RAYS) values.push(visual[i]);
  return Uint32Array.from(values);
});
const populations = {
  central,
  descending,
  descendingMidline:descending,
  descendingProxyLeft,
  descendingProxyRight,
  visualBoth:visual,
  olfactoryBoth:olfactory,
  olfactoryFoodProxyBoth:olfactory.slice(0,761),
  olfactoryWaterProxyBoth:olfactory.slice(761,1521),
  olfactoryThreatProxyBoth:olfactory.slice(1521),
  mechBoth:mech,
  airflowBoth:mech.slice(0,600),
  proprioBoth:mech.slice(600,1200),
  gustSweet:small(15_775,40),
  gustWater:small(15_815,40),
  gustBitter:small(15_855,40),
  endocrine,
  endocrineEnergyProxy:endocrine.slice(0,27),
  endocrineWaterProxy:endocrine.slice(27,54),
  endocrineFatigueProxy:endocrine.slice(54),
};
const data = {
  N,E,rowPtr,post,weight,
  ntCode:new Uint8Array(N),
  rootIds:new Array(N),
  mapping:{populations,outputFlags,retinaSectors},
};
const config = modelConfigFor('natural',{warmupMs:0});
const engine = new WholeConnectomeEngine(data,config,0x5ca1e);
const packet = {
  retinaBrightness:Array.from({length:RETINA_RAYS},(_,i)=>i<RETINA_RAYS/2?.28:.35),
  retinaMotion:Array(RETINA_RAYS).fill(0),retinaLoom:Array(RETINA_RAYS).fill(0),retinaProximity:Array(RETINA_RAYS).fill(0),
  odorLeft:[.08,.02,0],odorRight:[.11,.02,0],touch:[0,0,0,0,0,0],taste:[0,0,0],
  airflow:[0,0],temperature:.5,proprioception:[0,0],metabolic:[.7,.8,.2,.3,0],memoryCue:[0,0,0,0],ambientNoise:.02,dtMs:50,
};
const before=process.memoryUsage();
const started=performance.now();
let spikes=0;
for(let i=0;i<bodySteps;i++)spikes+=engine.advance(50,packet).stats.spikes;
const elapsed=(performance.now()-started)/1000;
const after=process.memoryUsage();
const motorMagnitude=Math.max(engine.lastMotor.forward,engine.lastMotor.reverse,Math.abs(engine.lastMotor.turn),engine.lastMotor.escape);
if(!(motorMagnitude>1e-4))throw new Error('reference-scale output populations produced no body drive');
console.log(JSON.stringify({
  kind:'synthetic-scale-engineering-test',
  neurons:N,edges:E,bodySteps,biologicalSeconds:bodySteps*.05,
  wallSeconds:Number(elapsed.toFixed(3)),
  achievedBiologicalRealtime:Number((bodySteps*.05/elapsed).toFixed(3)),
  spikes,
  motor:engine.lastMotor,
  heapUsedMiB:Number((after.heapUsed/1048576).toFixed(1)),
  arrayBuffersMiB:Number((after.arrayBuffers/1048576).toFixed(1)),
  note:'Counts match the reference pack; connectivity and annotations are synthetic. This is not a biological validation or a full-data parser test.',
},null,2));
