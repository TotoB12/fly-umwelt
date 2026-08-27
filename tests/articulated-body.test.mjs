import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {LEG_IDS,LEG_MOTOR_ACTION_SPECS} from '../src/core/constants.js';
import {ARTICULATED_ROOM_COLLISION,createArticulatedRoomProfile,deriveArticulatedRoomXml} from '../src/core/mujoco-articulated-body.js';

const root=resolve(import.meta.dirname,'..');

test('articulated action bridge classifies all 72 channels without enabling inferred anatomy',async()=>{
  const bridge=JSON.parse(await readFile(resolve(root,'public/data/calibration/articulated-body-bridge-v1.json'),'utf8'));
  assert.equal(bridge.packet.channels,LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length);
  const classified=[
    ...bridge.mapped.map(item=>item.actionId),
    ...bridge.structurallyInferred.flatMap(item=>item.actionIds),
    ...bridge.unresolved.map(item=>item.actionId),
  ].sort();
  assert.deepEqual(classified,LEG_MOTOR_ACTION_SPECS.map(item=>item.id).sort());
  assert.deepEqual(bridge.mapped.map(item=>item.actionId).sort(),['femurTibiaExtend','femurTibiaFlex'].sort());
  assert.equal(bridge.mapped.find(item=>item.actionId==='femurTibiaFlex').coordinateSign,1);
  assert.equal(bridge.mapped.find(item=>item.actionId==='femurTibiaExtend').coordinateSign,-1);
  assert(bridge.structurallyInferred.every(item=>item.controlStatus==='disabled'));
  assert.deepEqual(bridge.unresolved.map(item=>item.actionId).sort(),['longTendonPull','unknownLegMovement'].sort());
  assert.match(bridge.claimBoundary,/no angle or torque gain/i);
  assert.match(bridge.torqueQualification.runtimeStatus,/qualification interface only/i);
  assert.equal(bridge.torqueQualification.flexorCoordinateSign,1);
  assert(bridge.torqueQualification.unsupported.some(item=>/moment arms/i.test(item)));
  assert.equal(bridge.roomQualification.runtimeStatus,'explicit qualification profile only; the articulated body remains outside the live neural locomotor loop');
  assert.deepEqual(bridge.roomQualification.blockingGeometry,['four chamber boundaries','wall rectangles','shelter rectangles']);
  assert.deepEqual(bridge.roomQualification.nonblockingKinds,['food','water','light','threat']);
  assert.equal(bridge.roomQualification.engineeringParameters.colliderHeightMm,ARTICULATED_ROOM_COLLISION.colliderHeightMm);
  assert.equal(bridge.roomQualification.engineeringParameters.contactBodyGeoms,ARTICULATED_ROOM_COLLISION.contactBodyGeoms);
  assert.deepEqual(bridge.roomQualification.engineeringParameters.pairFriction,ARTICULATED_ROOM_COLLISION.pairFriction);
  assert.deepEqual(bridge.roomQualification.engineeringParameters.solverReference,ARTICULATED_ROOM_COLLISION.solverReference);
  assert.deepEqual(bridge.roomQualification.engineeringParameters.solverImpedance,ARTICULATED_ROOM_COLLISION.solverImpedance);
  assert.equal(bridge.roomQualification.engineeringParameters.marginMm,ARTICULATED_ROOM_COLLISION.marginMm);
  assert.equal(bridge.adhesionQualification.enabled,false);
  assert.equal(bridge.adhesionQualification.viewerActuators,0);
  assert.match(bridge.adhesionQualification.reasonDisabled,/neither adds passive sticky feet nor imports gait-phase adhesion timing/i);
});

test('articulated wrapper exposes mechanics but contains no motor-packet gait bridge',async()=>{
  const source=await readFile(resolve(root,'src/core/mujoco-articulated-body.js'),'utf8');
  assert.match(source,/class MujocoArticulatedBody/);
  assert.match(source,/contactState\(\)/);
  assert.match(source,/proprioceptionState\(\)/);
  assert.match(source,/femurTibiaState\(\)/);
  assert.match(source,/afferentState\(\)/);
  assert.match(source,/afferentVector\(\)/);
  assert.match(source,/setAppliedJointTorques\(values\)/);
  assert.match(source,/setPositionActuatorsEnabled\(enabled=true\)/);
  assert.match(source,/perturbRootPosition\(translation=/);
  assert.match(source,/serialize\(\)/);
  assert.doesNotMatch(source,/sanitizeMotorPacket|phaseClock|tripod|targetHeading|randomTurn/i);
});

test('articulated room profile maps spawn and only blocking room geometry',async()=>{
  const room={
    width:120,height:80,spawn:{x:58,y:42,heading:-Math.PI/2},
    objects:[
      {id:'wall-\"/><joint name="injected"','kind':'wall',x:17,y:17,w:23,h:4},
      {id:'shelter-a',kind:'shelter',x:11,y:58,w:21,h:13},
      {id:'food-a',kind:'food',x:97,y:22,r:3.6},
      {id:'water-a',kind:'water',x:27,y:37,r:3.6},
      {id:'light-a',kind:'light',x:105,y:65,r:12},
      {id:'threat-a',kind:'threat',x:60,y:30,r:2},
    ],
  };
  const profile=createArticulatedRoomProfile(room,[.496,0,2.1]);
  assert.equal(profile.schema,'fly-umwelt-articulated-room-profile-v1');
  assert.deepEqual(profile.spawnTranslation,[-2,2,0]);
  assert(Math.abs(profile.rootPosition[0]+1.504)<1e-12);
  assert.deepEqual(profile.rootPosition.slice(1),[2,2.1]);
  assert(Math.abs(profile.rootQuaternion[0]-Math.SQRT1_2)<1e-12);
  assert(Math.abs(profile.rootQuaternion[3]+Math.SQRT1_2)<1e-12);
  assert.equal(profile.colliders.length,6);
  assert.deepEqual(profile.colliders.map(collider=>collider.kind),['boundary','boundary','boundary','boundary','wall','shelter']);
  assert.deepEqual(profile.ignoredObjectKinds,['food','water','light','threat']);
  assert.equal(ARTICULATED_ROOM_COLLISION.colliderHeightMm,5);
  assert.equal(ARTICULATED_ROOM_COLLISION.boundaryThicknessMm,1);
  assert.equal(ARTICULATED_ROOM_COLLISION.contactBodyGeoms,55);
  assert.deepEqual(ARTICULATED_ROOM_COLLISION.pairFriction,[1,1,.02,.0001,.0001]);
  assert.deepEqual(ARTICULATED_ROOM_COLLISION.solverReference,[.0002,1]);
  assert.deepEqual(ARTICULATED_ROOM_COLLISION.solverImpedance,[.98,.99,.00001,.5,3]);
  assert.equal(ARTICULATED_ROOM_COLLISION.marginMm,.001);

  const source=await readFile(resolve(root,'public/data/morphology/neuromechfly-v2.1.0/model/fly.xml'),'utf8');
  const derived=deriveArticulatedRoomXml(source,profile);
  assert.equal((derived.match(/name="room_(?:boundary|obstacle)_/g)||[]).length,6);
  assert.equal((derived.match(/name="local_contact_/g)||[]).length,6);
  assert.equal((derived.match(/name="room_pair_/g)||[]).length,6*ARTICULATED_ROOM_COLLISION.contactBodyGeoms);
  assert.equal((derived.match(/margin="0\.001" solref="0\.0002 1" solimp="0\.98 0\.99 0\.00001 0\.5 3" friction="1 1 0\.02 0\.0001 0\.0001"/g)||[]).length,6*ARTICULATED_ROOM_COLLISION.contactBodyGeoms);
  assert.equal((derived.match(/conaffinity="1"/g)||[]).length,0);
  assert.doesNotMatch(derived,/name="injected"/);
  assert.equal((source.match(/conaffinity="1"/g)||[]).length,0);
  assert.equal((source.match(/name="ground_contact_/g)||[]).length,6);
  assert.equal((source.match(/name="room_pair_/g)||[]).length,0);

  const nonblockingVariant=structuredClone(room);
  nonblockingVariant.objects.find(object=>object.kind==='food').x=3;
  nonblockingVariant.objects.push({id:'another-light',kind:'light',x:2,y:2,r:1});
  const changedWall=structuredClone(room);
  changedWall.objects.find(object=>object.kind==='wall').x+=1;
  const changedSpawn=structuredClone(room);
  changedSpawn.spawn.heading=0;
  assert.equal(createArticulatedRoomProfile(nonblockingVariant,[.496,0,2.1]).physicsProfileKey,profile.physicsProfileKey);
  assert.notEqual(createArticulatedRoomProfile(changedWall,[.496,0,2.1]).physicsProfileKey,profile.physicsProfileKey);
  assert.notEqual(createArticulatedRoomProfile(changedSpawn,[.496,0,2.1]).physicsProfileKey,profile.physicsProfileKey);
  assert.doesNotMatch(profile.physicsProfileKey,/food|water|light|threat|wall-\"|shelter-a/);
});

test('world worker keeps articulated MuJoCo loading explicit and qualification-only',async()=>{
  const source=await readFile(resolve(root,'src/workers/world.worker.js'),'utf8');
  assert.match(source,/msg\.type==='articulated-body-qualification'/);
  assert.match(source,/qualification-only; not selected as the live locomotor plant/);
  assert.doesNotMatch(source,/world\.vnc\s*=\s*articulatedBody|world\.plant\s*=\s*articulatedBody/);
});
