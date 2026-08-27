import {performance} from 'node:perf_hooks';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {LEG_IDS, LEG_OUTPUT_FLAGS, modelConfigFor, OUTPUT_FLAGS, RETINA_RAYS} from '../src/core/constants.js';

// Engineering stress test only. Counts match the bundled BANC Balanced tier,
// while connectivity and annotations are deterministic synthetic data.
const N=155_855;
const E=3_730_893;
const stepsArg=process.argv.find(arg=>/^--body-steps=/.test(arg));
const bodySteps=Math.max(1,Math.min(50,Number(stepsArg?.split('=')[1])||5));
const rowPtr=new Uint32Array(N+1),post=new Uint32Array(E),weight=new Float32Array(E);
let edge=0;
const base=Math.floor(E/N),extra=E%N;
for(let pre=0;pre<N;pre++){
  rowPtr[pre]=edge;
  const count=base+(pre<extra?1:0);
  for(let k=0;k<count;k++,edge++){
    post[edge]=(Math.imul(pre+1,131071)+Math.imul(k+1,8191))%N;
    const sign=(pre+k)%11===0?-1:1;
    weight[edge]=sign*(.0008+((pre+k)%7)*.00055);
  }
}
rowPtr[N]=edge;
const small=(start,count)=>Uint32Array.from({length:count},(_,i)=>start+i);
const centralEnd=N-5000;
const central=small(0,centralEnd);
const descending=small(N-5000,3500);
const descendingProxyLeft=descending.slice(0,Math.ceil(descending.length/2));
const descendingProxyRight=descending.slice(Math.ceil(descending.length/2));
const outputFlags=new Uint32Array(N);
for(const idx of descendingProxyLeft)outputFlags[idx]=OUTPUT_FLAGS.DESCENDING|OUTPUT_FLAGS.PROXY_LEFT;
for(const idx of descendingProxyRight)outputFlags[idx]=OUTPUT_FLAGS.DESCENDING|OUTPUT_FLAGS.PROXY_RIGHT;
const populations={central,descending,descendingMidline:descending,descendingProxyLeft,descendingProxyRight};
let motorStart=N-120;
for(const leg of LEG_IDS){
  const indices=small(motorStart,20);motorStart+=20;
  populations[`legMotor${leg}`]=indices;
  for(const idx of indices)outputFlags[idx]=OUTPUT_FLAGS.LEG_MOTOR|LEG_OUTPUT_FLAGS[leg]|(leg[0]==='L'?OUTPUT_FLAGS.LEFT:OUTPUT_FLAGS.RIGHT);
}
populations.leg_motor=Uint32Array.from(LEG_IDS.flatMap(leg=>Array.from(populations[`legMotor${leg}`])));
populations.leg_motor_L=Uint32Array.from(['LF','LM','LH'].flatMap(leg=>Array.from(populations[`legMotor${leg}`])));
populations.leg_motor_R=Uint32Array.from(['RF','RM','RH'].flatMap(leg=>Array.from(populations[`legMotor${leg}`])));
const visual=small(0,11487),olfactory=small(11487,2281),mech=small(13768,1927),endocrine=small(15695,80);
Object.assign(populations,{
  visualBoth:visual,olfactoryBoth:olfactory,
  olfactoryFoodProxyBoth:olfactory.slice(0,761),olfactoryWaterProxyBoth:olfactory.slice(761,1521),olfactoryThreatProxyBoth:olfactory.slice(1521),
  mechBoth:mech,airflowBoth:mech.slice(0,600),proprioBoth:mech.slice(600,1200),
  gustSweet:small(15775,40),gustWater:small(15815,40),gustBitter:small(15855,40),
  endocrine,endocrineEnergyProxy:endocrine.slice(0,27),endocrineWaterProxy:endocrine.slice(27,54),endocrineFatigueProxy:endocrine.slice(54),
});
const retinaSectors=Array.from({length:RETINA_RAYS},(_,sector)=>Uint32Array.from(Array.from(visual).filter((_,i)=>i%RETINA_RAYS===sector)));
const data={N,E,rowPtr,post,weight,ntCode:new Uint8Array(N),rootIds:new Array(N),manifest:{graph:{weightSemantics:'count / postsynaptic total input'}},mapping:{populations,outputFlags,retinaSectors,signalPopulations:{}}};
const engine=new WholeConnectomeEngine(data,modelConfigFor('natural',{warmupMs:0}),0x5ca1e);
for(const leg of LEG_IDS)engine.perturb(`legMotor${leg}`,'',120,bodySteps*50+100);
const packet={
  retinaBrightness:Array.from({length:RETINA_RAYS},(_,i)=>i<RETINA_RAYS/2?.28:.35),
  retinaMotion:Array(RETINA_RAYS).fill(0),retinaLoom:Array(RETINA_RAYS).fill(0),retinaProximity:Array(RETINA_RAYS).fill(0),
  odorLeft:[.08,.02,0],odorRight:[.11,.02,0],touch:[0,0,0,0,0,0],taste:[0,0,0],airflow:[0,0],temperature:.5,
  proprioception:Array(62).fill(0),metabolic:[.7,.8,.2,.3,0],memoryCue:[0,0,0,0],ambientNoise:.02,dtMs:50,
};
const before=process.memoryUsage(),started=performance.now();let spikes=0;
for(let i=0;i<bodySteps;i++)spikes+=engine.advance(50,packet).stats.spikes;
const elapsed=(performance.now()-started)/1000,after=process.memoryUsage();
const motorMagnitude=Math.max(...engine.lastMotor.legs,engine.lastMotor.reverse,engine.lastMotor.escape);
if(!(motorMagnitude>1e-4))throw new Error('identified synthetic leg populations produced no direct effector output');
console.log(JSON.stringify({
  kind:'banc-balanced-scale-engineering-test',neurons:N,edges:E,bodySteps,biologicalSeconds:bodySteps*.05,
  wallSeconds:Number(elapsed.toFixed(3)),achievedBiologicalRealtime:Number((bodySteps*.05/elapsed).toFixed(3)),spikes,motor:engine.lastMotor,
  heapUsedMiB:Number((after.heapUsed/1048576).toFixed(1)),arrayBuffersMiB:Number((after.arrayBuffers/1048576).toFixed(1)),
  note:'Counts match BANC Balanced; connectivity and annotations are synthetic. Traction requires explicitly perturbed leg-effector pools. This is an engineering stress test, not biological validation.',
},null,2));
