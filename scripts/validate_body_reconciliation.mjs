import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MujocoArticulatedBody} from '../src/core/mujoco-articulated-body.js';
import {MujocoMusculoskeletalBody} from '../src/core/mujoco-musculoskeletal-body.js';

const root=resolve(import.meta.dirname,'..'),args=new Set(process.argv.slice(2));
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const viewerRoot=resolve(root,'public/data/morphology/neuromechfly-v2.1.0');
const muscleRoot=resolve(root,'public/data/morphology/flymimic-frontleg-20260623a');
const viewerProvenance=JSON.parse(await readFile(resolve(viewerRoot,'provenance.json'),'utf8'));
const muscleProvenance=JSON.parse(await readFile(resolve(muscleRoot,'provenance.json'),'utf8'));
const viewerXml=await readFile(resolve(viewerRoot,'model/fly.xml'),'utf8');
const muscleXml=await readFile(resolve(muscleRoot,'model/flymimic-frontleg.xml'),'utf8');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const round=(value,digits=12)=>Number(Number(value).toFixed(digits));
const rounded=values=>Array.from(values,value=>round(value));
const runtimeUrl=pathToFileURL(resolve(root,'public/vendor/mujoco-3.9.0/mujoco.js'));
const localJson=async url=>JSON.parse(await readFile(new URL(url),'utf8'));
const localBinary=async url=>readFile(new URL(url));

const canonicalBodyName=(name,model)=>{
  let value=String(name||'').replace(/^nmf\//,'').toLowerCase();
  if(model==='viewer'){
    if(value==='c_abdomen12')value='a1a2';
    else if(/^c_abdomen[3-6]$/.test(value))value=`a${value.at(-1)}`;
    else value=value.replace(/^c_/,'');
  }
  return value.replaceAll('_','');
};

const summarize=(body,kind)=>{
  const {model,mujoco}=body;
  const snapshot=kind==='viewer'?body.resetNeutral():body.resetDefault();
  const bodies=Array.from({length:model.nbody},(_,id)=>{
    const name=model.body(id).name,parentId=model.body_parentid[id];
    return {id,name,canonicalName:canonicalBodyName(name,kind),parentId,parentName:id?model.body(parentId).name:null,massMilligrams:round(model.body_mass[id]*1000,15),inertiaGramSquareMillimetres:rounded(model.body_inertia.slice(id*3,id*3+3)),keyframePositionMm:rounded(body.data.xpos.slice(id*3,id*3+3))};
  });
  const joints=Array.from({length:model.njnt},(_,id)=>({id,name:model.jnt(id).name,type:model.jnt_type[id],qposAddress:model.jnt_qposadr[id],dofAddress:model.jnt_dofadr[id],rangeRadians:rounded(model.jnt_range.slice(id*2,id*2+2)),keyframeQpos:model.jnt_type[id]===0?null:round(body.data.qpos[model.jnt_qposadr[id]])}));
  const geoms=Array.from({length:model.ngeom},(_,id)=>({id,name:model.geom(id).name,bodyName:model.body(model.geom_bodyid[id]).name,contype:model.geom_contype[id],conaffinity:model.geom_conaffinity[id]}));
  const pairs=Array.from({length:model.npair},(_,id)=>({id,geom1:model.geom(model.pair_geom1[id]).name,geom2:model.geom(model.pair_geom2[id]).name}));
  return {
    contract:{bodies:model.nbody,generalizedCoordinates:model.nq,generalizedVelocities:model.nv,joints:model.njnt,actuators:model.nu,activationStates:model.na,spatialTendons:model.ntendon,compiledMeshes:model.nmesh,geometries:model.ngeom,explicitContactPairs:model.npair,sensors:model.nsensor,sensorValues:model.nsensordata,keyframes:model.nkey,timeStepSeconds:model.opt.timestep,gravityMmPerSecondSquared:rounded(model.opt.gravity),totalMassMilligrams:round(mujoco.mj_getTotalmass(model)*1000)},
    keyframe:{name:model.key(0).name,rootQpos:kind==='viewer'?rounded(snapshot.qpos.slice(0,7)):null,leftFrontJoints:joints.filter(item=>/joint_LF/i.test(item.name))},
    bodies,geoms,pairs,sensorNames:Array.from({length:model.nsensor},(_,id)=>model.sensor(id).name),
  };
};

const viewer=await MujocoArticulatedBody.load({
  runtimeUrl,modelBaseUrl:pathToFileURL(viewerRoot).href.replace(/\/$/,''),
  bridgeUrl:pathToFileURL(resolve(root,'public/data/calibration/articulated-body-bridge-v1.json')),
  loadJson:localJson,loadBinary:localBinary,
});
const viewerSummary=summarize(viewer,'viewer');viewer.dispose();
const muscle=await MujocoMusculoskeletalBody.load({
  profile:'source',runtimeUrl,loadJson:async()=>muscleProvenance,
  loadBinary:async url=>{
    const key=new URL(String(url),'https://same-origin.invalid').pathname.replace('/data/morphology/flymimic-frontleg-20260623a/','');
    return readFile(resolve(muscleRoot,key));
  },
});
const muscleSummary=summarize(muscle,'muscle');muscle.dispose();

if(viewerSummary.contract.bodies!==70||viewerSummary.contract.generalizedCoordinates!==133||viewerSummary.contract.actuators!==42||viewerSummary.contract.sensors!==6)throw new Error('viewer compiled contract drifted');
if(muscleSummary.contract.bodies!==73||muscleSummary.contract.generalizedCoordinates!==14||muscleSummary.contract.actuators!==15||muscleSummary.contract.activationStates!==15||muscleSummary.contract.spatialTendons!==15||muscleSummary.contract.sensors!==0)throw new Error('FlyMimic compiled contract drifted');
if(viewerSummary.keyframe.rootQpos===null||muscleSummary.keyframe.rootQpos!==null)throw new Error('free-root versus anchored-root boundary drifted');
if(JSON.stringify(viewerSummary.contract.gravityMmPerSecondSquared)!==JSON.stringify([0,0,-9810])||JSON.stringify(muscleSummary.contract.gravityMmPerSecondSquared)!==JSON.stringify([0,0,-9801]))throw new Error('gravity discrepancy baseline drifted');
if(Math.abs(viewerSummary.contract.totalMassMilligrams-1.02431)>1e-12||Math.abs(muscleSummary.contract.totalMassMilligrams-2.494271478)>2e-12)throw new Error(`mass discrepancy baseline drifted: ${viewerSummary.contract.totalMassMilligrams} / ${muscleSummary.contract.totalMassMilligrams}`);

const viewerByCanonical=new Map(viewerSummary.bodies.map(item=>[item.canonicalName,item]));
const muscleByCanonical=new Map(muscleSummary.bodies.map(item=>[item.canonicalName,item]));
const canonicalIntersection=[...viewerByCanonical.keys()].filter(name=>muscleByCanonical.has(name)).sort();
const viewerOnly=[...viewerByCanonical.keys()].filter(name=>!muscleByCanonical.has(name)).sort();
const muscleOnly=[...muscleByCanonical.keys()].filter(name=>!viewerByCanonical.has(name)).sort();
if(canonicalIntersection.length<50||!viewerOnly.some(name=>name.includes('trochanterfemur'))||!muscleOnly.includes('lffemur')||!muscleOnly.includes('lftrochanter'))throw new Error('expected body segmentation discrepancy disappeared');

const directLfCanonical=['thorax','lfcoxa','lftibia','lftarsus1','lftarsus2','lftarsus3','lftarsus4','lftarsus5'];
const directLfComparisons=directLfCanonical.map(canonicalName=>{
  const viewerBody=viewerByCanonical.get(canonicalName),muscleBody=muscleByCanonical.get(canonicalName);
  if(!viewerBody||!muscleBody)throw new Error(`missing direct LF reconciliation body ${canonicalName}`);
  return {canonicalName,viewerBody:viewerBody.name,flyMimicBody:muscleBody.name,viewerMassMilligrams:viewerBody.massMilligrams,flyMimicMassMilligrams:muscleBody.massMilligrams,massRatioFlyMimicToViewer:viewerBody.massMilligrams?round(muscleBody.massMilligrams/viewerBody.massMilligrams):null,viewerInertiaGramSquareMillimetres:viewerBody.inertiaGramSquareMillimetres,flyMimicInertiaGramSquareMillimetres:muscleBody.inertiaGramSquareMillimetres,viewerKeyframePositionMm:viewerBody.keyframePositionMm,flyMimicKeyframePositionMm:muscleBody.keyframePositionMm};
});
const viewerTrochanterFemur=viewerByCanonical.get('lftrochanterfemur'),muscleTrochanter=muscleByCanonical.get('lftrochanter'),muscleFemur=muscleByCanonical.get('lffemur');
const segmentedLfComparison={viewerBody:viewerTrochanterFemur.name,viewerMassMilligrams:viewerTrochanterFemur.massMilligrams,flyMimicBodies:[muscleTrochanter.name,muscleFemur.name],flyMimicCombinedMassMilligrams:round(muscleTrochanter.massMilligrams+muscleFemur.massMilligrams,15),massRatioFlyMimicToViewer:round((muscleTrochanter.massMilligrams+muscleFemur.massMilligrams)/viewerTrochanterFemur.massMilligrams),inertiaComparisonValid:false,reason:'The FlyMimic trochanter and femur have separate frames. Their diagonal inertias cannot be added without rotations, centres of mass and the parallel-axis theorem.'};

const viewerMaskCollision=viewerSummary.geoms.filter(item=>item.contype||item.conaffinity);
const muscleMaskCollision=muscleSummary.geoms.filter(item=>item.contype||item.conaffinity);
if(viewerMaskCollision.length!==0||viewerSummary.pairs.length!==55||muscleMaskCollision.length!==72||muscleSummary.pairs.length!==0)throw new Error('contact declaration discrepancy baseline drifted');
const viewerMeshAssets=viewerProvenance.files.filter(file=>file.path.endsWith('.stl')).length;
const muscleMeshAssets=muscleProvenance.files.filter(file=>file.path.endsWith('.stl')).length;
if(viewerMeshAssets!==39||muscleMeshAssets!==71)throw new Error('source mesh inventory discrepancy drifted');

const report={
  schema:'fly-umwelt-body-reconciliation-v1',version:'1.0.0',modelVersion:packageJson.version,
  scope:'Read-only compiled comparison of the free-root NeuroMechFly browser body and restrained FlyMimic muscle body. This report does not merge, rescale or transfer parameters.',
  provenance:{viewer:{commit:viewerProvenance.upstream.commit,xmlSha256:sha256(viewerXml),sourceMeshAssets:viewerMeshAssets},flyMimic:{commit:muscleProvenance.upstream.flyMimicCommit,xmlSha256:sha256(muscleXml),sourceMeshAssets:muscleMeshAssets},runtime:'MuJoCo 3.9.0'},
  compiledComparison:{
    viewer:{...viewerSummary.contract,root:'one free joint named nmf',actuatorKind:'42 controller-free position actuators',sourceMeshAssets:viewerMeshAssets},
    flyMimic:{...muscleSummary.contract,root:'anchored thorax; 14 hinge coordinates with seven right-front equality locks',actuatorKind:'15 stateful Hill muscle actuators',sourceMeshAssets:muscleMeshAssets},
    massDifferenceMilligrams:round(muscleSummary.contract.totalMassMilligrams-viewerSummary.contract.totalMassMilligrams),massRatioFlyMimicToViewer:round(muscleSummary.contract.totalMassMilligrams/viewerSummary.contract.totalMassMilligrams),sameGravity:false,sameRootTopology:false,sameActuatorSemantics:false,sameSensorContract:false,
  },
  bodyIdentity:{rawNameIntersection:['world'],canonicalization:'Comparison-only lower-case normalization removes nmf/, c_ and underscores and maps c_abdomen12 to A1A2; no runtime names are changed.',canonicalIntersectionCount:canonicalIntersection.length,canonicalIntersection,viewerOnlyCanonical:viewerOnly,flyMimicOnlyCanonical:muscleOnly,leftFrontDirectComparisons:directLfComparisons,leftFrontTrochanterFemurSegmentation:segmentedLfComparison},
  coordinates:{viewer:viewerSummary.keyframe,flyMimic:muscleSummary.keyframe,transferReady:false,reason:'The viewer keyframe includes a seven-value free root and six articulated legs; FlyMimic has 14 restrained front-leg hinges, locks the right side and uses a different LF body segmentation and frame convention.'},
  contact:{
    viewer:{collisionMaskEnabledGeometries:viewerMaskCollision.length,explicitGroundPairs:viewerSummary.pairs.length,contactSensors:viewerSummary.contract.sensors,sensorNames:viewerSummary.sensorNames,qualification:'Free-root passive ground/room contact is separately qualified; base XML uses explicit pairs even though geom masks are zero.'},
    flyMimic:{collisionMaskEnabledGeometries:muscleMaskCollision.length,explicitPairs:muscleSummary.pairs.length,contactSensors:muscleSummary.contract.sensors,hasFloorGeometry:muscleSummary.geoms.some(item=>item.name==='floor'),qualification:'Collision-capable geoms compile, but the body is anchored, has no contact sensors, and the source paper omitted external-contact validation.'},
    externalLoadTransferReady:false,adhesionTransferReady:false,
  },
  decision:{mechanicallyMergeable:false,livePlantReplacementAllowed:false,massOrInertiaTransferAllowed:false,contactTransferAllowed:false,muscleRouteTransferAllowed:false,reasons:['Total mass differs by a factor greater than two.','Root topology, generalized coordinates and actuator semantics differ.','The viewer combines trochanter/femur bodies that FlyMimic separates at least in the front legs.','Matched LF segments have different compiled masses, inertias and keyframe frames.','Only the viewer has a qualified free-root external-contact/sensor path; only FlyMimic has muscle/tendon routes.']},
  nextEvidenceGates:['Reconcile segment geometry, frames, centres of mass and inertias against one explicitly chosen morphology without averaging incompatible bodies.','Validate FlyMimic external contact/load behavior in an untethered preparation before adding room collision or adhesion.','Extend muscle/tendon routes and afferents to all legs from anatomical evidence.','Retain distinct physics-profile state schemas until a single compiled body passes mass, contact, afferent and actuator qualifications.'],
};
const reportPath=resolve(root,`docs/benchmarks/body-reconciliation-${packageJson.version}.json`),serialized=`${JSON.stringify(report,null,2)}\n`;
if(args.has('--write')){await writeFile(reportPath,serialized);console.log(`wrote ${relative(root,reportPath)}`);}
else{
  let frozen;try{frozen=JSON.parse(await readFile(reportPath,'utf8'));}catch{throw new Error('missing frozen body reconciliation; run npm run body:reconcile:write');}
  if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('body reconciliation report drifted; inspect and regenerate deliberately with --write');
}
console.log(`reconciled bodies without merging: ${canonicalIntersection.length} canonical matches; mass ratio ${report.compiledComparison.massRatioFlyMimicToViewer}; contact/load transfer remains blocked`);
