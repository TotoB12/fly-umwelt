import test from 'node:test';import assert from 'node:assert/strict';import {fixtureData} from './helpers.mjs';
import {OUTPUT_FLAGS} from '../src/core/constants.js';
test('fixture pack exercises full parser and real-population mapping',async()=>{const d=await fixtureData();assert.equal(d.N,96);assert.equal(d.E,209);assert(d.mapping.populations.DNa02_L.length>0);assert(d.mapping.populations.MDN_L.length>0);assert(d.mapping.populations.olfactoryLeft.length>0);assert.equal(d.rowPtr.length,97);});
test('inhibitory transmitter overrides edge sign from source package',async()=>{const d=await fixtureData();for(let pre=0;pre<d.N;pre++){if(d.ntCode[pre]===2||d.ntCode[pre]===3)for(let e=d.rowPtr[pre];e<d.rowPtr[pre+1];e++)assert(d.weight[e]<=0);}});

test('annotated and proxy sensory mappings remain separate and inspectable',async()=>{const d=await fixtureData();const p=d.mapping.populations;assert(p.olfactoryFoodAnnotatedLeft.length>0);assert(p.olfactoryFoodProxyLeft.length>=p.olfactoryFoodAnnotatedLeft.length);assert(Array.isArray(d.mapping.provenance.syntheticPartitions));assert.equal(d.mapping.provenance.availableMappingModes.chemical.includes('annotated'),true);});
test('output side is independent of output class',async()=>{const d=await fixtureData();const i=d.mapping.populations.DNa02_L[0],j=d.mapping.populations.DNa02_R[0];assert(d.mapping.outputFlags[i]&OUTPUT_FLAGS.DESCENDING);assert(d.mapping.outputFlags[i]&OUTPUT_FLAGS.LEFT);assert(d.mapping.outputFlags[j]&OUTPUT_FLAGS.RIGHT);});

test('unresolved descending outputs receive a disclosed deterministic side proxy',async()=>{
  const d=await fixtureData();
  const p=d.mapping.populations;
  assert(p.descendingProxyLeft instanceof Uint32Array);
  assert(p.descendingProxyRight instanceof Uint32Array);
  assert.match(d.mapping.provenance.outputSideProxy,/deterministic|usable anatomical side/i);
  for(const i of p.descendingProxyLeft)assert(d.mapping.outputFlags[i]&OUTPUT_FLAGS.PROXY_LEFT);
  for(const i of p.descendingProxyRight)assert(d.mapping.outputFlags[i]&OUTPUT_FLAGS.PROXY_RIGHT);
});

test('broad output fallback is independent of sensory fallback', async () => {
  const N=14;
  const neuronRows=['root_id,nt_type'];
  const classRows=['root_id,flow,super_class,class,sub_class,side'];
  for(let i=0;i<N;i++){
    neuronRows.push(`n${i},ACH`);
    if(i<8)classRows.push(`n${i},afferent,sensory,visual,photo_receptor,${i%2?'right':'left'}`);
    else if(i<12)classRows.push(`n${i},afferent,sensory,olfactory,orn,${i%2?'right':'left'}`);
    else classRows.push(`n${i},intrinsic,central,interneuron,,`);
  }
  const bytes=new Uint8Array(8+N*3),view=new DataView(bytes.buffer);
  view.setUint32(0,N,true);view.setUint32(4,0,true);
  let offset=8;
  for(let i=0;i<N;i++,offset+=3){view.setUint8(offset,1);view.setUint16(offset+1,i===12?35:60,true);}
  const {parseConnectomePack}=await import('../src/core/connectome-data.js');
  const data=parseConnectomePack(neuronRows.join('\n'),classRows.join('\n'),bytes.buffer,{id:'fallback-test',neuronCount:N,edgeCount:0});
  assert.equal(data.mapping.provenance.sourceFunctionalGroupFallback,false,'sensory fallback should remain off');
  assert.equal(data.mapping.provenance.outputFunctionalGroupFallback,true,'output fallback should be disclosed');
  assert(data.mapping.populations.descending.includes(12),'source GNG/descending group should populate the broad output bridge');
});

test('display atlas groups every neuron using parser-derived populations', async () => {
  const {buildDisplayAtlas}=await import('../src/core/connectome-data.js');
  const data=await fixtureData();
  const atlas=buildDisplayAtlas(data);
  assert.equal(atlas.groupByNeuron.length,data.N);
  assert.equal(atlas.groups.length,9);
  assert.equal(atlas.groups.reduce((sum,group)=>sum+group.count,0),data.N);
  assert(atlas.groups.find(group=>group.key==='visual').count>0);
  assert(atlas.groups.find(group=>group.key==='descending').count>0);
  assert.match(atlas.provenance.note,/not anatomy|not.*recording/i);
});
