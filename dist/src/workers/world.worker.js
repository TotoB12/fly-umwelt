import {WorldModel} from '../core/world-model.js';
import {WORLD_DT,SENSOR_DT,SNAPSHOT_HZ,MAX_STEPS_PER_PUMP} from '../core/constants.js';

let world=null,port=null,running=false,speed=1,brainReady=false,roomRevision=0,worldGeneration=0;
let requestId=0,brainInFlight=false,sensorAccumulator=0,lastBrainWall=0,lastBrainBio=0;
let loopToken=0,lastPumpWall=0,wallAccumulator=0,lastSnapshotWall=0,speedWindow=[];

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));

function actualSpeed(){
  const now=performance.now();speedWindow=speedWindow.filter(sample=>now-sample.wall<1800);
  if(speedWindow.length<2)return 0;
  const bio=speedWindow.reduce((sum,sample)=>sum+sample.bio,0),wall=(now-speedWindow[0].wall)/1000;
  return wall>0?bio/wall:0;
}

function makeSnapshot(includeRoom=false){
  const snapshot=world.snapshot(includeRoom);
  snapshot.runtime={running,speed,brainReady,roomRevision,worldGeneration,actualSpeed:actualSpeed(),brainInFlight,brainAgeMs:lastBrainBio,brainWallLagMs:lastBrainWall?performance.now()-lastBrainWall:Infinity};
  return snapshot;
}

function postSnapshot(force=false,includeRoom=false){
  const now=performance.now();if(!force&&now-lastSnapshotWall<1000/SNAPSHOT_HZ)return;
  lastSnapshotWall=now;self.postMessage({type:'world-snapshot',snapshot:makeSnapshot(includeRoom)});
}

function sendSensory(force=false){
  if(!brainReady||brainInFlight)return false;
  if(!force&&sensorAccumulator<SENSOR_DT)return false;
  const duration=Math.max(SENSOR_DT,Math.min(.2,sensorAccumulator||SENSOR_DT));sensorAccumulator=Math.max(0,sensorAccumulator-duration);
  const sensory=world.sense(duration*1000),id=++requestId;brainInFlight=true;
  port.postMessage({type:'sense',requestId:id,generation:worldGeneration,sensory,durationMs:duration*1000});
  return true;
}

function onPortMessage(event){
  const msg=event.data;
  if(msg.type==='brain-ready'){brainReady=true;lastBrainWall=performance.now();self.postMessage({type:'brain-link-ready'});sendSensory(true);postSnapshot(true,true);return;}
  if(msg.type==='motor'){
    if(msg.generation!==worldGeneration)return;
    brainInFlight=false;lastBrainWall=performance.now();lastBrainBio=Number(msg.stats?.simulatedMs)||0;
    if(msg.motor)world.setBrain(msg.motor);
    if(sensorAccumulator>=SENSOR_DT)sendSensory(true);
    return;
  }
  if(msg.type==='brain-unavailable'&&msg.generation===worldGeneration){brainInFlight=false;brainReady=false;running=false;postSnapshot(true);self.postMessage({type:'world-error',message:'The neural worker became unavailable; playback was paused.'});}
}

function integrateStep(){
  world.step(WORLD_DT);sensorAccumulator+=WORLD_DT;speedWindow.push({wall:performance.now(),bio:WORLD_DT});sendSensory(false);postSnapshot(false,false);
}

async function runLoop(token){
  lastPumpWall=performance.now();wallAccumulator=0;
  while(running&&token===loopToken){
    const now=performance.now(),elapsed=Math.min(.1,(now-lastPumpWall)/1000);lastPumpWall=now;
    if(speed==='max')wallAccumulator=Math.max(wallAccumulator,WORLD_DT*MAX_STEPS_PER_PUMP);
    else wallAccumulator+=elapsed*Math.max(.05,Number(speed)||1);
    let steps=0,limit=speed==='max'?MAX_STEPS_PER_PUMP:Math.min(MAX_STEPS_PER_PUMP,24);
    while(wallAccumulator>=WORLD_DT&&steps<limit&&running&&token===loopToken){integrateStep();wallAccumulator-=WORLD_DT;steps++;}
    if(!steps)await sleep(2);else await sleep(speed==='max'?0:1);
  }
}

function setRunning(value,{emit=true}={}){
  running=Boolean(value);loopToken++;
  if(emit)postSnapshot(true);
  if(running){sendSensory(true);runLoop(loopToken);}
}

function resetWorld(msg){
  setRunning(false,{emit:false});worldGeneration++;brainInFlight=false;sensorAccumulator=0;
  world=new WorldModel(msg.room||world.room,msg.seed||world.seed,msg.mode||world.mode);if(Number.isFinite(msg.revision))roomRevision=msg.revision;
  speedWindow=[];lastSnapshotWall=performance.now();const snapshot=makeSnapshot(true);self.postMessage({type:'world-reset',token:msg.token||null,snapshot});if(brainReady)sendSensory(true);
}

self.onmessage=event=>{
  const msg=event.data;
  if(msg.type==='init'){
    worldGeneration=1;world=new WorldModel(msg.room,msg.seed||1,msg.mode||'natural');port=msg.port;port.onmessage=onPortMessage;port.start?.();postSnapshot(true,true);return;
  }
  if(!world)return;
  if(msg.type==='toggle')setRunning(!running);
  if(msg.type==='play')setRunning(true);
  if(msg.type==='pause')setRunning(false);
  if(msg.type==='speed'){speed=msg.speed==='max'?'max':Math.max(.05,Math.min(32,Number(msg.speed)||1));postSnapshot(true);}
  if(msg.type==='step'&&!running){for(let i=0;i<Math.round(SENSOR_DT/WORLD_DT);i++)integrateStep();sendSensory(true);postSnapshot(true);}
  if(msg.type==='mode'){world.setMode(msg.mode);postSnapshot(true);sendSensory(true);self.postMessage({type:'world-mode-applied',token:msg.token||null,mode:world.mode});}
  if(msg.type==='room-update'){world.updateRoom(msg.room);roomRevision=Math.max(roomRevision,Number(msg.revision)||0);postSnapshot(true,true);}
  if(msg.type==='reset')resetWorld(msg);
  if(msg.type==='touch'){world.touch(msg.region,msg.intensity);sendSensory(true);postSnapshot(true);}
  if(msg.type==='airflow'){world.airflow(msg.intensity);sendSensory(true);postSnapshot(true);}
  if(msg.type==='clear-events'){world.eventLog.length=0;postSnapshot(true);}
  if(msg.type==='serialize')self.postMessage({type:'world-state',requestId:msg.requestId,state:world.serialize()});
  if(msg.type==='restore'){
    setRunning(false,{emit:false});worldGeneration++;brainInFlight=false;sensorAccumulator=0;world.restore(msg.state);if(Number.isFinite(msg.revision))roomRevision=msg.revision;
    speedWindow=[];const snapshot=makeSnapshot(true);self.postMessage({type:'world-restored',token:msg.token||null,snapshot});if(brainReady)sendSensory(true);
  }
};
