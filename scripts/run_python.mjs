import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2);
if(!args.length){
  console.error('Usage: node scripts/run_python.mjs <script.py> [...args]');
  process.exit(2);
}

const candidates=process.platform==='win32'
  ? [{command:'py',prefix:['-3']},{command:'python3',prefix:[]},{command:'python',prefix:[]}]
  : [{command:'python3',prefix:[]},{command:'python',prefix:[]}];

let lastError=null;
for(const candidate of candidates){
  const result=spawnSync(candidate.command,[...candidate.prefix,...args],{stdio:'inherit'});
  if(!result.error)process.exit(result.status??1);
  if(result.error.code!=='ENOENT'){
    lastError=result.error;
    break;
  }
  lastError=result.error;
}

console.error(`Python 3 is required but no supported interpreter was found (${lastError?.message||'unknown error'}).`);
process.exit(127);
