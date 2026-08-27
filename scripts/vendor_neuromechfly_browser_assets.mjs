import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const upstreamCommit='0884af08981994543634563d95e9b1eb49945082';
const upstreamSourceCommit='ca65a510c2afe6ac61c51df4f274c8d190c2f95f';
const upstreamTag='v2.1.0';
const mujocoVersion='3.9.0';
const rawBase=`https://raw.githubusercontent.com/NeLy-EPFL/flygym/${upstreamCommit}/wasm`;
const morphologyRoot=resolve(root,'public/data/morphology/neuromechfly-v2.1.0');
const modelRoot=resolve(morphologyRoot,'model');
const runtimeRoot=resolve(root,'public/vendor/mujoco-3.9.0');
const licenseRoot=resolve(root,'public/vendor/licenses');
const expected=Object.freeze({
  'model/fly.xml':'cf094a58492f63f0f3e0eaf0625eff469ccde14490e82b951338e71252c6b205',
  'model_meta.json':'93a03fbf9aae6ece279a05d15f79facd4e4d30824c8e5431734521fdf1d46887',
  'runtime/mujoco.js':'1b74d494f7b0c8aa42629d105de4707a361c7b01065e47d3a100790d2951e008',
  'runtime/mujoco.wasm':'9eb895c79cb4d4a6d88bf2d9a449081a5a5c132e6a705ed90252a14b7f21ade8',
  'license/flygym-v2.1.0-LICENSE':'02afa15750a169f0815ff1525dacf28d010f1dfd4cb119fc9e96bfca4f426eb4',
  'license/mujoco-3.9.0-LICENSE':'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function fetchBytes(url){
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchPinned(relative,url,destination,knownHash=null){
  const bytes=await fetchBytes(url),sha256=hash(bytes);
  if(knownHash&&sha256!==knownHash)throw new Error(`${relative} hash ${sha256} != pinned ${knownHash}`);
  await mkdir(resolve(destination,'..'),{recursive:true});
  await writeFile(destination,bytes);
  return {path:relative,bytes:bytes.length,sha256,source:url};
}

await mkdir(modelRoot,{recursive:true});await mkdir(runtimeRoot,{recursive:true});await mkdir(licenseRoot,{recursive:true});
const files=[];
files.push(await fetchPinned(
  'model/fly.xml',`${rawBase}/viewer/assets/model/fly.xml`,resolve(modelRoot,'fly.xml'),expected['model/fly.xml'],
));
files.push(await fetchPinned(
  'model_meta.json',`${rawBase}/viewer/assets/model_meta.json`,resolve(morphologyRoot,'model_meta.json'),expected['model_meta.json'],
));
files.push(await fetchPinned(
  'runtime/mujoco.js',`${rawBase}/shared/vendor/mujoco/mujoco.js`,resolve(runtimeRoot,'mujoco.js'),expected['runtime/mujoco.js'],
));
files.push(await fetchPinned(
  'runtime/mujoco.wasm',`${rawBase}/shared/vendor/mujoco/mujoco.wasm`,resolve(runtimeRoot,'mujoco.wasm'),expected['runtime/mujoco.wasm'],
));
files.push(await fetchPinned(
  'license/flygym-v2.1.0-LICENSE',`https://raw.githubusercontent.com/NeLy-EPFL/flygym/${upstreamSourceCommit}/LICENSE`,resolve(licenseRoot,'flygym-v2.1.0-LICENSE'),expected['license/flygym-v2.1.0-LICENSE'],
));
files.push(await fetchPinned(
  'license/mujoco-3.9.0-LICENSE',`https://raw.githubusercontent.com/google-deepmind/mujoco/${mujocoVersion}/LICENSE`,resolve(licenseRoot,'mujoco-3.9.0-LICENSE'),expected['license/mujoco-3.9.0-LICENSE'],
));

const xml=await readFile(resolve(modelRoot,'fly.xml'),'utf8');
const meshes=[...new Set([...xml.matchAll(/<mesh[^>]*\bfile="([^"]+\.stl)"/g)].map(match=>match[1]))].sort();
if(meshes.length!==39)throw new Error(`expected 39 flattened NeuroMechFly meshes, found ${meshes.length}`);
for(const name of meshes)files.push(await fetchPinned(
  `model/${name}`,`${rawBase}/viewer/assets/model/${name}`,resolve(modelRoot,name),
));

const meta=JSON.parse(await readFile(resolve(morphologyRoot,'model_meta.json'),'utf8'));
if(meta.nq!==133||meta.nu!==42||meta.nbody!==70||meta.timestep!==.0001||meta.actuators?.length!==42)throw new Error('unexpected upstream NeuroMechFly browser-model contract');
const artifact={
  schema:'fly-umwelt-articulated-body-provenance-v1',version:'1.0.0',modelVersion:'3.8.0',
  upstream:{
    project:'FlyGym / NeuroMechFly v2',release:upstreamTag,sourceCommit:upstreamSourceCommit,browserAssetCommit:upstreamCommit,commit:upstreamCommit,
    repository:'https://github.com/NeLy-EPFL/flygym',license:'Apache-2.0',
    citationDoi:'10.1038/s41592-024-02497-y',
    generatedBrowserAssetContext:'Official FlyGym 2.1.0 gh-pages browser viewer; flattened model generated from the live FlyGym body with no locomotion controller.',
  },
  runtime:{project:'MuJoCo',version:mujocoVersion,license:'Apache-2.0',package:'@mujoco/mujoco'},
  modelContract:{
    coordinateUnit:'millimetre',massUnit:'gram',derivedForceUnit:'micronewton',timeStepSeconds:meta.timestep,gravityMmPerSecondSquared:meta.gravity,
    generalizedCoordinates:meta.nq,positionActuators:meta.nu,bodies:meta.nbody,meshCount:meshes.length,
    actuatorScope:'six legs times seven active degrees of freedom; controller-free position actuators in the upstream interactive viewer',
  },
  claimBoundary:'These files provide pinned morphology, mass, joint, collision and simulator structure. Fly Umwelt does not import the FlyGym CPG, tripod controller, preprogrammed steps or game behavior. Upstream actuator gains, friction and solver settings remain model parameters rather than measured fly physiology.',
  files:files.sort((a,b)=>a.path.localeCompare(b.path)),
};
await writeFile(resolve(morphologyRoot,'provenance.json'),`${JSON.stringify(artifact,null,2)}\n`);
console.log(`vendored NeuroMechFly ${upstreamTag}: ${artifact.modelContract.bodies} bodies, ${artifact.modelContract.positionActuators} actuators, ${meshes.length} meshes; MuJoCo ${mujocoVersion}; ${files.reduce((sum,file)=>sum+file.bytes,0).toLocaleString()} bytes`);
