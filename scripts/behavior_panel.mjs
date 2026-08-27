import {fixtureData} from '../tests/helpers.mjs';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {WorldModel} from '../src/core/world-model.js';
import {sanitizeMotorPacket} from '../src/core/protocol.js';

const seconds=Math.max(2,Math.min(60,Number(process.argv.find(arg=>arg.startsWith('--seconds='))?.split('=')[1])||8));
const seeds=(process.argv.find(arg=>arg.startsWith('--seeds='))?.split('=')[1]||'1,2,3').split(',').map(Number).filter(Number.isFinite);
const emptyRoom={version:1,name:'symmetric causal chamber',width:300,height:220,ambientLight:.45,temperature:.5,spawn:{x:150,y:110,heading:0},objects:[]};
const baseMotor=overrides=>sanitizeMotorPacket({coordinationDrive:.55,legs:[.68,.68,.68,.68,.68,.68],...overrides});

function pathMetrics(world,start,rotation,path){
  const displacement=Math.hypot(world.fly.x-start.x,world.fly.y-start.y);
  return {pathMm:+path.toFixed(4),displacementMm:+displacement.toFixed(4),straightness:path?+(displacement/path).toFixed(6):1,signedRotationDeg:+(rotation*180/Math.PI).toFixed(4),final:{x:+world.fly.x.toFixed(3),y:+world.fly.y.toFixed(3)}};
}
function directRun(motor,duration=seconds,room=emptyRoom,seed=1){
  const world=new WorldModel(room,seed,'connectome'),start={x:world.fly.x,y:world.fly.y},initialHeading=world.fly.heading;
  world.setBrain(motor);let path=0,priorX=world.fly.x,priorY=world.fly.y;
  for(let i=0;i<Math.round(duration/.01);i++){world.step(.01);path+=Math.hypot(world.fly.x-priorX,world.fly.y-priorY);priorX=world.fly.x;priorY=world.fly.y;}
  let rotation=world.fly.heading-initialHeading;while(rotation>Math.PI)rotation-=2*Math.PI;while(rotation<-Math.PI)rotation+=2*Math.PI;
  return {...pathMetrics(world,start,rotation,path),state:world.lastBehavior.state,proprioceptionLength:world.sense(50).proprioception.length};
}

const zero=directRun(sanitizeMotorPacket({}),3);
const symmetric=directRun(baseMotor({}),seconds);
const leftSteer=directRun(baseMotor({dna02Left:.72}),seconds);
const rightSteer=directRun(baseMotor({dna02Right:.72}),seconds);

const data=await fixtureData(),closedLoop=[];
for(const seed of seeds){
  const brain=new WholeConnectomeEngine(data,{modelMode:'natural'},seed),world=new WorldModel(emptyRoom,seed^0x1234,'natural');
  const start={x:world.fly.x,y:world.fly.y},initialHeading=world.fly.heading;
  let nextBrain=0,maxConflict=0,meanAsymmetry=0,brainFrames=0,path=0,priorX=world.fly.x,priorY=world.fly.y;
  for(let step=0;step<Math.round(seconds/.01);step++){
    if(world.time>=nextBrain-1e-9){
      const result=brain.advance(50,world.sense(50));world.setBrain(result.motor);nextBrain+=.05;
      maxConflict=Math.max(maxConflict,result.motor.conflict);
      meanAsymmetry+=Math.abs(result.motor.legLeft-result.motor.legRight);brainFrames++;
    }
    world.step(.01);path+=Math.hypot(world.fly.x-priorX,world.fly.y-priorY);priorX=world.fly.x;priorY=world.fly.y;
  }
  let rotation=world.fly.heading-initialHeading;while(rotation>Math.PI)rotation-=2*Math.PI;while(rotation<-Math.PI)rotation+=2*Math.PI;
  closedLoop.push({seed,...pathMetrics(world,start,rotation,path),maxConflict:+maxConflict.toFixed(6),meanLegAsymmetry:+(meanAsymmetry/Math.max(1,brainFrames)).toFixed(6),populationRateHz:+(brain.lastFrameStats?.populationRateHz||0).toFixed(6)});
}

const contactRoom={...emptyRoom,name:'contact chamber',spawn:{x:9,y:50,heading:Math.PI},objects:[{id:'wall',kind:'wall',x:2,y:42,w:2,h:16}]};
const contactWorld=new WorldModel(contactRoom,77,'connectome');contactWorld.setBrain(baseMotor({}));
let privateReverse=false,privateTurn=false;
for(let i=0;i<500;i++){contactWorld.step(.01);privateReverse||=contactWorld.lastBehavior.state==='reverse';privateTurn||=Math.abs(contactWorld.fly.turnRate)>.001;}
const contactPoint={x:contactWorld.fly.x,y:contactWorld.fly.y};
contactWorld.setBrain(baseMotor({reverse:1}));
let neuralReverse=false,leftWall=false;
for(let i=0;i<180;i++){contactWorld.step(.01);neuralReverse||=contactWorld.lastBehavior.state==='reverse';if(contactWorld.fly.x>10)leftWall=true;}

const result={
  schema:'fly-umwelt-causal-behavior-panel-v1',
  qualification:'Engineering diagnostics using the deterministic fixture and planar six-leg body. These tests detect hidden locomotor shortcuts, asymmetry and contact lock; they do not validate biological gait or navigation.',
  zeroOutput:zero,symmetricOutput:symmetric,mirroredSteering:{left:leftSteer,right:rightSteer,mirrorErrorDeg:+Math.abs(leftSteer.signedRotationDeg+rightSteer.signedRotationDeg).toFixed(4)},
  fixtureClosedLoop:closedLoop,
  contactCausality:{privateReverse,privateTurn,contactPoint,neuralReverse,leftWall,final:{x:+contactWorld.fly.x.toFixed(3),y:+contactWorld.fly.y.toFixed(3)},state:contactWorld.lastBehavior.state},
};
if(zero.pathMm>.001)throw new Error(`zero-output body moved ${zero.pathMm} mm`);
if(Math.abs(symmetric.signedRotationDeg)>2)throw new Error(`symmetric body drifted ${symmetric.signedRotationDeg}°`);
if(Math.sign(leftSteer.signedRotationDeg)===Math.sign(rightSteer.signedRotationDeg)||result.mirroredSteering.mirrorErrorDeg>4)throw new Error('mirrored steering did not produce mirrored body rotation');
if(privateReverse||privateTurn)throw new Error('contact selected a private plant-side reverse/turn program');
if(!neuralReverse||!leftWall)throw new Error('represented reverse output failed to clear the obstacle');
console.log(JSON.stringify(result,null,2));
