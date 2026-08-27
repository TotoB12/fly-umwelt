import {
  ANTENNA_OFFSET,ANTENNA_SEPARATION,FLY_RADIUS,MAX_RAY_DISTANCE,RETINA_FOV,RETINA_RAYS,WORLD_DT,
  modelConfigFor,normalizeModelMode,
} from './constants.js';
import {clamp,pointInCircle,pointInRect,rayCircle,rayRect,resolveCircleRect,wrapAngle} from './geometry.js';
import {createSensoryPacket,sanitizeMotorPacket} from './protocol.js';
import {normalizeRoom} from './room.js';
import {Xoshiro128} from './prng.js';
import {VncController} from './vnc-controller.js';
import {AssociativeMemory} from './memory-model.js';
import {PhysiologyModel} from './physiology-model.js';

const angleDelta=(from,to)=>wrapAngle(to-from);
const peakPositive=values=>{let peak=0;for(const value of values)if(Number.isFinite(value)&&value>peak)peak=value;return peak;};
const objectRayDistance=(ox,oy,dx,dy,obj,maxDist)=>obj.kind==='wall'||obj.kind==='shelter'?rayRect(ox,oy,dx,dy,obj,maxDist):rayCircle(ox,oy,dx,dy,obj,maxDist);
const reflectance=kind=>({wall:.2,shelter:.07,food:.72,water:.88,threat:.94,boundary:.14}[kind]??.3);

function lightAt(room,x,y){
  let value=room.ambientLight;
  for(const obj of room.objects)if(obj.kind==='light')value+=obj.strength*Math.max(0,1-Math.hypot(obj.x-x,obj.y-y)/Math.max(1,obj.r));
  for(const obj of room.objects)if(obj.kind==='shelter'&&x>=obj.x&&x<=obj.x+obj.w&&y>=obj.y&&y<=obj.y+obj.h)value*=.18;
  return clamp(value,0,1.5);
}

function odorAt(room,x,y,time=0){
  const channels=[0,0,0];
  for(const obj of room.objects){
    if((obj.kind==='food'||obj.kind==='water')&&obj.amount<=0)continue;
    let channel=-1,strength=0;
    if(obj.kind==='food'){channel=0;strength=obj.odor*obj.amount;}
    if(obj.kind==='water'){channel=1;strength=obj.odor*obj.amount;}
    if(obj.kind==='threat'){channel=2;strength=obj.odor;}
    if(channel<0)continue;
    const dx=obj.x-x,dy=obj.y-y,d2=dx*dx+dy*dy;
    // Slow plume fluctuations make successive samples informative without giving
    // the agent a source bearing or coordinate.
    const plume=.9+.1*Math.sin(time*.63+obj.x*.11+obj.y*.17+Math.atan2(dy,dx)*2.7);
    channels[channel]+=strength*plume/(1+d2*.016);
  }
  return channels.map(value=>clamp(value,0,1.5));
}

export class WorldModel {
  constructor(room,seed=0x4f1a9,mode='natural'){
    this.room=normalizeRoom(room);this.seed=seed;this.rng=new Xoshiro128(seed);this.time=0;this.mode=normalizeModelMode(mode);this.config=modelConfigFor(this.mode);
    this.fly={x:this.room.spawn.x,y:this.room.spawn.y,heading:this.room.spawn.heading,speed:0,turnRate:0,radius:FLY_RADIUS,alive:true};
    this.physiology=new PhysiologyModel();this.memory=new AssociativeMemory(this.rng);this.vnc=new VncController(this.rng,this.config.vncProfile);
    this.latestBrain=sanitizeMotorPacket({});
    this.lastBehavior=this.vnc.snapshot();this.touchPulse=new Float32Array(6);this.contactInput=new Float32Array(6);this.intervention={touch:new Float32Array(6),airflow:0};
    this.lastDepth=new Float32Array(RETINA_RAYS).fill(MAX_RAY_DISTANCE);this.lastBrightness=new Float32Array(RETINA_RAYS).fill(this.room.ambientLight);
    this.retinaDepth=new Float32Array(RETINA_RAYS).fill(MAX_RAY_DISTANCE);this.retinaBrightness=new Float32Array(RETINA_RAYS).fill(this.room.ambientLight);
    this.retinaMotion=new Float32Array(RETINA_RAYS);this.retinaLoom=new Float32Array(RETINA_RAYS);this.retinaProximity=new Float32Array(RETINA_RAYS);
    this.lastSensory=null;this.lastTaste={foodId:null,waterId:null};this.lastOdor={left:[0,0,0],right:[0,0,0]};
    this.trail=[];this.eventLog=[];this.lastRoomEditLogTime=-Infinity;this.lastMemoryRecord='';this.stepCount=0;
  }

  setMode(mode){this.mode=normalizeModelMode(mode);this.config=modelConfigFor(this.mode);this.vnc.setProfile(this.config.vncProfile);this.log('model',`${this.mode==='natural'?'Natural hybrid':this.mode==='connectome'?'Connectome dominant':'Evoked'} mode selected.`);}
  setBrain(motor={}){this.latestBrain=sanitizeMotorPacket(motor);}
  reset(room=this.room,seed=this.seed){Object.assign(this,new WorldModel(room,seed,this.mode));}
  log(type,message){this.eventLog.unshift({time:this.time,type,message});if(this.eventLog.length>70)this.eventLog.length=70;}
  touch(region=0,intensity=1){this.intervention.touch[clamp(region|0,0,5)]=clamp(intensity,0,2);this.log('observer',`Touch stimulus applied to leg ${['LF','LM','LH','RF','RM','RH'][clamp(region|0,0,5)]}.`);}
  airflow(intensity=1){this.intervention.airflow=clamp(intensity,0,2);this.log('observer','Airflow stimulus applied.');}

  updateRoom(nextRoom){
    const old=new Map(this.room.objects.map(o=>[o.id,o]));
    this.room=normalizeRoom(nextRoom);
    for(const obj of this.room.objects){
      const prior=old.get(obj.id);if(!prior)continue;
      if((obj.kind==='food'||obj.kind==='water')&&Number.isFinite(prior.amount))obj.amount=Math.min(obj.amount,prior.amount);
      if(obj.kind==='threat'&&Number.isFinite(prior.heading))obj.heading=prior.heading;
    }
    this.reconcilePosition();
    if(this.time-this.lastRoomEditLogTime>.45){this.log('observer','Room edited while neural, memory and physiological state continued.');this.lastRoomEditLogTime=this.time;}
  }

  reconcilePosition(){
    this.fly.x=clamp(this.fly.x,FLY_RADIUS,this.room.width-FLY_RADIUS);this.fly.y=clamp(this.fly.y,FLY_RADIUS,this.room.height-FLY_RADIUS);
    for(let pass=0;pass<8;pass++){
      let moved=false;
      for(const obj of this.room.objects)if(obj.kind==='wall'){
        const hit=resolveCircleRect(this.fly,FLY_RADIUS,obj);if(hit)moved=true;
      }
      if(!moved)break;
    }
  }

  updateThreats(dt){
    for(const obj of this.room.objects){
      if(obj.kind!=='threat'||obj.speed<=0)continue;
      obj.x+=Math.cos(obj.heading)*obj.speed*dt;obj.y+=Math.sin(obj.heading)*obj.speed*dt;
      if(obj.x<obj.r||obj.x>this.room.width-obj.r){obj.heading=Math.PI-obj.heading;obj.x=clamp(obj.x,obj.r,this.room.width-obj.r);}
      if(obj.y<obj.r||obj.y>this.room.height-obj.r){obj.heading=-obj.heading;obj.y=clamp(obj.y,obj.r,this.room.height-obj.r);}
      obj.heading=wrapAngle(obj.heading+this.rng.normal()*.012);
    }
  }

  registerLegContact(index,strength=1){
    const i=clamp(Number(index)|0,0,5);
    this.touchPulse[i]=Math.max(this.touchPulse[i],clamp(strength,0,2));
  }

  registerContact(normalX,normalY,strength=1){
    // The body collision normal points away from the obstacle; map the opposing
    // direction onto the anatomically nearest leg groups.
    const obstacleAngle=Math.atan2(-normalY,-normalX),relative=angleDelta(this.fly.heading,obstacleAngle),value=clamp(strength,0,2);
    const front=Math.abs(relative)<Math.PI/3,back=Math.abs(relative)>Math.PI*2/3;
    if(front){this.registerLegContact(0,value);this.registerLegContact(3,value);}
    else if(back){this.registerLegContact(2,value*.85);this.registerLegContact(5,value*.85);}
    if(relative<-.22){for(const i of [0,1,2])this.registerLegContact(i,value);}
    if(relative>.22){for(const i of [3,4,5])this.registerLegContact(i,value);}
  }

  resolveFootContacts(){
    const feet=this.vnc.footWorldPositions(this.fly);
    for(let i=0;i<feet.length;i++){
      const foot=feet[i];if(!foot.stance||foot.lift>.08)continue;
      let strength=0;
      if(foot.x<0||foot.x>this.room.width||foot.y<0||foot.y>this.room.height)strength=1;
      for(const obj of this.room.objects){
        if(obj.kind==='wall'&&pointInRect(foot.x,foot.y,obj))strength=Math.max(strength,1);
        else if(obj.kind==='threat'&&pointInCircle(foot.x,foot.y,obj))strength=Math.max(strength,1.35);
      }
      if(strength)this.registerLegContact(i,strength);
    }
  }

  resolveCollisions(){
    if(this.fly.x<FLY_RADIUS){this.fly.x=FLY_RADIUS;this.registerContact(1,0,1);}
    if(this.fly.x>this.room.width-FLY_RADIUS){this.fly.x=this.room.width-FLY_RADIUS;this.registerContact(-1,0,1);}
    if(this.fly.y<FLY_RADIUS){this.fly.y=FLY_RADIUS;this.registerContact(0,1,1);}
    if(this.fly.y>this.room.height-FLY_RADIUS){this.fly.y=this.room.height-FLY_RADIUS;this.registerContact(0,-1,1);}
    for(const obj of this.room.objects){
      if(obj.kind==='wall'){
        const hit=resolveCircleRect(this.fly,FLY_RADIUS,obj);
        if(hit){this.registerContact(hit.nx,hit.ny,1);this.fly.speed*=.08;}
      }else if(obj.kind==='threat'){
        const dx=this.fly.x-obj.x,dy=this.fly.y-obj.y,d=Math.hypot(dx,dy),minimum=FLY_RADIUS+obj.r;
        if(d<minimum&&d>1e-6){const nx=dx/d,ny=dy/d;this.fly.x+=nx*(minimum-d);this.fly.y+=ny*(minimum-d);this.registerContact(nx,ny,1.5);this.fly.speed*=.12;this.physiology.punishmentPulse=clamp(this.physiology.punishmentPulse+.2,0,1);}
      }
    }
  }

  currentTaste(){
    const taste=new Float32Array(3);let foodId=null,waterId=null;
    const mouthX=this.fly.x+Math.cos(this.fly.heading)*(FLY_RADIUS+.38),mouthY=this.fly.y+Math.sin(this.fly.heading)*(FLY_RADIUS+.38);
    for(const obj of this.room.objects){
      if((obj.kind!=='food'&&obj.kind!=='water')||obj.amount<=0)continue;
      if(Math.hypot(obj.x-mouthX,obj.y-mouthY)>obj.r+.48)continue;
      if(obj.kind==='food'){taste[0]=Math.max(taste[0],obj.amount);foodId=obj.id;}
      else {taste[1]=Math.max(taste[1],obj.amount);waterId=obj.id;}
    }
    return {taste,foodId,waterId};
  }

  consume(id,kind,amount){
    const obj=this.room.objects.find(o=>o.id===id&&o.kind===kind);if(!obj||obj.amount<=0)return 0;
    const consumed=Math.min(obj.amount,Math.max(0,amount));obj.amount-=consumed;return consumed;
  }

  step(dt=WORLD_DT){
    if(!this.physiology.alive){this.fly.alive=false;return;}
    this.updateThreats(dt);
    // Contact from the previous physical step remains available long enough for
    // the modeled VNC to react. New collisions are collected after movement and
    // become input on the following 10 ms step.
    this.contactInput.set(this.touchPulse);
    for(let i=0;i<this.intervention.touch.length;i++)this.contactInput[i]=Math.max(this.contactInput[i],this.intervention.touch[i]);
    this.touchPulse.fill(0);
    const preTaste=this.currentTaste();
    const behavior=this.vnc.step({brain:this.latestBrain,touch:this.contactInput,taste:preTaste.taste,physiology:this.physiology.snapshot(),dt});
    this.lastBehavior=behavior;
    this.fly.speed=behavior.speed;
    this.fly.turnRate=behavior.turnRate;
    this.fly.heading=wrapAngle(this.fly.heading+this.fly.turnRate*dt);
    const previousX=this.fly.x,previousY=this.fly.y;
    this.fly.x+=Math.cos(this.fly.heading)*this.fly.speed*dt;this.fly.y+=Math.sin(this.fly.heading)*this.fly.speed*dt;
    this.resolveFootContacts();
    this.resolveCollisions();
    const moved=Math.hypot(this.fly.x-previousX,this.fly.y-previousY),movement=clamp(moved/Math.max(dt,1e-6)/8,0,1);
    this.memory.updateSelfMotion(this.fly.speed,this.fly.turnRate,dt,this.mode==='natural'?.27:.16);this.memory.decay(dt);

    const contact=this.currentTaste();this.lastTaste=contact;
    let foodConsumed=0,waterConsumed=0;
    if(contact.foodId&&behavior.feed>.18){foodConsumed=this.consume(contact.foodId,'food',dt*.038*behavior.feed);this.physiology.applyConsumption('food',foodConsumed);}
    if(contact.waterId&&behavior.drink>.18){waterConsumed=this.consume(contact.waterId,'water',dt*.046*behavior.drink);this.physiology.applyConsumption('water',waterConsumed);}
    if(foodConsumed>.00015&&this.memory.recordReward('food',this.time,behavior.feed)){this.lastMemoryRecord='food';this.log('memory','A reward trace formed in the fly’s drifting internal map.');}
    if(waterConsumed>.00015&&this.memory.recordReward('water',this.time,behavior.drink)){this.lastMemoryRecord='water';this.log('memory','A water reward trace formed in the fly’s drifting internal map.');}

    // Internal stress and aversive memory must be driven by embodied evidence,
    // not privileged access to a room object's identity or coordinates. The
    // retina, descending neural output and tactile/nociceptive contact are the
    // only available threat evidence here.
    const looming=peakPositive(this.retinaLoom);
    const proximity=peakPositive(this.retinaProximity);
    const tactile=Math.max(peakPositive(this.contactInput),peakPositive(this.touchPulse))/1.5;
    const peripheralThreat=clamp(Math.max(
      looming*.95,
      Math.max(0,proximity-.62)*1.45,
      tactile*.86,
      this.physiology.punishmentPulse*.72,
    ),0,1);
    const centralThreat=clamp(this.latestBrain.escape*.65,0,1);
    const threat=Math.max(centralThreat,peripheralThreat*.82);
    if(threat>.68&&this.memory.recordThreat(this.time,threat)){this.lastMemoryRecord='threat';this.log('memory','An aversive trace formed in the fly’s internal map.');}
    this.physiology.update({dt,movement,threat,feeding:foodConsumed>0,drinking:waterConsumed>0,escape:behavior.escape});
    this.fly.alive=this.physiology.alive;

    this.intervention.airflow*=Math.exp(-dt*4.8);for(let i=0;i<this.intervention.touch.length;i++)this.intervention.touch[i]*=Math.exp(-dt*8);
    this.time+=dt;this.stepCount++;
    if(!this.trail.length||Math.hypot(this.fly.x-this.trail[this.trail.length-1].x,this.fly.y-this.trail[this.trail.length-1].y)>.55){this.trail.push({x:this.fly.x,y:this.fly.y,t:this.time});if(this.trail.length>700)this.trail.shift();}
  }

  sense(dtMs=50){
    for(let i=0;i<RETINA_RAYS;i++){
      const rel=(i/(RETINA_RAYS-1)-.5)*RETINA_FOV,angle=this.fly.heading+rel,dx=Math.cos(angle),dy=Math.sin(angle);
      let nearest=MAX_RAY_DISTANCE,kind='boundary';
      const boundaries=[
        rayRect(this.fly.x,this.fly.y,dx,dy,{x:-1,y:-1,w:this.room.width+2,h:1},nearest),
        rayRect(this.fly.x,this.fly.y,dx,dy,{x:-1,y:this.room.height,w:this.room.width+2,h:1},nearest),
        rayRect(this.fly.x,this.fly.y,dx,dy,{x:-1,y:0,w:1,h:this.room.height},nearest),
        rayRect(this.fly.x,this.fly.y,dx,dy,{x:this.room.width,y:0,w:1,h:this.room.height},nearest),
      ].filter(value=>value!==null);
      if(boundaries.length)nearest=Math.min(...boundaries);
      for(const obj of this.room.objects){
        if(obj.kind==='light')continue;if((obj.kind==='food'||obj.kind==='water')&&obj.amount<=0)continue;
        const value=objectRayDistance(this.fly.x,this.fly.y,dx,dy,obj,nearest);if(value!==null&&value<nearest){nearest=value;kind=obj.kind;}
      }
      const priorDepth=this.lastDepth[i],priorBrightness=this.lastBrightness[i];
      const obstacleLike=kind==='boundary'||kind==='wall'||kind==='threat';
      const nearRange=kind==='threat'?16:9;
      const proximity=obstacleLike?clamp(1-nearest/nearRange,0,1):0;
      const rawLoom=clamp((priorDepth-nearest)/Math.max(1,priorDepth),-1,1);
      const loom=obstacleLike?rawLoom:0;
      const sampleX=this.fly.x+dx*Math.min(nearest,8),sampleY=this.fly.y+dy*Math.min(nearest,8),illumination=lightAt(this.room,sampleX,sampleY);
      let brightness=illumination*reflectance(kind);if(kind==='threat')brightness=clamp(brightness+.25,0,1.5);
      const motion=clamp(Math.abs(brightness-priorBrightness)*1.55+Math.abs(loom)*.72+Math.abs(this.fly.turnRate)*.012,0,1);
      this.retinaDepth[i]=nearest;this.retinaBrightness[i]=brightness;this.retinaMotion[i]=motion;this.retinaLoom[i]=loom;this.retinaProximity[i]=proximity;
      this.lastDepth[i]=nearest;this.lastBrightness[i]=brightness;
    }
    const hx=Math.cos(this.fly.heading),hy=Math.sin(this.fly.heading),sx=-hy,sy=hx,ax=this.fly.x+hx*ANTENNA_OFFSET,ay=this.fly.y+hy*ANTENNA_OFFSET;
    const leftOdor=odorAt(this.room,ax+sx*ANTENNA_SEPARATION,ay+sy*ANTENNA_SEPARATION,this.time),rightOdor=odorAt(this.room,ax-sx*ANTENNA_SEPARATION,ay-sy*ANTENNA_SEPARATION,this.time);
    this.lastOdor={left:leftOdor,right:rightOdor};
    const contact=this.currentTaste();this.lastTaste=contact;
    const guidance=this.mode==='natural'?this.memory.guidance(this.physiology):{kind:null,angle:0,confidence:0,distance:Infinity};
    const right=Math.max(0,Math.sin(guidance.angle))*guidance.confidence,left=Math.max(0,-Math.sin(guidance.angle))*guidance.confidence,forward=Math.max(0,Math.cos(guidance.angle))*guidance.confidence;
    const packet=createSensoryPacket({
      retinaBrightness:this.retinaBrightness,retinaMotion:this.retinaMotion,retinaLoom:this.retinaLoom,retinaProximity:this.retinaProximity,
      odorLeft:leftOdor,odorRight:rightOdor,touch:this.contactInput,taste:contact.taste,
      airflow:[this.intervention.airflow,this.intervention.airflow],temperature:this.room.temperature,
      proprioception:this.vnc.proprioceptionVector(),metabolic:this.physiology.metabolicVector(),
      memoryCue:[left,forward,right,guidance.confidence],ambientNoise:.02,dtMs,
    });
    this.lastSensory={packet,guidance,summary:{odorLeft:leftOdor,odorRight:rightOdor,taste:Array.from(contact.taste),light:lightAt(this.room,this.fly.x,this.fly.y),touch:Array.from(this.contactInput),retinaProximity:Array.from(this.retinaProximity),retinaBrightness:Array.from(this.retinaBrightness)}};
    return packet;
  }

  snapshot(includeRoom=false){
    return {
      time:this.time,mode:this.mode,
      fly:{...this.fly},physiology:this.physiology.snapshot(),behavior:{...this.lastBehavior,...this.vnc.snapshot()},brain:{...this.latestBrain},
      senses:this.lastSensory?{...this.lastSensory.summary,guidance:this.lastSensory.guidance}:null,memory:this.memory.snapshot(),
      retina:{brightness:this.retinaBrightness.slice(),proximity:this.retinaProximity.slice(),motion:this.retinaMotion.slice(),loom:this.retinaLoom.slice()},
      trail:this.trail.slice(),events:this.eventLog.slice(0,40),room:includeRoom?structuredClone(this.room):undefined,
    };
  }

  serialize(){return {version:4,mode:this.mode,time:this.time,room:structuredClone(this.room),fly:{...this.fly},physiology:this.physiology.serialize(),memory:this.memory.serialize(),vnc:this.vnc.serialize(),latestBrain:{...this.latestBrain},trail:this.trail.slice(),events:this.eventLog.slice(),rng:this.rng.state(),lastDepth:this.lastDepth.slice(),lastBrightness:this.lastBrightness.slice()};}
  restore(state={}){
    if(state.room)this.room=normalizeRoom(state.room);if(state.mode)this.setMode(state.mode);if(Number.isFinite(state.time))this.time=state.time;
    if(state.fly)Object.assign(this.fly,state.fly);if(state.physiology)this.physiology.restore(state.physiology);if(state.memory)this.memory.restore(state.memory);if(state.vnc)this.vnc.restore(state.vnc);if(state.latestBrain)this.latestBrain=sanitizeMotorPacket(state.latestBrain);
    if(Array.isArray(state.trail))this.trail=state.trail.slice(-700);if(Array.isArray(state.events))this.eventLog=state.events.slice(0,70);if(state.rng)this.rng.restore(state.rng);
    this.touchPulse.fill(0);this.contactInput.fill(0);
    if(state.lastDepth?.length===this.lastDepth.length)this.lastDepth.set(state.lastDepth);if(state.lastBrightness?.length===this.lastBrightness.length)this.lastBrightness.set(state.lastBrightness);this.reconcilePosition();
  }
}
