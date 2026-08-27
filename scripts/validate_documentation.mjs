import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, relative, resolve, sep} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const requiredCurrent=[
  'README.md','BUILD_REPORT.md','CHANGELOG.md',
  'docs/README.md','docs/NEXT_DEVELOPER_HANDOFF.md','docs/ARCHITECTURE.md',
  'docs/REALITY_MATRIX.md','docs/VALIDATION.md','docs/CLOUDFLARE_PAGES.md',
  'docs/MUSCULOSKELETAL_BODY_3_8.md','docs/MUSCULOSKELETAL_INTEGRATION_3_8.md',
];
const historical=[
  'REDESIGN_HANDOFF.md','ACCURACY_IMPLEMENTATION_REPORT.md','WHOLE_CNS_IMPLEMENTATION_REPORT.md',
  'docs/REDESIGN_IMPLEMENTATION.md',
];
const currentForStatus=[...requiredCurrent,
  'docs/ARTICULATED_BODY_3_8.md','docs/BANC_PACK.md','docs/CLAIMS_AND_ETHICS.md',
  'docs/DATA.md','docs/DEVELOPMENT_ROADMAP.md','docs/FEMUR_TIBIA_CALIBRATION.md',
  'docs/FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md','docs/FRONT_LEG_VALIDATION_3_6.md',
  'docs/PERIPHERAL_MAPPING.md','docs/QUICKSTART.md','docs/RESEARCH_AUDIT.md',
  'docs/ROOM_FORMAT.md','docs/SCIENTIFIC_MODEL.md','docs/WHOLE_FLY_EXECUTION_PROGRAM.md',
];

async function read(path){return readFile(resolve(root,path),'utf8');}
async function exists(path){try{await stat(path);return true;}catch{return false;}}

for(const path of [...requiredCurrent,...historical])if(!await exists(resolve(root,path)))throw new Error(`required documentation missing: ${path}`);

const packageJson=JSON.parse(await read('package.json'));
if(!packageJson.scripts?.['docs:check'])throw new Error('package.json is missing docs:check');
if(!packageJson.scripts?.validate?.includes('npm run docs:check'))throw new Error('aggregate npm run validate must include docs:check');

const markdown=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['dist','node_modules','.git','.cache','.venv','.venv-oai'].includes(entry.name))continue;
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(entry.isFile()&&entry.name.endsWith('.md'))markdown.push(path);
  }
}
await walk(root);

for(const path of markdown){
  const text=await readFile(path,'utf8');
  for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    let target=match[1].trim();
    if(target.startsWith('<')&&target.endsWith('>'))target=target.slice(1,-1);
    target=target.split(/\s+["']/)[0];
    if(!target||target.startsWith('#')||/^(?:https?:|mailto:|data:)/i.test(target))continue;
    target=decodeURIComponent(target.split('#')[0].split('?')[0]);
    const resolved=resolve(dirname(path),target);
    if(!resolved.startsWith(root+sep)&&resolved!==root)throw new Error(`${relative(root,path)} links outside the project: ${match[1]}`);
    if(!await exists(resolved))throw new Error(`${relative(root,path)} has broken local link: ${match[1]}`);
  }
}

for(const path of currentForStatus){
  const text=await read(path);
  for(const match of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)){
    if(!packageJson.scripts?.[match[1]])throw new Error(`${path} documents missing package command: npm run ${match[1]}`);
  }
}

const readme=await read('README.md');
if(/WHOLE_CNS_IMPLEMENTATION_REPORT\.md`?\s*[—-]\s*current implementation/i.test(readme))throw new Error('README labels the historical 3.5 whole-CNS report as current');
if(!readme.includes('docs/NEXT_DEVELOPER_HANDOFF.md')||!readme.includes('docs/README.md'))throw new Error('README does not route maintainers through the documentation index and current handoff');

for(const path of historical){
  const opening=(await read(path)).slice(0,800);
  if(!/historical/i.test(opening))throw new Error(`${path} lacks an explicit historical banner near the top`);
}

const architecture=await read('docs/ARCHITECTURE.md');
for(const token of ['zero-safe','identity-only','profile: \'zero-safe\'','47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e','2.435074809384×']){
  if(!architecture.includes(token))throw new Error(`current architecture is missing ${token}`);
}
if(/no cell-type or spike-to-excitation bridge exists/i.test(architecture))throw new Error('architecture regressed to the pre-identity-audit status');

const handoff=await read('docs/NEXT_DEVELOPER_HANDOFF.md');
for(const token of [
  '04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531',
  '47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e',
  '720575941481179066','720575941639281525','2.435074809384',
  'automatic control is disabled','excitationGain','timingTransfer','no `.git` directory',
])if(!handoff.includes(token))throw new Error(`next-developer handoff is missing frozen status fact: ${token}`);

const staleStatus=[
  ['108/108','old deterministic-test count'],
  ['333 files','old source-file count'],
  ['81 JavaScript modules','old JavaScript-module count'],
  ['272 files','old static-artifact count'],
  ['121,347,479 bytes','old static byte total'],
];
for(const path of currentForStatus){
  const text=await read(path);
  for(const [token,label] of staleStatus)if(text.includes(token))throw new Error(`${path} contains ${label}: ${token}`);
}

console.log(`documentation validated: ${markdown.length} Markdown files, local links, commands, current-state facts and historical banners`);
