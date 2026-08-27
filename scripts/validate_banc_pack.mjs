import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {parseShardedConnectomePack,resolveGraphTier} from '../src/core/connectome-data.js';
import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_IDS,LEG_MOTOR_ACTION_SPECS,LEG_SENSORY_MODALITIES,legMotorActionPopulationKey,legMotorUnitPopulationKey} from '../src/core/constants.js';

const root=resolve(import.meta.dirname,'..');
const dataDir=resolve(root,'public/data/banc');
const manifest=JSON.parse(await readFile(resolve(dataDir,'manifest.json'),'utf8'));
const audit=JSON.parse(await readFile(resolve(dataDir,'audit.json'),'utf8'));
const edgeStats=JSON.parse(await readFile(resolve(dataDir,'edge-stats.json'),'utf8'));
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const expected={neurons:155855,core:1912731,balanced:3730893,maximal:13366470,shards:35};
const expectedMotorUnitCounts={
  LF:[0,16,1,1,1],LM:[0,15,1,1,1],LH:[0,16,1,1,1],
  RF:[1,14,1,1,1],RM:[0,17,0,1,1],RH:[0,17,1,1,1],
};
const expectedFecoCounts={LF:[27,27,59],LM:[34,20,53],LH:[38,22,56],RF:[25,26,47],RM:[13,23,55],RH:[25,24,71]};

if(manifest.schema!=='fly-umwelt-connectome-manifest-v2')throw new Error(`unexpected BANC schema ${manifest.schema}`);
if(manifest.neuronCount!==expected.neurons||audit.selectedNeurons!==expected.neurons)throw new Error(`BANC neuron count mismatch: ${manifest.neuronCount}/${audit.selectedNeurons}`);
for(const [tier,count] of Object.entries({core:expected.core,balanced:expected.balanced,maximal:expected.maximal})){
  if(Number(manifest.graph?.tiers?.[tier]?.edgeCount)!==count)throw new Error(`${tier} tier expected ${count} edges`);
  if(Number(edgeStats.tiers?.[tier])!==count)throw new Error(`${tier} edge-stats expected ${count} edges`);
  const budget=manifest.graph.tiers[tier].loadBudget;
  if(budget?.schema!=='fly-umwelt-load-budget-v1'||budget.uncompressedGraphBytes!==count*12||budget.runtimeCsrBytes!==count*8+(expected.neurons+1)*4)throw new Error(`${tier} load budget is missing or stale`);
}
if(manifest.graph?.weightSemantics!=='count / postsynaptic total input')throw new Error('BANC graph must store postsynaptic-normalized pair weights');
if(!String(audit.selection).includes('NOT_A_NEURON')||audit.excludedExplicitNonNeuronal!==157||audit.isRealNeuronOverrides!==13)throw new Error('BANC neuron-boundary audit is incomplete');

const metadataAssets=[manifest.neurons,manifest.classification,manifest.audit];
for(const spec of metadataAssets){
  const path=resolve(root,'public',String(spec.local).replace(/^\.\//,''));
  const bytes=await readFile(path);
  if(sha256(bytes)!==spec.sha256)throw new Error(`${basename(path)} SHA-256 mismatch`);
  if(bytes.length!==Number(spec.compressedBytes))throw new Error(`${basename(path)} byte-count mismatch`);
  if(bytes.length>25*1024*1024)throw new Error(`${basename(path)} exceeds Cloudflare Pages 25 MiB limit`);
}

const allComponents=manifest.graph?.components||{};
let shardCount=0;
const coreBuffers=[];
const componentRecords={};
let globalMin=Infinity,globalMax=-Infinity;
for(const [componentId,component] of Object.entries(allComponents)){
  let componentCount=0;
  for(const spec of component.shards||[]){
    shardCount++;
    const path=resolve(root,'public',String(spec.local).replace(/^\.\//,''));
    const info=await stat(path);
    if(info.size>25*1024*1024)throw new Error(`${basename(path)} exceeds Cloudflare Pages 25 MiB limit`);
    if(info.size!==Number(spec.compressedBytes))throw new Error(`${basename(path)} compressed byte-count mismatch`);
    const compressed=await readFile(path);
    if(sha256(compressed)!==spec.sha256)throw new Error(`${basename(path)} SHA-256 mismatch`);
    const raw=gunzipSync(compressed);
    if(raw.length%12!==0)throw new Error(`${basename(path)} is not a whole number of 12-byte edge records`);
    const records=raw.length/12;
    if(Number(spec.records)!==records)throw new Error(`${basename(path)} expected ${spec.records} records, got ${records}`);
    componentCount+=records;
    const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
    for(let offset=0;offset<raw.byteLength;offset+=12){
      const pre=view.getUint32(offset,true),post=view.getUint32(offset+4,true),weight=view.getFloat32(offset+8,true);
      if(pre>=expected.neurons||post>=expected.neurons)throw new Error(`${basename(path)} contains endpoint outside 0..${expected.neurons-1}`);
      if(!Number.isFinite(weight)||weight<=0||weight>1+1e-6)throw new Error(`${basename(path)} contains invalid normalized weight ${weight}`);
      if(weight<globalMin)globalMin=weight;if(weight>globalMax)globalMax=weight;
    }
    if(componentId==='core')coreBuffers.push(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  }
  if(componentCount!==Number(component.edgeCount))throw new Error(`${componentId} component count ${componentCount} != ${component.edgeCount}`);
  componentRecords[componentId]=componentCount;
}
if(shardCount!==expected.shards)throw new Error(`expected ${expected.shards} BANC shards, got ${shardCount}`);

const coreTier=resolveGraphTier(manifest,'core');
const neuronText=gunzipSync(await readFile(resolve(dataDir,'neurons.csv.gz'))).toString('utf8');
const classText=gunzipSync(await readFile(resolve(dataDir,'classification.csv.gz'))).toString('utf8');
const coreManifest={...manifest,edgeCount:coreTier.edgeCount,graphTier:'core'};
const pack=parseShardedConnectomePack(neuronText,classText,coreBuffers,coreManifest);
if(pack.N!==expected.neurons||pack.E!==expected.core)throw new Error(`parsed Core graph mismatch ${pack.N}/${pack.E}`);
for(const leg of ['LF','LM','LH','RF','RM','RH']){
  const count=pack.mapping.populations[`legMotor${leg}`]?.length||0;
  if(count<2)throw new Error(`mapped legMotor${leg} population is too small (${count})`);
}
const peripheral=pack.mapping.provenance.peripheralMapping;
if(peripheral.motorUnits!==391)throw new Error(`pinned BANC annotations must expose 391 explicit leg motor neurons, got ${peripheral.motorUnits}`);
if(peripheral.motorCellTypes!==68)throw new Error(`pinned BANC annotations must preserve 68 leg motor cell types, got ${peripheral.motorCellTypes}`);
if(peripheral.motorTargets!==17)throw new Error(`pinned BANC annotations must preserve 17 motor targets, got ${peripheral.motorTargets}`);
if(peripheral.explicitLegSensoryUnits!==5214||peripheral.sensoryUnits!==5302)throw new Error(`pinned BANC leg-afferent boundary changed: ${peripheral.explicitLegSensoryUnits} explicit / ${peripheral.sensoryUnits} mapped`);
if(peripheral.uncertaintyCounts.lrTypeConflict!==167||peripheral.uncertaintyCounts.missingTransmitterEvidence!==26)throw new Error('pinned BANC motor uncertainty counts changed');
for(const leg of LEG_IDS)for(const action of ['femurTibiaFlex','femurTibiaExtend']){
  const key=legMotorActionPopulationKey(leg,action);
  if(!(pack.mapping.populations[key]?.length>0))throw new Error(`missing identified antagonist population ${key}`);
}
for(const leg of LEG_IDS){
  for(let unit=0;unit<FEMUR_TIBIA_MOTOR_UNIT_SPECS.length;unit++){
    const key=legMotorUnitPopulationKey(leg,FEMUR_TIBIA_MOTOR_UNIT_SPECS[unit].id),count=pack.mapping.populations[key]?.length||0;
    if(count!==expectedMotorUnitCounts[leg][unit])throw new Error(`${key} expected ${expectedMotorUnitCounts[leg][unit]}, got ${count}`);
  }
  for(const [subtype,expectedCount] of ['Claw','Hook','Club'].map((name,index)=>[name,expectedFecoCounts[leg][index]])){
    const count=pack.mapping.populations[`leg${subtype}${leg}`]?.length||0;
    if(count!==expectedCount)throw new Error(`leg${subtype}${leg} expected ${expectedCount}, got ${count}`);
  }
  for(const signed of ['ClawFlexion','ClawExtension','HookFlexion','HookExtension'])if((pack.mapping.populations[`leg${signed}${leg}`]?.length||0)!==0)throw new Error(`BANC must not fabricate signed ${signed} roots for ${leg}`);
}
for(const name of ['DNa01_L','DNa01_R','DNa02_L','DNa02_R','DNg13_L','DNg13_R']){
  if((pack.mapping.populations[name]?.length||0)!==1)throw new Error(`${name} must resolve to one audited neuron`);
}
if((pack.mapping.populations.halt?.length||0)!==0)throw new Error('BANC halt pool must be empty without an exact supported halt type');

const result={
  schema:'fly-umwelt-banc-validation-v1',
  manifestId:manifest.id,
  neuronCount:pack.N,
  componentRecords,
  tiers:Object.fromEntries(Object.entries(manifest.graph.tiers).map(([key,value])=>[key,value.edgeCount])),
  shardCount,
  normalizedWeightRange:[globalMin,globalMax],
  legMotorCounts:Object.fromEntries(['LF','LM','LH','RF','RM','RH'].map(leg=>[leg,pack.mapping.populations[`legMotor${leg}`].length])),
  femurTibiaMotorUnitCounts:Object.fromEntries(LEG_IDS.map(leg=>[leg,Object.fromEntries(FEMUR_TIBIA_MOTOR_UNIT_SPECS.map(spec=>[spec.id,pack.mapping.populations[legMotorUnitPopulationKey(leg,spec.id)]?.length||0]))])),
  fecoPopulationCounts:Object.fromEntries(LEG_IDS.map(leg=>[leg,Object.fromEntries(['Claw','Hook','Club'].map(subtype=>[subtype.toLowerCase(),pack.mapping.populations[`leg${subtype}${leg}`]?.length||0]))])),
  signedFecoPopulations:'absent in pinned BANC annotations; runtime uses disclosed unsigned fallback',
  peripheral:{
    ...peripheral,
    actionChannels:LEG_MOTOR_ACTION_SPECS.length,
    sensoryModalityChannels:LEG_SENSORY_MODALITIES.length,
  },
  steeringCounts:Object.fromEntries(['DNa01_L','DNa01_R','DNa02_L','DNa02_R','DNg13_L','DNg13_R'].map(name=>[name,pack.mapping.populations[name].length])),
  haltCount:pack.mapping.populations.halt?.length||0,
};
console.log(JSON.stringify(result,null,2));
