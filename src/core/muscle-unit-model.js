import {FEMUR_TIBIA_MOTOR_UNIT_SPECS} from './constants.js';
import {FRONT_FEMUR_TIBIA_CALIBRATION} from './leg-calibration.js';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const approach=(current,target,tau,dt)=>current+(target-current)*(1-Math.exp(-Math.max(0,dt)/Math.max(1e-6,tau)));
const ramp=(value,threshold,width)=>clamp01((clamp01(value)-threshold)/Math.max(1e-6,width));
const unitIndex=id=>FEMUR_TIBIA_MOTOR_UNIT_SPECS.findIndex(unit=>unit.id===id);

export function createFemurTibiaMuscleState(){
  return {
    commands:{slow:0,intermediate:0,fast:0,extensorSlow:0,extensorFast:0},
    activation:{slow:0,intermediate:0,fast:0,extensorSlow:0,extensorFast:0},
    fatigue:{intermediate:0,fast:0,extensorFast:0},
    intermediateGateSeconds:0,
    flexorForce:0,extensorForce:0,netForce:0,
    evidenceMode:'action-fallback',
  };
}

/**
 * Convert BANC unit activity into delayed active muscle force. The measured
 * force-per-spike ratios constrain relative gains, while normalized thresholds
 * are explicitly engineering parameters. No neural evidence means no active
 * force; resting posture comes from passive joint mechanics, not hidden tone.
 */
export function stepFemurTibiaMuscle(state,input={},dt=.01){
  const calibration=FRONT_FEMUR_TIBIA_CALIBRATION;
  const recruitment=calibration.recruitment,parameters=calibration.motorUnits;
  const flexorDrive=clamp01(input.flexorDrive),extensorDrive=clamp01(input.extensorDrive);
  const units=Array.from(input.motorUnits||[],clamp01);
  const explicit=units.length===FEMUR_TIBIA_MOTOR_UNIT_SPECS.length&&units.some(value=>value>1e-8);
  let slow,intermediate,fastCandidate,extensorSlow,extensorFast;
  if(explicit){
    const unresolved=units[unitIndex('flexorUnresolved')];
    slow=Math.max(units[unitIndex('flexorSlow')],ramp(unresolved,recruitment.slowThreshold,recruitment.thresholdRampWidth));
    intermediate=ramp(unresolved,recruitment.intermediateThreshold,recruitment.thresholdRampWidth);
    fastCandidate=units[unitIndex('flexorFast')];
    extensorSlow=units[unitIndex('extensorSlow')];
    extensorFast=units[unitIndex('extensorFast')];
    state.evidenceMode='source-unit';
  }else{
    slow=ramp(flexorDrive,recruitment.slowThreshold,recruitment.thresholdRampWidth);
    intermediate=ramp(flexorDrive,recruitment.intermediateThreshold,recruitment.thresholdRampWidth);
    fastCandidate=ramp(flexorDrive,recruitment.fastThreshold,recruitment.thresholdRampWidth);
    extensorSlow=ramp(extensorDrive,recruitment.slowThreshold,recruitment.thresholdRampWidth);
    extensorFast=ramp(extensorDrive,recruitment.fastThreshold,recruitment.thresholdRampWidth);
    state.evidenceMode='action-fallback';
  }

  state.intermediateGateSeconds=Math.max(0,state.intermediateGateSeconds-dt);
  if(intermediate>=recruitment.fastRequiresIntermediate)state.intermediateGateSeconds=recruitment.gateMemorySeconds;
  const fast=state.intermediateGateSeconds>0?fastCandidate:0;
  Object.assign(state.commands,{slow,intermediate,fast,extensorSlow,extensorFast});

  const updateActivation=(key,target,spec)=>{
    const tau=target>state.activation[key]?spec.riseTauSeconds:spec.fallTauSeconds;
    state.activation[key]=approach(state.activation[key],target,tau,dt);
  };
  updateActivation('slow',slow,parameters.flexorSlow);
  updateActivation('intermediate',intermediate,parameters.flexorIntermediate);
  updateActivation('fast',fast,parameters.flexorFast);
  updateActivation('extensorSlow',extensorSlow,parameters.extensorSlow);
  updateActivation('extensorFast',extensorFast,parameters.extensorFast);

  for(const key of ['intermediate','fast','extensorFast']){
    const target=state.activation[key];
    const tau=target>state.fatigue[key]?parameters.fatigueTauSeconds:parameters.recoveryTauSeconds;
    state.fatigue[key]=approach(state.fatigue[key],target,tau,dt);
  }
  const force=(key,spec)=>state.activation[key]*spec.forceGain*(1-spec.fatigueGain*(state.fatigue[key]||0));
  state.flexorForce=force('slow',parameters.flexorSlow)+force('intermediate',parameters.flexorIntermediate)+force('fast',parameters.flexorFast);
  state.extensorForce=force('extensorSlow',parameters.extensorSlow)+force('extensorFast',parameters.extensorFast);
  state.netForce=state.extensorForce-state.flexorForce;
  return state;
}

