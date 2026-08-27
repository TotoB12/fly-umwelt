import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldModel} from '../src/core/world-model.js';
import {PlanarHexapodPlant,FEMUR_TIBIA_JOINT_MODEL} from '../src/core/hexapod-plant.js';
import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_MOTOR_ACTION_SPECS} from '../src/core/constants.js';

// Large enough that an active-bout speed assay does not become a boundary-
// collision assay during its six-second observation window.
const openRoom={name:'symmetric chamber',width:300,height:220,ambientLight:.5,temperature:.5,spawn:{x:150,y:110,heading:0},objects:[]};
const motor=(over={})=>({
  locomotorDrive:.8,coordinationDrive:.8,legs:[.8,.8,.8,.8,.8,.8],
  dna02Left:0,dna02Right:0,dna01Left:0,dna01Right:0,dng13Left:0,dng13Right:0,
  reverse:0,feed:0,drink:0,escape:0,halt:0,confidence:.8,conflict:0,turnEvidence:0,
  feedingEvidence:0,legLeft:.8,legRight:.8,centralArousal:0,...over,
});
function run(input,seconds=6,seed=7,room=openRoom){
  const world=new WorldModel(room,seed,'natural');world.setBrain(input);
  let path=0,rotation=0,x=world.fly.x,y=world.fly.y,heading=world.fly.heading;
  for(let i=0;i<seconds*100;i++){world.step(.01);path+=Math.hypot(world.fly.x-x,world.fly.y-y);x=world.fly.x;y=world.fly.y;let delta=world.fly.heading-heading;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;rotation+=delta;heading=world.fly.heading;}
  return {world,path,rotation};
}

test('descending coordination cannot create movement without identified leg output',()=>{
  const {world,path}=run(motor({locomotorDrive:0,legs:[0,0,0,0,0,0],legLeft:0,legRight:0,coordinationDrive:1}),4);
  assert.equal(path,0);assert.equal(world.fly.speed,0);assert.equal(world.fly.turnRate,0);
});

test('tonic leg readiness cannot start the transitional gait clock without coordination evidence',()=>{
  const {world,path}=run(motor({coordinationDrive:0}),4);
  assert.equal(path,0);assert.equal(world.fly.speed,0);assert.equal(world.lastBehavior.gaitFrequencyHz,0);
  assert(world.lastBehavior.legs.every(leg=>leg.amplitude>.5),'tonic leg-pool evidence should remain visible as postural readiness');
});

test('bilaterally symmetric leg output produces a nearly straight trajectory',()=>{
  for(const seed of [1,7,31]){
    const {world,path}=run(motor(),6,seed);
    assert(path>20,`seed ${seed} should translate through stance traction`);
    assert(Math.abs(world.fly.heading)<.035,`seed ${seed} heading drift ${world.fly.heading}`);
    const displacement=Math.hypot(world.fly.x-openRoom.spawn.x,world.fly.y-openRoom.spawn.y);
    assert(displacement/path>.999,`seed ${seed} straightness ${displacement/path}`);
  }
});

test('mirrored DNa steering evidence produces mirrored body rotation',()=>{
  const right=run(motor({dna02Right:.8,turnEvidence:.576}),6);
  const left=run(motor({dna02Left:.8,turnEvidence:-.576}),6);
  assert(right.rotation>1.5);assert(left.rotation< -1.5);
  assert(Math.abs(right.rotation+left.rotation)<.03);
  assert(Math.abs((right.world.fly.y-openRoom.spawn.y)+(left.world.fly.y-openRoom.spawn.y))<.05);
});

test('persistent tonic left-right leg-pool imbalance is not a steering command',()=>{
  const longRoom={...openRoom,width:2200,height:1200,spawn:{x:1100,y:600,heading:0}};
  const {world,rotation}=run(motor({legs:[.88,.84,.82,.38,.4,.42],legLeft:.846,legRight:.4}),60,7,longRoom);
  assert(Math.abs(rotation)<.01,`tonic motor imbalance manufactured ${rotation} rad of yaw`);
  assert(Math.abs(world.fly.turnRate)<.001);
});

test('ingestion requires both local mouth contact and mapped effector evidence',()=>{
  const foodRoom={...openRoom,objects:[{id:'f',kind:'food',x:152,y:110,r:.7,amount:.5,odor:1}]};
  const withoutOutput=run(motor({legs:[0,0,0,0,0,0],locomotorDrive:0,coordinationDrive:0,feed:0}),2,3,foodRoom).world;
  const withOutput=run(motor({legs:[0,0,0,0,0,0],locomotorDrive:0,coordinationDrive:0,feed:.9,feedingEvidence:.9}),2,3,foodRoom).world;
  assert.equal(withoutOutput.room.objects[0].amount,.5);
  assert(withOutput.room.objects[0].amount<.45);
  assert.equal(withoutOutput.lastBehavior.feed,0);
  assert.equal(withOutput.lastBehavior.state,'feed');
  assert(withOutput.lastBehavior.feed>.18);
  assert.equal(withOutput.lastBehavior.ingestionContact,'food');
});

test('bare-floor proboscis output is an attempted probe, never feeding or consumption',()=>{
  const world=run(motor({legs:[0,0,0,0,0,0],locomotorDrive:0,coordinationDrive:0,feed:.9,feedingEvidence:.9}),2,11,openRoom).world;
  assert.equal(world.lastTaste.foodId,null);
  assert.equal(world.lastBehavior.state,'probe');
  assert.equal(world.lastBehavior.feed,0);
  assert.equal(world.lastBehavior.feedAttempt,.9);
  assert.match(world.lastBehavior.reason,/without matching mouth contact/);
});

test('matching taste contact cannot cause ingestion without a neural attempt',()=>{
  const foodRoom={...openRoom,objects:[{id:'f',kind:'food',x:152,y:110,r:.7,amount:.5,odor:1}]};
  const world=run(motor({legs:[0,0,0,0,0,0],locomotorDrive:0,coordinationDrive:0,feed:0}),1,19,foodRoom).world;
  assert.equal(world.lastBehavior.feedAttempt,0);
  assert.equal(world.lastBehavior.feed,0);
  assert.equal(world.room.objects[0].amount,.5);
});

const actionIndex=id=>LEG_MOTOR_ACTION_SPECS.findIndex(action=>action.id===id);
const jointInput=(legIndex,actionId,value=1)=>{
  const actuators=new Array(6*LEG_MOTOR_ACTION_SPECS.length).fill(0);
  actuators[legIndex*LEG_MOTOR_ACTION_SPECS.length+actionIndex(actionId)]=value;
  return {legs:[0,0,0,0,0,0],actuators};
};

test('identified flexor and extensor channels drive the modeled femur-tibia joint in opposite directions',()=>{
  const flexed=new PlanarHexapodPlant(),extended=new PlanarHexapodPlant();
  for(let i=0;i<80;i++){
    flexed.step({brain:jointInput(0,'femurTibiaFlex'),dt:.01});
    extended.step({brain:jointInput(0,'femurTibiaExtend'),dt:.01});
  }
  assert(flexed.legs[0].femurTibiaAngle<FEMUR_TIBIA_JOINT_MODEL.restAngle-.35);
  assert(extended.legs[0].femurTibiaAngle>FEMUR_TIBIA_JOINT_MODEL.restAngle+.35);
  assert(flexed.legs[0].footX<extended.legs[0].footX);
});

test('bilaterally matched actuator evidence produces symmetric joint states',()=>{
  const plant=new PlanarHexapodPlant();
  const actuators=new Array(6*LEG_MOTOR_ACTION_SPECS.length).fill(0);
  for(const legIndex of [0,3])actuators[legIndex*LEG_MOTOR_ACTION_SPECS.length+actionIndex('femurTibiaExtend')]=.7;
  for(let i=0;i<70;i++)plant.step({brain:{legs:[0,0,0,0,0,0],actuators},dt:.01});
  assert(Math.abs(plant.legs[0].femurTibiaAngle-plant.legs[3].femurTibiaAngle)<1e-12);
  assert(Math.abs(plant.legs[0].femurTibiaVelocity-plant.legs[3].femurTibiaVelocity)<1e-12);
});

test('never-driven muscle is silent and subtype-resolved articulated state returns through proprioception',()=>{
  const plant=new PlanarHexapodPlant();
  plant.step({brain:jointInput(0,'femurTibiaFlex',0),dt:.01});
  assert.equal(plant.legs[0].activeJointTorque,0);
  plant.step({brain:jointInput(0,'femurTibiaFlex'),dt:.01});
  const afterDrive=plant.proprioceptionVector();
  assert.equal(afterDrive.length,92);
  assert(afterDrive[2]<0);assert(afterDrive[3]<0);
  const drivenTorque=Math.abs(plant.legs[0].activeJointTorque);
  plant.step({brain:jointInput(0,'femurTibiaFlex',0),dt:.01});
  assert(Math.abs(plant.legs[0].activeJointTorque)<drivenTorque,'muscle force should relax instead of disappearing instantaneously');
});

test('resolved BANC motor spikes are consumed once and retain absolute force evidence',()=>{
  const plant=new PlanarHexapodPlant(),counts=new Array(6*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length).fill(0);counts[2]=1;
  const frame={legs:[0,0,0,0,0,0],motorUnitSpikeCounts:counts,motorFrameId:1,motorFrameDurationMs:50};
  plant.step({brain:frame,dt:.01});
  const leg=plant.legs[0],delivered=leg.spikeForce.deliveredSpikes.fast;
  assert.equal(delivered,1);assert(leg.calibratedFlexorForceMicroNewtons>0);assert(leg.calibratedFlexorTorqueNewtonMeters>0);
  plant.step({brain:frame,dt:.01});
  assert.equal(leg.spikeForce.deliveredSpikes.fast,delivered,'the same neural frame must not replay its spike count');
  plant.step({brain:{...frame,motorFrameId:2},dt:.01});
  assert.equal(leg.spikeForce.deliveredSpikes.fast,2);
  assert.equal(leg.absoluteForceEvidence,'BANC-resolved slow/fast spike counts');
});
