import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_IDS,LEG_MOTOR_ACTION_SPECS} from './constants.js';
import {clamp,wrapAngle} from './geometry.js';
import {createFecoState,stepFecoTransduction} from './feco-transduction.js';
import {createSpikeForceState,stepSpikeForceState,triggerMotorUnitBurst} from './front-leg-biophysics.js';
import {FEMUR_TIBIA_PROPRIOCEPTION_FIELDS,FRONT_FEMUR_TIBIA_CALIBRATION} from './leg-calibration.js';
import {LOCOMOTOR_CALIBRATION} from './locomotor-calibration.js';
import {createFemurTibiaMuscleState,stepFemurTibiaMuscle} from './muscle-unit-model.js';

const TAU=Math.PI*2;
const smooth=(current,target,rate,dt)=>current+(target-current)*(1-Math.exp(-Math.max(0,rate)*dt));
const offsets=Object.freeze({LF:0,LM:Math.PI,LH:0,RF:Math.PI,RM:0,RH:Math.PI});
const attachment=Object.freeze({
  LF:{x:.92,y:-.58},LM:{x:.02,y:-.68},LH:{x:-.92,y:-.58},
  RF:{x:.92,y:.58},RM:{x:.02,y:.68},RH:{x:-.92,y:.58},
});
const legSide=id=>id[0]==='L'?-1:1;
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const FLEXOR_ACTION=LEG_MOTOR_ACTION_SPECS.findIndex(action=>action.id==='femurTibiaFlex');
const EXTENSOR_ACTION=LEG_MOTOR_ACTION_SPECS.findIndex(action=>action.id==='femurTibiaExtend');

// The coordinate range and neutral angle follow the adult front-leg
// preparation. Passive mechanics and acceleration remain disclosed engineering
// values; only the front leg is directly constrained by the cited experiments.
const calibrated=FRONT_FEMUR_TIBIA_CALIBRATION;
export const FEMUR_TIBIA_JOINT_MODEL=Object.freeze({
  minAngle:calibrated.coordinate.minimumAngleRad,
  maxAngle:calibrated.coordinate.maximumAngleRad,
  restAngle:calibrated.coordinate.neutralAngleRad,
  activeAcceleration:calibrated.joint.activeAcceleration,
  passiveStiffness:calibrated.joint.passiveStiffness,
  damping:calibrated.joint.damping,
  maxVelocity:calibrated.joint.maximumVelocityRadPerSecond,
});

function makeLeg(id){
  return {
    id,side:legSide(id),segment:id[1],phase:offsets[id],phaseVelocity:0,
    neuralDrive:0,amplitude:0,stance:false,load:0,contact:0,lift:0,retraction:0,
    femurTibiaAngle:FEMUR_TIBIA_JOINT_MODEL.restAngle,femurTibiaVelocity:0,
    flexorDrive:0,extensorDrive:0,activeJointTorque:0,passiveJointTorque:0,
    muscle:createFemurTibiaMuscleState(),feco:createFecoState(FEMUR_TIBIA_JOINT_MODEL.restAngle),
    spikeForce:createSpikeForceState(),lastMotorSpikeFrameId:0,
    calibratedFlexorForceMicroNewtons:0,calibratedFlexorTorqueNewtonMeters:0,
    unresolvedMotorSpikes:0,absoluteForceEvidence:'no resolved slow/fast spikes in current frame',
    localX:attachment[id].x,localY:attachment[id].y,footX:attachment[id].x,footY:attachment[id].y,
  };
}

function integrateFemurTibia(leg,flexorDrive,extensorDrive,motorUnits,motorUnitSpikeCounts,motorFrameId,effectiveGain,dt){
  const model=FEMUR_TIBIA_JOINT_MODEL;
  leg.flexorDrive=clamp(Number(flexorDrive)||0,0,1);
  leg.extensorDrive=clamp(Number(extensorDrive)||0,0,1);
  stepFemurTibiaMuscle(leg.muscle,{flexorDrive:leg.flexorDrive,extensorDrive:leg.extensorDrive,motorUnits},dt);
  if(motorFrameId>0&&motorFrameId!==leg.lastMotorSpikeFrameId){
    const counts=Array.from(motorUnitSpikeCounts||[],value=>Math.max(0,Math.round(Number(value)||0)));
    triggerMotorUnitBurst(leg.spikeForce,'slow',counts[0]);
    triggerMotorUnitBurst(leg.spikeForce,'fast',counts[2]);
    leg.unresolvedMotorSpikes=counts[1]||0;
    leg.lastMotorSpikeFrameId=motorFrameId;
    leg.absoluteForceEvidence=(counts[0]||counts[2])?'BANC-resolved slow/fast spike counts':'no resolved slow/fast spikes in current frame';
  }
  stepSpikeForceState(leg.spikeForce,dt);
  leg.calibratedFlexorForceMicroNewtons=leg.spikeForce.totalFlexorForceMicroNewtons;
  leg.calibratedFlexorTorqueNewtonMeters=leg.spikeForce.totalFlexorTorqueNewtonMeters;
  // Muscle activation has finite rise/fall times, so force can persist briefly
  // after neural evidence ceases. A never-driven state still has exactly zero
  // active torque; passive elasticity may move a displaced silent joint.
  leg.activeJointTorque=leg.muscle.netForce*model.activeAcceleration*effectiveGain;
  leg.passiveJointTorque=-(leg.femurTibiaAngle-model.restAngle)*model.passiveStiffness-leg.femurTibiaVelocity*model.damping;
  const acceleration=leg.activeJointTorque+leg.passiveJointTorque;
  leg.femurTibiaVelocity=clamp(leg.femurTibiaVelocity+acceleration*dt,-model.maxVelocity,model.maxVelocity);
  leg.femurTibiaAngle+=leg.femurTibiaVelocity*dt;
  if(leg.femurTibiaAngle<=model.minAngle){leg.femurTibiaAngle=model.minAngle;if(leg.femurTibiaVelocity<0)leg.femurTibiaVelocity=0;}
  if(leg.femurTibiaAngle>=model.maxAngle){leg.femurTibiaAngle=model.maxAngle;if(leg.femurTibiaVelocity>0)leg.femurTibiaVelocity=0;}
}

/**
 * Browser-native intermediate body. It is deliberately not a velocity-command
 * agent: identified leg-pool activation is required for stance traction.
 * Descending populations alter gait timing and bilateral stride gain only.
 */
export class PlanarHexapodPlant {
  constructor(){this.reset();}
  reset(){
    this.clock=0;this.speed=0;this.turnRate=0;this.lastReason='no identified leg-motor output';
    this.legs=LEG_IDS.map(makeLeg);this.forwardTraction=0;this.leftTraction=0;this.rightTraction=0;this.gaitFrequencyHz=0;
  }

  step({brain={},touch=[],taste=[],physiology={},dt=.01}={}){
    // Contact is physical evidence, not a private behavior selector. It can
    // unload the contacted leg and is returned to the CNS through the world
    // sensory packet. Reversal and steering must come back through represented
    // neural outputs rather than a plant-side timer or alternating turn rule.
    const contacts=LEG_IDS.map((_,i)=>clamp(Number(touch?.[i])||0,0,2));
    const neuralLegs=LEG_IDS.map((_,i)=>clamp(Number(brain.legs?.[i])||0,0,1));
    const fatigue=clamp(Number(physiology.fatigue)||0,0,1),sleep=clamp(Number(physiology.sleepPressure)||0,0,1);
    const halt=clamp(Number(brain.halt)||0,0,1);
    const reverse=clamp(Number(brain.reverse)||0,0,1);
    const coordination=clamp(Number(brain.coordinationDrive)||0,0,1);
    const dna02=(Number(brain.dna02Right)||0)-(Number(brain.dna02Left)||0);
    const dna01=(Number(brain.dna01Right)||0)-(Number(brain.dna01Left)||0);
    const dng13=(Number(brain.dng13Right)||0)-(Number(brain.dng13Left)||0);
    const steering=clamp(dna02*.72+dna01*.34+dng13*.22,-1,1);
    const effectiveGain=(1-halt*.98)*(1-fatigue*.45)*(1-sleep*.24);
    const actuatorValues=brain.actuators||[];
    const motorUnitValues=brain.motorUnits||[];
    const motorUnitSpikeValues=brain.motorUnitSpikeCounts||[];
    const motorFrameId=Math.max(0,Math.floor(Number(brain.motorFrameId)||0));
    const direction=reverse>.35?-1:1;
    // The gait clock may run without force. This models coordination only: the
    // translation equations below depend exclusively on identified leg drives.
    const meanLeg=mean(neuralLegs);
    const locomotor=LOCOMOTOR_CALIBRATION;
    // Slow leg-motor units are tonically active at rest and contribute posture.
    // Leg-pool readiness alone must therefore not start an imposed gait cycle.
    // The transitional clock requires a separate coordination signal; actual
    // translation still additionally requires identified leg-pool traction.
    const hasGaitEvidence=coordination>1e-9;
    const frequencyHz=hasGaitEvidence?clamp(
      locomotor.engineering.activeFrequencyBaseHz+
      coordination*locomotor.engineering.coordinationFrequencySpanHz+
      meanLeg*locomotor.engineering.motorFrequencySpanHz,
      locomotor.evidence.activeJointCycleMinHz,locomotor.evidence.activeJointCycleMaxHz,
    ):0;
    this.gaitFrequencyHz=frequencyHz;
    const signedOmega=TAU*frequencyHz*direction;
    this.clock=wrapAngle(this.clock+signedOmega*dt);

    const swingFraction=.38;
    for(let i=0;i<this.legs.length;i++){
      const leg=this.legs[i],outside=steering>0?leg.side<0:steering<0?leg.side>0:false;
      const inside=steering>0?leg.side>0:steering<0?leg.side<0:false;
      let strideGain=1;
      if(outside)strideGain+=Math.abs(steering)*(.26+Math.abs(dng13)*.18);
      if(inside)strideGain-=Math.abs(steering)*(.42+Math.abs(dna02)*.12);
      const unload=clamp(contacts[i]*.72,0,.86);
      const target=clamp(neuralLegs[i]*strideGain*effectiveGain*(1-unload),0,1);
      const actuatorBase=i*LEG_MOTOR_ACTION_SPECS.length;
      const motorUnitBase=i*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length;
      const motorUnits=motorUnitValues.length>=motorUnitBase+FEMUR_TIBIA_MOTOR_UNIT_SPECS.length
        ?motorUnitValues.slice(motorUnitBase,motorUnitBase+FEMUR_TIBIA_MOTOR_UNIT_SPECS.length):[];
      const motorUnitSpikeCounts=motorUnitSpikeValues.length>=motorUnitBase+FEMUR_TIBIA_MOTOR_UNIT_SPECS.length
        ?motorUnitSpikeValues.slice(motorUnitBase,motorUnitBase+FEMUR_TIBIA_MOTOR_UNIT_SPECS.length):[];
      integrateFemurTibia(
        leg,actuatorValues[actuatorBase+FLEXOR_ACTION],actuatorValues[actuatorBase+EXTENSOR_ACTION],motorUnits,motorUnitSpikeCounts,motorFrameId,effectiveGain,dt,
      );
      leg.neuralDrive=neuralLegs[i];
      leg.amplitude=smooth(leg.amplitude,target,12,dt);
      leg.phase=wrapAngle(this.clock+offsets[leg.id]);
      leg.phaseVelocity=signedOmega;
      const phase=(leg.phase%TAU+TAU)%TAU;
      const swingEnd=TAU*swingFraction;
      leg.stance=phase>=swingEnd;
      const swingPhase=leg.stance?0:phase/swingEnd*Math.PI;
      const stancePhase=leg.stance?(phase-swingEnd)/(TAU-swingEnd):0;
      leg.lift=leg.stance?0:Math.sin(swingPhase)*leg.amplitude;
      leg.retraction=leg.stance?stancePhase*2-1:1-2*(phase/swingEnd);
      const loadCurve=leg.stance?(.62+.38*Math.sin(Math.PI*stancePhase)):0;
      leg.load=leg.amplitude*loadCurve*(1-unload*.65);
      leg.contact=smooth(leg.contact,contacts[i],18,dt);
      stepFecoTransduction(leg.feco,{angle:leg.femurTibiaAngle,velocity:leg.femurTibiaVelocity,contact:leg.contact},dt);
      const base=attachment[leg.id];
      const jointPosition=clamp((leg.femurTibiaAngle-FEMUR_TIBIA_JOINT_MODEL.restAngle)/
        (FEMUR_TIBIA_JOINT_MODEL.maxAngle-FEMUR_TIBIA_JOINT_MODEL.minAngle),-.5,.5);
      // The phase scaffold still supplies most of the stride, while the actual
      // antagonist state now changes foot placement and closes proprioception.
      leg.localX=base.x+leg.retraction*.58*leg.amplitude+jointPosition*.44;
      leg.localY=base.y+leg.side*(.76+.16*leg.amplitude-.13*leg.lift+jointPosition*.16);
      leg.footX=leg.localX;leg.footY=leg.localY;
    }

    const leftLoads=this.legs.slice(0,3).filter(l=>l.stance).map(l=>l.load);
    const rightLoads=this.legs.slice(3).filter(l=>l.stance).map(l=>l.load);
    this.leftTraction=leftLoads.length?mean(leftLoads):0;
    this.rightTraction=rightLoads.length?mean(rightLoads):0;
    this.forwardTraction=(this.leftTraction+this.rightTraction)/2;
    // Tripod stance alternates two legs on one side against one on the other.
    // Instantaneous left/right load would therefore manufacture a large yaw
    // oscillation even for exactly symmetric commands. Cycle-scale stride
    // amplitude retains steering and contact unloading while cancelling that
    // known phase-count artifact.
    // Wosnitza et al. identify step frequency as the primary walking-speed
    // control. Mendes et al. provide a representative 28 mm/s at a roughly
    // 60 ms step period, hence 1.68 mm planar advance per cycle. Stance
    // traction still multiplies the transfer, so neither frequency nor
    // descending coordination can create translation on its own.
    const targetSpeed=direction*frequencyHz*locomotor.evidence.representativeAdvancePerCycleMm*this.forwardTraction;
    // DNa01/DNa02/DNg13 right-left activity predicts rotational velocity, and
    // identified steering DNs modulate inside/outside strides. Raw tonic
    // left/right motor-pool imbalance is not itself a continuous yaw command.
    // Gate the disclosed engineering yaw gain by physical stance traction so
    // steering activity cannot rotate an inactive body.
    const targetTurn=steering*locomotor.engineering.steeringGainRadPerSecond*
      clamp(this.forwardTraction*locomotor.engineering.steeringTractionScale,0,1);
    this.speed=smooth(this.speed,targetSpeed,9,dt);
    this.turnRate=smooth(this.turnRate,targetTurn,13,dt);
    if(Math.abs(this.speed)<.002)this.speed=0;if(Math.abs(this.turnRate)<.001)this.turnRate=0;

    const feedAttempt=clamp(Number(brain.feed)||0,0,1),drinkAttempt=clamp(Number(brain.drink)||0,0,1),escape=clamp(Number(brain.escape)||0,0,1);
    const foodContact=Number(taste?.[0]||0)>locomotor.engineering.ingestionContactThreshold;
    const waterContact=Number(taste?.[1]||0)>locomotor.engineering.ingestionContactThreshold;
    const feed=foodContact?feedAttempt:0,drink=waterContact?drinkAttempt:0;
    const moving=Math.abs(this.speed)>.05;
    const probing=feedAttempt>locomotor.engineering.probingDisplayThreshold||drinkAttempt>locomotor.engineering.probingDisplayThreshold;
    const state=feed>locomotor.engineering.ingestionFulfillmentThreshold?'feed'
      :drink>locomotor.engineering.ingestionFulfillmentThreshold?'drink'
      :reverse>.35&&moving?'reverse':moving?'walk':probing?'probe':'rest';
    this.lastReason=feed>locomotor.engineering.ingestionFulfillmentThreshold?'food taste/contact plus identified proboscis output'
      :drink>locomotor.engineering.ingestionFulfillmentThreshold?'water taste/contact plus identified proboscis output'
      :reverse>.35&&moving?'identified reverse output plus leg-motor traction':moving?'identified leg-motor traction'
      :probing?'proboscis output without matching mouth contact':'no identified leg-motor traction';
    return {
      speed:this.speed,turnRate:this.turnRate,state,reason:this.lastReason,
      drive:meanLeg,bias:steering,feed,drink,feedAttempt,drinkAttempt,escape,
      ingestionContact:foodContact?'food':waterContact?'water':null,gaitFrequencyHz:frequencyHz,
      coordinationDrive:coordination,forwardTraction:this.forwardTraction,
      leftTraction:this.leftTraction,rightTraction:this.rightTraction,
      legs:this.legs.map(leg=>({...leg})),
    };
  }

  proprioceptionVector(){
    const values=[clamp(this.speed/LOCOMOTOR_CALIBRATION.evidence.straightBoutSpeedMaxMmPerSecond,-1,1),clamp(this.turnRate/1.75,-1,1)];
    for(const leg of this.legs){
      const angleScale=leg.femurTibiaAngle<FEMUR_TIBIA_JOINT_MODEL.restAngle
        ?FEMUR_TIBIA_JOINT_MODEL.restAngle-FEMUR_TIBIA_JOINT_MODEL.minAngle
        :FEMUR_TIBIA_JOINT_MODEL.maxAngle-FEMUR_TIBIA_JOINT_MODEL.restAngle;
      values.push(
      clamp((leg.femurTibiaAngle-FEMUR_TIBIA_JOINT_MODEL.restAngle)/angleScale,-1,1),
      clamp(leg.femurTibiaVelocity/FEMUR_TIBIA_JOINT_MODEL.maxVelocity,-1,1),
      Math.sin(leg.phase),Math.cos(leg.phase),clamp(leg.phaseVelocity/(TAU*LOCOMOTOR_CALIBRATION.evidence.activeJointCycleMaxHz),-1,1),
      leg.amplitude,leg.load,leg.stance?1:0,clamp(leg.contact,0,1.5),leg.lift,
      leg.feco.clawFlexion,leg.feco.clawExtension,leg.feco.hookFlexion,leg.feco.hookExtension,leg.feco.club,
      );
    }
    if(values.length!==2+LEG_IDS.length*FEMUR_TIBIA_PROPRIOCEPTION_FIELDS.length)throw new Error('Femur–tibia proprioception schema length mismatch');
    return Float32Array.from(values);
  }

  footWorldPositions(fly){
    const c=Math.cos(fly.heading),s=Math.sin(fly.heading);
    return this.legs.map(leg=>({
      id:leg.id,
      x:fly.x+c*leg.footX-s*leg.footY,
      y:fly.y+s*leg.footX+c*leg.footY,
      stance:leg.stance,lift:leg.lift,amplitude:leg.amplitude,
    }));
  }

  snapshot(){return {
    clock:this.clock,speed:this.speed,turnRate:this.turnRate,reason:this.lastReason,
    forwardTraction:this.forwardTraction,leftTraction:this.leftTraction,rightTraction:this.rightTraction,gaitFrequencyHz:this.gaitFrequencyHz,
    legs:this.legs.map(leg=>({...leg})),
  };}
  serialize(){return {version:6,clock:this.clock,speed:this.speed,turnRate:this.turnRate,lastReason:this.lastReason,forwardTraction:this.forwardTraction,leftTraction:this.leftTraction,rightTraction:this.rightTraction,gaitFrequencyHz:this.gaitFrequencyHz,legs:this.legs.map(leg=>structuredClone(leg))};}
  restore(state={}){
    for(const key of ['clock','speed','turnRate','lastReason','forwardTraction','leftTraction','rightTraction','gaitFrequencyHz'])if(state[key]!==undefined)this[key]=state[key];
    if(Array.isArray(state.legs)&&state.legs.length===this.legs.length)for(let i=0;i<this.legs.length;i++){
      Object.assign(this.legs[i],state.legs[i]);
      this.legs[i].muscle={...createFemurTibiaMuscleState(),...(state.legs[i].muscle||{})};
      this.legs[i].muscle.commands={...createFemurTibiaMuscleState().commands,...(state.legs[i].muscle?.commands||{})};
      this.legs[i].muscle.activation={...createFemurTibiaMuscleState().activation,...(state.legs[i].muscle?.activation||{})};
      this.legs[i].muscle.fatigue={...createFemurTibiaMuscleState().fatigue,...(state.legs[i].muscle?.fatigue||{})};
      this.legs[i].feco={...createFecoState(this.legs[i].femurTibiaAngle),...(state.legs[i].feco||{})};
      this.legs[i].spikeForce={...createSpikeForceState(),...(state.legs[i].spikeForce||{})};
      this.legs[i].spikeForce.forceByUnitMicroNewtons={...createSpikeForceState().forceByUnitMicroNewtons,...(state.legs[i].spikeForce?.forceByUnitMicroNewtons||{})};
      this.legs[i].spikeForce.deliveredSpikes={...createSpikeForceState().deliveredSpikes,...(state.legs[i].spikeForce?.deliveredSpikes||{})};
      this.legs[i].spikeForce.bursts=Array.isArray(state.legs[i].spikeForce?.bursts)?structuredClone(state.legs[i].spikeForce.bursts):[];
    }
  }
}
