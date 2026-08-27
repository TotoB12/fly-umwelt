const WASM_PAGE_BYTES = 64 * 1024;
const KERNEL_ABI = 1;

export const COMPUTE_BACKEND_IDS = Object.freeze(['auto','wasm','js']);

export function normalizeComputeBackend(value='auto') {
  return COMPUTE_BACKEND_IDS.includes(value) ? value : 'auto';
}

export function exactLinearCoefficients(dtMs, membraneTauMs=20, synapseTauMs=5) {
  const dt=Math.max(1e-6,Number(dtMs)||0);
  const tm=Math.max(1e-6,Number(membraneTauMs)||20);
  const ts=Math.max(1e-6,Number(synapseTauMs)||5);
  const voltageDecay=Math.exp(-dt/tm);
  const conductanceDecay=Math.exp(-dt/ts);
  const conductanceToVoltage=Math.abs(tm-ts)<1e-9
    ? (dt/tm)*voltageDecay
    : (ts/(ts-tm))*(conductanceDecay-voltageDecay);
  return {voltageDecay,conductanceDecay,conductanceToVoltage};
}

export class JavaScriptLifKernel {
  constructor(neuronCount) {
    this.id='js';
    this.label='JavaScript';
    this.neuronCount=Math.max(0,neuronCount|0);
    this.v=new Float32Array(this.neuronCount);
    this.g=new Float32Array(this.neuronCount);
    this.refractory=new Float32Array(this.neuronCount);
    this.spikeIndices=new Uint32Array(this.neuronCount);
  }

  clear() {
    this.v.fill(0);this.g.fill(0);this.refractory.fill(0);this.spikeIndices.fill(0);
  }

  integrate({dtMs,voltageDecay,conductanceDecay,conductanceToVoltage,thresholdMv}) {
    const {v,g,refractory,spikeIndices}=this;
    let spikeCount=0;
    for(let i=0;i<this.neuronCount;i++){
      const remaining=refractory[i];
      if(remaining>0){
        refractory[i]=Math.max(0,remaining-dtMs);
        v[i]=0;
        // The source equations mark both v and g "unless refractory".
        continue;
      }
      const oldG=g[i];
      const nextV=v[i]*voltageDecay+oldG*conductanceToVoltage;
      g[i]=oldG*conductanceDecay;
      v[i]=nextV;
      if(nextV>thresholdMv)spikeIndices[spikeCount++]=i;
    }
    return spikeCount;
  }

  describe() {
    return {id:this.id,label:this.label,wasm:false,abi:null,neuronCount:this.neuronCount};
  }
}

export class WasmLifKernel {
  static async fromBytes(bytes, neuronCount) {
    const source=bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const result=await WebAssembly.instantiate(source,{});
    return new WasmLifKernel(result.instance,neuronCount);
  }

  static async fromUrl(url, neuronCount) {
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)throw new Error(`WASM kernel HTTP ${response.status}`);
    let result;
    if(typeof WebAssembly.instantiateStreaming==='function'){
      try{result=await WebAssembly.instantiateStreaming(Promise.resolve(response.clone()),{});}catch{/* MIME/CSP fallback below */}
    }
    if(!result)result=await WebAssembly.instantiate(await response.arrayBuffer(),{});
    return new WasmLifKernel(result.instance,neuronCount);
  }

  constructor(instance, neuronCount) {
    const exports=instance?.exports||{};
    if(typeof exports.abi_version!=='function'||exports.abi_version()!==KERNEL_ABI)throw new Error('Unsupported neural WASM kernel ABI');
    if(!(exports.memory instanceof WebAssembly.Memory))throw new Error('Neural WASM kernel did not export memory');
    this.instance=instance;
    this.exports=exports;
    this.memory=exports.memory;
    this.id='wasm';
    this.label='WebAssembly';
    this.neuronCount=Math.max(0,neuronCount|0);
    const required=Number(exports.required_bytes(this.neuronCount));
    const missing=Math.max(0,required-this.memory.buffer.byteLength);
    if(missing>0)this.memory.grow(Math.ceil(missing/WASM_PAGE_BYTES));
    const used=Number(exports.init(this.neuronCount));
    if(used>this.memory.buffer.byteLength)throw new Error('Neural WASM memory layout exceeds allocated memory');
    this.refreshViews();
    this.clear();
  }

  refreshViews() {
    const buffer=this.memory.buffer,n=this.neuronCount;
    this.v=new Float32Array(buffer,Number(this.exports.ptr_v()),n);
    this.g=new Float32Array(buffer,Number(this.exports.ptr_g()),n);
    this.refractory=new Float32Array(buffer,Number(this.exports.ptr_refractory()),n);
    this.spikeIndices=new Uint32Array(buffer,Number(this.exports.ptr_spikes()),n);
  }

  clear() { this.exports.clear_state(); }

  integrate({dtMs,voltageDecay,conductanceDecay,conductanceToVoltage,thresholdMv}) {
    return Number(this.exports.integrate(dtMs,voltageDecay,conductanceDecay,conductanceToVoltage,thresholdMv));
  }

  describe() {
    return {id:this.id,label:this.label,wasm:true,abi:KERNEL_ABI,neuronCount:this.neuronCount,memoryBytes:this.memory.buffer.byteLength};
  }
}

export async function createLifKernel({requested='auto',neuronCount,wasmUrl}={}) {
  const normalized=normalizeComputeBackend(requested);
  const warnings=[];
  if(normalized!=='js'&&typeof WebAssembly!=='undefined'){
    try{
      const kernel=await WasmLifKernel.fromUrl(wasmUrl,neuronCount);
      return {kernel,requested:normalized,resolved:'wasm',warnings};
    }catch(error){
      warnings.push(`WebAssembly kernel unavailable: ${error?.message||error}`);
      if(normalized==='wasm')warnings.push('Falling back to the deterministic JavaScript kernel.');
    }
  }else if(normalized==='wasm')warnings.push('WebAssembly is unavailable in this browser; using JavaScript.');
  const kernel=new JavaScriptLifKernel(neuronCount);
  return {kernel,requested:normalized,resolved:'js',warnings};
}
