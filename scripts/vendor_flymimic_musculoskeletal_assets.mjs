import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const flyGymSourceCommit='ca65a510c2afe6ac61c51df4f274c8d190c2f95f';
const flyMimicCommit='9ea1131626cd76f7203b74076ef8f0e9cab30bef';
const assetVersion='20260623a';
const assetPrefix=`flygym_assets/neuromechfly_musculoskeletal_meshes_${assetVersion}`;
const morphologyRoot=resolve(root,`public/data/morphology/flymimic-frontleg-${assetVersion}`);
const modelRoot=resolve(morphologyRoot,'model'),meshRoot=resolve(modelRoot,'meshes/stl');
const licenseRoot=resolve(root,'public/vendor/licenses');
const xmlName='flymimic-frontleg.xml';
const sourceXmlName='best_combined_arm_damping_stiff_cvt3.xml';
const expected=Object.freeze({
  xmlSha256:'04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531',
  licenseSha256:'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4',
  metadataSha256:'54138a21f727bc4ac161fee0840b4f55b571c535bd8e5747216914c8cac30cf3',
  bucketListingSha256:'347c860bc2a0e1d4a018b40466ff671126829cc30fbd0af96c3119759423a45e',
  bucketObjects:72,bucketBytes:13961844,meshFiles:71,
});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const md5=bytes=>createHash('md5').update(bytes).digest('hex');

async function fetchBytes(url){
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function writeVerified(relative,url,destination,{sha=null,size=null,etag=null}={}){
  const bytes=await fetchBytes(url),actualSha=sha256(bytes);
  if(sha&&actualSha!==sha)throw new Error(`${relative} hash ${actualSha} != pinned ${sha}`);
  if(size!==null&&bytes.length!==size)throw new Error(`${relative} length ${bytes.length} != pinned ${size}`);
  if(etag&&md5(bytes)!==etag)throw new Error(`${relative} MD5 does not match pinned S3 ETag ${etag}`);
  await mkdir(resolve(destination,'..'),{recursive:true});await writeFile(destination,bytes);
  return {path:relative,bytes:bytes.length,sha256:actualSha,source:url,...(etag?{sourceEtagMd5:etag}:{})};
}

const flyGymXmlUrl=`https://raw.githubusercontent.com/NeLy-EPFL/flygym/${flyGymSourceCommit}/src/flygym/assets/model/musculoskeletal/${sourceXmlName}`;
const flyMimicXmlUrl=`https://raw.githubusercontent.com/gizemozd/FlyMimic/${flyMimicCommit}/flymimic/assets/models/${sourceXmlName}`;
const [flyGymXml,flyMimicXml]=await Promise.all([fetchBytes(flyGymXmlUrl),fetchBytes(flyMimicXmlUrl)]);
if(sha256(flyGymXml)!==expected.xmlSha256||!flyGymXml.equals(flyMimicXml))throw new Error('Pinned FlyGym and FlyMimic musculoskeletal XML copies differ');

const listUrl=`https://datasets.epfl.ch/nely-public-share?list-type=2&prefix=${encodeURIComponent(`${assetPrefix}/`)}`;
const listing=await (await fetch(listUrl)).text();
const objects=[...listing.matchAll(/<Contents><Key>([^<]+)<\/Key>.*?<ETag>(?:&quot;|")?([^<&"]+)(?:&quot;|")?<\/ETag><Size>(\d+)<\/Size>/g)]
  .map(([,key,etag,size])=>({key,size:Number(size),etag})).sort((a,b)=>a.key.localeCompare(b.key));
if(objects.length!==expected.bucketObjects||objects.reduce((sum,item)=>sum+item.size,0)!==expected.bucketBytes)throw new Error('Pinned FlyGym musculoskeletal S3 inventory drifted');
if(sha256(JSON.stringify(objects))!==expected.bucketListingSha256)throw new Error('Pinned FlyGym musculoskeletal S3 listing identity drifted');
const meshObjects=objects.filter(item=>item.key.endsWith('.stl')),metadataObject=objects.find(item=>item.key.endsWith('/metadata.yaml'));
if(meshObjects.length!==expected.meshFiles||!metadataObject)throw new Error('Musculoskeletal mesh/metadata inventory is incomplete');

const xmlText=flyGymXml.toString('utf8');
const referencedMeshes=[...new Set([...xmlText.matchAll(/<mesh[^>]*\bfile="([^"]+\.stl)"/g)].map(match=>basename(match[1])))].sort();
if(JSON.stringify(referencedMeshes)!==JSON.stringify(meshObjects.map(item=>basename(item.key)).sort()))throw new Error('Musculoskeletal XML mesh references differ from pinned S3 inventory');
if((xmlText.match(/class="muscle" tendon=/g)||[]).length!==15||(xmlText.match(/<spatial name=/g)||[]).length!==15)throw new Error('Musculoskeletal XML no longer contains 15 muscle actuators and 15 spatial tendons');

await mkdir(meshRoot,{recursive:true});await mkdir(licenseRoot,{recursive:true});
const files=[];
await writeFile(resolve(modelRoot,xmlName),flyGymXml);
files.push({path:`model/${xmlName}`,bytes:flyGymXml.length,sha256:sha256(flyGymXml),source:flyGymXmlUrl,identicalFlyMimicSource:flyMimicXmlUrl});
for(const item of meshObjects){
  const name=basename(item.key),url=`https://datasets.epfl.ch/nely-public-share/${item.key}`;
  files.push(await writeVerified(`model/meshes/stl/${name}`,url,resolve(meshRoot,name),item));
}
files.push(await writeVerified('mesh_metadata.yaml',`https://datasets.epfl.ch/nely-public-share/${metadataObject.key}`,resolve(morphologyRoot,'mesh_metadata.yaml'),{...metadataObject,sha:expected.metadataSha256}));
const licenseName=`flymimic-${flyMimicCommit.slice(0,7)}-LICENSE`;
files.push(await writeVerified(`license/${licenseName}`,`https://raw.githubusercontent.com/gizemozd/FlyMimic/${flyMimicCommit}/LICENSE`,resolve(licenseRoot,licenseName),{sha:expected.licenseSha256}));

const artifact={
  schema:'fly-umwelt-musculoskeletal-body-provenance-v1',version:'1.0.0',modelVersion:'3.8.0',
  upstream:{
    project:'FlyMimic musculoskeletal NeuroMechFly front leg in FlyGym v2.1.0',flyGymSourceCommit,flyMimicCommit,
    meshAssetVersion:assetVersion,meshAssetPrefix:assetPrefix,repository:'https://github.com/gizemozd/FlyMimic',license:'Apache-2.0',
    citation:'Özdil et al., Musculoskeletal simulation of limb movement biomechanics in Drosophila melanogaster, ICLR 2026',arxiv:'2509.06426v2',
  },
  runtime:{project:'MuJoCo WebAssembly',version:'3.9.0',sharedProvenance:'../neuromechfly-v2.1.0/provenance.json'},
  sourceContract:{
    scope:'restrained/tethered left-front leg only',muscleActuators:15,spatialTendons:15,meshCount:referencedMeshes.length,timeStepSeconds:.0001,
    controlledJoints:'seven left-front degrees of freedom across thorax-coxa, coxa-trochanter and femur-tibia; right-front coordinates locked; other legs passive or rigid',
    units:'millimetre-gram-second model; force in micronewtons',minimumExcitation:.0001,
  },
  excluded:['FlyMimic PPO policy','motion-capture clips','imitation reward','preprogrammed gait/adhesion timing','mid-/hind-leg anatomical prototypes'],
  evidenceBoundary:'Attachment sites and representative paths are anatomy-derived; maximum isometric force, contraction velocity and other physiological terms contain estimates and multi-behavior optimization. The source paper omits external contact forces and does not supply a BANC spike-to-excitation transfer. This asset is a restrained mechanics qualification body, not free-walking validation.',
  files:files.sort((a,b)=>a.path.localeCompare(b.path)),
};
await writeFile(resolve(morphologyRoot,'provenance.json'),`${JSON.stringify(artifact,null,2)}\n`);
console.log(`vendored FlyMimic ${assetVersion}: ${referencedMeshes.length} meshes, 15 Hill muscles, 15 tendons; ${files.reduce((sum,file)=>sum+file.bytes,0).toLocaleString()} bytes`);
