import {createFecoState,stepFecoTransduction} from './feco-transduction.js';
import {FRONT_FEMUR_TIBIA_CALIBRATION,FRONT_LEG_SPIKE_FORCE_BRIDGE} from './leg-calibration.js';

const EPSILON=1e-12;
const clamp=(value,minimum,maximum)=>Math.max(minimum,Math.min(maximum,Number(value)||0));
const finiteNonnegative=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const approach=(current,target,tau,dt)=>current+(target-current)*(1-Math.exp(-Math.max(0,dt)/Math.max(EPSILON,tau)));

function unitSpec(unit){
  const spec=FRONT_LEG_SPIKE_FORCE_BRIDGE.motorUnits[unit];
  if(!spec)throw new Error(`Unknown front-leg motor unit: ${unit}`);
  return spec;
}

/** Peak probe-equivalent force for a discrete additional-spike count. */
export function forceFromSpikeCountMicroNewtons(unit,spikeCount){
  const count=finiteNonnegative(spikeCount),spec=unitSpec(unit);
  if(spec.countCurve==='linear')return spec.oneSpikeMicroNewtons*count;
  const q=FRONT_LEG_SPIKE_FORCE_BRIDGE.motorUnits.summationRetention;
  return spec.oneSpikeMicroNewtons*(1-q**count)/(1-q);
}

/** Joint torque implied by a force measured at the external probe lever arm. */
export function probeForceToJointTorqueNewtonMeters(forceMicroNewtons,leverArmMeters=FRONT_LEG_SPIKE_FORCE_BRIDGE.forceProbe.leverArmMeters){
  return finiteNonnegative(forceMicroNewtons)*1e-6*finiteNonnegative(leverArmMeters);
}

export function probeTorqueBoundsNewtonMeters(forceMicroNewtons){
  const probe=FRONT_LEG_SPIKE_FORCE_BRIDGE.forceProbe;
  return Object.freeze({
    low:probeForceToJointTorqueNewtonMeters(forceMicroNewtons,probe.leverArmMeters-probe.leverArmStandardDeviationMeters),
    central:probeForceToJointTorqueNewtonMeters(forceMicroNewtons,probe.leverArmMeters),
    high:probeForceToJointTorqueNewtonMeters(forceMicroNewtons,probe.leverArmMeters+probe.leverArmStandardDeviationMeters),
  });
}

function normalizedTwitch(age,spec){
  if(age<0)return 0;
  if(age<=spec.peakSeconds){
    const numerator=1-Math.exp(-age/spec.riseTauSeconds);
    const denominator=1-Math.exp(-spec.peakSeconds/spec.riseTauSeconds);
    return numerator/Math.max(EPSILON,denominator);
  }
  return Math.exp(-(age-spec.peakSeconds)/spec.fallTauSeconds);
}

export function createSpikeForceState(){
  return {
    timeSeconds:0,
    bursts:[],
    forceByUnitMicroNewtons:{slow:0,intermediate:0,fast:0},
    totalFlexorForceMicroNewtons:0,
    totalFlexorTorqueNewtonMeters:0,
    deliveredSpikes:{slow:0,intermediate:0,fast:0},
  };
}

export function triggerMotorUnitBurst(state,unit,spikeCount){
  const count=finiteNonnegative(spikeCount);
  if(count<=0)return state;
  const peakForceMicroNewtons=forceFromSpikeCountMicroNewtons(unit,count);
  state.bursts.push({unit,spikeCount:count,ageSeconds:0,peakForceMicroNewtons});
  state.deliveredSpikes[unit]=(state.deliveredSpikes[unit]||0)+count;
  return state;
}

export function stepSpikeForceState(state,dt=FRONT_LEG_SPIKE_FORCE_BRIDGE.integrationStepSeconds){
  const step=Math.max(0,Number(dt)||0),byUnit={slow:0,intermediate:0,fast:0},active=[];
  for(const burst of state.bursts){
    burst.ageSeconds+=step;
    const spec=unitSpec(burst.unit),shape=normalizedTwitch(burst.ageSeconds,spec);
    byUnit[burst.unit]+=burst.peakForceMicroNewtons*shape;
    if(burst.ageSeconds<spec.peakSeconds+spec.fallTauSeconds*12)active.push(burst);
  }
  state.bursts=active;
  state.timeSeconds+=step;
  state.forceByUnitMicroNewtons=byUnit;
  state.totalFlexorForceMicroNewtons=byUnit.slow+byUnit.intermediate+byUnit.fast;
  state.totalFlexorTorqueNewtonMeters=probeForceToJointTorqueNewtonMeters(state.totalFlexorForceMicroNewtons);
  return state;
}

export function createGcamp6fObservationState(){return {filteredDrive:0,deltaFOverF:0,timeSeconds:0};}

/**
 * Provisional GCaMP6f observation layer. It supplies indicator kinetics and
 * saturation but deliberately does not add genetic-driver mixing, noise or an
 * arbitrary direction bias.
 */
export function stepGcamp6fObservation(state,drive,dt){
  const config=FRONT_LEG_SPIKE_FORCE_BRIDGE.gcamp6f,target=finiteNonnegative(drive);
  const tau=target>state.filteredDrive?config.riseTauSeconds:config.fallTauSeconds;
  state.filteredDrive=approach(state.filteredDrive,target,tau,dt);
  state.deltaFOverF=state.filteredDrive/(config.saturationDrive+state.filteredDrive);
  state.timeSeconds+=Math.max(0,Number(dt)||0);
  return state.deltaFOverF;
}

/** Sample a high-rate fluorescence trace at the experiment's imaging cadence. */
export function sampleGcamp6fTrace(samples,sampleRateHertz=FRONT_LEG_SPIKE_FORCE_BRIDGE.gcamp6f.sampleRateHertz){
  if(!Array.isArray(samples)||!samples.length)return [];
  const period=1/Math.max(EPSILON,Number(sampleRateHertz)||0),duration=samples.at(-1).timeSeconds,output=[];
  let cursor=0;
  for(let time=0;time<=duration+EPSILON;time+=period){
    while(cursor+1<samples.length&&Math.abs(samples[cursor+1].timeSeconds-time)<Math.abs(samples[cursor].timeSeconds-time))cursor++;
    output.push({...samples[cursor],requestedSampleTimeSeconds:time});
  }
  return output;
}

export function createLoadedFrontLegState(initialAngleRad=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.neutralAngleRad){
  const neutral=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.neutralAngleRad;
  return {
    schema:'fly-umwelt-loaded-front-leg-state-v1',
    timeSeconds:0,
    deflectionRad:neutral-clamp(initialAngleRad,FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.minimumAngleRad,FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.maximumAngleRad),
    angularVelocityRadPerSecond:0,
    angularAccelerationRadPerSecond2:0,
    angleRad:initialAngleRad,
    angleVelocityRadPerSecond:0,
    probeDisplacementMeters:0,
    probeVelocityMetersPerSecond:0,
    appliedMuscleForceMicroNewtons:0,
    reconstructedSystemForceMicroNewtons:0,
    reconstructedProbeForceMicroNewtons:0,
    activeTorqueNewtonMeters:0,
    springTorqueNewtonMeters:0,
    dampingTorqueNewtonMeters:0,
    spikeForce:createSpikeForceState(),
    feco:createFecoState(initialAngleRad),
    gcamp:{
      clawFlexion:createGcamp6fObservationState(),clawExtension:createGcamp6fObservationState(),
      hookFlexion:createGcamp6fObservationState(),hookExtension:createGcamp6fObservationState(),club:createGcamp6fObservationState(),
    },
    fluorescence:{clawFlexion:0,clawExtension:0,hookFlexion:0,hookExtension:0,club:0},
  };
}

export function loadedFrontLegPhysicalConstants(){
  const {forceProbe:probe,morphology}=FRONT_LEG_SPIKE_FORCE_BRIDGE,r=probe.leverArmMeters;
  const probeRotationalInertia=probe.effectiveMassKilograms*r*r;
  return Object.freeze({
    leverArmMeters:r,
    probeRotationalInertiaKilogramMeterSquared:probeRotationalInertia,
    tibiaRotationalInertiaKilogramMeterSquared:morphology.tibiaPivotInertiaKilogramMeterSquared,
    totalRotationalInertiaKilogramMeterSquared:probeRotationalInertia+morphology.tibiaPivotInertiaKilogramMeterSquared,
    rotationalStiffnessNewtonMeterPerRadian:probe.springNewtonsPerMeter*r*r,
    rotationalDampingNewtonMeterSecondPerRadian:probe.dragKilogramsPerSecond*r*r,
  });
}

/** Advance the measured probe load and the body-derived FeCO/fluorescence path. */
export function stepLoadedFrontLeg(state,{spikes=null,externalTorqueNewtonMeters=0}={},dt=FRONT_LEG_SPIKE_FORCE_BRIDGE.integrationStepSeconds){
  const step=Math.max(EPSILON,Number(dt)||FRONT_LEG_SPIKE_FORCE_BRIDGE.integrationStepSeconds);
  if(spikes)for(const unit of ['slow','intermediate','fast'])triggerMotorUnitBurst(state.spikeForce,unit,spikes[unit]);
  stepSpikeForceState(state.spikeForce,step);
  const physical=loadedFrontLegPhysicalConstants(),q=state.deflectionRad,velocity=state.angularVelocityRadPerSecond;
  const activeTorque=state.spikeForce.totalFlexorTorqueNewtonMeters+Number(externalTorqueNewtonMeters||0);
  const springTorque=-physical.rotationalStiffnessNewtonMeterPerRadian*q;
  const dampingTorque=-physical.rotationalDampingNewtonMeterSecondPerRadian*velocity;
  const acceleration=(activeTorque+springTorque+dampingTorque)/physical.totalRotationalInertiaKilogramMeterSquared;
  const nextVelocity=velocity+acceleration*step;
  let nextDeflection=q+nextVelocity*step;
  const coordinate=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate;
  const maximumFlexion=coordinate.neutralAngleRad-coordinate.minimumAngleRad;
  const maximumExtension=coordinate.neutralAngleRad-coordinate.maximumAngleRad;
  nextDeflection=clamp(nextDeflection,maximumExtension,maximumFlexion);
  state.angularVelocityRadPerSecond=nextDeflection===q+nextVelocity*step?nextVelocity:0;
  state.angularAccelerationRadPerSecond2=acceleration;
  state.deflectionRad=nextDeflection;
  state.angleRad=coordinate.neutralAngleRad-nextDeflection;
  state.angleVelocityRadPerSecond=-state.angularVelocityRadPerSecond;
  state.probeDisplacementMeters=nextDeflection*physical.leverArmMeters;
  state.probeVelocityMetersPerSecond=state.angularVelocityRadPerSecond*physical.leverArmMeters;
  state.appliedMuscleForceMicroNewtons=state.spikeForce.totalFlexorForceMicroNewtons;
  state.activeTorqueNewtonMeters=activeTorque;
  state.springTorqueNewtonMeters=springTorque;
  state.dampingTorqueNewtonMeters=dampingTorque;
  // Reconstruct at the same pre-integration state used by the equation of
  // motion. Mixing q(t + dt) with acceleration at t creates a first-order
  // numerical observation error even when the dynamics themselves are sound.
  const common=physical.rotationalStiffnessNewtonMeterPerRadian*q+
    physical.rotationalDampingNewtonMeterSecondPerRadian*velocity;
  state.reconstructedProbeForceMicroNewtons=(common+physical.probeRotationalInertiaKilogramMeterSquared*acceleration)/physical.leverArmMeters*1e6;
  state.reconstructedSystemForceMicroNewtons=(common+physical.totalRotationalInertiaKilogramMeterSquared*acceleration)/physical.leverArmMeters*1e6;
  stepFecoTransduction(state.feco,{angle:state.angleRad,velocity:state.angleVelocityRadPerSecond,contact:0},step);
  for(const channel of Object.keys(state.fluorescence)){
    state.fluorescence[channel]=stepGcamp6fObservation(state.gcamp[channel],state.feco[channel],step);
  }
  state.timeSeconds+=step;
  return state;
}

export function simulateLoadedFrontLegBurst(unit,spikeCount,{durationSeconds=.25,dt=FRONT_LEG_SPIKE_FORCE_BRIDGE.integrationStepSeconds}={}){
  const state=createLoadedFrontLegState(),samples=[];
  let first=true;
  for(let time=0;time<durationSeconds-EPSILON;time+=dt){
    stepLoadedFrontLeg(state,{spikes:first?{[unit]:spikeCount}:null},dt);first=false;
    samples.push({
      timeSeconds:state.timeSeconds,angleRad:state.angleRad,angleVelocityRadPerSecond:state.angleVelocityRadPerSecond,
      appliedForceMicroNewtons:state.appliedMuscleForceMicroNewtons,reconstructedForceMicroNewtons:state.reconstructedSystemForceMicroNewtons,
      activeTorqueNewtonMeters:state.activeTorqueNewtonMeters,
      feco:{clawFlexion:state.feco.clawFlexion,clawExtension:state.feco.clawExtension,hookFlexion:state.feco.hookFlexion,hookExtension:state.feco.hookExtension,club:state.feco.club},
      fluorescence:{...state.fluorescence},
    });
  }
  return {unit,spikeCount,dt,durationSeconds,state,samples,imagingSamples:sampleGcamp6fTrace(samples)};
}
