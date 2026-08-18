import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fixtureData} from '../tests/helpers.mjs';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {WorldModel} from '../src/core/world-model.js';

const root=resolve(import.meta.dirname,'..');
const secondsArg=process.argv.find(arg=>arg.startsWith('--seconds='));
const seconds=Math.max(20,Math.min(900,Number(secondsArg?.split('=')[1])||180));
const seeds=(process.argv.find(arg=>arg.startsWith('--seeds='))?.split('=')[1]||'1,2,3,4,5,17,99').split(',').map(Number).filter(Number.isFinite);
const room=JSON.parse(await readFile(resolve(root,'public/rooms/default.json'),'utf8'));
const data=await fixtureData();
const runs=[];

for(const seed of seeds){
  const brain=new WholeConnectomeEngine(data,{modelMode:'natural'},seed);
  const world=new WorldModel(room,seed^0x1234,'natural');
  const dt=.01,steps=Math.round(seconds/dt);let nextBrain=0,saturated=0,maxSaturated=0,wallSteps=0,turns=0,lastState='',minFood=Infinity,minWater=Infinity;
  const states={};
  for(let step=0;step<steps;step++){
    if(world.time>=nextBrain-1e-9){const result=brain.advance(50,world.sense(50));world.setBrain(result.motor);nextBrain+=.05;}
    world.step(dt);
    const behavior=world.lastBehavior;states[behavior.state]=(states[behavior.state]||0)+1;
    if(behavior.state==='saccade'&&lastState!=='saccade')turns++;lastState=behavior.state;
    if(Math.min(world.fly.x,world.fly.y,room.width-world.fly.x,room.height-world.fly.y)<1.7)wallSteps++;
    if(Math.abs(world.fly.turnRate)>5.5){saturated++;maxSaturated=Math.max(maxSaturated,saturated);}else saturated=0;
    const food=world.room.objects.find(object=>object.kind==='food'),water=world.room.objects.find(object=>object.kind==='water');
    if(food)minFood=Math.min(minFood,Math.hypot(world.fly.x-food.x,world.fly.y-food.y));
    if(water)minWater=Math.min(minWater,Math.hypot(world.fly.x-water.x,world.fly.y-water.y));
  }
  const food=world.room.objects.find(object=>object.kind==='food'),water=world.room.objects.find(object=>object.kind==='water');
  runs.push({
    seed,seconds,final:{x:+world.fly.x.toFixed(2),y:+world.fly.y.toFixed(2)},turns,
    wallFraction:+(wallSteps/steps).toFixed(4),maxHighTurnSeconds:+(maxSaturated*dt).toFixed(3),
    stateFractions:Object.fromEntries(Object.entries(states).map(([key,value])=>[key,+(value/steps).toFixed(4)])),
    minFoodDistance:+minFood.toFixed(2),minWaterDistance:+minWater.toFixed(2),
    foodConsumed:+(1-(food?.amount??1)).toFixed(4),waterConsumed:+(1-(water?.amount??1)).toFixed(4),
    learnedTraces:world.memory.totalLearned,odorEncounters:world.vnc.encounterCount,
  });
}

const aggregate={
  runs:runs.length,
  maxWallFraction:Math.max(...runs.map(run=>run.wallFraction)),
  maxHighTurnSeconds:Math.max(...runs.map(run=>run.maxHighTurnSeconds)),
  runsWithResourceConsumption:runs.filter(run=>run.foodConsumed>0.001||run.waterConsumed>0.001).length,
  uniqueRoundedEndpoints:new Set(runs.map(run=>`${Math.round(run.final.x/5)},${Math.round(run.final.y/5)}`)).size,
};
console.log(JSON.stringify({kind:'deterministic-fixture-behavior-panel',qualification:'This measures the bundled validation graph and modeled VNC/body. It is not a behavioral validation of the 139k graph.',aggregate,runs},null,2));
