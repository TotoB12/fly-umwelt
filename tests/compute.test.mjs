import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCalibratedResolution,computeSelection,createCalibrationSensoryPacket,normalizeNeuralResolution,resolveGraphTierPreference,resolveNeuralResolution} from '../src/core/compute-profile.js';
import {normalizeComputeBackend} from '../src/core/neural-kernels.js';
import {FEMUR_TIBIA_PROPRIOCEPTION_LENGTH} from '../src/core/leg-calibration.js';

test('compute preferences normalize unknown URL values safely',()=>{
  assert.equal(normalizeComputeBackend('gpu-maybe'),'auto');
  assert.equal(normalizeNeuralResolution('ultra'),'auto');
  assert.equal(computeSelection({backend:'wasm',resolution:'research'}).resolution.dtMs,.5);
});

test('automatic temporal profiles protect constrained devices and exploit small fixtures',()=>{
  assert.equal(resolveNeuralResolution('auto',{neuronCount:158262},{hardwareConcurrency:2,deviceMemory:4}).resolved,'economy');
  assert.equal(resolveNeuralResolution('auto',{neuronCount:158262},{hardwareConcurrency:16,deviceMemory:16}).resolved,'fine');
  assert.equal(resolveNeuralResolution('auto',{neuronCount:158262},{hardwareConcurrency:16,deviceMemory:0}).resolved,'balanced');
  assert.equal(resolveNeuralResolution('auto',{testOnly:true,neuronCount:48},{hardwareConcurrency:2,deviceMemory:2}).resolved,'research');
  assert.equal(resolveNeuralResolution('balanced',{},{}).dtMs,2);
});



test('automatic structural tiers never select Maximal and protect constrained devices',()=>{
  const manifest={defaultGraphTier:'balanced',graph:{tiers:{core:{},balanced:{},maximal:{}}}};
  assert.equal(resolveGraphTierPreference('auto',manifest,{hardwareConcurrency:2,deviceMemory:4}),'core');
  assert.equal(resolveGraphTierPreference('auto',manifest,{hardwareConcurrency:12,deviceMemory:0}),'core');
  assert.equal(resolveGraphTierPreference('auto',manifest,{hardwareConcurrency:12,deviceMemory:16}),'balanced');
  assert.equal(resolveGraphTierPreference('maximal',manifest,{hardwareConcurrency:2,deviceMemory:2}),'maximal');
  assert.equal(resolveGraphTierPreference('unknown',manifest,{hardwareConcurrency:8,deviceMemory:8}),'balanced');
});

test('measured calibration selects the finest profile with real-time headroom',()=>{
  const selected=chooseCalibratedResolution([
    {id:'research',load:1.4},{id:'fine',load:.91},{id:'balanced',load:.72},{id:'economy',load:.43},
  ],.78);
  assert.equal(selected.resolved,'balanced');
  assert.equal(selected.dtMs,2);
  const constrained=chooseCalibratedResolution([{id:'balanced',load:1.5},{id:'economy',load:1.1}],.78);
  assert.equal(constrained.resolved,'economy');
});


test('calibration uses a bounded, representative embodied sensory packet',()=>{
  const packet=createCalibrationSensoryPacket(64);
  assert.equal(packet.retinaBrightness.length,64);
  assert.equal(packet.retinaMotion.length,64);
  assert.equal(packet.touch.length,6);
  assert.equal(packet.metabolic.length,5);
  assert.equal(packet.proprioception.length,FEMUR_TIBIA_PROPRIOCEPTION_LENGTH);
  assert(packet.retinaBrightness.some((value)=>value>0));
  assert(packet.odorRight[0]>packet.odorLeft[0]);
  for(const values of [packet.retinaBrightness,packet.retinaMotion,packet.retinaLoom,packet.retinaProximity,packet.odorLeft,packet.odorRight,packet.touch,packet.taste,packet.airflow,packet.proprioception,packet.metabolic,packet.memoryCue]){
    for(const value of values)assert(Number.isFinite(value)&&value>=-1&&value<=1);
  }
});
