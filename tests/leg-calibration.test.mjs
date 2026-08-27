import test from 'node:test';
import assert from 'node:assert/strict';
import {createFecoState,stepFecoTransduction} from '../src/core/feco-transduction.js';
import {FRONT_FEMUR_TIBIA_CALIBRATION} from '../src/core/leg-calibration.js';
import {createFemurTibiaMuscleState,stepFemurTibiaMuscle} from '../src/core/muscle-unit-model.js';
import {PlanarHexapodPlant} from '../src/core/hexapod-plant.js';

const degrees=value=>value*Math.PI/180;

test('monotonic aggregate drive recruits slow, intermediate, then fast',()=>{
  const state=createFemurTibiaMuscleState(),seen={slow:null,intermediate:null,fast:null};
  for(let step=0;step<=100;step++){
    const drive=step/100;
    stepFemurTibiaMuscle(state,{flexorDrive:drive},.001);
    for(const key of Object.keys(seen))if(seen[key]===null&&state.commands[key]>.01)seen[key]=drive;
  }
  assert(seen.slow<seen.intermediate);assert(seen.intermediate<seen.fast);
  assert(seen.fast>=FRONT_FEMUR_TIBIA_CALIBRATION.recruitment.fastThreshold);
});

test('source fast unit is gated unless unresolved intermediate evidence is recruited',()=>{
  const state=createFemurTibiaMuscleState();
  stepFemurTibiaMuscle(state,{motorUnits:[0,0,1,0,0]},.005);
  assert.equal(state.commands.fast,0);
  stepFemurTibiaMuscle(state,{motorUnits:[0,.8,1,0,0]},.005);
  assert(state.commands.intermediate>.42);assert.equal(state.commands.fast,1);
});

test('fast activation reaches half response near the measured 8.5 ms',()=>{
  const state=createFemurTibiaMuscleState();
  // Prime the intermediate gate without accumulating fast activation.
  stepFemurTibiaMuscle(state,{motorUnits:[0,.8,0,0,0]},.001);
  let elapsed=0;
  while(state.activation.fast<.5&&elapsed<.05){stepFemurTibiaMuscle(state,{motorUnits:[0,.8,1,0,0]},.0001);elapsed+=.0001;}
  assert(Math.abs(elapsed-.0085)<.0004,`half response at ${(elapsed*1000).toFixed(2)} ms`);
});

test('zero neural evidence produces exactly zero active muscle force',()=>{
  const state=createFemurTibiaMuscleState();
  for(let i=0;i<100;i++)stepFemurTibiaMuscle(state,{},.01);
  assert.equal(state.flexorForce,0);assert.equal(state.extensorForce,0);assert.equal(state.netForce,0);
});

test('claw is position-polarized and hook distinguishes movement direction',()=>{
  const flexed=createFecoState(degrees(90)),extended=createFecoState(degrees(90));
  for(let i=0;i<80;i++){
    stepFecoTransduction(flexed,{angle:degrees(35),velocity:0},.01);
    stepFecoTransduction(extended,{angle:degrees(145),velocity:0},.01);
  }
  assert(flexed.clawFlexion>.6&&flexed.clawExtension<.05);
  assert(extended.clawExtension>.5&&extended.clawFlexion<.05);
  const moving=createFecoState(degrees(90));
  stepFecoTransduction(moving,{angle:degrees(88),velocity:degrees(-200)},.01);
  assert(moving.hookFlexion>moving.hookExtension);
  for(let i=0;i<20;i++)stepFecoTransduction(moving,{angle:degrees(92),velocity:degrees(200)},.01);
  assert(moving.hookExtension>moving.hookFlexion);
});

test('club is bidirectional and decays during a stationary hold',()=>{
  const state=createFecoState(degrees(90));
  for(let i=0;i<10;i++)stepFecoTransduction(state,{angle:degrees(90+i*4),velocity:degrees(400)},.01);
  const extensionPeak=state.club;
  for(let i=0;i<30;i++)stepFecoTransduction(state,{angle:degrees(130-i*3),velocity:degrees(-400)},.01);
  const flexionPeak=state.club;
  assert(extensionPeak>.25&&flexionPeak>.25);
  for(let i=0;i<120;i++)stepFecoTransduction(state,{angle:degrees(40),velocity:0},.01);
  assert(state.club<.01);
});

test('plant save/restore preserves muscle and FeCO filter continuation',()=>{
  const a=new PlanarHexapodPlant();
  for(let i=0;i<30;i++)a.step({brain:{actuators:Array(72).fill(.35)},touch:[.2,0,0,0,0,0],dt:.01});
  const saved=a.serialize(),b=new PlanarHexapodPlant();b.restore(saved);
  const input={brain:{actuators:Array(72).fill(.2)},touch:[0,0,0,0,0,0],dt:.01};
  a.step(input);b.step(input);
  assert.deepEqual(b.serialize(),a.serialize());
});

