import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_IDS,LEG_MOTOR_ACTION_SPECS,legMotorActionPopulationKey,legMotorUnitPopulationKey} from './constants.js';
import {LOCOMOTOR_CALIBRATION} from './locomotor-calibration.js';
import {sanitizeMotorPacket} from './protocol.js';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const clampSigned=value=>Math.max(-1,Math.min(1,Number(value)||0));
const sat=(value,scale=1)=>clamp01(1-Math.exp(-Math.max(0,Number(value)||0)/Math.max(1e-6,scale)));
const rate=(object,key)=>Number(object?.[key]||0);
const activation=(functional,key)=>Number(functional?.[key]?.activation??functional?.[key]??0);
const popRate=(functional,key)=>Number(functional?.[key]?.rate??0);
const signal=(functional,key,rateScale=90)=>activation(functional,key)+sat(popRate(functional,key),rateScale);
const mean=values=>values.length?values.reduce((sum,value)=>sum+Number(value||0),0)/values.length:0;

/**
 * Converts population state into effector evidence without choosing an action.
 * Six identified leg-motor pools remain separate. Descending activity can
 * coordinate their timing, but it cannot become translational force by itself.
 */
export class NeuralEffectorDecoder {
  constructor(mapping={},config={}){
    this.mapping=mapping;
    this.smooth={
      locomotorDrive:0,coordinationDrive:0,dna02Left:0,dna02Right:0,
      dna01Left:0,dna01Right:0,dng13Left:0,dng13Right:0,
      reverse:0,feed:0,drink:0,escape:0,halt:0,confidence:0,conflict:0,
      feedingEvidence:0,legLeft:0,legRight:0,turnEvidence:0,centralArousal:0,
    };
    this.smoothLegs=new Float32Array(LEG_IDS.length);
    this.smoothActuators=new Float32Array(LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length);
    this.smoothMotorUnits=new Float32Array(LEG_IDS.length*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);
    this.setConfig(config);
  }
  setConfig(config={}){
    this.gain=Number.isFinite(config.outputGain)?Math.max(0,config.outputGain):(this.gain??1);
    this.strictDecoder=typeof config.strictDecoder==='boolean'?config.strictDecoder:(this.strictDecoder??true);
    this.broadDescendingGain=Number.isFinite(config.broadDescendingGain)?Math.max(0,config.broadDescendingGain):(this.broadDescendingGain??0);
    this.allowOutputSideProxy=typeof config.allowOutputSideProxy==='boolean'?config.allowOutputSideProxy:(this.allowOutputSideProxy??false);
    this.useSubthresholdOutput=typeof config.useSubthresholdOutput==='boolean'?config.useSubthresholdOutput:(this.useSubthresholdOutput??false);
    this.subthresholdOutputGain=Number.isFinite(config.subthresholdOutputGain)?Math.max(0,config.subthresholdOutputGain):(this.subthresholdOutputGain??0);
    this.motorSubthresholdSaturationScale=Number.isFinite(config.motorSubthresholdSaturationScale)
      ?Math.max(1e-6,config.motorSubthresholdSaturationScale)
      :(this.motorSubthresholdSaturationScale??LOCOMOTOR_CALIBRATION.engineering.motorSubthresholdSaturationScale);
    this.modelMode=config.modelMode||this.modelMode||'natural';
  }

  decode(rates={},functional={}){
    const named=rates.named||{},broad=rates.broad||{},analogNamed=rates.activation?.named||{},analogBroad=rates.activation?.broad||{};
    const analogScale=this.useSubthresholdOutput?this.subthresholdOutputGain:0;
    const combined=key=>rate(named,key)+rate(analogNamed,key)*analogScale;
    // The homogeneous whole-CNS LIF approximation leaves the identified BANC
    // motor pools subthreshold even though adult slow motor units are tonically
    // excitable. Preserve spike evidence exactly, but give the measured neural
    // membrane state a separate, disclosed saturation scale instead of treating
    // it as a few hundredths of one spike/second. Descending activity is not an
    // input to this function, and exact zero motor evidence remains exact zero.
    const motorEvidence=key=>{
      const spikeEvidence=sat(rate(named,key)*this.gain,LOCOMOTOR_CALIBRATION.engineering.spikeRateSaturationHz);
      const analogEvidence=this.useSubthresholdOutput
        ?sat(activation(analogNamed,key)*analogScale*this.gain,this.motorSubthresholdSaturationScale):0;
      return clamp01(1-(1-spikeEvidence)*(1-analogEvidence));
    };
    const descending=rate(broad,'descending')+rate(analogBroad,'descending')*analogScale;
    const coordination=this.strictDecoder?0:sat(descending*this.broadDescendingGain*this.gain,1.5);

    const rawLegs=LEG_IDS.map(id=>motorEvidence(`legMotor${id}`));
    const rawActuators=[];
    for(const legId of LEG_IDS)for(const action of LEG_MOTOR_ACTION_SPECS)rawActuators.push(motorEvidence(legMotorActionPopulationKey(legId,action.id)));
    const rawMotorUnits=[];
    for(const legId of LEG_IDS)for(const unit of FEMUR_TIBIA_MOTOR_UNIT_SPECS)rawMotorUnits.push(motorEvidence(legMotorUnitPopulationKey(legId,unit.id)));
    const rawLeft=mean(rawLegs.slice(0,3)),rawRight=mean(rawLegs.slice(3));
    const dna02Left=sat(combined('DNa02_L')*this.gain,2.5),dna02Right=sat(combined('DNa02_R')*this.gain,2.5);
    const dna01Left=sat(combined('DNa01_L')*this.gain,3.2),dna01Right=sat(combined('DNa01_R')*this.gain,3.2);
    const dng13Left=sat(combined('DNg13_L')*this.gain,3.2),dng13Right=sat(combined('DNg13_R')*this.gain,3.2);
    const reverse=sat((combined('MDN')*1.35+combined('DNp42')*.45+combined('backward_motor')*.75)*this.gain,4.8);
    const halt=sat(combined('halt')*this.gain,4);
    const defensive=sat((combined('giant_fiber')+combined('DNp09')*.22)*this.gain,4);
    const feedHz=combined('MN9')+combined('proboscis_motor')+rate(broad,'proboscis_motor')*.25+rate(analogBroad,'proboscis_motor')*.25*analogScale;
    const feedingEvidence=sat(signal(functional,'feeding',70),.8);
    const feed=Math.max(sat(feedHz*this.gain,4.5),feedingEvidence*.18);
    const drink=sat(combined('water_motor')*this.gain,4.5);
    const central=sat(signal(functional,'centralArousal',45),.72);
    const turnEvidence=clampSigned(
      (dna02Right-dna02Left)*.72+(dna01Right-dna01Left)*.34+(dng13Right-dng13Left)*.22,
    );
    const locomotorDrive=mean(rawLegs);
    const activeOpposition=Math.min(rawLeft,rawRight);
    const conflict=clamp01(
      Math.min(locomotorDrive,reverse)*.9+
      Math.min(locomotorDrive,halt)*.9+
      Math.min(feed,defensive)*.35+
      Math.min(1,Math.abs(rawLeft-rawRight))*activeOpposition*.18,
    );
    const confidence=Math.max(
      clamp01(((Number(rates.specificOutputSpikes)||0)+(Number(rates.outputSpikes)||0)*.08)/8),
      locomotorDrive*.72,coordination*.28,reverse*.55,halt*.55,feed*.45,defensive*.55,
    );
    const raw={
      locomotorDrive,coordinationDrive:coordination,
      dna02Left,dna02Right,dna01Left,dna01Right,dng13Left,dng13Right,
      reverse,feed,drink,escape:defensive,halt,confidence,conflict,feedingEvidence,
      legLeft:rawLeft,legRight:rawRight,turnEvidence,centralArousal:central,
    };
    const smoothing=this.strictDecoder?.42:.34;
    for(let i=0;i<rawLegs.length;i++)this.smoothLegs[i]+=(rawLegs[i]-this.smoothLegs[i])*smoothing;
    for(let i=0;i<rawActuators.length;i++)this.smoothActuators[i]+=(rawActuators[i]-this.smoothActuators[i])*smoothing;
    for(let i=0;i<rawMotorUnits.length;i++)this.smoothMotorUnits[i]+=(rawMotorUnits[i]-this.smoothMotorUnits[i])*smoothing;
    for(const key of Object.keys(this.smooth))this.smooth[key]+=(raw[key]-this.smooth[key])*smoothing;
    return sanitizeMotorPacket({
      ...this.smooth,legs:this.smoothLegs,actuators:this.smoothActuators,motorUnits:this.smoothMotorUnits,
      motorUnitSpikeCounts:rates.motorUnitSpikeCounts,
      motorFrameId:rates.motorFrameId,
      motorFrameDurationMs:rates.motorFrameDurationMs,
    });
  }
}
