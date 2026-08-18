import {readdir, readFile, stat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {relative, resolve, sep} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const exclusions=new Set(['RELEASE_MANIFEST.json']);
const excludedPatterns=['RELEASE_MANIFEST.json','.git/**','.cache/**','node_modules/**','**/__pycache__/**','**/*.pyc'];
const files=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=resolve(dir,entry.name);
    const rel=relative(root,full).split(sep).join('/');
    if(exclusions.has(rel)||rel==='.git'||rel.startsWith('.git/')||rel==='.cache'||rel.startsWith('.cache/')||rel==='node_modules'||rel.startsWith('node_modules/')||rel.includes('/__pycache__/')||rel.endsWith('.pyc'))continue;
    if(entry.isDirectory())await walk(full);
    else if(entry.isFile()){
      const bytes=await readFile(full);
      files.push({path:rel,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
}
await walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const output={project:'Fly Umwelt',version:packageJson.version,generated:new Date().toISOString(),fileCount:files.length,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0),excluded:excludedPatterns,files};
await writeFile(resolve(root,'RELEASE_MANIFEST.json'),JSON.stringify(output,null,2)+'\n');
console.log(`release manifest: ${files.length} files, ${output.totalBytes.toLocaleString()} bytes`);
