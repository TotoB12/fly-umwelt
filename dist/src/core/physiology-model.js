import {clamp} from './geometry.js';

const approach=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));

/**
 * Lightweight homeostatic body state. These variables are explicit hypotheses,
 * not measurements from the scanned FlyWire individual.
 */
export class PhysiologyModel {
  constructor(){this.reset();}
  reset(){
    this.age=0;this.energy=.78;this.hydration=.84;this.gutEnergy=.08;this.gutWater=.06;
    this.hunger=.25;this.thirst=.18;this.fatigue=.1;this.sleepPressure=.2;
    this.arousal=.24;this.stress=.05;this.rewardPulse=0;this.punishmentPulse=0;
    this.alive=true;this.feeding=false;this.drinking=false;this.consumedFood=0;this.consumedWater=0;
  }
  applyConsumption(kind,amount){
    const value=Math.max(0,Number(amount)||0);if(!value)return;
    if(kind==='food'){this.gutEnergy=clamp(this.gutEnergy+value*1.7,0,1);this.rewardPulse=clamp(this.rewardPulse+value*16,0,1);this.consumedFood+=value;}
    if(kind==='water'){this.gutWater=clamp(this.gutWater+value*1.9,0,1);this.rewardPulse=clamp(this.rewardPulse+value*12,0,1);this.consumedWater+=value;}
  }
  update({dt,movement=0,threat=0,feeding=false,drinking=false,escape=0}={}){
    if(!this.alive)return;
    this.age+=dt;this.feeding=Boolean(feeding);this.drinking=Boolean(drinking);
    this.rewardPulse*=Math.exp(-dt/1.1);this.punishmentPulse*=Math.exp(-dt/1.4);
    const absorbedEnergy=Math.min(this.gutEnergy,dt*.0055),absorbedWater=Math.min(this.gutWater,dt*.008);
    this.gutEnergy-=absorbedEnergy;this.gutWater-=absorbedWater;
    this.energy=clamp(this.energy+absorbedEnergy-dt*(.0003+movement*movement*.00034+threat*.00008),0,1);
    this.hydration=clamp(this.hydration+absorbedWater-dt*(.00017+movement*.00012),0,1);
    this.hunger=clamp(1-(this.energy*.84+this.gutEnergy*.16),0,1);
    this.thirst=clamp(1-(this.hydration*.9+this.gutWater*.1),0,1);
    this.fatigue=clamp(this.fatigue+dt*(movement*.0018-(movement<.06?.0013:0)),0,1);
    this.sleepPressure=clamp(this.sleepPressure+dt*(.00042+this.fatigue*.00025-(movement<.03?.0008:0)),0,1);
    this.arousal=approach(this.arousal,clamp(.14+movement*.24+threat*.88+this.rewardPulse*.2,0,1),threat>.25?6:1.25,dt);
    this.stress=approach(this.stress,clamp(threat*.92+escape*.2+this.punishmentPulse*.45,0,1),threat>.2?5:.65,dt);
    if(threat>.5)this.punishmentPulse=clamp(this.punishmentPulse+dt*threat*.8,0,1);
    if(this.energy<=.001||this.hydration<=.001)this.alive=false;
  }
  metabolicVector(){return new Float32Array([this.hunger,this.thirst,this.fatigue,this.sleepPressure,this.stress,this.rewardPulse,this.punishmentPulse]);}
  snapshot(){return {age:this.age,energy:this.energy,hydration:this.hydration,gutEnergy:this.gutEnergy,gutWater:this.gutWater,hunger:this.hunger,thirst:this.thirst,fatigue:this.fatigue,sleepPressure:this.sleepPressure,arousal:this.arousal,stress:this.stress,rewardPulse:this.rewardPulse,punishmentPulse:this.punishmentPulse,alive:this.alive,feeding:this.feeding,drinking:this.drinking,consumedFood:this.consumedFood,consumedWater:this.consumedWater};}
  serialize(){return this.snapshot();}
  restore(state={}){for(const key of Object.keys(this.snapshot()))if(typeof state[key]==='boolean'||Number.isFinite(state[key]))this[key]=state[key];}
}
