import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const input=resolve(root,'native/lif_kernel.c');
const output=resolve(root,'public/wasm/lif-kernel.wasm');
await mkdir(resolve(root,'public/wasm'),{recursive:true});
const clang=process.env.CLANG||'clang';
const args=[
  '--target=wasm32','-O3','-flto','-nostdlib',input,
  '-Wl,--no-entry','-Wl,--export-memory','-Wl,--initial-memory=1048576','-Wl,--max-memory=536870912',
  '-Wl,--export=abi_version','-Wl,--export=required_bytes','-Wl,--export=init',
  '-Wl,--export=ptr_v','-Wl,--export=ptr_g','-Wl,--export=ptr_refractory','-Wl,--export=ptr_spikes',
  '-Wl,--export=count_neurons','-Wl,--export=clear_state','-Wl,--export=integrate',
  '-o',output,
];
const result=spawnSync(clang,args,{stdio:'inherit'});
if(result.status!==0)throw new Error(`clang failed with status ${result.status}`);
console.log(`built ${output}`);
