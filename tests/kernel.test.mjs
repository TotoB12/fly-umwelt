import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {JavaScriptLifKernel,WasmLifKernel,exactLinearCoefficients} from '../src/core/neural-kernels.js';

const wasmPath=resolve(import.meta.dirname,'..','public','wasm','lif-kernel.wasm');

function seedState(kernel){
  for(let i=0;i<kernel.neuronCount;i++){
    kernel.v[i]=Math.fround(((i%17)-8)*.41);
    kernel.g[i]=Math.fround(((i%13)-6)*.37);
    kernel.refractory[i]=i%19===0?2.2:i%23===0?.2:0;
  }
}

function closeArrays(actual,expected,tolerance=2e-5){
  assert.equal(actual.length,expected.length);
  for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<=tolerance,`index ${i}: ${actual[i]} != ${expected[i]}`);
}

test('bundled neural WebAssembly binary has the expected ABI',async()=>{
  const bytes=await readFile(wasmPath);
  assert(WebAssembly.validate(bytes));
  const kernel=await WasmLifKernel.fromBytes(bytes,257);
  assert.equal(kernel.describe().abi,1);
  assert.equal(kernel.describe().neuronCount,257);
  assert(kernel.describe().memoryBytes>=257*16);
});

test('WebAssembly and JavaScript LIF kernels remain numerically and spike-event compatible',async()=>{
  const bytes=await readFile(wasmPath),N=257;
  const js=new JavaScriptLifKernel(N),wasm=await WasmLifKernel.fromBytes(bytes,N);
  seedState(js);seedState(wasm);
  for(const dtMs of [2,.5,1,4,2]){
    const coefficients=exactLinearCoefficients(dtMs,20,5);
    const a=js.integrate({dtMs,thresholdMv:7,...coefficients});
    const b=wasm.integrate({dtMs,thresholdMv:7,...coefficients});
    assert.equal(b,a);
    assert.deepEqual(Array.from(wasm.spikeIndices.slice(0,b)),Array.from(js.spikeIndices.slice(0,a)));
    closeArrays(wasm.v,js.v);closeArrays(wasm.g,js.g);closeArrays(wasm.refractory,js.refractory,3e-6);
    for(let i=0;i<a;i++){
      const index=js.spikeIndices[i];
      js.v[index]=wasm.v[index]=0;js.g[index]=wasm.g[index]=0;js.refractory[index]=wasm.refractory[index]=2.2;
    }
  }
});
