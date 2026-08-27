import {buildDisplayAtlas,loadConnectome} from '../core/connectome-data.js';
import {WholeConnectomeEngine} from '../core/brain-engine.js';
import {RETINA_RAYS} from '../core/constants.js';
import {createLifKernel} from '../core/neural-kernels.js';
import {CALIBRATION_ORDER, NEURAL_RESOLUTIONS, chooseCalibratedResolution, createCalibrationSensoryPacket} from '../core/compute-profile.js';

let engine=null,port=null,manifest=null,initConfig=null,seed=1,lastSnapshotAt=0,rootIndex=null,data=null;
let compute=null,computeCalibration=null,reconfiguring=false,queuedSense=null;
const report=(payload,transfer=[])=>self.postMessage(payload,transfer);
const wasmUrl=new URL('../../wasm/lif-kernel.wasm',import.meta.url);

function computeDescriptor(){
  return {
    requested:compute?.requested||initConfig?.computeBackendRequested||'auto',
    resolved:compute?.resolved||engine?.kernel?.id||'js',
    kernel:engine?.kernel?.describe?.()||null,
    warnings:compute?.warnings||[],
    resolutionRequested:initConfig?.neuralResolutionRequested||'auto',
    resolutionResolved:engine?.config?.neuralResolutionResolved||initConfig?.neuralResolutionResolved||'balanced',
    calibration:computeCalibration,
    brainDtMs:engine?.config?.brainDtMs,
    integrator:engine?.integrator?.id||'exact-linear-coupled-v1',
  };
}

async function createEngine(config,nextSeed,state=null){
  report({type:'brain-progress',phase:'compute',message:'Starting the browser neural compute kernel…'});
  compute=await createLifKernel({requested:config.computeBackendRequested||'auto',neuronCount:data.N,wasmUrl});
  const next=new WholeConnectomeEngine(data,config,nextSeed,{kernel:compute.kernel});
  if(state){
    const restored={...state,config:{...(state.config||{}),...config}};
    next.restore(restored);
  }
  return next;
}

function preserveCalibratedAuto(config={}){
  if(config.neuralResolutionRequested==='auto'&&computeCalibration?.selected){
    const selected=NEURAL_RESOLUTIONS[computeCalibration.selected];
    if(selected?.dtMs)return {...config,brainDtMs:selected.dtMs,neuralResolutionResolved:selected.id};
  }
  return config;
}

async function calibrateAutoResolution(candidate,config={}){
  if(config.neuralResolutionRequested!=='auto'){
    computeCalibration=null;
    return candidate;
  }
  if(manifest?.testOnly||data.N<20_000){
    const selected='research';
    const finalConfig={...config,brainDtMs:NEURAL_RESOLUTIONS[selected].dtMs,neuralResolutionResolved:selected};
    candidate.setConfig(finalConfig);initConfig={...initConfig,...finalConfig};
    computeCalibration={selected,targetLoad:.78,samples:[],reason:'small graph; highest bundled resolution selected without timing probe'};
    return candidate;
  }

  report({type:'brain-progress',phase:'compute',message:'Calibrating temporal resolution on this browser without advancing the individual…'});
  const original=candidate.serialize(),samples=[];
  const calibrationSensory=createCalibrationSensoryPacket(RETINA_RAYS);
  const measure=(id)=>{
    const profile=NEURAL_RESOLUTIONS[id];
    candidate.restore({...original,config:{...(original.config||{}),...config,brainDtMs:profile.dtMs,neuralResolutionResolved:id}});
    const stats=candidate.advance(200,calibrationSensory).stats;
    const load=Math.max(0,Number(stats.wallMs)||0)/Math.max(1,Number(stats.simulatedMs)||200);
    samples.push({id,dtMs:profile.dtMs,load,wallMs:Number(stats.wallMs)||0,simulatedMs:Number(stats.simulatedMs)||200,spikes:Number(stats.spikes)||0,probe:'representative-bounded-sensory'});
    return load;
  };

  const targetLoad=.78;
  const balancedLoad=measure('balanced');
  if(balancedLoad<=targetLoad){
    const fineLoad=measure('fine');
    if(fineLoad<=targetLoad)measure('research');
  }else measure('economy');
  const selected=chooseCalibratedResolution(samples,targetLoad);
  const finalConfig={...config,brainDtMs:selected.dtMs,neuralResolutionResolved:selected.resolved};
  candidate.restore({...original,config:{...(original.config||{}),...finalConfig}});
  initConfig={...initConfig,...finalConfig};
  computeCalibration={
    selected:selected.resolved,
    targetLoad,
    samples:CALIBRATION_ORDER.map((id)=>samples.find((sample)=>sample.id===id)).filter(Boolean),
    reason:samples.some((sample)=>sample.id===selected.resolved&&sample.load<=targetLoad)
      ? 'finest measured profile with browser headroom'
      : 'least costly measured profile; real-time neural work may still be unavailable',
  };
  return candidate;
}

async function init(msg){
  manifest=msg.manifest;initConfig=msg.config||{};seed=msg.seed||1;port=msg.port;port.onmessage=onPortMessage;port.start?.();
  try{
    data=await loadConnectome(manifest,progress=>report({type:'brain-progress',...progress}),{graphTier:msg.graphTier||'auto'});
    engine=await createEngine(initConfig,seed);
    let warmup={durationMs:0,spikes:0,populationRateHz:0};
    if(engine.config.warmupMs>0){report({type:'brain-progress',phase:'initial-state',message:'Establishing the disclosed ongoing neural state…'});warmup=engine.warmup(engine.config.warmupMs);}
    engine=await calibrateAutoResolution(engine,initConfig);
    rootIndex=new Map(data.rootIds.map((id,i)=>[String(id),i]));
    const displayAtlas=buildDisplayAtlas(data);
    report({
      type:'brain-ready',
      graphTier:data.graphTier,
      dataset:{id:manifest.id,label:manifest.label,shortLabel:manifest.shortLabel,anatomy:manifest.anatomy,testOnly:!!manifest.testOnly,edgeCoverage:manifest.edgeCoverage||'',source:manifest.source||'',limitations:manifest.limitations||[],dataClass:manifest.dataClass||'reference'},
      counts:{neurons:data.N,edges:data.E,...data.counts},mappingSummary:data.counts,mappingProvenance:data.mapping.provenance,
      config:{...engine.config},effectiveDelayMs:engine.effectiveDelayMs,warmup,autonomySeeds:engine.autonomySeeds.length,displayAtlas,
      compute:computeDescriptor(),capabilities:msg.capabilities||{},
    },[displayAtlas.groupByNeuron.buffer]);
    port.postMessage({type:'brain-ready'});
  }catch(error){report({type:'brain-error',message:error?.message||String(error),stack:error?.stack});}
}

function processSense(msg){
  if(!engine){port.postMessage({type:'brain-unavailable',requestId:msg.requestId,generation:msg.generation});return;}
  if(msg.type==='sense'){
    try{
      const result=engine.advance(msg.durationMs,msg.sensory);
      port.postMessage({type:'motor',requestId:msg.requestId,generation:msg.generation,...result});
      const now=performance.now();
      if(msg.forceSnapshot||now-lastSnapshotAt>110){lastSnapshotAt=now;report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:result.sampleSpikes});}
    }catch(error){report({type:'brain-error',message:error?.message||String(error),stack:error?.stack});port.postMessage({type:'brain-unavailable',requestId:msg.requestId,generation:msg.generation});}
  }
}

function onPortMessage(event){
  const msg=event.data;
  if(reconfiguring&&msg.type==='sense'){
    // The world allows one neural request in flight. Hold it across a compute
    // backend/resolution swap instead of falsely declaring the brain dead.
    queuedSense=msg;
    return;
  }
  processSense(msg);
}

function inspect(index,requestId){
  const i=Math.max(0,Math.min(engine.data.N-1,index|0));
  report({type:'neuron-inspection',requestId,neuron:{index:i,rootId:engine.data.rootIds[i],annotation:engine.data.annotations?.[i]||'unannotated',detail:engine.data.annotationDetail?.[i]||'',ntCode:engine.data.ntCode[i],group:engine.data.group[i],region:engine.data.region[i],v:engine.v[i],g:engine.g[i],refractory:engine.refractory[i],outDegree:engine.data.rowPtr[i+1]-engine.data.rowPtr[i]}});
}

async function applyCompute(msg){
  if(reconfiguring)return;
  reconfiguring=true;
  let succeeded=false;
  try{
    const state=engine.serialize();
    initConfig={...initConfig,...msg.config};
    engine=await createEngine(initConfig,seed,state);
    engine=await calibrateAutoResolution(engine,initConfig);
    succeeded=true;
    report({type:'compute-applied',token:msg.token||null,config:{...engine.config},effectiveDelayMs:engine.effectiveDelayMs,compute:computeDescriptor()});
    report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:[]});
  }catch(error){
    report({type:'brain-error',message:error?.message||String(error),stack:error?.stack});
  }finally{
    reconfiguring=false;
    const nextSense=queuedSense;queuedSense=null;
    if(nextSense){
      if(succeeded&&engine)processSense(nextSense);
      else port.postMessage({type:'brain-unavailable',requestId:nextSense.requestId,generation:nextSense.generation});
    }
  }
}

self.onmessage=async event=>{
  const msg=event.data;
  if(msg.type==='init')return init(msg);
  if(!engine)return;
  if(msg.type==='config'){const nextConfig=preserveCalibratedAuto(msg.config||{});engine.setConfig(nextConfig);initConfig={...initConfig,...nextConfig};report({type:'config-applied',token:msg.token||null,config:{...engine.config},effectiveDelayMs:engine.effectiveDelayMs,compute:computeDescriptor()});}
  if(msg.type==='compute')return applyCompute(msg);
  if(msg.type==='perturb'){const ok=engine.perturb(msg.population,msg.side,msg.rateHz,msg.durationMs);report({type:'perturbation',ok,population:msg.population,side:msg.side||''});}
  if(msg.type==='reset'){
    seed=msg.seed||seed;initConfig={...initConfig,...preserveCalibratedAuto(msg.config||{})};engine.kernel.clear();engine=new WholeConnectomeEngine(data,initConfig,seed,{kernel:engine.kernel});
    const warmup=engine.config.warmupMs>0?engine.warmup(engine.config.warmupMs):{durationMs:0,spikes:0,populationRateHz:0};
    report({type:'brain-reset',token:msg.token||null,warmup,autonomySeeds:engine.autonomySeeds.length,config:{...engine.config},compute:computeDescriptor()});report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:[]});
  }
  if(msg.type==='serialize')report({type:'brain-state',requestId:msg.requestId,state:engine.serialize()});
  if(msg.type==='restore'){engine.restore(msg.state);report({type:'brain-restored',token:msg.token||null,config:{...engine.config},compute:computeDescriptor()});report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:[]});}
  if(msg.type==='inspect')inspect(msg.index,msg.requestId);
  if(msg.type==='inspect-root'){const i=rootIndex?.get(String(msg.rootId));if(i===undefined)report({type:'neuron-inspection',requestId:msg.requestId,neuron:null});else inspect(i,msg.requestId);}
};
