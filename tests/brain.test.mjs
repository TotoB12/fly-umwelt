import test from 'node:test';
import assert from 'node:assert/strict';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {NeuralEffectorDecoder} from '../src/core/motor-decoder.js';
import {fixtureData} from './helpers.mjs';
import {modelConfigFor, RETINA_RAYS} from '../src/core/constants.js';

const sensory=(over={})=>({
  retinaBrightness:new Float32Array(RETINA_RAYS).fill(.2),retinaMotion:new Float32Array(RETINA_RAYS),retinaLoom:new Float32Array(RETINA_RAYS),retinaProximity:new Float32Array(RETINA_RAYS),
  odorLeft:new Float32Array([.2,0,0]),odorRight:new Float32Array([.8,0,0]),touch:new Float32Array(6),taste:new Float32Array(3),airflow:new Float32Array(2),temperature:.5,
  proprioception:new Float32Array(2),metabolic:new Float32Array([.4,.2,.1,.1,.1]),memoryCue:new Float32Array(4),ambientNoise:.02,dtMs:50,...over,
});
const zeroSensory=()=>sensory({retinaBrightness:new Float32Array(RETINA_RAYS),odorLeft:new Float32Array(3),odorRight:new Float32Array(3),metabolic:new Float32Array(5),ambientNoise:0});
const coreMotor=m=>Object.fromEntries(['forward','reverse','turn','feed','drink','escape','halt','confidence'].map(k=>[k,m[k]]));

test('same neural seed and sensory history is deterministic',async()=>{const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'natural'},123),b=new WholeConnectomeEngine(data,{modelMode:'natural'},123);for(let i=0;i<20;i++){const x=a.advance(50,sensory()),y=b.advance(50,sensory());assert.deepEqual(x.motor,y.motor);assert.equal(x.stats.spikes,y.stats.spikes);}});

test('evoked zero-baseline mode is silent without stimulation',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked'},7),result=engine.advance(600,null);assert.equal(result.stats.spikes,0);assert.deepEqual(coreMotor(result.motor),{forward:0,reverse:0,turn:0,feed:0,drink:0,escape:0,halt:0,confidence:0});});

test('natural mode creates disclosed ongoing CNS activity without stimulating outputs directly',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural'},123);assert(engine.autonomySeeds.length>0);for(const index of engine.autonomySeeds)assert.equal(data.mapping.outputFlags[index]&0xfffffffc,0);let spikes=engine.warmup(600).spikes;for(let i=0;i<50;i++)spikes+=engine.advance(50,zeroSensory()).stats.spikes;assert(spikes>0);});

test('causal activation of a labelled output changes the neural motor packet',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked',autonomyDrive:0,outputGain:1},9),baseline=engine.advance(50,zeroSensory()).motor;engine.perturb('DNa02','R',180,400);let turn=-1;for(let i=0;i<12;i++)turn=Math.max(turn,engine.advance(50,zeroSensory()).motor.turn);assert(turn>baseline.turn+.05);});

test('strict decoder ignores broad descending activity',()=>{const decoder=new NeuralEffectorDecoder({}, {strictDecoder:true,broadDescendingGain:1,outputGain:1,functionalIntent:false});const motor=decoder.decode({named:{},broad:{descending:500,descending_L:0,descending_R:500},outputSpikes:100,specificOutputSpikes:0});assert.equal(motor.forward,0);assert.equal(motor.turn,0);assert.equal(motor.confidence,0);});

test('evoked mode uses conservative sensory mappings',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'evoked'},44);engine.advance(50,sensory());const labels=[...engine.stimulationCursor.keys()];assert(labels.some(label=>label.startsWith('retina-hemifield')));assert(!labels.some(label=>label.startsWith('retina-sector-proxy')));assert(labels.some(label=>label.includes('Annotated')));});

test('natural mode discloses proxy sensory and memory mappings',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural',autonomyDrive:0},44);engine.advance(50,sensory({memoryCue:new Float32Array([.3,.1,.6,.8])}));const labels=[...engine.stimulationCursor.keys()];assert(labels.some(label=>label.startsWith('retina-sector-proxy')));assert(labels.some(label=>label.includes('Proxy')));assert(labels.some(label=>label.startsWith('memory-')));});

test('the three modes have materially different boundary conditions',()=>{const natural=modelConfigFor('natural'),connectome=modelConfigFor('connectome'),evoked=modelConfigFor('evoked');assert.equal(natural.functionalIntent,true);assert.equal(natural.memoryInput,true);assert.equal(natural.vncProfile,'natural');assert.equal(connectome.functionalIntent,false);assert.equal(connectome.memoryInput,false);assert.equal(connectome.vncProfile,'direct');assert.equal(evoked.autonomyDrive,0);assert.equal(evoked.strictDecoder,true);assert.equal(evoked.vncProfile,'evoked');});

test('natural output bridge produces bounded drive from persistent neural state',async()=>{const data=await fixtureData(),engine=new WholeConnectomeEngine(data,{modelMode:'natural'},123);engine.warmup(engine.config.warmupMs);let forward=0,turn=0;for(let i=0;i<80;i++){const result=engine.advance(50,zeroSensory());forward=Math.max(forward,result.motor.forward);turn=Math.max(turn,Math.abs(result.motor.turn));}assert(forward>.03);assert(turn<.95);});

test('neural state is persistent and serializable',async()=>{const data=await fixtureData(),a=new WholeConnectomeEngine(data,{modelMode:'natural'},77);for(let i=0;i<8;i++)a.advance(50,sensory());const state=a.serialize(),b=new WholeConnectomeEngine(data,{modelMode:'natural'},1);b.restore(state);const x=a.advance(50,sensory()),y=b.advance(50,sensory());assert.deepEqual(x.motor,y.motor);assert.equal(x.stats.spikes,y.stats.spikes);});
