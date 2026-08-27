import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSensoryPacket,createSensoryPacket,sanitizeMotorPacket,WORLD_TO_BRAIN_FIELDS} from '../src/core/protocol.js';
import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_MOTOR_ACTION_SPECS} from '../src/core/constants.js';
import {FEMUR_TIBIA_PROPRIOCEPTION_LENGTH} from '../src/core/leg-calibration.js';

test('strict sensory API contains no world-coordinate or target fields',()=>{for(const forbidden of ['x','y','position','heading','objects','target','desiredHeading','nearest','bearing'])assert.equal(WORLD_TO_BRAIN_FIELDS.includes(forbidden),false);});
test('epistemic boundary rejects privileged state',()=>{assert.throws(()=>assertSensoryPacket({retinaBrightness:[],foodPosition:[1,2]}),/violation/);assert.throws(()=>assertSensoryPacket({objects:[]}),/violation/);});
test('sensory and neural evidence packets are bounded and explicit',()=>{
  const p=createSensoryPacket({retinaBrightness:[0],retinaMotion:[0],retinaLoom:[0],retinaProximity:[0],odorLeft:[0,0,0],odorRight:[0,0,0],touch:[0],taste:[0],airflow:[0],temperature:.5,proprioception:new Array(FEMUR_TIBIA_PROPRIOCEPTION_LENGTH).fill(0),metabolic:[0],memoryCue:[0],ambientNoise:0,dtMs:50});
  assert.equal(p.temperature,.5);assert.equal(p.proprioception.length,FEMUR_TIBIA_PROPRIOCEPTION_LENGTH);
  const m=sanitizeMotorPacket({locomotorDrive:9,coordinationDrive:-1,legs:[2,-1,.5,NaN,.2,7],actuators:[2,-1,.5],motorUnits:[2,-1,.5,NaN,.2,7],motorUnitSpikeCounts:[1.2,-1,70000],motorFrameId:4.8,motorFrameDurationMs:50,dna02Left:3,dna02Right:-2,reverse:-1,feed:2,drink:NaN,escape:0,turnEvidence:-7,conflict:4});
  assert.equal(m.locomotorDrive,1);assert.equal(m.coordinationDrive,0);assert.deepEqual(m.legs,[1,0,.5,0,.2,1]);
  assert.equal(m.dna02Left,1);assert.equal(m.dna02Right,0);assert.equal(m.reverse,0);assert.equal(m.feed,1);assert.equal(m.drink,0);assert.equal(m.turnEvidence,-1);assert.equal(m.conflict,1);
  assert.equal(m.actuators.length,6*LEG_MOTOR_ACTION_SPECS.length);assert.deepEqual(m.actuators.slice(0,3),[1,0,.5]);
  assert.equal(m.motorUnits.length,6*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);assert.deepEqual(m.motorUnits.slice(0,6),[1,0,.5,0,.2,1]);
  assert.equal(m.motorUnitSpikeCounts.length,6*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);assert.deepEqual(m.motorUnitSpikeCounts.slice(0,3),[1,0,65535]);
  assert.equal(m.motorFrameId,4);assert.equal(m.motorFrameDurationMs,50);
});
