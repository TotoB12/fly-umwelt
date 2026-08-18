import {clamp} from './geometry.js';

const smooth=(current,target,rate,dt)=>current+(target-current)*(1-Math.exp(-rate*dt));
const signedChoice=(rng,bias)=>rng.next()<clamp(.5+bias*.45,.05,.95)?1:-1;

/**
 * Disclosed VNC/body model.
 *
 * The brain supplies low-dimensional neural evidence. This layer supplies the
 * missing rhythm generation, walk/stop bouts, finite body saccades and local
 * tactile escape that a brain-only FAFB volume cannot contain. It never sees
 * objects, coordinates, targets, bearings or a desired heading.
 *
 * Natural-profile constants follow the qualitative structure measured in
 * freely walking Drosophila: mostly straight translation, stochastic ~30°
 * body saccades, and separate walk/stop transitions. Strong visual or tactile
 * evidence can trigger larger finite escape turns.
 */
export class VncController {
  constructor(rng,profile='natural'){this.rng=rng;this.setProfile(profile);this.reset();}
  setProfile(profile='natural'){this.profile=profile;}
  reset(){
    this.state='rest';this.stateTimer=.16;this.boutTimer=0;this.contactCooldown=0;
    this.pendingContactTurn=0;this.saccadeSign=1;this.saccadeSpeed=0;this.turnDrift=0;
    this.speed=0;this.turnRate=0;this.lastOdor=0;this.odorDerivative=0;
    this.odorEncounterTrace=0;this.odorPresent=false;this.encounterCount=0;this.encounterCooldown=0;
    this.ingestionCooldown=0;this.mealTime=0;this.mealLimit=0;
    this.behaviorReason='settling after initialization';
  }
  enterRest(duration=.35,reason='brief pause'){this.state='rest';this.stateTimer=duration;this.behaviorReason=reason;}
  enterWalk(duration=1.5,reason='walking bout'){this.state='walk';this.boutTimer=duration;this.behaviorReason=reason;}
  enterReverse(sign,reason='local contact reflex'){
    this.state='reverse';this.stateTimer=this.rng.range(.14,.26);this.pendingContactTurn=sign||signedChoice(this.rng,0);this.behaviorReason=reason;
  }
  enterIngestion(kind,reason){
    this.state=kind;this.mealTime=0;this.mealLimit=kind==='feed'?this.rng.range(2.2,6.8):this.rng.range(1.5,4.8);this.stateTimer=this.mealLimit;this.behaviorReason=reason;
  }
  enterSaccade(sign,amplitudeDeg=30,reason='steering saccade'){
    const amplitude=clamp(Math.abs(amplitudeDeg),8,125)*Math.PI/180;
    this.state='saccade';this.saccadeSign=sign||signedChoice(this.rng,0);
    // Short finite turns. The exact angular speed is an engineering fit to the
    // 2D body, while the separated-translation/saccade structure is biological.
    this.saccadeSpeed=this.saccadeSign*this.rng.range(6.2,9.4);
    this.stateTimer=amplitude/Math.abs(this.saccadeSpeed);this.behaviorReason=reason;
  }

  updateOdorHistory(odor,dt){
    this.odorDerivative=smooth(this.odorDerivative,(odor-this.lastOdor)/Math.max(dt,.001),4,dt);
    this.lastOdor=smooth(this.lastOdor,odor,7,dt);
    this.odorEncounterTrace*=Math.exp(-dt/2);this.encounterCooldown=Math.max(0,this.encounterCooldown-dt);
    const present=odor>.105;
    if(this.encounterCooldown<=0&&((present&&!this.odorPresent)||this.odorDerivative>.8)){this.odorEncounterTrace=clamp(this.odorEncounterTrace+1,0,6);this.encounterCount++;this.encounterCooldown=.1;}
    this.odorPresent=present;
  }

  step({brain={},touch=[],taste=[],physiology={},dt=.01}={}){
    this.contactCooldown=Math.max(0,this.contactCooldown-dt);this.ingestionCooldown=Math.max(0,this.ingestionCooldown-dt);
    const front=clamp(Number(touch[0]||0),0,2),right=clamp(Number(touch[1]||0),0,2),back=clamp(Number(touch[2]||0),0,2),left=clamp(Number(touch[3]||0),0,2);
    const fatigue=clamp(Number(physiology.fatigue||0),0,1),sleep=clamp(Number(physiology.sleepPressure||0),0,1),stress=clamp(Number(physiology.stress||0),0,1),hunger=clamp(Number(physiology.hunger||0),0,1),thirst=clamp(Number(physiology.thirst||0),0,1);
    const natural=this.profile==='natural',direct=this.profile==='direct',evoked=this.profile==='evoked';

    const odor=clamp(Number(brain.odorPresence||0),0,1);this.updateOdorHistory(odor,dt);

    // Local mechanosensory/VNC reflex. A real FAFB brain-only graph omits most
    // of this loop; keeping it here prevents physically impossible wall pushing.
    if(this.contactCooldown<=0&&this.state!=='reverse'){
      if(front>.3||(left>.72&&right>.72)){
        const away=right>left?-.95:left>right?.95:signedChoice(this.rng,0);
        this.contactCooldown=.45;this.enterReverse(away,'tactile obstacle reflex');
      }else if(Math.max(left,right)>.82&&this.state==='walk'){
        // A shallow, finite correction retains boundary exploration without
        // allowing a side contact to become an endless wall circle.
        const away=right>left?-.75:.75;
        this.contactCooldown=.32;this.enterSaccade(away,this.rng.range(18,38),'side-contact correction');
      }
    }

    const sweetContact=Number(taste[0]||0)>.05,waterContact=Number(taste[1]||0)>.05;
    const feedCommand=clamp(Number(brain.feed||0),0,1),drinkCommand=clamp(Math.max(brain.drink||0,(brain.feed||0)*.45),0,1);
    if(this.state==='feed'||this.state==='drink'){
      this.mealTime+=dt;this.stateTimer=Math.max(0,this.mealLimit-this.mealTime);
      const contact=this.state==='feed'?sweetContact:waterContact,command=this.state==='feed'?feedCommand:drinkCommand,need=this.state==='feed'?hunger:thirst;
      if(!contact||command<.12||this.mealTime>=this.mealLimit||need<.075){
        this.ingestionCooldown=this.rng.range(.8,2.5);this.enterRest(this.rng.range(.12,.42),this.mealTime>=this.mealLimit?'meal bout ended':'ingestion contact ended');
      }
    }else if(this.ingestionCooldown<=0&&sweetContact&&feedCommand>.25)this.enterIngestion('feed','proboscis output and sweet contact');
    else if(this.ingestionCooldown<=0&&waterContact&&drinkCommand>.24)this.enterIngestion('drink','ingestion output and water contact');
    if((brain.escape||0)>.46&&this.state!=='reverse'&&this.state!=='saccade'){
      const sign=signedChoice(this.rng,clamp((brain.visualBias||0)+(brain.turn||0)*.35,-1,1));
      this.enterSaccade(sign,this.rng.range(58,108),'defensive neural output');
    }

    let drive;
    if(natural){
      drive=clamp(.22+(brain.forward||0)*.55+(brain.centralArousal||0)*.3+hunger*.1-stress*.06-fatigue*.46-sleep*.22,0,1);
    }else drive=clamp((brain.forward||0)*(direct?1:.95),0,1);
    drive*=1-clamp(brain.halt||0,0,1)*.92;

    // Direction is evidence, not a continuous motor command. It changes which
    // way a finite saccade is chosen. Sustained steering is deliberately tiny.
    const bias=clamp(
      (brain.turn||0)*(natural?.26:.62)+(brain.odorBias||0)*(natural?.78:.25)+(brain.visualBias||0)*(natural?.9:.55)+(brain.memoryBias||0)*(natural?.48:0),
      -1,1,
    );
    const risk=clamp(Math.max(brain.visualRisk||0,stress*.4),0,1);
    const encounterStrength=clamp(this.odorEncounterTrace/3,0,1);

    if(this.state==='rest'){
      this.stateTimer-=dt;
      // Recent odor encounters make stopped flies resume walking sooner.
      if(this.stateTimer<=0&&drive>(evoked?.12:.075))this.enterWalk(this.rng.range(.9,3.8)*(1-fatigue*.3)*(1+encounterStrength*.35),natural?'spontaneous walking bout':'descending walking drive');
    }else if(this.state==='walk'){
      this.boutTimer-=dt;
      const lostOdor=natural&&odor>.035&&this.odorDerivative<-.16;
      // Natural mode uses stochastic, stereotyped saccades. Odor evidence
      // biases direction, not the magnitude or base occurrence rate.
      const baseTurnRate=natural?1.05:.3;
      const turnHazard=baseTurnRate+risk*1.6+(lostOdor?.35:0);
      if(risk>.62){
        const sign=signedChoice(this.rng,clamp((brain.visualBias||0)*1.3+bias*.2,-1,1));
        this.enterSaccade(sign,this.rng.range(52,98),'near-obstacle avoidance');
      }else if(this.rng.next()<turnHazard*dt){
        const sign=signedChoice(this.rng,bias);
        const amplitude=natural?clamp(30+this.rng.normal()*10+(lostOdor?10:0),10,70):clamp(24+Math.abs(bias)*26+this.rng.normal()*10,8,85);
        this.enterSaccade(sign,amplitude,lostOdor?'odor-loss reorientation':Math.abs(bias)>.22?'brain-biased saccade':'spontaneous saccade');
      }else if(this.boutTimer<=0){
        // Odor encounters prolong walking and shorten pauses, matching the
        // walk/stop structure seen in plume navigation.
        const stopProbability=natural?clamp(.45+fatigue*.18-encounterStrength*.3,.08,.72):.25;
        if(natural&&this.rng.next()<stopProbability)this.enterRest(this.rng.range(.1,.75)*(1-encounterStrength*.55)+fatigue*.55,'inter-bout pause');
        else this.enterWalk(this.rng.range(.8,3.4)*(1+encounterStrength*.3),'continued exploration');
      }
    }else if(this.state==='reverse'){
      this.stateTimer-=dt;if(this.stateTimer<=0)this.enterSaccade(this.pendingContactTurn,this.rng.range(48,95),'turning away after contact');
    }else if(this.state==='saccade'){
      this.stateTimer-=dt;if(this.stateTimer<=0)this.enterWalk(this.rng.range(.75,2.8)*(1+encounterStrength*.25),'straight run after saccade');
    }

    let targetSpeed=0,targetTurn=0;
    if(this.state==='walk'){
      // Freely walking flies in plume experiments averaged ~10 mm/s. The
      // virtual body uses a nearby range, reduced by fatigue and weak drive.
      targetSpeed=(4.6+5.8*drive)*(1-fatigue*.3);
      const sustainedBias=natural?clamp((brain.odorBias||0)*.18+(brain.visualBias||0)*.12+(brain.memoryBias||0)*.1,-.22,.22):bias*.22;
      this.turnDrift=smooth(this.turnDrift,sustainedBias,1.5,dt);
      targetTurn=clamp(this.turnDrift,-.24,.24);
    }else if(this.state==='saccade'){
      targetSpeed=(4.2+4.8*drive)*(1-risk*.1);targetTurn=this.saccadeSpeed;
    }else if(this.state==='reverse'){
      targetSpeed=-(2.5+2*Math.max(brain.reverse||0,.25));targetTurn=0;
    }

    if((brain.reverse||0)>.54&&this.state!=='reverse'&&this.state!=='saccade')this.enterReverse(signedChoice(this.rng,bias),'reverse descending output');
    if((brain.halt||0)>.74&&this.state!=='feed'&&this.state!=='drink')this.enterRest(.18,'halting output');

    this.speed=smooth(this.speed,targetSpeed,this.state==='saccade'?11:7,dt);
    this.turnRate=smooth(this.turnRate,targetTurn,this.state==='saccade'?26:9,dt);
    if(Math.abs(this.speed)<.025)this.speed=0;if(Math.abs(this.turnRate)<.006)this.turnRate=0;

    return {speed:this.speed,turnRate:this.turnRate,state:this.state,reason:this.behaviorReason,drive,bias,feed:this.state==='feed'?clamp(brain.feed||0,0,1):0,drink:this.state==='drink'?clamp(brain.drink||0,0,1):0,escape:clamp(brain.escape||0,0,1)};
  }
  snapshot(){return {profile:this.profile,state:this.state,reason:this.behaviorReason,speed:this.speed,turnRate:this.turnRate,boutRemaining:Math.max(0,this.boutTimer),stateRemaining:Math.max(0,this.stateTimer),odorDerivative:this.odorDerivative,odorEncounterTrace:this.odorEncounterTrace,encounterCount:this.encounterCount,mealRemaining:Math.max(0,this.mealLimit-this.mealTime)};}
  serialize(){return {profile:this.profile,state:this.state,stateTimer:this.stateTimer,boutTimer:this.boutTimer,contactCooldown:this.contactCooldown,pendingContactTurn:this.pendingContactTurn,saccadeSign:this.saccadeSign,saccadeSpeed:this.saccadeSpeed,turnDrift:this.turnDrift,speed:this.speed,turnRate:this.turnRate,lastOdor:this.lastOdor,odorDerivative:this.odorDerivative,odorEncounterTrace:this.odorEncounterTrace,odorPresent:this.odorPresent,encounterCount:this.encounterCount,encounterCooldown:this.encounterCooldown,ingestionCooldown:this.ingestionCooldown,mealTime:this.mealTime,mealLimit:this.mealLimit,behaviorReason:this.behaviorReason};}
  restore(state={}){Object.assign(this,state);}
}
