import {sanitizeMotorPacket} from './protocol.js';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const clampSigned=value=>Math.max(-1,Math.min(1,Number(value)||0));
const sat=(value,scale=1)=>clamp01(1-Math.exp(-Math.max(0,Number(value)||0)/Math.max(1e-6,scale)));
const rate=(object,key)=>Number(object?.[key]||0);
const activation=(functional,key)=>Number(functional?.[key]?.activation??functional?.[key]??0);
const popRate=(functional,key)=>Number(functional?.[key]?.rate??0);
const signal=(functional,key,rateScale=90)=>activation(functional,key)+sat(popRate(functional,key),rateScale);
const asymmetry=(left,right,epsilon=.025)=>clampSigned((right-left)/(Math.abs(left)+Math.abs(right)+epsilon));
const meanRange=(values,start,end,transform=v=>v)=>{
  if(!values?.length||end<=start)return 0;
  let sum=0,count=0;
  for(let i=start;i<end&&i<values.length;i++){sum+=transform(Number(values[i])||0);count++;}
  return count?sum/count:0;
};
const peakRange=(values,start,end,transform=v=>v)=>{
  let peak=0;
  if(!values?.length)return peak;
  for(let i=start;i<end&&i<values.length;i++)peak=Math.max(peak,transform(Number(values[i])||0));
  return peak;
};

/**
 * Converts measured/proxy neural population state into low-dimensional evidence
 * for the modeled VNC. Natural mode may also use local sensory features that
 * have already crossed the fly's sensory boundary; it never receives objects,
 * coordinates, targets or desired actions.
 */
export class NeuralEffectorDecoder {
  constructor(mapping={},config={}){
    this.mapping=mapping;
    this.smooth={forward:0,reverse:0,turn:0,feed:0,drink:0,escape:0,halt:0,confidence:0,odorBias:0,odorPresence:0,visualBias:0,visualRisk:0,memoryBias:0,memoryConfidence:0,centralArousal:0,feedingEvidence:0};
    this.setConfig(config);
  }
  setConfig(config={}){
    this.gain=Number.isFinite(config.outputGain)?Math.max(0,config.outputGain):(this.gain??1);
    this.strictDecoder=typeof config.strictDecoder==='boolean'?config.strictDecoder:(this.strictDecoder??true);
    this.broadDescendingGain=Number.isFinite(config.broadDescendingGain)?Math.max(0,config.broadDescendingGain):(this.broadDescendingGain??0);
    this.allowOutputSideProxy=typeof config.allowOutputSideProxy==='boolean'?config.allowOutputSideProxy:(this.allowOutputSideProxy??false);
    this.useSubthresholdOutput=typeof config.useSubthresholdOutput==='boolean'?config.useSubthresholdOutput:(this.useSubthresholdOutput??false);
    this.subthresholdOutputGain=Number.isFinite(config.subthresholdOutputGain)?Math.max(0,config.subthresholdOutputGain):(this.subthresholdOutputGain??0);
    this.functionalIntent=typeof config.functionalIntent==='boolean'?config.functionalIntent:(this.functionalIntent??false);
    this.modelMode=config.modelMode||this.modelMode||'natural';
  }

  decode(rates={},functional={},sensory=null){
    const named=rates.named||{},broad=rates.broad||{},analogNamed=rates.activation?.named||{},analogBroad=rates.activation?.broad||{};
    const analogScale=this.useSubthresholdOutput?this.subthresholdOutputGain:0;

    const namedForwardHz=
      1.2*(rate(named,'oDN1')+rate(analogNamed,'oDN1')*analogScale)+
      .72*(rate(named,'P9')+rate(analogNamed,'P9')*analogScale)+
      .72*(rate(named,'BPN')+rate(analogNamed,'BPN')*analogScale)+
      .5*(rate(named,'DNg_walk')+rate(analogNamed,'DNg_walk')*analogScale)+
      .35*(rate(named,'leg_motor')+rate(analogNamed,'leg_motor')*analogScale);
    const namedReverseHz=
      1.35*(rate(named,'MDN')+rate(analogNamed,'MDN')*analogScale)+
      .45*(rate(named,'DNp42')+rate(analogNamed,'DNp42')*analogScale)+
      .75*(rate(named,'backward_motor')+rate(analogNamed,'backward_motor')*analogScale);
    const leftNamed=
      rate(named,'DNa02_L')+rate(analogNamed,'DNa02_L')*analogScale+
      .58*(rate(named,'DNa01_L')+rate(analogNamed,'DNa01_L')*analogScale)+
      .32*(rate(named,'DNg13_L')+rate(analogNamed,'DNg13_L')*analogScale);
    const rightNamed=
      rate(named,'DNa02_R')+rate(analogNamed,'DNa02_R')*analogScale+
      .58*(rate(named,'DNa01_R')+rate(analogNamed,'DNa01_R')*analogScale)+
      .32*(rate(named,'DNg13_R')+rate(analogNamed,'DNg13_R')*analogScale);

    const broadRate=rate(broad,'descending')+rate(analogBroad,'descending')*analogScale;
    const leftBroad=this.allowOutputSideProxy
      ? rate(broad,'descendingEffective_L')+rate(analogBroad,'descendingEffective_L')*analogScale
      : rate(broad,'descending_L')+rate(analogBroad,'descending_L')*analogScale;
    const rightBroad=this.allowOutputSideProxy
      ? rate(broad,'descendingEffective_R')+rate(analogBroad,'descendingEffective_R')*analogScale
      : rate(broad,'descending_R')+rate(analogBroad,'descending_R')*analogScale;

    const central=sat(signal(functional,'centralArousal',45),.72);
    const populationForward=this.strictDecoder?0:sat(broadRate*this.broadDescendingGain*this.gain,.7);
    const directForward=sat(namedForwardHz*this.gain,5.5);
    const forward=Math.max(directForward,populationForward*.82,this.functionalIntent?central*.28:0);
    const reverse=sat(namedReverseHz*this.gain,4.8);

    const namedTurn=Math.tanh((rightNamed-leftNamed)*.14*this.gain);
    const broadTurn=this.strictDecoder?0:asymmetry(leftBroad,rightBroad,.04)*sat((leftBroad+rightBroad)*this.broadDescendingGain*this.gain,2.2);
    const turn=clampSigned(namedTurn+broadTurn*.72);

    const metabolic=sensory?.metabolic||[];
    const hunger=clamp01(metabolic[0]),thirst=clamp01(metabolic[1]),stress=clamp01(metabolic[4]);
    const fL=signal(functional,'odorFoodLeft',85),fR=signal(functional,'odorFoodRight',85);
    const wL=signal(functional,'odorWaterLeft',85),wR=signal(functional,'odorWaterRight',85);
    const tL=signal(functional,'odorThreatLeft',85),tR=signal(functional,'odorThreatRight',85);
    const appetitiveL=fL*(.28+.9*hunger)+wL*(.2+.95*thirst);
    const appetitiveR=fR*(.28+.9*hunger)+wR*(.2+.95*thirst);
    const threatGain=.65+.9*stress;
    let odorBias=asymmetry(appetitiveL-tL*threatGain,appetitiveR-tR*threatGain,.04);
    let odorPresence=sat(Math.max(appetitiveL,appetitiveR,tL,tR),.3);

    let visualBias=0,visualRisk=0;
    if(this.functionalIntent&&sensory){
      const proximity=sensory.retinaProximity||[],loom=sensory.retinaLoom||[],motion=sensory.retinaMotion||[];
      const half=Math.max(1,Math.floor(Math.max(proximity.length,loom.length,motion.length)/2));
      const riskAt=i=>clamp01((Number(proximity[i])||0)*.62+Math.max(0,Number(loom[i])||0)*.95+(Number(motion[i])||0)*.18);
      const leftRisk=Math.max(meanRange(proximity,0,half,v=>clamp01(v))*.42,peakRange(loom,0,half,v=>Math.max(0,v))*.9,peakRange(proximity,0,half,v=>clamp01(v))*.7,meanRange(motion,0,half,v=>clamp01(v))*.2);
      const rightRisk=Math.max(meanRange(proximity,half,proximity.length,v=>clamp01(v))*.42,peakRange(loom,half,loom.length,v=>Math.max(0,v))*.9,peakRange(proximity,half,proximity.length,v=>clamp01(v))*.7,meanRange(motion,half,motion.length,v=>clamp01(v))*.2);
      // Positive angular motion is a right turn. More risk on the left biases right.
      visualBias=clampSigned((leftRisk-rightRisk)*1.25);
      visualRisk=clamp01(Math.max(leftRisk,rightRisk));
    }

    const memoryCue=sensory?.memoryCue||[];
    const memoryLeft=signal(functional,'memoryLeft',70),memoryRight=signal(functional,'memoryRight',70);
    const functionalMemory=asymmetry(memoryLeft,memoryRight,.035);
    const cueMemory=clampSigned((Number(memoryCue[2])||0)-(Number(memoryCue[0])||0));
    const memoryConfidence=clamp01(Number(memoryCue[3])||0);
    const memoryBias=this.functionalIntent?clampSigned(functionalMemory*.6+cueMemory*.4):0;

    if(!this.functionalIntent){odorBias=0;odorPresence=0;visualBias=0;visualRisk=0;}

    const defensiveHz=rate(named,'giant_fiber')+.22*rate(named,'DNp09');
    const threatEvidence=sat(signal(functional,'threat',70),.8);
    const feedHz=rate(named,'MN9')+rate(named,'proboscis_motor')+rate(broad,'proboscis_motor')*.25+
      (rate(analogNamed,'MN9')+rate(analogNamed,'proboscis_motor')+rate(analogBroad,'proboscis_motor')*.25)*analogScale;
    const feedingEvidence=sat(signal(functional,'feeding',70),.8);
    const sweetContact=clamp01(sensory?.taste?.[0]);
    const waterContact=clamp01(sensory?.taste?.[1]);
    const feed=Math.max(sat(feedHz*this.gain,4.5),this.functionalIntent?sweetContact*feedingEvidence:0);
    const drink=Math.max(sat(rate(named,'water_motor')*this.gain,4.5),this.functionalIntent?waterContact*feedingEvidence*.8:0);
    const escape=Math.max(sat(defensiveHz*this.gain,4),this.functionalIntent?threatEvidence*.55:0);
    const halt=sat(rate(named,'halt')*this.gain,4);

    const raw={
      forward:forward*(1-reverse*.78)*(1-halt*.9),reverse:reverse*(1-forward*.35),turn,
      feed,drink,escape,halt,
      confidence:Math.max(clamp01((Number(rates.specificOutputSpikes)||0+(this.strictDecoder?0:Number(rates.outputSpikes)||0)*.12)/8),this.functionalIntent?Math.max(central*.5,odorPresence*.45,visualRisk*.4):0),
      odorBias,odorPresence,visualBias,visualRisk,memoryBias,memoryConfidence,centralArousal:central,feedingEvidence,
    };

    const rateSmoothing=this.strictDecoder?.38:.32;
    for(const key of Object.keys(this.smooth))this.smooth[key]+=(raw[key]-this.smooth[key])*rateSmoothing;
    return sanitizeMotorPacket(this.smooth);
  }
}
