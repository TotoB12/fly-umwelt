import {FRONT_FEMUR_TIBIA_CALIBRATION} from './leg-calibration.js';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const approach=(current,target,tau,dt)=>current+(target-current)*(1-Math.exp(-Math.max(0,dt)/Math.max(1e-6,tau)));

export function createFecoState(angle=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate.neutralAngleRad){
  return {
    lastAngle:Number(angle),lastVelocity:0,lastContact:0,
    lastMotionDirection:0,
    clawFlexion:0,clawExtension:0,hookFlexion:0,hookExtension:0,club:0,
    clubAdaptation:0,impactEnvelope:0,
  };
}

/**
 * Stateful, subtype-resolved FeCO boundary model. Claw is tonic position,
 * hook is signed phasic movement, and club is bidirectional/dynamic. The
 * browser's 100 Hz body loop cannot reproduce the measured 100–2000 Hz club
 * carrier, so contact transients contribute only a disclosed impact envelope.
 */
export function stepFecoTransduction(state,input={},dt=.01){
  const calibration=FRONT_FEMUR_TIBIA_CALIBRATION;
  const p=calibration.feco,c=calibration.coordinate;
  const angle=Math.max(c.minimumAngleRad,Math.min(c.maximumAngleRad,Number(input.angle)||c.neutralAngleRad));
  const velocity=Number.isFinite(Number(input.velocity))?Number(input.velocity):(angle-state.lastAngle)/Math.max(1e-6,dt);
  const contact=clamp01(input.contact);
  const flexPosition=clamp01((c.neutralAngleRad-angle)/(c.neutralAngleRad-c.minimumAngleRad));
  const extensionPosition=clamp01((angle-c.neutralAngleRad)/(c.maximumAngleRad-c.neutralAngleRad));
  const history=p.clawHistoryGain;
  // The experimental hysteresis was measured at the end of a three-second
  // hold. Retain the last movement direction during a hold; the previous
  // implementation inspected instantaneous velocity, so its claimed history
  // effect vanished as soon as motion stopped.
  if(velocity< -1e-8)state.lastMotionDirection=-1;
  else if(velocity>1e-8)state.lastMotionDirection=1;
  const flexHistory=state.lastMotionDirection<0?1+history:state.lastMotionDirection>0?1-history:1;
  const extensionHistory=state.lastMotionDirection>0?1+history:state.lastMotionDirection<0?1-history:1;
  const flexTarget=clamp01(flexPosition*flexHistory);
  const extensionTarget=clamp01(extensionPosition*extensionHistory);
  state.clawFlexion=approach(state.clawFlexion,flexTarget,p.tonicTauSeconds,dt);
  state.clawExtension=approach(state.clawExtension,extensionTarget,p.tonicTauSeconds,dt);

  const speed=Math.abs(velocity),directionStrength=clamp01(speed/(speed+p.hookSpeedHalfRadPerSecond));
  const hookFlexTarget=velocity<0?directionStrength:0,hookExtensionTarget=velocity>0?directionStrength:0;
  state.hookFlexion=approach(state.hookFlexion,hookFlexTarget,hookFlexTarget>state.hookFlexion?p.phasicRiseTauSeconds:p.phasicFallTauSeconds,dt);
  state.hookExtension=approach(state.hookExtension,hookExtensionTarget,hookExtensionTarget>state.hookExtension?p.phasicRiseTauSeconds:p.phasicFallTauSeconds,dt);

  const normalizedSpeed=speed/Math.max(1e-6,p.clubPeakSpeedRadPerSecond);
  const movementEnvelope=clamp01(normalizedSpeed*Math.exp(1-normalizedSpeed));
  const contactRate=Math.abs(contact-state.lastContact)/Math.max(1e-6,dt);
  const impactTarget=clamp01(contactRate/50);
  state.impactEnvelope=approach(state.impactEnvelope,impactTarget,impactTarget>state.impactEnvelope ? .018 : .08,dt);
  state.clubAdaptation=approach(state.clubAdaptation,movementEnvelope,p.clubAdaptationTauSeconds,dt);
  const extensionFraction=clamp01((angle-c.neutralAngleRad)/(c.maximumAngleRad-c.neutralAngleRad));
  const angleGain=1-p.clubExtensionAttenuation*extensionFraction;
  const clubTarget=clamp01(movementEnvelope*angleGain*(1-.18*state.clubAdaptation)+state.impactEnvelope*p.clubImpactGain);
  state.club=approach(state.club,clubTarget,clubTarget>state.club?p.phasicRiseTauSeconds:p.phasicFallTauSeconds,dt);
  state.lastAngle=angle;state.lastVelocity=velocity;state.lastContact=contact;
  return state;
}
