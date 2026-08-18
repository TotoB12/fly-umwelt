import {buildDisplayAtlas,loadConnectome} from '../core/connectome-data.js';
import {WholeConnectomeEngine} from '../core/brain-engine.js';

let engine=null,port=null,manifest=null,initConfig=null,seed=1,lastSnapshotAt=0,rootIndex=null;
const report=(payload,transfer=[])=>self.postMessage(payload,transfer);

async function init(msg){
  manifest=msg.manifest;initConfig=msg.config||{};seed=msg.seed||1;port=msg.port;port.onmessage=onPortMessage;port.start?.();
  try{
    const data=await loadConnectome(manifest,progress=>report({type:'brain-progress',...progress}));
    engine=new WholeConnectomeEngine(data,initConfig,seed);
    let warmup={durationMs:0,spikes:0,populationRateHz:0};
    if(engine.config.warmupMs>0){report({type:'brain-progress',phase:'initial-state',message:'Establishing the disclosed ongoing neural state…'});warmup=engine.warmup(engine.config.warmupMs);}
    rootIndex=new Map(data.rootIds.map((id,i)=>[String(id),i]));
    const displayAtlas=buildDisplayAtlas(data);
    report({
      type:'brain-ready',
      dataset:{id:manifest.id,label:manifest.label,anatomy:manifest.anatomy,testOnly:!!manifest.testOnly,edgeCoverage:manifest.edgeCoverage||'',source:manifest.source||'',limitations:manifest.limitations||[],dataClass:manifest.dataClass||'reference'},
      counts:{neurons:data.N,edges:data.E,...data.counts},mappingSummary:data.counts,mappingProvenance:data.mapping.provenance,
      config:{...engine.config},effectiveDelayMs:engine.effectiveDelayMs,warmup,autonomySeeds:engine.autonomySeeds.length,displayAtlas,
    },[displayAtlas.groupByNeuron.buffer]);
    port.postMessage({type:'brain-ready'});
  }catch(error){report({type:'brain-error',message:error?.message||String(error),stack:error?.stack});}
}

function onPortMessage(event){
  const msg=event.data;
  if(!engine){port.postMessage({type:'brain-unavailable',requestId:msg.requestId,generation:msg.generation});return;}
  if(msg.type==='sense'){
    try{
      const result=engine.advance(msg.durationMs,msg.sensory);
      port.postMessage({type:'motor',requestId:msg.requestId,generation:msg.generation,...result});
      const now=performance.now();
      if(now-lastSnapshotAt>110){lastSnapshotAt=now;report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:result.sampleSpikes});}
    }catch(error){report({type:'brain-error',message:error?.message||String(error),stack:error?.stack});port.postMessage({type:'brain-unavailable',requestId:msg.requestId,generation:msg.generation});}
  }
}

function inspect(index,requestId){
  const i=Math.max(0,Math.min(engine.data.N-1,index|0));
  report({type:'neuron-inspection',requestId,neuron:{index:i,rootId:engine.data.rootIds[i],annotation:engine.data.annotations?.[i]||'unannotated',detail:engine.data.annotationDetail?.[i]||'',ntCode:engine.data.ntCode[i],group:engine.data.group[i],region:engine.data.region[i],v:engine.v[i],g:engine.g[i],refractory:engine.refractory[i],outDegree:engine.data.rowPtr[i+1]-engine.data.rowPtr[i]}});
}

self.onmessage=async event=>{
  const msg=event.data;if(msg.type==='init')return init(msg);if(!engine)return;
  if(msg.type==='config'){engine.setConfig(msg.config||{});report({type:'config-applied',token:msg.token||null,config:{...engine.config},effectiveDelayMs:engine.effectiveDelayMs});}
  if(msg.type==='perturb'){const ok=engine.perturb(msg.population,msg.side,msg.rateHz,msg.durationMs);report({type:'perturbation',ok,population:msg.population,side:msg.side||''});}
  if(msg.type==='reset'){seed=msg.seed||seed;engine=new WholeConnectomeEngine(engine.data,{...initConfig,...msg.config},seed);const warmup=engine.config.warmupMs>0?engine.warmup(engine.config.warmupMs):{durationMs:0,spikes:0,populationRateHz:0};report({type:'brain-reset',token:msg.token||null,warmup,autonomySeeds:engine.autonomySeeds.length,config:{...engine.config}});report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:[]});}
  if(msg.type==='serialize')report({type:'brain-state',requestId:msg.requestId,state:engine.serialize()});
  if(msg.type==='restore'){engine.restore(msg.state);report({type:'brain-restored',token:msg.token||null,config:{...engine.config}});report({type:'brain-snapshot',snapshot:engine.snapshot(),sampleSpikes:[]});}
  if(msg.type==='inspect')inspect(msg.index,msg.requestId);
  if(msg.type==='inspect-root'){const i=rootIndex?.get(String(msg.rootId));if(i===undefined)report({type:'neuron-inspection',requestId:msg.requestId,neuron:null});else inspect(i,msg.requestId);}
};
