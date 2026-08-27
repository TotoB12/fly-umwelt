import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {parseShardedConnectomePack,resolveGraphTier} from '../src/core/connectome-data.js';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {WorldModel} from '../src/core/world-model.js';
import {modelConfigFor} from '../src/core/constants.js';

const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/data/banc');
const arg=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.split('=')[1];
const tierArg=arg('tier')||'core';
const seconds=Math.max(1,Math.min(30,Number(arg('seconds'))||5));
const seeds=(arg('seeds')||'1,2,3').split(',').map(Number).filter(Number.isFinite);
const includeDefault=process.argv.includes('--default-room');
const manifest=JSON.parse(await readFile(resolve(base,'manifest.json'),'utf8'));
const tier=resolveGraphTier(manifest,tierArg);
const asArrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
const neuronText=gunzipSync(await readFile(resolve(base,'neurons.csv.gz'))).toString('utf8');
const classText=gunzipSync(await readFile(resolve(base,'classification.csv.gz'))).toString('utf8');
const shardBuffers=[];
for(const spec of tier.shards){const raw=gunzipSync(await readFile(resolve(root,'public',spec.local.replace(/^\.\//,''))));shardBuffers.push(asArrayBuffer(raw));}
const parseStart=performance.now();
const data=parseShardedConnectomePack(neuronText,classText,shardBuffers,{...manifest,edgeCount:tier.edgeCount,graphTier:tier.id});
const parseWallSeconds=(performance.now()-parseStart)/1000;
const symmetricRoom={version:1,name:'symmetric empty chamber',width:300,height:220,ambientLight:.45,temperature:.5,spawn:{x:150,y:110,heading:0},objects:[]};
const defaultRoom=includeDefault?JSON.parse(await readFile(resolve(root,'public/rooms/default.json'),'utf8')):null;

function signedAngleDelta(current,previous){let value=current-previous;while(value>Math.PI)value-=Math.PI*2;while(value<-Math.PI)value+=Math.PI*2;return value;}
function round(value,digits=6){return Number(Number(value||0).toFixed(digits));}
async function run(room,seed){
  const engine=new WholeConnectomeEngine(data,modelConfigFor('natural',{warmupMs:0}),seed);
  const world=new WorldModel(room,seed^0x9e3779b9,'natural');
  const steps=Math.round(seconds/.01);let nextBrain=0,path=0,signedRotation=0,absoluteRotation=0,priorX=world.fly.x,priorY=world.fly.y,priorHeading=world.fly.heading;
  let brainFrames=0,rateSum=0,maxRate=0,maxConflict=0,meanConflict=0,legAsymmetry=0,meanLegDrive=0,saturatedFrames=0,spikes=0;
  const start=performance.now();
  for(let step=0;step<steps;step++){
    if(world.time>=nextBrain-1e-9){
      const result=engine.advance(50,world.sense(50));world.setBrain(result.motor);nextBrain+=.05;
      const stats=result.stats,brain=result.motor;brainFrames++;spikes+=stats.spikes;rateSum+=stats.populationRateHz;maxRate=Math.max(maxRate,stats.populationRateHz);
      maxConflict=Math.max(maxConflict,brain.conflict);meanConflict+=brain.conflict;legAsymmetry+=Math.abs(brain.legLeft-brain.legRight);meanLegDrive+=brain.locomotorDrive;
      if(stats.populationRateHz>25||brain.conflict>.95)saturatedFrames++;
    }
    world.step(.01);
    path+=Math.hypot(world.fly.x-priorX,world.fly.y-priorY);priorX=world.fly.x;priorY=world.fly.y;
    const delta=signedAngleDelta(world.fly.heading,priorHeading);signedRotation+=delta;absoluteRotation+=Math.abs(delta);priorHeading=world.fly.heading;
  }
  const displacement=Math.hypot(world.fly.x-room.spawn.x,world.fly.y-room.spawn.y),wallSeconds=(performance.now()-start)/1000;
  return {
    seed,seconds,wallSeconds:round(wallSeconds,4),achievedBiologicalRealtime:round(seconds/wallSeconds,3),pathMm:round(path,4),displacementMm:round(displacement,4),straightness:path?round(displacement/path,6):1,
    signedRotationDeg:round(signedRotation*180/Math.PI,4),absoluteRotationDeg:round(absoluteRotation*180/Math.PI,4),final:{x:round(world.fly.x,3),y:round(world.fly.y,3),heading:round(world.fly.heading,5)},
    spikes,populationRateHz:{mean:round(rateSum/Math.max(1,brainFrames),6),max:round(maxRate,6)},motor:{meanLegDrive:round(meanLegDrive/Math.max(1,brainFrames),6),meanLegAsymmetry:round(legAsymmetry/Math.max(1,brainFrames),6),meanConflict:round(meanConflict/Math.max(1,brainFrames),6),maxConflict:round(maxConflict,6)},saturatedFrames,
  };
}

const evoked=new WholeConnectomeEngine(data,modelConfigFor('evoked',{warmupMs:0}),0x77);
let evokedSpikes=0;for(let i=0;i<10;i++)evokedSpikes+=evoked.advance(50,null).stats.spikes;
const evokedZero={durationMs:500,spikes:evokedSpikes,locomotorDrive:evoked.lastMotor.locomotorDrive,legs:evoked.lastMotor.legs};
if(evokedSpikes!==0||evoked.lastMotor.locomotorDrive!==0||evoked.lastMotor.legs.some(value=>value!==0))throw new Error('zero-input Evoked BANC run was not silent');

const symmetric=[];for(const seed of seeds)symmetric.push(await run(symmetricRoom,seed));
const defaultRuns=[];if(defaultRoom)for(const seed of seeds)defaultRuns.push(await run(defaultRoom,seed));
for(const run of symmetric){
  if(!Number.isFinite(run.pathMm)||!Number.isFinite(run.signedRotationDeg)||run.saturatedFrames)throw new Error(`unstable BANC run for seed ${run.seed}`);
}
const aggregate=runs=>runs.length?{
  meanPathMm:round(runs.reduce((sum,item)=>sum+item.pathMm,0)/runs.length,4),meanStraightness:round(runs.reduce((sum,item)=>sum+item.straightness,0)/runs.length,6),meanSignedRotationDeg:round(runs.reduce((sum,item)=>sum+item.signedRotationDeg,0)/runs.length,4),maxAbsoluteSignedRotationDeg:round(Math.max(...runs.map(item=>Math.abs(item.signedRotationDeg))),4),meanPopulationRateHz:round(runs.reduce((sum,item)=>sum+item.populationRateHz.mean,0)/runs.length,6),maxConflict:round(Math.max(...runs.map(item=>item.motor.maxConflict)),6),saturatedFrames:runs.reduce((sum,item)=>sum+item.saturatedFrames,0),
}:null;
console.log(JSON.stringify({schema:'fly-umwelt-banc-dynamics-v3',qualification:'Engineering stability and causal-boundary check on the actual bundled BANC graph. Turning is reported rather than rejected because this diagnostic has no source-anchored spontaneous-trajectory criterion. Biological gait observations and unresolved locomotor qualification are audited separately.',dataset:{id:manifest.id,tier:tier.id,neurons:data.N,edges:data.E,weightSemantics:manifest.graph.weightSemantics},parseWallSeconds:round(parseWallSeconds,4),evokedZero,symmetric:{aggregate:aggregate(symmetric),runs:symmetric},defaultRoom:defaultRuns.length?{aggregate:aggregate(defaultRuns),runs:defaultRuns}:null},null,2));
