import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  createGcamp6fObservationState,createLoadedFrontLegState,forceFromSpikeCountMicroNewtons,
  probeForceToJointTorqueNewtonMeters,probeTorqueBoundsNewtonMeters,sampleGcamp6fTrace,simulateLoadedFrontLegBurst,
  stepGcamp6fObservation,stepLoadedFrontLeg,
} from '../src/core/front-leg-biophysics.js';
import {evaluateFrontLegBridge,validateFrontLegBridgeArtifact} from '../src/core/front-leg-bridge-validation.js';
import {FRONT_FEMUR_TIBIA_CALIBRATION,FRONT_LEG_SPIKE_FORCE_BRIDGE} from '../src/core/leg-calibration.js';

const artifact=JSON.parse(await readFile(new URL('../public/data/calibration/front-leg-spike-force-bridge-v1.json',import.meta.url),'utf8'));

test('spike-force bridge artifact retains evidence, licensing and falsifiable gates',()=>{
  assert.deepEqual(validateFrontLegBridgeArtifact(artifact),{sourceCount:4,fitMetricCount:4,heldOutMetricCount:5});
  assert.equal(artifact.sources.find(source=>source.id==='flygym-2.1.0-morphology').commit.length,40);
  assert.match(artifact.knownLimitations.join(' '),/No tendon moment arm/i);
});

test('discrete motor-unit counts reproduce absolute scale and two-spike summation',()=>{
  assert.equal(forceFromSpikeCountMicroNewtons('slow',10),.13);
  assert(Math.abs(forceFromSpikeCountMicroNewtons('fast',2)/forceFromSpikeCountMicroNewtons('fast',1)-1.6)<1e-12);
  assert(Math.abs(forceFromSpikeCountMicroNewtons('intermediate',2)/forceFromSpikeCountMicroNewtons('intermediate',1)-1.6)<1e-12);
  assert(forceFromSpikeCountMicroNewtons('slow',1)<forceFromSpikeCountMicroNewtons('intermediate',1));
  assert(forceFromSpikeCountMicroNewtons('intermediate',1)<forceFromSpikeCountMicroNewtons('fast',1));
});

test('measured external lever arm creates explicit torque and uncertainty bounds',()=>{
  const central=probeForceToJointTorqueNewtonMeters(7.0382),bounds=probeTorqueBoundsNewtonMeters(7.0382);
  assert(Math.abs(central-2.9349294e-9)<1e-18);
  assert(bounds.low<bounds.central&&bounds.central<bounds.high);
  assert(Math.abs((bounds.high-bounds.low)/(2*bounds.central)-FRONT_LEG_SPIKE_FORCE_BRIDGE.forceProbe.leverArmStandardDeviationMeters/FRONT_LEG_SPIKE_FORCE_BRIDGE.forceProbe.leverArmMeters)<1e-15);
});

test('loaded force-probe motion reconstructs applied force and closes FeCO causally',()=>{
  const simulation=simulateLoadedFrontLegBurst('fast',1),neutral=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.neutralAngleRad;
  const active=simulation.samples.filter(sample=>sample.appliedForceMicroNewtons>.01);
  assert(Math.max(...active.map(sample=>Math.abs(sample.reconstructedForceMicroNewtons-sample.appliedForceMicroNewtons)/sample.appliedForceMicroNewtons))<1e-12);
  assert(Math.min(...simulation.samples.map(sample=>sample.angleRad))<neutral);
  assert(Math.max(...simulation.samples.map(sample=>sample.feco.hookFlexion))>.1);
  assert(Math.max(...simulation.samples.map(sample=>sample.feco.club))>.1);
});

test('zero spikes produce no active force, torque or motion',()=>{
  const simulation=simulateLoadedFrontLegBurst('fast',0,{durationSeconds:.1});
  assert(simulation.samples.every(sample=>sample.appliedForceMicroNewtons===0&&sample.activeTorqueNewtonMeters===0));
  assert(simulation.samples.every(sample=>sample.angleRad===FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.neutralAngleRad));
});

test('provisional GCaMP6f layer is causal, saturating and direction-neutral',()=>{
  const a=createGcamp6fObservationState(),b=createGcamp6fObservationState();
  for(let i=0;i<1000;i++){
    stepGcamp6fObservation(a,1,.001);stepGcamp6fObservation(b,1,.001);
  }
  assert.deepEqual(a,b);
  assert(a.deltaFOverF>0&&a.deltaFOverF<1);
  const before=a.deltaFOverF;
  for(let i=0;i<1000;i++)stepGcamp6fObservation(a,0,.001);
  assert(a.deltaFOverF<before*.02);
  const trace=Array.from({length:1001},(_,index)=>({timeSeconds:index*.001,fluorescence:{club:index/1000}}));
  const sampled=sampleGcamp6fTrace(trace);
  assert.equal(sampled.length,9);
  for(let i=1;i<sampled.length;i++)assert(Math.abs((sampled[i].requestedSampleTimeSeconds-sampled[i-1].requestedSampleTimeSeconds)-1/8.01)<1e-12);
});

test('loaded bridge state continues exactly after serialization',()=>{
  const a=createLoadedFrontLegState();
  for(let i=0;i<160;i++)stepLoadedFrontLeg(a,{spikes:i===0?{intermediate:2}:null},.0001);
  const b=structuredClone(a);
  for(let i=0;i<250;i++){stepLoadedFrontLeg(a,{},.0001);stepLoadedFrontLeg(b,{},.0001);}
  assert.deepEqual(b,a);
});

test('bridge qualification retains fit/held-out distinction and passes its causal gates',()=>{
  const report=evaluateFrontLegBridge(artifact,{modelVersion:'3.6.0'});
  assert.deepEqual(report.summary,{all:{total:9,pass:9,fail:0},fit:{total:4,pass:4,fail:0},heldOut:{total:5,pass:5,fail:0}});
  assert.match(report.claims.unsupported,/Free-walking tendon geometry/);
});
