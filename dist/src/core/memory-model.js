import {clamp, wrapAngle} from './geometry.js';

const angleDelta=(from,to)=>wrapAngle(to-from);
const dist=(a,b,c,d)=>Math.hypot(c-a,d-b);

/**
 * A disclosed path-integration and associative-memory hypothesis. The memory
 * never receives world coordinates. It integrates self-motion with drift and
 * records reward/threat events in that private, error-prone frame.
 */
export class AssociativeMemory {
  constructor(rng){this.rng=rng;this.reset();}
  reset(){this.estimatedX=0;this.estimatedY=0;this.estimatedHeading=0;this.food=[];this.water=[];this.threats=[];this.lastReward=-Infinity;this.lastThreat=-Infinity;this.totalLearned=0;this.drift=0;}
  updateSelfMotion(speed,turnRate,dt,noise=.28){
    this.estimatedHeading=wrapAngle(this.estimatedHeading+turnRate*dt+this.rng.normal()*noise*.007*Math.sqrt(dt*120));
    const noisySpeed=speed*(1+this.rng.normal()*noise*.018);
    this.estimatedX+=Math.cos(this.estimatedHeading)*noisySpeed*dt;
    this.estimatedY+=Math.sin(this.estimatedHeading)*noisySpeed*dt;
    this.drift=clamp(this.drift+noise*dt*.0008,0,1);
  }
  decay(dt){for(const list of [this.food,this.water,this.threats]){for(const m of list){m.age+=dt;m.strength*=Math.exp(-dt/m.decayTau);}for(let i=list.length-1;i>=0;i--)if(list[i].strength<.035||list[i].age>list[i].maxAge)list.splice(i,1);}}
  recordReward(kind,time,magnitude=1){if(time-this.lastReward<3.5)return false;this.lastReward=time;this.#upsert(kind==='water'?this.water:this.food,kind,clamp(.45+magnitude*.55,0,1),240,1000);this.totalLearned++;return true;}
  recordThreat(time,magnitude=1){if(time-this.lastThreat<1.8)return false;this.lastThreat=time;this.#upsert(this.threats,'threat',clamp(.45+magnitude*.55,0,1),120,500);this.totalLearned++;return true;}
  #upsert(list,kind,strength,decayTau,maxAge){
    let nearest=null,best=Infinity;for(const m of list){const d=dist(this.estimatedX,this.estimatedY,m.x,m.y);if(d<best){best=d;nearest=m;}}
    if(nearest&&best<8){nearest.x=nearest.x*.65+this.estimatedX*.35;nearest.y=nearest.y*.65+this.estimatedY*.35;nearest.strength=clamp(Math.max(nearest.strength,strength)+.08,0,1);nearest.age=0;nearest.visits++;return;}
    list.push({id:`${kind}-${this.totalLearned+1}`,kind,x:this.estimatedX,y:this.estimatedY,strength,age:0,decayTau,maxAge,visits:1});
    if(list.length>8)list.sort((a,b)=>b.strength-a.strength).splice(8);
  }
  guidance({hunger=0,thirst=0,stress=0}={}){
    if(stress>.68&&this.threats.length){const m=this.#best(this.threats,true);const away=wrapAngle(Math.atan2(m.y-this.estimatedY,m.x-this.estimatedX)+Math.PI);return {kind:'avoid',angle:angleDelta(this.estimatedHeading,away),confidence:clamp(m.strength*stress*(1-this.drift*.3),0,1),distance:dist(this.estimatedX,this.estimatedY,m.x,m.y)};}
    let list=null,kind=null,need=0;if(hunger>thirst+.08&&this.food.length){list=this.food;kind='food';need=hunger;}else if(thirst>.35&&this.water.length){list=this.water;kind='water';need=thirst;}else if(hunger>.4&&this.food.length){list=this.food;kind='food';need=hunger;}
    if(!list)return {kind:null,angle:0,confidence:0,distance:Infinity};
    const m=this.#best(list,false),d=dist(this.estimatedX,this.estimatedY,m.x,m.y),angle=angleDelta(this.estimatedHeading,Math.atan2(m.y-this.estimatedY,m.x-this.estimatedX));
    return {kind,angle,confidence:clamp(m.strength*need*Math.max(.18,Math.min(1,d/6))*(1-this.drift*.3),0,1),distance:d};
  }
  #best(list,nearest){let chosen=null,score=-Infinity;for(const m of list){const d=dist(this.estimatedX,this.estimatedY,m.x,m.y),s=nearest?m.strength/(1+d*.05):m.strength*(.7+.3*Math.min(1,d/20));if(s>score){score=s;chosen=m;}}return chosen;}
  snapshot(){const map=m=>({id:m.id,kind:m.kind,x:m.x,y:m.y,strength:m.strength,age:m.age,visits:m.visits,distance:dist(this.estimatedX,this.estimatedY,m.x,m.y)});return {estimatedPose:{x:this.estimatedX,y:this.estimatedY,heading:this.estimatedHeading,drift:this.drift},food:this.food.map(map),water:this.water.map(map),threats:this.threats.map(map),totalLearned:this.totalLearned};}
  serialize(){return {estimatedX:this.estimatedX,estimatedY:this.estimatedY,estimatedHeading:this.estimatedHeading,food:structuredClone(this.food),water:structuredClone(this.water),threats:structuredClone(this.threats),lastReward:this.lastReward,lastThreat:this.lastThreat,totalLearned:this.totalLearned,drift:this.drift};}
  restore(s={}){for(const key of ['estimatedX','estimatedY','estimatedHeading','lastReward','lastThreat','totalLearned','drift'])if(Number.isFinite(s[key]))this[key]=s[key];for(const key of ['food','water','threats'])this[key]=Array.isArray(s[key])?structuredClone(s[key]):[];}
}
