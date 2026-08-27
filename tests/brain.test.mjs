import test from 'node:test';
import assert from 'node:assert/strict';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {NeuralEffectorDecoder} from '../src/core/motor-decoder.js';
import {fixtureData} from './helpers.mjs';
import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_MOTOR_ACTION_SPECS,modelConfigFor,RETINA_RAYS} from '../src/core/constants.js';

const sensory=(over={})=>({
  retinaBrightness:new Float32Array(RETINA_RAYS).fill(.2),retinaMotion:new Float32Array(RETINA_RAYS),retinaLoom:new Float32Array(RETINA_RAYS),retinaProximity:new Float32Array(RETINA_RAYS),
  odorLeft:new Float32Array([.2,0,0]),odorRight:new Float32Array([.8,0,0]),touch:new Float32Array(6),taste:new Float32Array(3),airflow:new Float32Array(2),temperature:.5,
  proprioception:new Float32Array(50),metabolic:new Float32Array([.4,.2,.1,.1,.1]),memoryCue:new Float32Array(4),ambientNoise:.02,dtMs:50,...over,
});
const zeroSensory=()=>sensory({retinaBrightness:new Float32Array(RETINA_RAYS),odorLeft:new Float32Array(3),odorRight:new Float32Array(3),metabolic:new Float32Array(5),ambientNoise:0});
const coreMotor=m=>({locomotorDrive:m.locomotorDrive,coordinationDrive:m.coordinationDrive,legs:m.legs,reverse:m.reverse,feed:m.feed,drink:m.drink,escape:m.escape,halt:m.halt,confidence:m.confidence,turnEvidence:m.turnEvidence});

test('same neural seed and sensory history is deterministic',async()=>{const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'natural'},123),b=new WholeConnectomeEngine(data,{modelMode:'natural'},123);for(let i=0;i<20;i++){const x=a.advance(50,sensory()),y=b.advance(50,sensory());assert.deepEqual(x.motor,y.motor);assert.equal(x.stats.spikes,y.stats.spikes);}});

test('evoked zero-baseline mode is silent without stimulation',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked'},7),result=engine.advance(600,null);assert.equal(result.stats.spikes,0);assert.deepEqual(coreMotor(result.motor),{locomotorDrive:0,coordinationDrive:0,legs:[0,0,0,0,0,0],reverse:0,feed:0,drink:0,escape:0,halt:0,confidence:0,turnEvidence:0});});

test('natural mode creates disclosed ongoing CNS activity without stimulating outputs directly',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural'},123);assert(engine.autonomySeeds.length>0);for(const index of engine.autonomySeeds)assert.equal(data.mapping.outputFlags[index]&0xfffffffc,0);let spikes=engine.warmup(600).spikes;for(let i=0;i<50;i++)spikes+=engine.advance(50,zeroSensory()).stats.spikes;assert(spikes>0);});

test('causal activation of a labelled output changes the neural motor packet',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},9),baseline=engine.advance(50,zeroSensory()).motor;engine.perturb('DNa02','R',180,400);let turn=-1;for(let i=0;i<12;i++)turn=Math.max(turn,engine.advance(50,zeroSensory()).motor.turnEvidence);assert(turn>baseline.turnEvidence+.05);});

test('strict decoder ignores broad descending activity',()=>{const decoder=new NeuralEffectorDecoder({}, {strictDecoder:true,broadDescendingGain:1,outputGain:1,functionalIntent:false});const motor=decoder.decode({named:{},broad:{descending:500,descending_L:0,descending_R:500},outputSpikes:100,specificOutputSpikes:0});assert.equal(motor.locomotorDrive,0);assert.equal(motor.turnEvidence,0);assert.equal(motor.coordinationDrive,0);assert(motor.confidence>=0&&motor.confidence<=1);});

test('motor excitability bridge uses only identified motor state and preserves exact zero',()=>{
  const decoder=new NeuralEffectorDecoder({}, {strictDecoder:false,broadDescendingGain:1,outputGain:1,useSubthresholdOutput:true,subthresholdOutputGain:9,motorSubthresholdSaturationScale:.16});
  const coordinationOnly=decoder.decode({named:{},broad:{descending:500},activation:{named:{},broad:{descending:1}}});
  assert.equal(coordinationOnly.locomotorDrive,0);
  assert.deepEqual(coordinationOnly.legs,[0,0,0,0,0,0]);
  const identified=decoder.decode({named:{},broad:{},activation:{named:{legMotorLF:.0025},broad:{}}});
  assert(identified.legs[0]>.04);
  assert.deepEqual(identified.legs.slice(1),[0,0,0,0,0]);
});

test('decoder preserves discrete motor-unit counts without smoothing or replay metadata loss',()=>{
  const decoder=new NeuralEffectorDecoder({}, {strictDecoder:true,outputGain:1}),counts=new Array(6*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length).fill(0);counts[2]=3;
  const motor=decoder.decode({named:{},broad:{},motorUnitSpikeCounts:counts,motorFrameId:17,motorFrameDurationMs:50});
  assert.equal(motor.motorUnitSpikeCounts[2],3);assert.equal(motor.motorFrameId,17);assert.equal(motor.motorFrameDurationMs,50);
});

test('evoked mode uses conservative sensory mappings',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked'},44);engine.advance(50,sensory());const labels=[...engine.stimulationCursor.keys()];assert(labels.some(label=>label.startsWith('retina-hemifield')));assert(!labels.some(label=>label.startsWith('retina-sector-proxy')));assert(labels.some(label=>label.includes('Annotated')));});

test('natural mode discloses proxy sensory and memory mappings',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural',autonomyDrive:0},44);engine.advance(50,sensory({memoryCue:new Float32Array([.3,.1,.6,.8])}));const labels=[...engine.stimulationCursor.keys()];assert(labels.some(label=>label.startsWith('retina-sector-proxy')));assert(labels.some(label=>label.includes('Proxy')));assert(labels.some(label=>label.startsWith('memory-')));});

test('the three modes have materially different boundary conditions',()=>{const natural=modelConfigFor('natural'),connectome=modelConfigFor('connectome'),evoked=modelConfigFor('evoked');assert.equal(natural.functionalIntent,false);assert.equal(natural.memoryInput,true);assert.equal(natural.vncProfile,'hexapod');assert.equal(connectome.functionalIntent,false);assert.equal(connectome.memoryInput,false);assert.equal(connectome.vncProfile,'hexapod');assert.equal(evoked.autonomyDrive,0);assert.equal(evoked.strictDecoder,true);assert.equal(evoked.vncProfile,'hexapod');});

test('natural output bridge produces bounded drive from persistent neural state',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural'},123);engine.warmup(engine.config.warmupMs);let locomotor=0,turn=0;for(let i=0;i<80;i++){const result=engine.advance(50,zeroSensory());locomotor=Math.max(locomotor,result.motor.locomotorDrive);turn=Math.max(turn,Math.abs(result.motor.turnEvidence));}assert(locomotor>.03);assert(turn<.95);});

test('neural state is persistent and serializable',async()=>{const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'natural'},77);for(let i=0;i<8;i++)a.advance(50,sensory());const state=a.serialize(),b=new WholeConnectomeEngine(data,{modelMode:'natural'},1);b.restore(state);const x=a.advance(50,sensory()),y=b.advance(50,sensory());assert.deepEqual(x.motor,y.motor);assert.equal(x.stats.spikes,y.stats.spikes);});

test('serialization preserves all six smoothed leg-effector outputs',async()=>{const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'natural'},0x6633);for(let i=0;i<10;i++)a.advance(50,sensory());assert(a.decoder.smoothLegs.some(value=>value>0));const state=a.serialize(),b=new WholeConnectomeEngine(data,{modelMode:'natural'},2);b.restore(state);assert.deepEqual(Array.from(b.decoder.smoothLegs),Array.from(a.decoder.smoothLegs));assert.deepEqual(b.lastMotor.legs,a.lastMotor.legs);});

test('causal activation of an identified flexor reaches its exact actuator channel',async()=>{
  const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},0x117);
  const action=LEG_MOTOR_ACTION_SPECS.findIndex(item=>item.id==='femurTibiaFlex');
  engine.perturb('legActionLFFemurTibiaFlex','',220,500);
  let peak=0;
  for(let i=0;i<12;i++)peak=Math.max(peak,engine.advance(50,zeroSensory()).motor.actuators[action]);
  assert(peak>.05);
});

test('serialization preserves independently smoothed detailed actuator outputs',async()=>{
  const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},0x221);
  a.perturb('legActionRHFemurTibiaExtend','',200,400);
  for(let i=0;i<5;i++)a.advance(50,zeroSensory());
  assert(a.decoder.smoothActuators.some(value=>value>0));
  const state=a.serialize(),b=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},2);b.restore(state);
  assert.deepEqual(Array.from(b.decoder.smoothActuators),Array.from(a.decoder.smoothActuators));
  assert.deepEqual(b.lastMotor.actuators,a.lastMotor.actuators);
});

test('serialization preserves independently smoothed femur-tibia motor-unit outputs',async()=>{
  const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},0x222);
  a.perturb('legMotorUnitLFFlexorUnresolved','',200,400);
  for(let i=0;i<5;i++)a.advance(50,zeroSensory());
  assert(a.decoder.smoothMotorUnits.some(value=>value>0));
  const state=a.serialize(),b=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},2);b.restore(state);
  assert.equal(a.decoder.smoothMotorUnits.length,6*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);
  assert.deepEqual(Array.from(b.decoder.smoothMotorUnits),Array.from(a.decoder.smoothMotorUnits));
  assert.deepEqual(b.lastMotor.motorUnits,a.lastMotor.motorUnits);
});

test('subtype-resolved proprioception routes FeCO evidence without inventing signed roots',async()=>{
  const data=await fixtureData(),p=data.mapping.populations;
  p.legClawLF=p.legJointAngleLF;p.legHookLF=p.legMovementDirectionLF;p.legClubLF=p.legVibrationLF;
  const engine=new WholeConnectomeEngine(data,{modelMode:'evoked'},45),packet=new Float32Array(92);
  packet.set([.2,.1,0,1,.2,.3,.4,1,0,.1,.8,.1,.6,.05,.7],2);
  engine.advance(50,sensory({proprioception:packet}));
  const labels=[...engine.stimulationCursor.keys()];
  assert(labels.includes('leg-claw-position-unsigned-LF'));
  assert(labels.includes('leg-hook-direction-unsigned-LF'));
  assert(labels.includes('leg-club-dynamic-envelope-LF'));
  assert(!labels.some(label=>/^leg-(?:claw|hook)-(?:flexion|extension)-LF$/.test(label)));
});

test('articulated proprioception targets exact joint modality populations while legacy packets remain supported',async()=>{
  const data=await fixtureData();
  const articulated=new WholeConnectomeEngine(data,{modelMode:'evoked'},44);
  const articulatedPacket=new Float32Array(62);articulatedPacket.set([.2,.5,0,1,.2,.3,.4,1,0,0],2);
  articulated.advance(50,sensory({proprioception:articulatedPacket}));
  const labels=[...articulated.stimulationCursor.keys()];
  assert(labels.includes('leg-joint-angle-LF'));assert(labels.includes('leg-joint-direction-LF'));assert(labels.includes('leg-strain-LF'));
  const legacy=new WholeConnectomeEngine(data,{modelMode:'evoked'},44);
  const legacyPacket=new Float32Array(50);legacyPacket.set([0,1,.2,.3,.4,1,0,0],2);
  legacy.advance(50,sensory({proprioception:legacyPacket}));
  const legacyLabels=[...legacy.stimulationCursor.keys()];
  assert(legacyLabels.includes('leg-position-LF'));assert(legacyLabels.includes('leg-movement-LF'));assert(legacyLabels.includes('leg-load-LF'));
});

test('spiking neurons leave refractory state once instead of entering a repeating cycle',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked',brainDtMs:2},91);const index=Array.from({length:data.N},(_,i)=>i).find(i=>!engine.zeroRefractoryMask[i]);assert.notEqual(index,undefined);engine.v[index]=engine.config.thresholdMv+1;engine.step();assert.equal(engine.spikeCount,1);assert(Math.abs(engine.refractory[index]-engine.config.refractoryMs)<1e-5);engine.step();assert(Math.abs(engine.refractory[index]-.2)<1e-5);engine.step();assert.equal(engine.refractory[index],0);for(let i=0;i<5;i++)engine.step();assert.equal(engine.refractory[index],0);});

test('published unless-refractory semantics freeze synaptic state until release',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked',brainDtMs:2},92);const index=Array.from({length:data.N},(_,i)=>i).find(i=>!engine.zeroRefractoryMask[i]);assert.notEqual(index,undefined);engine.g[index]=5;engine.refractory[index]=2.2;engine.step();assert.equal(engine.g[index],5);engine.step();assert.equal(engine.g[index],5);engine.step();assert(engine.g[index]<5);});

test('Poisson-input target populations retain the published zero refractory period',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked'},93);const index=data.mapping.populations.visualLeft?.[0]??data.mapping.populations.visualBoth?.[0];assert.notEqual(index,undefined);engine.v[index]=engine.config.thresholdMv+1;engine.step();assert.equal(engine.refractory[index],0);});

test('pending synaptic events are time-preserved when temporal resolution changes',async()=>{const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'evoked',brainDtMs:2,synapticDelayMs:4},94);const index=Array.from(data.mapping.populations.central)[0],slot=(a.pendingIndex+1)%a.pending.length;a.pending[slot][index]=3.5;a.pendingTouched[slot].push(index);const state=a.serialize();state.config={...state.config,brainDtMs:1};const b=new WholeConnectomeEngine(data,state.config,1);b.restore(state);const expectedSlot=(b.pendingIndex+2)%b.pending.length;assert.equal(b.pending[expectedSlot][index],3.5);assert.equal(b.pending.reduce((sum,queue)=>sum+queue[index],0),3.5);});

test('Causal decoder output is invariant to post-connectome sensory features',()=>{const rates={named:{oDN1:8,DNa02_L:2,DNa02_R:5},broad:{},outputSpikes:4,specificOutputSpikes:4},functional={centralArousal:{rate:20,activation:.3},feeding:{rate:5,activation:.1}};const a=new NeuralEffectorDecoder({}, {modelMode:'connectome',functionalIntent:false,outputGain:1}),b=new NeuralEffectorDecoder({}, {modelMode:'connectome',functionalIntent:false,outputGain:1});const quiet=zeroSensory(),extreme=sensory({retinaLoom:new Float32Array(RETINA_RAYS).fill(1),retinaProximity:new Float32Array(RETINA_RAYS).fill(1),taste:new Float32Array([1,1,1]),memoryCue:new Float32Array([1,0,0,1])});assert.deepEqual(a.decode(rates,functional,quiet),b.decode(rates,functional,extreme));});


test('serialization restores the last decoded motor packet and frame statistics',async()=>{
  const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'natural'},0x51a7e);
  a.advance(50,sensory());
  const expectedMotor={...a.lastMotor},expectedStats=structuredClone(a.lastFrameStats),state=a.serialize();
  a.advance(50,zeroSensory());
  a.restore(state);
  assert.deepEqual(a.lastMotor,expectedMotor);
  assert.deepEqual(a.lastFrameStats,expectedStats);
});


test('serialization restores the active sensory boundary packet',async()=>{
  const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural'},0x5e115e);
  const original=sensory({odorLeft:new Float32Array([.61,.12,.04]),memoryCue:new Float32Array([.3,.2,.1,.7])});
  engine.advance(50,original);
  const state=engine.serialize();
  engine.advance(50,zeroSensory());
  engine.restore(state);
  assert.deepEqual(engine.currentSensory,state.currentSensory);
  assert.notEqual(engine.currentSensory,state.currentSensory);
  assert.deepEqual(Array.from(engine.currentSensory.odorLeft),Array.from(original.odorLeft));
});
