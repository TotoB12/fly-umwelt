import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {parseConnectomePack,parseShardedConnectomePack,resolveGraphTier} from '../src/core/connectome-data.js';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {modelConfigFor,RETINA_RAYS} from '../src/core/constants.js';
import {JavaScriptLifKernel,WasmLifKernel} from '../src/core/neural-kernels.js';
import {NEURAL_RESOLUTIONS} from '../src/core/compute-profile.js';

const root=resolve(import.meta.dirname,'..');
const arg=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.split('=')[1];
const matrix=process.argv.includes('--matrix');
const datasetArg=arg('dataset')||(process.argv.includes('--full')?'banc':'fixture');
const dataset=['fixture','fafb','banc'].includes(datasetArg)?datasetArg:'fixture';
const tierArg=arg('tier')||'balanced';
const backendArg=arg('backend')||(matrix?'all':'js');
const resolutionArg=arg('resolution')||(matrix?'all':'balanced');
const biologicalSeconds=Math.max(.05,Number(arg('seconds'))||(dataset==='fixture'?20:1));
const repeats=Math.max(1,Math.min(9,Number(arg('repeats'))||(matrix?3:1)));
const warmupSeconds=Math.max(0,Number(arg('warmup'))||.1);
const wasmPath=resolve(root,'public/wasm/lif-kernel.wasm');

const validBackends=new Set(['all','js','wasm']);
if(!validBackends.has(backendArg))throw new Error(`Unknown --backend=${backendArg}; expected all, js or wasm.`);
const profileIds=Object.keys(NEURAL_RESOLUTIONS).filter(id=>id!=='auto');
if(resolutionArg!=='all'&&!profileIds.includes(resolutionArg))throw new Error(`Unknown --resolution=${resolutionArg}; expected all or ${profileIds.join(', ')}.`);
if(!existsSync(wasmPath))throw new Error('Neural WASM kernel is missing. Run npm run wasm:build.');

const asArrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
async function loadData(){
  if(dataset==='banc'){
    const base=resolve(root,'public/data/banc');
    const manifest=JSON.parse(await readFile(resolve(base,'manifest.json'),'utf8'));
    const tier=resolveGraphTier(manifest,tierArg);
    const neuronText=gunzipSync(await readFile(resolve(base,'neurons.csv.gz'))).toString('utf8');
    const classText=gunzipSync(await readFile(resolve(base,'classification.csv.gz'))).toString('utf8');
    const buffers=[];
    for(const spec of tier.shards){
      const path=resolve(root,'public',spec.local.replace(/^\.\//,''));
      const raw=gunzipSync(await readFile(path));buffers.push(asArrayBuffer(raw));
    }
    const data=parseShardedConnectomePack(neuronText,classText,buffers,{...manifest,edgeCount:tier.edgeCount,graphTier:tier.id});
    return {data,label:`BANC ${tier.label}`,tier:tier.id};
  }
  const base=resolve(root,'public/data');
  const prefix=dataset==='fafb'?'':'fixture-';
  const graphName=dataset==='fafb'?'connectome.bin.gz':'fixture.bin.gz';
  const neuronName=`${prefix}neurons.csv.gz`,className=`${prefix}classification.csv.gz`;
  for(const name of [graphName,neuronName,className])if(!existsSync(resolve(base,name)))throw new Error(`${name} is missing.`);
  const [graphGz,neuronsGz,classesGz]=await Promise.all([readFile(resolve(base,graphName)),readFile(resolve(base,neuronName)),readFile(resolve(base,className))]);
  const graph=gunzipSync(graphGz);
  return {data:parseConnectomePack(gunzipSync(neuronsGz).toString('utf8'),gunzipSync(classesGz).toString('utf8'),asArrayBuffer(graph),{}),label:dataset==='fafb'?'FAFB brain comparison':'fixture',tier:'legacy'};
}

const {data,label,tier}=await loadData();
const wasmBytes=await readFile(wasmPath);
const packet={
  retinaBrightness:Array.from({length:RETINA_RAYS},(_,i)=>i<RETINA_RAYS/2?.33:.27),retinaMotion:Array(RETINA_RAYS).fill(0),retinaLoom:Array(RETINA_RAYS).fill(0),retinaProximity:Array(RETINA_RAYS).fill(0),
  odorLeft:[.08,.01,0],odorRight:[.12,.01,0],touch:[0,0,0,0,0,0],taste:[0,0,0],airflow:[0,0],temperature:.5,
  proprioception:Array(62).fill(0),metabolic:[.7,.8,.2,.3,0],memoryCue:[0,0,0,0],ambientNoise:.02,dtMs:50,
};
const bodySteps=Math.ceil(biologicalSeconds/.05),backends=backendArg==='all'?['js','wasm']:[backendArg],resolutions=resolutionArg==='all'?profileIds:[resolutionArg],results=[];
const createKernel=id=>id==='wasm'?WasmLifKernel.fromBytes(wasmBytes,data.N):new JavaScriptLifKernel(data.N);
for(const resolution of resolutions){
  const dtMs=NEURAL_RESOLUTIONS[resolution].dtMs;
  for(const backend of backends){
    const samples=[];
    for(let repeat=0;repeat<repeats;repeat++){
      const kernel=await createKernel(backend);
      const engine=new WholeConnectomeEngine(data,modelConfigFor('natural',{warmupMs:0,brainDtMs:dtMs}),0x51f1e,{kernel});
      for(let i=0;i<Math.ceil(warmupSeconds/.05);i++)engine.advance(50,packet);
      const start=performance.now();let spikes=0;
      for(let i=0;i<bodySteps;i++)spikes+=engine.advance(50,packet).stats.spikes;
      const wallSeconds=(performance.now()-start)/1000;
      samples.push({wallSeconds,spikes,totalSpikes:engine.totalSpikes,motor:{locomotorDrive:Number(engine.lastMotor.locomotorDrive.toFixed(6)),legs:engine.lastMotor.legs.map(value=>Number(value.toFixed(6))),turnEvidence:Number(engine.lastMotor.turnEvidence.toFixed(6)),reverse:Number(engine.lastMotor.reverse.toFixed(6)),escape:Number(engine.lastMotor.escape.toFixed(6))},kernel:kernel.describe()});
    }
    samples.sort((a,b)=>a.wallSeconds-b.wallSeconds);const median=samples[Math.floor(samples.length/2)];
    results.push({backend,resolution,brainDtMs:dtMs,repeats,warmupBiologicalSeconds:Number((Math.ceil(warmupSeconds/.05)*.05).toFixed(3)),biologicalSeconds:Number((bodySteps*.05).toFixed(3)),wallSeconds:Number(median.wallSeconds.toFixed(4)),sampleWallSeconds:samples.map(sample=>Number(sample.wallSeconds.toFixed(4))),achievedBiologicalRealtime:Number((bodySteps*.05/median.wallSeconds).toFixed(3)),spikes:median.spikes,totalSpikes:median.totalSpikes,motor:median.motor,kernel:median.kernel});
  }
}
for(const resolution of resolutions){const pair=results.filter(item=>item.resolution===resolution);if(pair.length===2&&pair[0].spikes!==pair[1].spikes)throw new Error(`${resolution} JS/WASM spike mismatch: ${pair[0].spikes} vs ${pair[1].spikes}`);}
console.log(JSON.stringify({pack:label,dataset,tier,neurons:data.N,edges:data.E,model:'natural',note:'Whole-engine benchmark. WASM integrates neuron state; sparse propagation remains deterministic JavaScript. Performance is hardware-specific, not biological validation.',results},null,2));
