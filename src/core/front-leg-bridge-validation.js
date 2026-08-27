import {
  createLoadedFrontLegState,forceFromSpikeCountMicroNewtons,probeTorqueBoundsNewtonMeters,
  simulateLoadedFrontLegBurst,stepLoadedFrontLeg,
} from './front-leg-biophysics.js';
import {FRONT_FEMUR_TIBIA_CALIBRATION,FRONT_LEG_SPIKE_FORCE_BRIDGE} from './leg-calibration.js';

const finite=value=>Number.isFinite(Number(value));
const round=(value,digits=12)=>finite(value)?Number(Number(value).toFixed(digits)):value;
const relativeError=(actual,expected)=>Math.abs(actual-expected)/Math.max(1e-18,Math.abs(expected));

export function validateFrontLegBridgeArtifact(artifact){
  if(!artifact||artifact.schema!==FRONT_LEG_SPIKE_FORCE_BRIDGE.schema)throw new Error('Unexpected front-leg spike-force bridge schema');
  if(!/^\d+\.\d+\.\d+$/.test(String(artifact.version||'')))throw new Error('Bridge artifact version must be semantic');
  if(!Array.isArray(artifact.sources)||artifact.sources.length!==4)throw new Error('Bridge artifact must retain four provenance sources');
  for(const source of artifact.sources){
    if(!source.id||!source.license)throw new Error('Bridge source lacks id or license');
    for(const [key,value] of Object.entries(source))if(/sha256$/i.test(key)&&!/^[a-f0-9]{64}$/.test(String(value)))throw new Error(`Invalid bridge source hash for ${source.id}`);
  }
  const probe=artifact.reportedMeasurements?.forceProbe,model=artifact.bridgeModel;
  for(const key of ['springNewtonsPerMeter','effectiveMassKilograms','dragKilogramsPerSecond','leverArmMeters'])if(!finite(probe?.[key])||probe[key]<=0)throw new Error(`Invalid force-probe ${key}`);
  if(!finite(model?.loadedJoint?.integrationStepSeconds)||model.loadedJoint.integrationStepSeconds<=0)throw new Error('Invalid loaded-joint integration step');
  if(!Array.isArray(artifact.qualification?.fitMetrics)||!Array.isArray(artifact.qualification?.heldOutMetrics))throw new Error('Bridge qualification contract is missing');
  const close=(actual,expected,label,tolerance=1e-12)=>{if(Math.abs(Number(actual)-Number(expected))>Math.max(1e-18,tolerance*Math.abs(Number(expected))))throw new Error(`Bridge artifact/runtime drift: ${label}`);};
  const frozen=FRONT_LEG_SPIKE_FORCE_BRIDGE;
  close(probe.springNewtonsPerMeter,frozen.forceProbe.springNewtonsPerMeter,'probe spring');
  close(probe.effectiveMassKilograms,frozen.forceProbe.effectiveMassKilograms,'probe mass');
  close(probe.dragKilogramsPerSecond,frozen.forceProbe.dragKilogramsPerSecond,'probe drag');
  close(probe.leverArmMeters,frozen.forceProbe.leverArmMeters,'probe lever arm');
  close(artifact.morphologyPrior.frontTibiaMassKilograms,frozen.morphology.tibiaMassKilograms,'tibia mass');
  close(artifact.morphologyPrior.frontTibiaLengthMeters,frozen.morphology.tibiaLengthMeters,'tibia length');
  close(artifact.morphologyPrior.slenderRodPivotInertiaKilogramMeterSquared,frozen.morphology.tibiaPivotInertiaKilogramMeterSquared,'tibia inertia');
  close(artifact.reportedMeasurements.oneSpikeForce.fastMicroNewtons,frozen.motorUnits.fast.oneSpikeMicroNewtons,'fast one-spike force');
  close(artifact.reportedMeasurements.oneSpikeForce.intermediateMicroNewtons,frozen.motorUnits.intermediate.oneSpikeMicroNewtons,'intermediate one-spike force');
  close(model.gcamp6fObservation.sampleRateHertz,frozen.gcamp6f.sampleRateHertz,'GCaMP sample rate');
  return {
    sourceCount:artifact.sources.length,
    fitMetricCount:artifact.qualification.fitMetrics.length,
    heldOutMetricCount:artifact.qualification.heldOutMetrics.length,
  };
}

function halfRiseMilliseconds(simulation){
  const peak=Math.max(...simulation.samples.map(sample=>sample.appliedForceMicroNewtons));
  return simulation.samples.find(sample=>sample.appliedForceMicroNewtons>=peak/2)?.timeSeconds*1000;
}

function reconstructionError(simulation){
  let maximum=0;
  for(const sample of simulation.samples){
    if(sample.appliedForceMicroNewtons<1e-6)continue;
    maximum=Math.max(maximum,relativeError(sample.reconstructedForceMicroNewtons,sample.appliedForceMicroNewtons));
  }
  return maximum;
}

function bridgeContinuationError(){
  const state=createLoadedFrontLegState();
  for(let i=0;i<180;i++)stepLoadedFrontLeg(state,{spikes:i===0?{fast:1}:null},.0001);
  const restored=structuredClone(state);
  for(let i=0;i<120;i++){stepLoadedFrontLeg(state,{},.0001);stepLoadedFrontLeg(restored,{},.0001);}
  const paths=[
    ['angleRad'],['angleVelocityRadPerSecond'],['appliedMuscleForceMicroNewtons'],['activeTorqueNewtonMeters'],
    ['feco','clawFlexion'],['feco','hookFlexion'],['feco','club'],['fluorescence','club'],
  ];
  return Math.max(...paths.map(path=>Math.abs(path.reduce((value,key)=>value[key],state)-path.reduce((value,key)=>value[key],restored))));
}

export function evaluateFrontLegBridge(artifact,{modelVersion=artifact.modelVersion}={}){
  const integrity=validateFrontLegBridgeArtifact(artifact);
  const fastOne=forceFromSpikeCountMicroNewtons('fast',1),fastTwo=forceFromSpikeCountMicroNewtons('fast',2);
  const intermediateOne=forceFromSpikeCountMicroNewtons('intermediate',1),intermediateTwo=forceFromSpikeCountMicroNewtons('intermediate',2);
  const fast=simulateLoadedFrontLegBurst('fast',1),intermediate=simulateLoadedFrontLegBurst('intermediate',1);
  const zero=simulateLoadedFrontLegBurst('fast',0,{durationSeconds:.08});
  const torqueBounds=probeTorqueBoundsNewtonMeters(fastOne),neutral=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.neutralAngleRad;
  const results=[
    {id:'slow-force-slope',role:'fit',predicted:forceFromSpikeCountMicroNewtons('slow',2)-forceFromSpikeCountMicroNewtons('slow',1),expected:.013,tolerance:1e-12},
    {id:'fast-two-over-one',role:'fit',predicted:fastTwo/fastOne,expected:1.6,tolerance:1e-12},
    {id:'intermediate-two-over-one',role:'fit',predicted:intermediateTwo/intermediateOne,expected:1.6,tolerance:1e-12},
    {id:'fast-intermediate-half-rise',role:'fit',predicted:(halfRiseMilliseconds(fast)+halfRiseMilliseconds(intermediate))/2,expected:8.5,tolerance:.15},
    {id:'force-reconstruction',role:'held-out',predicted:Math.max(reconstructionError(fast),reconstructionError(intermediate)),expected:0,tolerance:.01},
    {id:'zero-spike-causality',role:'held-out',predicted:Math.max(...zero.samples.map(sample=>Math.abs(sample.activeTorqueNewtonMeters))),expected:0,tolerance:0},
    {id:'lever-arm-sensitivity',role:'held-out',predicted:(torqueBounds.high-torqueBounds.low)/(2*torqueBounds.central),expected:FRONT_LEG_SPIKE_FORCE_BRIDGE.forceProbe.leverArmStandardDeviationMeters/FRONT_LEG_SPIKE_FORCE_BRIDGE.forceProbe.leverArmMeters,tolerance:1e-12},
    {id:'loaded-fe-co-closure',role:'held-out',predicted:{
      angleDecreaseDegrees:(neutral-Math.min(...fast.samples.map(sample=>sample.angleRad)))*180/Math.PI,
      hookFlexionPeak:Math.max(...fast.samples.map(sample=>sample.feco.hookFlexion)),
      clubPeak:Math.max(...fast.samples.map(sample=>sample.feco.club)),
    },pass:Math.min(...fast.samples.map(sample=>sample.angleRad))<neutral&&Math.max(...fast.samples.map(sample=>sample.feco.hookFlexion))>.1&&Math.max(...fast.samples.map(sample=>sample.feco.club))>.1},
    {id:'save-restore-continuation',role:'held-out',predicted:bridgeContinuationError(),expected:0,tolerance:0},
  ].map(result=>{
    const pass=typeof result.pass==='boolean'?result.pass:Math.abs(result.predicted-result.expected)<=result.tolerance;
    return {...result,status:pass?'pass':'fail',pass,predicted:typeof result.predicted==='number'?round(result.predicted):Object.fromEntries(Object.entries(result.predicted).map(([key,value])=>[key,round(value)]))};
  });
  const summary=group=>({total:group.length,pass:group.filter(item=>item.pass).length,fail:group.filter(item=>!item.pass).length});
  return {
    schema:'fly-umwelt-front-leg-spike-force-report-v1',artifactVersion:artifact.version,modelVersion,integrity,
    summary:{all:summary(results),fit:summary(results.filter(item=>item.role==='fit')),heldOut:summary(results.filter(item=>item.role==='held-out'))},
    results,
    claims:{
      supported:'Discrete experimental motor-unit spike counts now produce absolute probe-equivalent force, experiment-specific joint torque, loaded motion, body-derived FeCO state and provisional fluorescence.',
      unsupported:'Free-walking tendon geometry, absolute extensor force, other-leg transfer and preparation-specific GCaMP6f fluorescence remain unresolved.',
    },
  };
}
