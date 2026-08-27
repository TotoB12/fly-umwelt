import {normalizeComputeBackend} from './neural-kernels.js';
import {FEMUR_TIBIA_PROPRIOCEPTION_FIELDS,FEMUR_TIBIA_PROPRIOCEPTION_LENGTH} from './leg-calibration.js';

export const NEURAL_RESOLUTIONS = Object.freeze({
  auto:Object.freeze({id:'auto',label:'Auto',dtMs:null,description:'Choose a conservative step for this graph and device.'}),
  economy:Object.freeze({id:'economy',label:'Economy · 4 ms',dtMs:4,description:'Lowest CPU cost; coarsest threshold timing.'}),
  balanced:Object.freeze({id:'balanced',label:'Balanced · 2 ms',dtMs:2,description:'Original browser step, now with exact passive integration.'}),
  fine:Object.freeze({id:'fine',label:'Fine · 1 ms',dtMs:1,description:'Finer event and refractory timing at roughly twice the work.'}),
  research:Object.freeze({id:'research',label:'Research · 0.5 ms',dtMs:.5,description:'Highest bundled temporal resolution; demanding on whole-CNS packs.'}),
});

export function normalizeNeuralResolution(value='auto') {
  return NEURAL_RESOLUTIONS[value] ? value : 'auto';
}

export function detectBrowserCapabilities(scope=globalThis) {
  const navigator=scope.navigator||{};
  return {
    webAssembly:typeof scope.WebAssembly!=='undefined',
    webGPU:Boolean(navigator.gpu),
    crossOriginIsolated:Boolean(scope.crossOriginIsolated),
    sharedArrayBuffer:Boolean(scope.crossOriginIsolated&&typeof scope.SharedArrayBuffer!=='undefined'),
    hardwareConcurrency:Math.max(1,Number(navigator.hardwareConcurrency)||1),
    deviceMemory:Math.max(0,Number(navigator.deviceMemory)||0),
  };
}

export function resolveNeuralResolution(requested='auto',manifest={},capabilities={}) {
  const normalized=normalizeNeuralResolution(requested);
  if(normalized!=='auto')return {...NEURAL_RESOLUTIONS[normalized],requested:normalized,resolved:normalized,automatic:false};
  const testOnly=Boolean(manifest?.testOnly);
  const neurons=Number(manifest?.neuronCount)||0;
  const cores=Math.max(1,Number(capabilities.hardwareConcurrency)||1);
  const memory=Math.max(0,Number(capabilities.deviceMemory)||0);
  let resolved='balanced';
  if(testOnly||neurons&&neurons<20_000)resolved='research';
  else if(cores<=4||(memory>0&&memory<=4))resolved='economy';
  else if(cores>=12&&memory>=8)resolved='fine';
  return {...NEURAL_RESOLUTIONS[resolved],requested:'auto',resolved,automatic:true};
}


export function resolveGraphTierPreference(requested='auto',manifest={},capabilities={}) {
  const tiers=manifest?.graph?.tiers||null;
  if(!tiers)return 'legacy';
  const normalized=requested==='auto'||tiers[requested]?requested:'auto';
  if(normalized!=='auto')return normalized;
  const cores=Math.max(1,Number(capabilities.hardwareConcurrency)||1);
  const memory=Math.max(0,Number(capabilities.deviceMemory)||0);
  // deviceMemory is absent in several major browsers. Unknown memory is not
  // evidence that a whole-CNS Balanced allocation is safe.
  if(tiers.core&&(memory===0||cores<=4||memory<=4))return 'core';
  if(tiers.balanced)return 'balanced';
  return manifest.defaultGraphTier&&tiers[manifest.defaultGraphTier]?manifest.defaultGraphTier:Object.keys(tiers)[0];
}

export function computeSelection({backend='auto',resolution='auto',manifest={},capabilities={}}={}) {
  return {
    backendRequested:normalizeComputeBackend(backend),
    resolution:resolveNeuralResolution(resolution,manifest,capabilities),
    capabilities:{...capabilities},
  };
}


export function createCalibrationSensoryPacket(retinaRays=64) {
  const count=Math.max(1,Number(retinaRays)||64);
  return {
    retinaBrightness:Float32Array.from({length:count},(_,index)=>index<count/2?.33:.27),
    retinaMotion:new Float32Array(count).fill(.02),
    retinaLoom:new Float32Array(count),
    retinaProximity:new Float32Array(count).fill(.05),
    odorLeft:new Float32Array([.08,.01,0]),
    odorRight:new Float32Array([.12,.01,0]),
    touch:new Float32Array(6),
    taste:new Float32Array(3),
    airflow:new Float32Array([.03,.04]),
    temperature:.5,
    proprioception:Float32Array.from({length:FEMUR_TIBIA_PROPRIOCEPTION_LENGTH},(_,index)=>{
      if(index===0)return .15;if(index===1)return .05;
      const field=(index-2)%FEMUR_TIBIA_PROPRIOCEPTION_FIELDS.length;
      return [0,0,0,.9,.12,.2,.45,1,0,.1,.55,.08,.16,.03,.12][field]||0;
    }),
    metabolic:new Float32Array([.7,.8,.2,.3,0]),
    memoryCue:new Float32Array(4),
    ambientNoise:.02,
    dtMs:50,
  };
}

export const CALIBRATION_ORDER = Object.freeze(['research','fine','balanced','economy']);

export function chooseCalibratedResolution(samples=[],targetLoad=.78) {
  const byId=new Map((samples||[]).map((sample)=>[sample.id,sample]));
  for(const id of CALIBRATION_ORDER){
    const sample=byId.get(id);
    if(sample&&Number.isFinite(sample.load)&&sample.load<=targetLoad){
      return {...NEURAL_RESOLUTIONS[id],requested:'auto',resolved:id,automatic:true,calibrated:true,targetLoad};
    }
  }
  const available=CALIBRATION_ORDER.map((id)=>byId.get(id)).filter((sample)=>sample&&Number.isFinite(sample.load));
  const fallback=available.sort((a,b)=>a.load-b.load)[0];
  const id=fallback?.id||'economy';
  return {...NEURAL_RESOLUTIONS[id],requested:'auto',resolved:id,automatic:true,calibrated:Boolean(fallback),targetLoad};
}
