import test from 'node:test';import assert from 'node:assert/strict';import {fixtureData} from './helpers.mjs';
import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_IDS,LEG_MOTOR_ACTION_SPECS,LEG_SENSORY_MODALITIES,OUTPUT_FLAGS,legMotorActionPopulationKey,legMotorUnitPopulationKey} from '../src/core/constants.js';
import {parseConnectomePack,parseShardedConnectomePack} from '../src/core/connectome-data.js';
test('fixture pack exercises full parser and real-population mapping',async()=>{const d=await fixtureData();assert.equal(d.N,120);assert.equal(d.E,361);assert(d.mapping.populations.DNa02_L.length>0);assert(d.mapping.populations.MDN_L.length>0);assert(d.mapping.populations.olfactoryLeft.length>0);assert.equal(d.rowPtr.length,121);for(const id of ['LF','LM','LH','RF','RM','RH'])assert.equal(d.mapping.populations[`legMotor${id}`].length,2);});
test('inhibitory transmitter overrides edge sign from source package',async()=>{const d=await fixtureData();for(let pre=0;pre<d.N;pre++){if(d.ntCode[pre]===2||d.ntCode[pre]===3||d.ntCode[pre]===7)for(let e=d.rowPtr[pre];e<d.rowPtr[pre+1];e++)assert(d.weight[e]<=0);}});

test('histamine uses the inhibitory chloride-channel approximation in single and sharded packs',()=>{
  const neuronText='root_id,nt_type\nh,HISTAMINE\ng,GABA\na,ACH\nt,TYRAMINE\n';
  const classText='root_id,flow,super_class,class,sub_class,side\nh,afferent,sensory,visual,photoreceptor,left\ng,intrinsic,central,interneuron,,\na,intrinsic,central,interneuron,,\nt,intrinsic,central,interneuron,,\n';
  const edges=[[0,2,2],[1,2,3],[2,3,4],[3,2,5]];
  const singleBytes=new Uint8Array(8+edges.length*12+4*3),singleView=new DataView(singleBytes.buffer);
  singleView.setUint32(0,4,true);singleView.setUint32(4,edges.length,true);
  let offset=8;
  for(const [pre,post,weight] of edges){singleView.setUint32(offset,pre,true);singleView.setUint32(offset+4,post,true);singleView.setFloat32(offset+8,weight,true);offset+=12;}
  const single=parseConnectomePack(neuronText,classText,singleBytes.buffer,{neuronCount:4,edgeCount:4});
  assert.deepEqual(Array.from(single.weight),[-2,-3,4,0]);
  assert.deepEqual(single.mapping.provenance.transmitterSignModel.inhibitoryFastApproximation,['GABA','glutamate','histamine']);assert(single.mapping.provenance.transmitterSignModel.zeroInstantaneousFastGain.includes('tyramine'));

  const shardBytes=new Uint8Array(edges.length*12),shardView=new DataView(shardBytes.buffer);
  offset=0;
  for(const [pre,post,weight] of edges){shardView.setUint32(offset,pre,true);shardView.setUint32(offset+4,post,true);shardView.setFloat32(offset+8,weight,true);offset+=12;}
  const sharded=parseShardedConnectomePack(neuronText,classText,[shardBytes.buffer],{neuronCount:4,edgeCount:4});
  assert.deepEqual(Array.from(sharded.weight),[-2,-3,4,0]);
});

test('low-memory sharded parsing groups interleaved sources into valid CSR rows',()=>{
  const neurons='root_id,nt_type\na,ACH\nb,GABA\nc,ACH\n';
  const classes='root_id,flow,super_class,class\na,intrinsic,central,interneuron\nb,intrinsic,central,interneuron\nc,intrinsic,central,interneuron\n';
  const edges=[[2,0,5],[0,2,3],[1,0,4],[2,1,2],[0,1,1]];
  const buffers=[edges.slice(0,2),edges.slice(2)].map(records=>{const bytes=new Uint8Array(records.length*12),view=new DataView(bytes.buffer);let offset=0;for(const [pre,post,weight] of records){view.setUint32(offset,pre,true);view.setUint32(offset+4,post,true);view.setFloat32(offset+8,weight,true);offset+=12;}return bytes.buffer;});
  const pack=parseShardedConnectomePack(neurons,classes,buffers,{neuronCount:3,edgeCount:5});
  assert.deepEqual(Array.from(pack.rowPtr),[0,2,3,5]);
  assert.deepEqual(Array.from(pack.post.slice(pack.rowPtr[0],pack.rowPtr[1])).sort(),[1,2]);
  assert.deepEqual(Array.from(pack.post.slice(pack.rowPtr[1],pack.rowPtr[2])),[0]);
  assert.deepEqual(Array.from(pack.post.slice(pack.rowPtr[2],pack.rowPtr[3])).sort(),[0,1]);
  assert(pack.weight[pack.rowPtr[1]]<0);
});

test('haltere sensory annotations cannot be mistaken for the halt command',()=>{
  const neurons='root_id,nt_type\nh,ACH\nb,ACH\n';
  const classes='root_id,flow,super_class,class,sub_class,cell_type,side,body_part_sensory,cell_function\nh,afferent,sensory,mechanosensory,haltere,haltere afferent,left,haltere,haltere vibration\nb,descending,descending,descending,,BRK,right,,brake command\n';
  const bytes=new Uint8Array(8+2*3),view=new DataView(bytes.buffer);view.setUint32(0,2,true);view.setUint32(4,0,true);
  const data=parseConnectomePack(neurons,classes,bytes.buffer,{neuronCount:2,edgeCount:0});
  assert.equal(data.mapping.populations.halt.length,1);assert.equal(data.mapping.populations.halt[0],1);assert(!data.mapping.populations.halt.includes(0));
});

test('named forward outputs do not absorb unrelated DN1 or generic DNg types',()=>{
  const neurons='root_id,nt_type\no,ACH\nc,GLUTAMATE\ng,ACH\nw,ACH\n';
  const classes='root_id,flow,super_class,class,sub_class,cell_type,side\no,descending,descending,descending,,oDN1,left\nc,intrinsic,central_brain_intrinsic,circadian_neuron,DN1p,DN1pB,left\ng,descending,descending,descending,,DNg14,right\nw,descending,descending,descending,,walking DN,right\n';
  const bytes=new Uint8Array(8+4*3),view=new DataView(bytes.buffer);view.setUint32(0,4,true);view.setUint32(4,0,true);
  const data=parseConnectomePack(neurons,classes,bytes.buffer,{neuronCount:4,edgeCount:0}),p=data.mapping.populations;
  assert.deepEqual(Array.from(p.oDN1),[0]);assert(!p.oDN1.includes(1));
  assert.deepEqual(Array.from(p.DNg_walk),[3]);assert(!p.DNg_walk.includes(2));
});

test('annotated and proxy sensory mappings remain separate and inspectable',async()=>{const d=await fixtureData();const p=d.mapping.populations;assert(p.olfactoryFoodAnnotatedLeft.length>0);assert(p.olfactoryFoodProxyLeft.length>=p.olfactoryFoodAnnotatedLeft.length);assert(Array.isArray(d.mapping.provenance.syntheticPartitions));assert.equal(d.mapping.provenance.availableMappingModes.chemical.includes('annotated'),true);});
test('output side is independent of output class',async()=>{const d=await fixtureData();const i=d.mapping.populations.DNa02_L[0],j=d.mapping.populations.DNa02_R[0];assert(d.mapping.outputFlags[i]&OUTPUT_FLAGS.DESCENDING);assert(d.mapping.outputFlags[i]&OUTPUT_FLAGS.LEFT);assert(d.mapping.outputFlags[j]&OUTPUT_FLAGS.RIGHT);});

test('peripheral atlas preserves identified antagonist, muscle-target, and afferent annotations',async()=>{
  const d=await fixtureData(),atlas=d.mapping.peripheralAtlas,provenance=d.mapping.provenance.peripheralMapping;
  assert.equal(atlas.schema,'fly-umwelt-peripheral-atlas-v2');assert.equal(provenance.schema,atlas.schema);
  assert.equal(provenance.motorUnits,12);assert.equal(provenance.mappedMotorActions,12);
  assert(atlas.motorTargets.includes('tibia_flexor_muscle'));assert(atlas.motorTargets.includes('tibia_extensor_muscle'));
  for(const id of LEG_IDS){
    assert.equal(d.mapping.populations[legMotorActionPopulationKey(id,'femurTibiaFlex')].length,1);
    assert.equal(d.mapping.populations[legMotorActionPopulationKey(id,'femurTibiaExtend')].length,1);
    for(const modality of ['JointAngle','MovementDirection','Strain','Vibration'])assert(d.mapping.populations[`leg${modality}${id}`].length>0);
  }
  for(const modality of ['jointAngle','movementDirection','strain','vibration']){
    const bit=LEG_SENSORY_MODALITIES.find(item=>item.id===modality).bit;
    assert(Array.from(atlas.sensoryModalityMask).some(mask=>mask&bit));
  }
  assert.equal(atlas.motorActions.length,LEG_MOTOR_ACTION_SPECS.length);
  assert.equal(atlas.motorUnitClasses.length,FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);
  assert(Array.from(atlas.motorUnitClassCode).some(Boolean));
  for(const id of LEG_IDS)assert.equal(d.mapping.populations[legMotorUnitPopulationKey(id,'flexorUnresolved')].length,1);
  assert.equal(atlas.peripheralUncertaintyCode.length,d.N);
  assert.match(provenance.explanation,/not calibrated transfer functions/i);
});

test('FeCO parser preserves claw, hook and club identity without fabricating polarity',()=>{
  const neurons='root_id,nt_type\nc,ACH\nh,ACH\nb,ACH\ns,ACH\n';
  const classes=[
    'root_id,flow,super_class,class,sub_class,cell_type,side,body_part_sensory,function_detailed',
    'c,afferent,sensory,leg_sensory_neuron,chordotonal,SNpp50 claw_chordotonal,left,front_leg,tonic position',
    'h,afferent,sensory,leg_sensory_neuron,chordotonal,SNpp39 hook_chordotonal,left,front_leg,phasic direction',
    'b,afferent,sensory,leg_sensory_neuron,chordotonal,SApp23 club_chordotonal,left,front_leg,vibration movement',
    's,afferent,sensory,leg_sensory_neuron,chordotonal,claw_chordotonal flexion,left,front_leg,flexion position',
  ].join('\n');
  const bytes=new Uint8Array(8+4*3),view=new DataView(bytes.buffer);view.setUint32(0,4,true);view.setUint32(4,0,true);
  const data=parseConnectomePack(neurons,classes,bytes.buffer,{neuronCount:4,edgeCount:0}),p=data.mapping.populations;
  assert.deepEqual(Array.from(data.mapping.peripheralAtlas.sensorySubtypeCode),[1,2,3,1]);
  assert.deepEqual(Array.from(p.legClawLF),[0,3]);assert.deepEqual(Array.from(p.legHookLF),[1]);assert.deepEqual(Array.from(p.legClubLF),[2]);
  assert.deepEqual(Array.from(p.legClawFlexionLF),[3]);
  assert.equal(p.legClawExtensionLF,undefined);assert.equal(p.legHookFlexionLF,undefined);assert.equal(p.legHookExtensionLF,undefined);
});

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
