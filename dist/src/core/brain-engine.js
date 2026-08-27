import {ANY_OUTPUT_MASK, FEMUR_TIBIA_MOTOR_UNIT_SPECS, LEG_IDS, LEG_MOTOR_ACTION_SPECS, LEG_OUTPUT_FLAGS, MODEL_DEFAULTS, OUTPUT_FLAGS, OUTPUT_POPULATION_SPECS, legMotorActionPopulationKey, legMotorUnitPopulationKey, modelConfigFor} from './constants.js';
import {Xoshiro128, hashString} from './prng.js';
import {NeuralEffectorDecoder} from './motor-decoder.js';
import {assertSensoryPacket} from './protocol.js';
import {JavaScriptLifKernel, exactLinearCoefficients} from './neural-kernels.js';

const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const populationRate = (count,size,durationMs) => size ? count*1000/durationMs/size : 0;

export class WholeConnectomeEngine {
  constructor(data, config = {}, seed = 0x829ab1, runtime = {}) {
    this.data = data;
    const mode = config.modelMode || MODEL_DEFAULTS.modelMode;
    this.config = modelConfigFor(mode,config);
    this.rng = new Xoshiro128(seed);
    this.kernel = runtime.kernel || new JavaScriptLifKernel(data.N);
    if(this.kernel.neuronCount!==data.N)throw new Error(`Neural kernel has ${this.kernel.neuronCount} states for ${data.N} neurons`);
    this.v = this.kernel.v; // relative to -52 mV rest
    this.g = this.kernel.g; // synaptic voltage state
    this.refractory = this.kernel.refractory;
    this.pending = [];
    this.pendingTouched = [];
    this.pendingIndex = 0;
    this.configureDelayBuffers();
    this.configureIntegrator();
    this.spikeIndices = this.kernel.spikeIndices;
    this.spikeCount = 0;
    this.totalSpikes = 0;
    this.motorFrameId = 0;
    this.simulatedMs = 0;
    this.currentSensory = null;
    this.decoder = new NeuralEffectorDecoder(data.mapping,this.config);
    const outputIndices=[];
    for(let i=0;i<data.N;i++)if(data.mapping.outputFlags?.[i]&ANY_OUTPUT_MASK)outputIndices.push(i);
    this.outputIndices=Uint32Array.from(outputIndices);
    this.signalNames=Object.keys(data.mapping.signalPopulations||{}).slice(0,30);
    this.signalMasks=new Uint32Array(data.N);
    for(let bit=0;bit<this.signalNames.length;bit++){
      const indices=data.mapping.signalPopulations[this.signalNames[bit]]||[];
      const mask=(1<<bit)>>>0;
      for(const index of indices)this.signalMasks[index]|=mask;
    }
    this.lastMotor = this.decoder.decode({}, {}, null);
    this.activityHistory = [];
    this.homeostaticMultiplier = 1;
    this.stimulationCursor = new Map();
    this.lastFrameStats = null;
    this.perturbations = [];
    this.temporaryInputCounts = new Uint16Array(data.N);
    this.zeroRefractoryMask = new Uint8Array(data.N);
    this.refreshPoissonTargetMask();
    this.autonomySeeds = new Uint32Array();
    this.refreshAutonomySeeds();
    this.normalizedEdgeWeights=/fraction|normalized|postsynaptic|post input/i.test(String(data.manifest?.graph?.weightSemantics||''));
  }

  configureDelayBuffers() {
    const steps = Math.max(1,Math.round((Number(this.config.synapticDelayMs)||1.8)/(Number(this.config.brainDtMs)||2)));
    this.delaySteps = steps;
    this.effectiveDelayMs = steps * this.config.brainDtMs;
    this.pending = Array.from({length:steps+1},()=>new Float32Array(this.data.N));
    this.pendingTouched = Array.from({length:steps+1},()=>[]);
    this.pendingIndex = 0;
  }

  clearPendingBuffers() {
    for(let i=0;i<this.pending.length;i++){
      this.pending[i].fill(0);
      this.pendingTouched[i].length=0;
    }
    this.pendingIndex=0;
  }

  migratePendingBuffers(source,sourceTouched,sourceIndex=0,sourceDtMs=this.config.brainDtMs) {
    if(!Array.isArray(source)||!source.length)return;
    const oldLength=source.length,newLength=this.pending.length;
    const oldIndex=((Number(sourceIndex)||0)%oldLength+oldLength)%oldLength;
    const oldDt=Math.max(1e-6,Number(sourceDtMs)||this.config.brainDtMs);
    const newDt=Math.max(1e-6,Number(this.config.brainDtMs)||oldDt);
    this.clearPendingBuffers();
    for(let slot=0;slot<oldLength;slot++){
      const buffer=source[slot];
      if(!buffer?.length)continue;
      const offset=(slot-oldIndex+oldLength)%oldLength;
      const targetOffset=clamp(Math.round(offset*oldDt/newDt),0,newLength-1);
      const targetSlot=targetOffset%newLength;
      const target=this.pending[targetSlot],targetTouched=this.pendingTouched[targetSlot];
      const touched=sourceTouched?.[slot];
      if(Array.isArray(touched)||ArrayBuffer.isView(touched)){
        for(const rawIndex of touched){
          const index=Number(rawIndex)|0,value=Number(buffer[index])||0;
          if(!value||index<0||index>=target.length)continue;
          if(target[index]===0)targetTouched.push(index);
          target[index]=clamp(target[index]+value,-80,80);
        }
      }else{
        for(let index=0;index<Math.min(buffer.length,target.length);index++){
          const value=Number(buffer[index])||0;
          if(!value)continue;
          if(target[index]===0)targetTouched.push(index);
          target[index]=clamp(target[index]+value,-80,80);
        }
      }
    }
  }

  configureIntegrator() {
    this.integrator=exactLinearCoefficients(this.config.brainDtMs,this.config.membraneTauMs,this.config.synapseTauMs);
    this.integrator.id='exact-linear-coupled-v1';
  }

  setConfig(next = {}) {
    const oldDt=this.config.brainDtMs,oldDelay=this.config.synapticDelayMs,oldSeedFraction=this.config.spontaneousSeedFraction;
    const oldPending=this.pending,oldTouched=this.pendingTouched,oldPendingIndex=this.pendingIndex;
    const requestedMode=next.modelMode;
    if(requestedMode && requestedMode!==this.config.modelMode) this.config=modelConfigFor(requestedMode,{...next});
    else Object.assign(this.config,next);
    if(this.config.brainDtMs!==oldDt||this.config.synapticDelayMs!==oldDelay){
      this.configureDelayBuffers();
      this.migratePendingBuffers(oldPending,oldTouched,oldPendingIndex,oldDt);
    }
    this.configureIntegrator();
    if(this.config.spontaneousSeedFraction!==oldSeedFraction)this.refreshAutonomySeeds();
    this.decoder.setConfig(this.config);
  }

  refreshPoissonTargetMask() {
    this.zeroRefractoryMask.fill(0);
    const populations=this.data.mapping.populations||{};
    const sensoryPattern=/^(visual|olfactory|gust|mech|airflow|proprio|thermo|hygro|endocrine|leg(?:Sensory|Tactile|Proprio|Position|Movement|Vibration|Load|JointAngle|MovementDirection|Strain|Nociception|Gustatory|Claw|Hook|Club))/i;
    for(const [name,indices] of Object.entries(populations)){
      if(!sensoryPattern.test(name))continue;
      for(const index of indices||[])this.zeroRefractoryMask[index]=1;
    }
    for(const sector of this.data.mapping.retinaSectors||[])for(const index of sector||[])this.zeroRefractoryMask[index]=1;
    for(const [name,indices] of Object.entries(this.data.mapping.signalPopulations||{})){
      if(!/^memory/i.test(name))continue;
      for(const index of indices||[])this.zeroRefractoryMask[index]=1;
    }
  }

  refreshAutonomySeeds() {
    const fraction=clamp(Number(this.config.spontaneousSeedFraction)||0,0,0.25);
    if(fraction<=0){this.autonomySeeds=new Uint32Array();return;}
    const candidates=this.data.mapping.populations.central||new Uint32Array();
    const flags=this.data.mapping.outputFlags||new Uint32Array(this.data.N);
    const selected=[];
    const threshold=Math.floor(fraction*0x100000000);
    for(const idx of candidates){
      if(flags[idx]&ANY_OUTPUT_MASK)continue;
      const h=hashString(`spontaneous:${this.data.rootIds[idx]||idx}`)>>>0;
      if(h<threshold)selected.push(idx);
    }
    const minimum=Math.min(4,candidates.length);
    if(selected.length<minimum){
      for(const idx of candidates){
        if(flags[idx]&ANY_OUTPUT_MASK||selected.includes(idx))continue;
        selected.push(idx);if(selected.length>=minimum)break;
      }
    }
    this.autonomySeeds=Uint32Array.from(selected);
  }

  setSensory(packet) { this.currentSensory=assertSensoryPacket(packet); }

  perturb(population,side='',rateHz=100,durationMs=500) {
    const key=side?`${population}_${side}`:population;
    const indices=this.data.mapping.populations[key]||this.data.mapping.populations[population];
    if(!indices?.length)return false;
    for(const index of indices)if(this.temporaryInputCounts[index]<65535)this.temporaryInputCounts[index]++;
    this.perturbations.push({key,indices,rateHz:clamp(Number(rateHz)||0,0,300),until:this.simulatedMs+clamp(Number(durationMs)||0,1,10000)});
    return true;
  }

  /** PoissonInput analogue: events add directly to target membrane voltage. */
  poissonVoltageInput(indices,rateHz,dtMs,label,eventMv=this.config.synapseWeightMv*this.config.sensoryEventMultiplier) {
    if(!indices?.length||rateHz<=0||eventMv<=0)return;
    const expected=indices.length*rateHz*dtMs/1000;
    let events=Math.floor(expected);
    if(this.rng.next()<expected-events)events++;
    events=Math.min(events,Math.max(16,Math.min(5000,Math.ceil(indices.length*0.75))));
    let cursor=this.stimulationCursor.get(label)??(hashString(label)%indices.length);
    const stride=104729;
    for(let e=0;e<events;e++){
      cursor=(cursor+stride+this.rng.int(31))%indices.length;
      const idx=indices[cursor];
      // The published model sets Poisson-target refractory time to zero.
      this.refractory[idx]=0;
      this.v[idx]=clamp(this.v[idx]+eventMv,-80,90);
    }
    this.stimulationCursor.set(label,cursor);
  }

  currentPopulationEvents(indices,rateHz,eventMv,dtMs,label='tonic') {
    if(!indices?.length||rateHz<=0||eventMv<=0)return;
    const expected=indices.length*rateHz*dtMs/1000;
    let events=Math.min(5000,Math.floor(expected+this.rng.next()));
    let cursor=this.stimulationCursor.get(label)??(hashString(label)%indices.length);
    for(let e=0;e<events;e++){
      cursor=(cursor+65537+this.rng.int(13))%indices.length;
      this.g[indices[cursor]]=clamp(this.g[indices[cursor]]+eventMv,-60,60);
    }
    this.stimulationCursor.set(label,cursor);
  }

  applyExternalInputs(dtMs) {
    const s=this.currentSensory,p=this.data.mapping.populations,gain=this.config.sensoryGain;
    if(s){
      const retinalDrive = new Float32Array(s.retinaBrightness?.length || 0);
      for(let i=0;i<retinalDrive.length;i++){
        const luminance=clamp(Number(s.retinaBrightness[i]||0),0,1.5);
        retinalDrive[i]=this.config.visualTransduction==='feature-assisted'
          ? clamp(luminance*.62+Math.abs(Number(s.retinaMotion[i]||0))*.46+Math.max(0,Number(s.retinaLoom[i]||0))*.75,0,1.5)
          : luminance;
      }
      if(this.config.retinalMapping==='hemifield'){
        const half=Math.max(1,Math.ceil(retinalDrive.length/2));
        let left=0,right=0;
        for(let i=0;i<retinalDrive.length;i++){
          if(i<half)left+=retinalDrive[i];else right+=retinalDrive[i];
        }
        left/=half;right/=Math.max(1,retinalDrive.length-half);
        this.poissonVoltageInput(p.visualLeft,left*55*gain,dtMs,'retina-hemifield-L');
        this.poissonVoltageInput(p.visualRight,right*55*gain,dtMs,'retina-hemifield-R');
        this.poissonVoltageInput(p.visualBoth,(left+right)*24*gain,dtMs,'retina-hemifield-M');
      }else{
        const sectors=this.data.mapping.retinaSectors||[];
        for(let i=0;i<sectors.length;i++)this.poissonVoltageInput(sectors[i],(retinalDrive[i]||0)*55*gain,dtMs,`retina-sector-proxy-${i}`);
      }

      const ol=s.odorLeft||[],or=s.odorRight||[];
      const proxyAllowed=this.config.allowSyntheticReceptorFallback&&this.config.chemicalMapping==='proxy';
      const mappingMode=proxyAllowed?'Proxy':'Annotated';
      const odor=(channel,label,lval,rval)=>{
        // If receptor identity is unavailable, annotated mode activates the broad
        // olfactory afferent pool. It does not manufacture odor-specific neurons.
        const specificLeft=p[`olfactory${channel}${mappingMode}Left`];
        const specificRight=p[`olfactory${channel}${mappingMode}Right`];
        const specificBoth=p[`olfactory${channel}${mappingMode}Both`];
        const left=specificLeft?.length?specificLeft:(p.olfactoryLeft?.length?p.olfactoryLeft:p.olfactoryBoth);
        const right=specificRight?.length?specificRight:(p.olfactoryRight?.length?p.olfactoryRight:p.olfactoryBoth);
        const both=specificBoth?.length?specificBoth:(!p.olfactoryLeft?.length&&!p.olfactoryRight?.length?p.olfactoryBoth:null);
        this.poissonVoltageInput(left,clamp(lval*70*gain,0,140),dtMs,`${label}-${mappingMode}-L`);
        this.poissonVoltageInput(right,clamp(rval*70*gain,0,140),dtMs,`${label}-${mappingMode}-R`);
        this.poissonVoltageInput(both,clamp((lval+rval)*28*gain,0,90),dtMs,`${label}-${mappingMode}-M`);
      };
      odor('Food','volatile-fruit',ol[0]||0,or[0]||0);
      odor('Water','humidity',ol[1]||0,or[1]||0);
      odor('Threat','aversive-odor',ol[2]||0,or[2]||0);

      this.poissonVoltageInput(p.gustSweet,(s.taste?.[0]||0)*95*gain,dtMs,'taste-sweet');
      this.poissonVoltageInput(p.gustWater,(s.taste?.[1]||0)*95*gain,dtMs,'taste-water');
      this.poissonVoltageInput(p.gustBitter,(s.taste?.[2]||0)*120*gain,dtMs,'taste-aversive');
      this.poissonVoltageInput(p.gustUnknown,Math.max(...(s.taste||[0]))*50*gain,dtMs,'taste-unknown');

      const touch=s.touch||[],leftTouch=(touch[0]||0)+(touch[1]||0)+(touch[2]||0),rightTouch=(touch[3]||0)+(touch[4]||0)+(touch[5]||0);
      this.poissonVoltageInput(p.mechLeft?.length?p.mechLeft:p.mechBoth,clamp(leftTouch*38*gain,0,150),dtMs,'touch-L');
      this.poissonVoltageInput(p.mechRight?.length?p.mechRight:p.mechBoth,clamp(rightTouch*38*gain,0,150),dtMs,'touch-R');
      for(let leg=0;leg<LEG_IDS.length;leg++){
        const id=LEG_IDS[leg],value=clamp(Number(touch[leg])||0,0,2);
        this.poissonVoltageInput(p[`legTactile${id}`]?.length?p[`legTactile${id}`]:p[`legSensory${id}`],value*82*gain,dtMs,`touch-${id}`);
      }

      const wind=s.airflow||[];
      this.poissonVoltageInput(p.airflowLeft?.length?p.airflowLeft:p.airflowBoth,clamp((wind[0]||0)*70*gain,0,130),dtMs,'air-L');
      this.poissonVoltageInput(p.airflowRight?.length?p.airflowRight:p.airflowBoth,clamp((wind[1]||0)*70*gain,0,130),dtMs,'air-R');

      const proprio=s.proprioception||[];
      if(proprio.length>=2+LEG_IDS.length*8){
        const subtypeResolved=proprio.length>=2+LEG_IDS.length*15;
        const articulated=proprio.length>=2+LEG_IDS.length*10;
        const fieldsPerLeg=subtypeResolved?15:articulated?10:8;
        const bodyForward=Math.abs(Number(proprio[0])||0),bodyYaw=Number(proprio[1])||0;
        for(let leg=0;leg<LEG_IDS.length;leg++){
          const id=LEG_IDS[leg],base=2+leg*fieldsPerLeg,offset=articulated?2:0;
          const jointAngle=articulated?clamp(Number(proprio[base])||0,-1,1):null;
          const jointVelocity=articulated?clamp(Number(proprio[base+1])||0,-1,1):null;
          const phaseSin=clamp(Number(proprio[base+offset])||0,-1,1),phaseCos=clamp(Number(proprio[base+offset+1])||0,-1,1);
          const phaseVelocity=Math.abs(Number(proprio[base+offset+2])||0),amplitude=clamp(Number(proprio[base+offset+3])||0,0,1);
          const load=clamp(Number(proprio[base+offset+4])||0,0,1.5),stance=clamp(Number(proprio[base+offset+5])||0,0,1);
          const contact=clamp(Number(proprio[base+offset+6])||0,0,1.5),lift=clamp(Number(proprio[base+offset+7])||0,0,1);
          if(subtypeResolved){
            const clawFlexion=clamp(Number(proprio[base+10])||0,0,1),clawExtension=clamp(Number(proprio[base+11])||0,0,1);
            const hookFlexion=clamp(Number(proprio[base+12])||0,0,1),hookExtension=clamp(Number(proprio[base+13])||0,0,1);
            const club=clamp(Number(proprio[base+14])||0,0,1);
            const clawGeneric=p[`legClaw${id}`]?.length?p[`legClaw${id}`]:(p[`legJointAngle${id}`]?.length?p[`legJointAngle${id}`]:p[`legProprio${id}`]);
            const hookGeneric=p[`legHook${id}`]?.length?p[`legHook${id}`]:(p[`legMovementDirection${id}`]?.length?p[`legMovementDirection${id}`]:p[`legProprio${id}`]);
            const clubPopulation=p[`legClub${id}`]?.length?p[`legClub${id}`]:p[`legVibration${id}`];
            const signedClaw=Boolean(p[`legClawFlexion${id}`]?.length&&p[`legClawExtension${id}`]?.length);
            const signedHook=Boolean(p[`legHookFlexion${id}`]?.length&&p[`legHookExtension${id}`]?.length);
            if(signedClaw){
              this.poissonVoltageInput(p[`legClawFlexion${id}`],clawFlexion*52*gain,dtMs,`leg-claw-flexion-${id}`);
              this.poissonVoltageInput(p[`legClawExtension${id}`],clawExtension*52*gain,dtMs,`leg-claw-extension-${id}`);
            }else this.poissonVoltageInput(clawGeneric,Math.max(clawFlexion,clawExtension)*52*gain,dtMs,`leg-claw-position-unsigned-${id}`);
            if(signedHook){
              this.poissonVoltageInput(p[`legHookFlexion${id}`],hookFlexion*48*gain,dtMs,`leg-hook-flexion-${id}`);
              this.poissonVoltageInput(p[`legHookExtension${id}`],hookExtension*48*gain,dtMs,`leg-hook-extension-${id}`);
            }else this.poissonVoltageInput(hookGeneric,Math.max(hookFlexion,hookExtension)*48*gain,dtMs,`leg-hook-direction-unsigned-${id}`);
            this.poissonVoltageInput(clubPopulation,club*46*gain,dtMs,`leg-club-dynamic-envelope-${id}`);
          }else{
            // Compatibility path for v2 articulated and legacy phase packets.
            // It cannot recover subtype state or signed root identities.
            const position=articulated?clamp(.5+jointAngle*.5,0,1):clamp(.5+.25*phaseSin+.25*phaseCos,0,1);
            const positionPopulation=articulated&&p[`legJointAngle${id}`]?.length?p[`legJointAngle${id}`]:(p[`legPosition${id}`]?.length?p[`legPosition${id}`]:p[`legProprio${id}`]);
            const movementPopulation=articulated&&p[`legMovementDirection${id}`]?.length?p[`legMovementDirection${id}`]:(p[`legMovement${id}`]?.length?p[`legMovement${id}`]:p[`legProprio${id}`]);
            const movement=articulated?Math.abs(jointVelocity):phaseVelocity;
            this.poissonVoltageInput(positionPopulation,position*52*gain,dtMs,`${articulated?'leg-joint-angle':'leg-position'}-${id}`);
            this.poissonVoltageInput(movementPopulation,clamp(movement*.78+phaseVelocity*.18+bodyForward*.12,0,1.5)*48*gain,dtMs,`${articulated?'leg-joint-direction':'leg-movement'}-${id}`);
            this.poissonVoltageInput(p[`legVibration${id}`],clamp(phaseVelocity*.42+lift*.28,0,1.5)*42*gain,dtMs,`leg-vibration-${id}`);
          }
          const strainPopulation=articulated&&p[`legStrain${id}`]?.length?p[`legStrain${id}`]:p[`legLoad${id}`];
          this.poissonVoltageInput(strainPopulation,clamp(load*.7+stance*.22,0,1.5)*58*gain,dtMs,`${articulated?'leg-strain':'leg-load'}-${id}`);
          this.poissonVoltageInput(p[`legTactile${id}`],contact*68*gain,dtMs,`leg-contact-${id}`);
          this.poissonVoltageInput(p[`legProprio${id}`],clamp(amplitude*.25+Math.abs(bodyYaw)*.12,0,1)*32*gain,dtMs,`leg-general-${id}`);
        }
      }else{
        const pLeft=p.proprioLeft?.length?p.proprioLeft:p.proprioBoth,pRight=p.proprioRight?.length?p.proprioRight:p.proprioBoth;
        const movement=Math.abs(proprio[0]||0)*35+Math.abs(proprio[1]||0)*25;
        this.poissonVoltageInput(pLeft,clamp(movement+((proprio[1]||0)<0?10:0),0,90)*gain,dtMs,'proprio-L');
        this.poissonVoltageInput(pRight,clamp(movement+((proprio[1]||0)>0?10:0),0,90)*gain,dtMs,'proprio-R');
      }

      this.poissonVoltageInput(p.thermoWarm,Math.max(0,(s.temperature||.5)-.55)*90*gain,dtMs,'thermo-warm');
      this.poissonVoltageInput(p.thermoCool,Math.max(0,.45-(s.temperature||.5))*90*gain,dtMs,'thermo-cool');
      this.poissonVoltageInput(p.hygro,((ol[1]||0)+(or[1]||0))*22*gain,dtMs,'hygro');

      if(this.config.interoception){
        const m=s.metabolic||[],proxy=this.config.allowSyntheticReceptorFallback&&this.config.interoceptionMapping==='proxy',suffix=proxy?'Proxy':'';
        const generic=p.endocrine;
        this.poissonVoltageInput(p[`endocrineEnergy${suffix}`]?.length?p[`endocrineEnergy${suffix}`]:generic,clamp((m[0]||0)*45*gain,0,80),dtMs,`intero-energy-${suffix||'annotated'}`);
        this.poissonVoltageInput(p[`endocrineWater${suffix}`]?.length?p[`endocrineWater${suffix}`]:generic,clamp((m[1]||0)*45*gain,0,80),dtMs,`intero-water-${suffix||'annotated'}`);
        this.poissonVoltageInput(p[`endocrineFatigue${suffix}`]?.length?p[`endocrineFatigue${suffix}`]:generic,clamp(((m[2]||0)*.7+(m[3]||0)*.55+(m[4]||0)*.5)*38*gain,0,80),dtMs,`intero-fatigue-${suffix||'annotated'}`);
      }

      if(this.config.memoryInput){
        const cue=s.memoryCue||[],signals=this.data.mapping.signalPopulations||{};
        const confidence=clamp(Number(cue[3]||0),0,1);
        this.poissonVoltageInput(signals.memoryLeft,clamp(Number(cue[0]||0)*confidence*52*gain,0,90),dtMs,'memory-bearing-L');
        this.poissonVoltageInput(signals.memoryForward,clamp(Number(cue[1]||0)*confidence*52*gain,0,90),dtMs,'memory-bearing-F');
        this.poissonVoltageInput(signals.memoryRight,clamp(Number(cue[2]||0)*confidence*52*gain,0,90),dtMs,'memory-bearing-R');
      }
    }

    const activePerturbations=[];
    for(const perturbation of this.perturbations){
      if(perturbation.until>this.simulatedMs){
        this.poissonVoltageInput(perturbation.indices,perturbation.rateHz,dtMs,`opto-${perturbation.key}`);
        activePerturbations.push(perturbation);
      }else{
        for(const index of perturbation.indices)if(this.temporaryInputCounts[index]>0)this.temporaryInputCounts[index]--;
      }
    }
    this.perturbations=activePerturbations;

    // Explicit boundary hypothesis for the unknown live neural state. A small,
    // deterministic subset of non-output central neurons receives suprathreshold
    // Poisson seed events; the broader central population receives weak synaptic
    // bombardment. Neither path reads the world or writes motor commands directly.
    if(this.config.autonomyDrive>0){
      const multiplier=this.config.autonomyDrive*this.homeostaticMultiplier;
      this.poissonVoltageInput(this.autonomySeeds,(Number(this.config.spontaneousSeedRateHz)||0)*multiplier,dtMs,'spontaneous-seeds',Number(this.config.spontaneousSeedEventMv)||0);
      this.currentPopulationEvents(p.central,(Number(this.config.backgroundSynapticRateHz)||0)*multiplier,Number(this.config.backgroundSynapticEventMv)||0,dtMs,'background-central');
    }
  }

  step(dtMs=this.config.brainDtMs) {
    this.spikeCount=0;
    this.applyExternalInputs(dtMs);
    const due=this.pending[this.pendingIndex];
    const dueTouched=this.pendingTouched[this.pendingIndex];
    for(const index of dueTouched){
      if(due[index]!==0){this.g[index]=clamp(this.g[index]+due[index],-60,60);due[index]=0;}
    }
    dueTouched.length=0;
    const coefficients=dtMs===this.config.brainDtMs
      ? this.integrator
      : exactLinearCoefficients(dtMs,this.config.membraneTauMs,this.config.synapseTauMs);
    this.spikeCount=this.kernel.integrate({dtMs,thresholdMv:this.config.thresholdMv,...coefficients});
    const deliveryIndex=(this.pendingIndex+this.delaySteps)%this.pending.length;
    const delivery=this.pending[deliveryIndex],deliveryTouched=this.pendingTouched[deliveryIndex],{rowPtr,post,weight}=this.data,scale=this.normalizedEdgeWeights?this.config.recurrentGainMv:this.config.synapseWeightMv;
    for(let s=0;s<this.spikeCount;s++){
      const pre=this.spikeIndices[s];
      this.v[pre]=0;this.g[pre]=0;
      this.refractory[pre]=(this.zeroRefractoryMask[pre]||this.temporaryInputCounts[pre])?0:this.config.refractoryMs;
      for(let e=rowPtr[pre];e<rowPtr[pre+1];e++){
        const target=post[e];
        if(delivery[target]===0)deliveryTouched.push(target);
        delivery[target]=clamp(delivery[target]+weight[e]*scale,-80,80);
      }
    }
    this.pendingIndex=(this.pendingIndex+1)%this.pending.length;
    this.totalSpikes+=this.spikeCount;this.simulatedMs+=dtMs;
    return this.spikeCount;
  }

  collectOutputCounts(durationMs,frameSpikes) {
    const flags=this.data.mapping.outputFlags,pops=this.data.mapping.populations,peripheral=this.data.mapping.peripheralAtlas||{};
    const broad={descending:0,descending_L:0,descending_R:0,descendingProxy_L:0,descendingProxy_R:0,proboscis_motor:0,leg_motor:0,leg_motor_L:0,leg_motor_R:0};
    const legCounts=Object.fromEntries(LEG_IDS.map(id=>[id,0]));
    const motorActionCounts=new Uint32Array(LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length);
    const motorUnitCounts=new Uint32Array(LEG_IDS.length*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);
    const namedCounts={};
    for(const spec of OUTPUT_POPULATION_SPECS){namedCounts[spec.name]=0;namedCounts[`${spec.name}_L`]=0;namedCounts[`${spec.name}_R`]=0;}
    let outputSpikes=0,specificOutputSpikes=0;
    for(const idx of frameSpikes){
      const f=flags[idx];
      if(f&ANY_OUTPUT_MASK)outputSpikes++;
      if(f&OUTPUT_FLAGS.DESCENDING){
        broad.descending++;
        if(f&OUTPUT_FLAGS.LEFT)broad.descending_L++;
        if(f&OUTPUT_FLAGS.RIGHT)broad.descending_R++;
        if(f&OUTPUT_FLAGS.PROXY_LEFT)broad.descendingProxy_L++;
        if(f&OUTPUT_FLAGS.PROXY_RIGHT)broad.descendingProxy_R++;
      }
      if(f&OUTPUT_FLAGS.PROBOSCIS_MOTOR)broad.proboscis_motor++;
      if(f&OUTPUT_FLAGS.LEG_MOTOR){
        broad.leg_motor++;
        if(f&OUTPUT_FLAGS.LEFT)broad.leg_motor_L++;
        if(f&OUTPUT_FLAGS.RIGHT)broad.leg_motor_R++;
      }
      let matchedSpecific=false;
      for(const id of LEG_IDS)if(f&LEG_OUTPUT_FLAGS[id]){legCounts[id]++;matchedSpecific=true;}
      const motorLeg=(peripheral.motorLegCode?.[idx]||0)-1,motorAction=(peripheral.motorActionCode?.[idx]||0)-1;
      if(motorLeg>=0&&motorAction>=0)motorActionCounts[motorLeg*LEG_MOTOR_ACTION_SPECS.length+motorAction]++;
      const motorUnit=(peripheral.motorUnitClassCode?.[idx]||0)-1;
      if(motorLeg>=0&&motorUnit>=0)motorUnitCounts[motorLeg*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length+motorUnit]++;
      for(const spec of OUTPUT_POPULATION_SPECS){
        if(!(f&(1<<spec.bit)))continue;
        matchedSpecific=true;
        namedCounts[spec.name]++;
        if(f&OUTPUT_FLAGS.LEFT)namedCounts[`${spec.name}_L`]++;
        if(f&OUTPUT_FLAGS.RIGHT)namedCounts[`${spec.name}_R`]++;
      }
      if(matchedSpecific)specificOutputSpikes++;
    }
    const rates={named:{},broad:{},outputSpikes,specificOutputSpikes};
    for(const [name,count] of Object.entries(namedCounts))rates.named[name]=populationRate(count,pops[name]?.length||0,durationMs);
    rates.named.proboscis_motor=populationRate(broad.proboscis_motor,pops.proboscisMotor?.length||0,durationMs);
    rates.named.leg_motor=populationRate(broad.leg_motor,pops.leg_motor?.length||0,durationMs);
    rates.named.leg_motor_L=populationRate(broad.leg_motor_L,pops.leg_motor_L?.length||0,durationMs);
    rates.named.leg_motor_R=populationRate(broad.leg_motor_R,pops.leg_motor_R?.length||0,durationMs);
    for(const id of LEG_IDS)rates.named[`legMotor${id}`]=populationRate(legCounts[id],pops[`legMotor${id}`]?.length||0,durationMs);
    for(let leg=0;leg<LEG_IDS.length;leg++)for(let action=0;action<LEG_MOTOR_ACTION_SPECS.length;action++){
      const key=legMotorActionPopulationKey(LEG_IDS[leg],LEG_MOTOR_ACTION_SPECS[action].id);
      rates.named[key]=populationRate(motorActionCounts[leg*LEG_MOTOR_ACTION_SPECS.length+action],pops[key]?.length||0,durationMs);
    }
    for(let leg=0;leg<LEG_IDS.length;leg++)for(let unit=0;unit<FEMUR_TIBIA_MOTOR_UNIT_SPECS.length;unit++){
      const key=legMotorUnitPopulationKey(LEG_IDS[leg],FEMUR_TIBIA_MOTOR_UNIT_SPECS[unit].id);
      rates.named[key]=populationRate(motorUnitCounts[leg*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length+unit],pops[key]?.length||0,durationMs);
    }
    rates.broad.descending=populationRate(broad.descending,pops.descending?.length||0,durationMs);
    rates.broad.descending_L=populationRate(broad.descending_L,pops.descendingLeft?.length||0,durationMs);
    rates.broad.descending_R=populationRate(broad.descending_R,pops.descendingRight?.length||0,durationMs);
    rates.broad.descendingProxy_L=populationRate(broad.descendingProxy_L,pops.descendingProxyLeft?.length||0,durationMs);
    rates.broad.descendingProxy_R=populationRate(broad.descendingProxy_R,pops.descendingProxyRight?.length||0,durationMs);
    const leftCount=(pops.descendingLeft?.length||0)+(pops.descendingProxyLeft?.length||0);
    const rightCount=(pops.descendingRight?.length||0)+(pops.descendingProxyRight?.length||0);
    rates.broad.descendingEffective_L=populationRate(broad.descending_L+broad.descendingProxy_L,leftCount,durationMs);
    rates.broad.descendingEffective_R=populationRate(broad.descending_R+broad.descendingProxy_R,rightCount,durationMs);
    rates.broad.proboscis_motor=rates.named.proboscis_motor;
    rates.broad.leg_motor=rates.named.leg_motor;
    // Preserve discrete evidence before the normalized decoder. The body can
    // consume each frame once; unresolved populations remain visibly unresolved.
    rates.motorUnitSpikeCounts=Array.from(motorUnitCounts);
    rates.motorFrameDurationMs=durationMs;

    const activation={named:{},broad:{}};
    const namedSums={};
    for(const spec of OUTPUT_POPULATION_SPECS){namedSums[spec.name]=0;namedSums[`${spec.name}_L`]=0;namedSums[`${spec.name}_R`]=0;}
    const legSums=Object.fromEntries(LEG_IDS.map(id=>[id,0]));
    const motorActionSums=new Float32Array(LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length);
    const motorUnitSums=new Float32Array(LEG_IDS.length*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length);
    const a={descending:0,descending_L:0,descending_R:0,descendingProxy_L:0,descendingProxy_R:0,proboscis_motor:0,leg_motor:0,leg_motor_L:0,leg_motor_R:0};
    const threshold=Math.max(0.1,Number(this.config.thresholdMv)||7);
    for(const idx of this.outputIndices){
      const f=flags[idx];
      const value=clamp((Math.max(0,this.v[idx])+Math.max(0,this.g[idx])*.35)/threshold,0,2);
      if(f&OUTPUT_FLAGS.DESCENDING){
        a.descending+=value;
        if(f&OUTPUT_FLAGS.LEFT)a.descending_L+=value;
        if(f&OUTPUT_FLAGS.RIGHT)a.descending_R+=value;
        if(f&OUTPUT_FLAGS.PROXY_LEFT)a.descendingProxy_L+=value;
        if(f&OUTPUT_FLAGS.PROXY_RIGHT)a.descendingProxy_R+=value;
      }
      if(f&OUTPUT_FLAGS.PROBOSCIS_MOTOR)a.proboscis_motor+=value;
      if(f&OUTPUT_FLAGS.LEG_MOTOR){
        a.leg_motor+=value;
        if(f&OUTPUT_FLAGS.LEFT)a.leg_motor_L+=value;
        if(f&OUTPUT_FLAGS.RIGHT)a.leg_motor_R+=value;
      }
      for(const id of LEG_IDS)if(f&LEG_OUTPUT_FLAGS[id])legSums[id]+=value;
      const motorLeg=(peripheral.motorLegCode?.[idx]||0)-1,motorAction=(peripheral.motorActionCode?.[idx]||0)-1;
      if(motorLeg>=0&&motorAction>=0)motorActionSums[motorLeg*LEG_MOTOR_ACTION_SPECS.length+motorAction]+=value;
      const motorUnit=(peripheral.motorUnitClassCode?.[idx]||0)-1;
      if(motorLeg>=0&&motorUnit>=0)motorUnitSums[motorLeg*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length+motorUnit]+=value;
      for(const spec of OUTPUT_POPULATION_SPECS){
        if(!(f&(1<<spec.bit)))continue;
        namedSums[spec.name]+=value;
        if(f&OUTPUT_FLAGS.LEFT)namedSums[`${spec.name}_L`]+=value;
        if(f&OUTPUT_FLAGS.RIGHT)namedSums[`${spec.name}_R`]+=value;
      }
    }
    for(const [name,sum] of Object.entries(namedSums))activation.named[name]=(pops[name]?.length||0)?sum/pops[name].length:0;
    activation.named.proboscis_motor=(pops.proboscisMotor?.length||0)?a.proboscis_motor/pops.proboscisMotor.length:0;
    activation.named.leg_motor=(pops.leg_motor?.length||0)?a.leg_motor/pops.leg_motor.length:0;
    activation.named.leg_motor_L=(pops.leg_motor_L?.length||0)?a.leg_motor_L/pops.leg_motor_L.length:0;
    activation.named.leg_motor_R=(pops.leg_motor_R?.length||0)?a.leg_motor_R/pops.leg_motor_R.length:0;
    for(const id of LEG_IDS)activation.named[`legMotor${id}`]=(pops[`legMotor${id}`]?.length||0)?legSums[id]/pops[`legMotor${id}`].length:0;
    for(let leg=0;leg<LEG_IDS.length;leg++)for(let action=0;action<LEG_MOTOR_ACTION_SPECS.length;action++){
      const key=legMotorActionPopulationKey(LEG_IDS[leg],LEG_MOTOR_ACTION_SPECS[action].id),size=pops[key]?.length||0;
      activation.named[key]=size?motorActionSums[leg*LEG_MOTOR_ACTION_SPECS.length+action]/size:0;
    }
    for(let leg=0;leg<LEG_IDS.length;leg++)for(let unit=0;unit<FEMUR_TIBIA_MOTOR_UNIT_SPECS.length;unit++){
      const key=legMotorUnitPopulationKey(LEG_IDS[leg],FEMUR_TIBIA_MOTOR_UNIT_SPECS[unit].id),size=pops[key]?.length||0;
      activation.named[key]=size?motorUnitSums[leg*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length+unit]/size:0;
    }
    activation.broad.descending=(pops.descending?.length||0)?a.descending/pops.descending.length:0;
    activation.broad.descending_L=(pops.descendingLeft?.length||0)?a.descending_L/pops.descendingLeft.length:0;
    activation.broad.descending_R=(pops.descendingRight?.length||0)?a.descending_R/pops.descendingRight.length:0;
    activation.broad.descendingProxy_L=(pops.descendingProxyLeft?.length||0)?a.descendingProxy_L/pops.descendingProxyLeft.length:0;
    activation.broad.descendingProxy_R=(pops.descendingProxyRight?.length||0)?a.descendingProxy_R/pops.descendingProxyRight.length:0;
    activation.broad.descendingEffective_L=leftCount?(a.descending_L+a.descendingProxy_L)/leftCount:0;
    activation.broad.descendingEffective_R=rightCount?(a.descending_R+a.descendingProxy_R)/rightCount:0;
    activation.broad.proboscis_motor=activation.named.proboscis_motor;
    activation.broad.leg_motor=activation.named.leg_motor;
    rates.activation=activation;
    return rates;
  }

  collectFunctionalSignals(durationMs,frameSpikes){
    const counts=new Uint32Array(this.signalNames.length);
    for(const index of frameSpikes){
      let mask=this.signalMasks[index]>>>0;
      while(mask){
        const bit=31-Math.clz32(mask&-mask);
        counts[bit]++;mask&=mask-1;
      }
    }
    const threshold=Math.max(.1,Number(this.config.thresholdMv)||7),signals={};
    for(let bit=0;bit<this.signalNames.length;bit++){
      const name=this.signalNames[bit],indices=this.data.mapping.signalPopulations[name]||[];
      let sum=0;
      for(const index of indices)sum+=clamp((Math.max(0,this.v[index])+Math.max(0,this.g[index])*.35)/threshold,0,2);
      signals[name]={
        rate:populationRate(counts[bit],indices.length,durationMs),
        activation:indices.length?sum/indices.length:0,
        size:indices.length,
      };
    }
    return signals;
  }

  advance(durationMs,sensory) {
    if(sensory)this.setSensory(sensory);
    const steps=Math.max(1,Math.round(durationMs/this.config.brainDtMs)),frameSpikes=[];
    const started=performance.now();
    for(let k=0;k<steps;k++){
      this.step(this.config.brainDtMs);
      for(let i=0;i<this.spikeCount;i++)frameSpikes.push(this.spikeIndices[i]);
    }
    const actualDuration=steps*this.config.brainDtMs,rates=this.collectOutputCounts(actualDuration,frameSpikes);
    rates.motorFrameId=++this.motorFrameId;
    const functional=this.collectFunctionalSignals(actualDuration,frameSpikes);
    this.lastMotor=this.decoder.decode(rates,functional,this.currentSensory);
    const populationRateHz=frameSpikes.length*1000/actualDuration/this.data.N;
    if(this.config.homeostasis&&this.config.autonomyDrive>0&&this.autonomySeeds.length){
      const error=this.config.targetPopulationRateHz-populationRateHz;
      this.homeostaticMultiplier=clamp(this.homeostaticMultiplier*Math.exp(error*.00035*actualDuration),.08,12);
    }
    const wallMs=Math.max(.01,performance.now()-started);
    this.lastFrameStats={
      simulatedMs:actualDuration,wallMs,populationRateHz,spikes:frameSpikes.length,totalSpikes:this.totalSpikes,
      homeostaticMultiplier:this.homeostaticMultiplier,rates,functional,modelMode:this.config.modelMode,
      brainDtMs:this.config.brainDtMs,effectiveDelayMs:this.effectiveDelayMs,strictDecoder:this.config.strictDecoder,retinalMapping:this.config.retinalMapping,chemicalMapping:this.config.chemicalMapping,interoceptionMapping:this.config.interoceptionMapping,
      integrator:this.integrator.id,computeBackend:this.kernel.describe(),functionalIntent:this.config.functionalIntent,
    };
    this.activityHistory.push(populationRateHz);if(this.activityHistory.length>240)this.activityHistory.shift();
    return {motor:this.lastMotor,stats:this.lastFrameStats,sampleSpikes:frameSpikes.slice(0,4000)};
  }


  warmup(durationMs=this.config.warmupMs) {
    const duration=Math.max(0,Number(durationMs)||0);
    if(!duration)return {durationMs:0,spikes:0,populationRateHz:0};
    const previousSensory=this.currentSensory;
    this.currentSensory=null;
    let elapsed=0,spikes=0,last=null;
    while(elapsed<duration){
      const chunk=Math.min(40,duration-elapsed);
      last=this.advance(chunk,null);spikes+=last.stats.spikes;elapsed+=last.stats.simulatedMs;
    }
    this.currentSensory=previousSensory;
    return {durationMs:elapsed,spikes,populationRateHz:elapsed>0?spikes*1000/elapsed/this.data.N:0,homeostaticMultiplier:this.homeostaticMultiplier};
  }

  snapshot() {return {config:{...this.config},motor:{...this.lastMotor},stats:this.lastFrameStats,activityHistory:this.activityHistory.slice(),simulatedMs:this.simulatedMs,effectiveDelayMs:this.effectiveDelayMs,computeBackend:this.kernel.describe(),integrator:this.integrator.id};}

  serialize() {
    return {
      version:6,
      config:{...this.config},
      v:this.v.slice(),g:this.g.slice(),refractory:this.refractory.slice(),
      pending:this.pending.map(x=>x.slice()),pendingTouched:this.pendingTouched.map(x=>Uint32Array.from(x)),pendingIndex:this.pendingIndex,pendingDtMs:this.config.brainDtMs,
      rng:this.rng.state(),simulatedMs:this.simulatedMs,totalSpikes:this.totalSpikes,motorFrameId:this.motorFrameId,homeostaticMultiplier:this.homeostaticMultiplier,
      decoderSmooth:{...this.decoder.smooth},decoderSmoothLegs:this.decoder.smoothLegs.slice(),decoderSmoothActuators:this.decoder.smoothActuators.slice(),decoderSmoothMotorUnits:this.decoder.smoothMotorUnits.slice(),stimulationCursor:Array.from(this.stimulationCursor.entries()),activityHistory:this.activityHistory.slice(),
      lastMotor:{...this.lastMotor},lastFrameStats:this.lastFrameStats?structuredClone(this.lastFrameStats):null,currentSensory:this.currentSensory?structuredClone(this.currentSensory):null,
      perturbations:this.perturbations.map(({key,rateHz,until})=>({key,rateHz,remainingMs:Math.max(0,until-this.simulatedMs)})),
      computeBackend:this.kernel.describe(),
    };
  }

  restore(state) {
    const serializedPending=state.pending;
    const serializedPendingTouched=state.pendingTouched;
    const serializedPendingIndex=state.pendingIndex;
    const serializedPendingDt=Number(state.pendingDtMs)||Number(state.config?.brainDtMs)||this.config.brainDtMs;
    if(state.config)this.setConfig(state.config);
    if(state.v?.length===this.v.length)this.v.set(state.v);
    if(state.g?.length===this.g.length)this.g.set(state.g);
    if(state.refractory?.length===this.refractory.length){
      this.refractory.set(state.refractory);
      // v3 could persist the old negative one-step spike sentinel. It means
      // "not refractory on the next step", not a new refractory cycle.
      for(let i=0;i<this.refractory.length;i++)if(this.refractory[i]<0)this.refractory[i]=0;
    }
    if(Array.isArray(serializedPending))this.migratePendingBuffers(serializedPending,serializedPendingTouched,serializedPendingIndex,serializedPendingDt);
    else if(state.pending0&&this.pending.length>=2)this.migratePendingBuffers([state.pending0,state.pending1||[]],null,0,serializedPendingDt);
    if(state.rng)this.rng.restore(state.rng);
    this.simulatedMs=Number(state.simulatedMs)||0;this.totalSpikes=Number(state.totalSpikes)||0;this.motorFrameId=Math.max(0,Math.floor(Number(state.motorFrameId)||0));this.homeostaticMultiplier=Number(state.homeostaticMultiplier)||1;
    if(state.decoderSmooth)Object.assign(this.decoder.smooth,state.decoderSmooth);
    if(state.decoderSmoothLegs?.length===this.decoder.smoothLegs.length)this.decoder.smoothLegs.set(state.decoderSmoothLegs);
    if(state.decoderSmoothActuators?.length===this.decoder.smoothActuators.length)this.decoder.smoothActuators.set(state.decoderSmoothActuators);
    if(state.decoderSmoothMotorUnits?.length===this.decoder.smoothMotorUnits.length)this.decoder.smoothMotorUnits.set(state.decoderSmoothMotorUnits);
    if(state.lastMotor)this.lastMotor={...this.lastMotor,...state.lastMotor};
    this.lastFrameStats=state.lastFrameStats?structuredClone(state.lastFrameStats):null;
    this.currentSensory=state.currentSensory?structuredClone(state.currentSensory):null;
    this.stimulationCursor=new Map(state.stimulationCursor||[]);this.activityHistory=Array.isArray(state.activityHistory)?state.activityHistory.slice(-240):[];
    this.perturbations=[];this.temporaryInputCounts.fill(0);
    for(const item of state.perturbations||[]){
      const indices=this.data.mapping.populations[item.key];
      const remainingMs=clamp(Number(item.remainingMs)||0,0,10000);
      if(!indices?.length||remainingMs<=0)continue;
      for(const index of indices)if(this.temporaryInputCounts[index]<65535)this.temporaryInputCounts[index]++;
      this.perturbations.push({key:item.key,indices,rateHz:clamp(Number(item.rateHz)||0,0,300),until:this.simulatedMs+remainingMs});
    }
  }
}
