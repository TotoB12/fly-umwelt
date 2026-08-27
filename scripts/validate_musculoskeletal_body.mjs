import {createHash} from 'node:crypto';
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MujocoMusculoskeletalBody} from '../src/core/mujoco-musculoskeletal-body.js';

const root=resolve(import.meta.dirname,'..'),args=new Set(process.argv.slice(2));
const morphologyRoot=resolve(root,'public/data/morphology/flymimic-frontleg-20260623a');
const runtimePath=resolve(root,'public/vendor/mujoco-3.9.0/mujoco.js');
const licenseRoot=resolve(root,'public/vendor/licenses');
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const provenance=JSON.parse(await readFile(resolve(morphologyRoot,'provenance.json'),'utf8'));
const articulatedReport=JSON.parse(await readFile(resolve(root,`docs/benchmarks/articulated-body-qualification-${packageJson.version}.json`),'utf8'));
const xml=await readFile(resolve(morphologyRoot,'model/flymimic-frontleg.xml'),'utf8');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const round=(value,digits=12)=>Number(Number(value).toFixed(digits));
const rounded=values=>Array.from(values,value=>round(value));
const finite=values=>Array.from(values).every(Number.isFinite);

async function walk(directory,prefix=''){
  const output=[];
  for(const name of await readdir(directory)){
    const path=resolve(directory,name),item=await stat(path),key=prefix?`${prefix}/${name}`:name;
    if(item.isDirectory())output.push(...await walk(path,key));else if(item.isFile())output.push(key);
  }
  return output.sort();
}

if(provenance.schema!=='fly-umwelt-musculoskeletal-body-provenance-v1'||provenance.modelVersion!==packageJson.version)throw new Error('musculoskeletal provenance schema/version mismatch');
if(provenance.upstream.flyGymSourceCommit!=='ca65a510c2afe6ac61c51df4f274c8d190c2f95f'||provenance.upstream.flyMimicCommit!=='9ea1131626cd76f7203b74076ef8f0e9cab30bef')throw new Error('FlyGym/FlyMimic source is not commit pinned');
if(provenance.upstream.meshAssetVersion!=='20260623a'||provenance.upstream.meshAssetPrefix!=='flygym_assets/neuromechfly_musculoskeletal_meshes_20260623a')throw new Error('FlyMimic mesh bucket identity drifted');
if(provenance.runtime.version!=='3.9.0'||provenance.upstream.license!=='Apache-2.0')throw new Error('musculoskeletal runtime/license contract drifted');
if(provenance.files.length!==74||provenance.files.reduce((sum,file)=>sum+file.bytes,0)!==14022871)throw new Error('tracked FlyMimic file count/bytes drifted');

const resolvedFile=file=>file.path.startsWith('license/')?resolve(licenseRoot,file.path.slice('license/'.length)):resolve(morphologyRoot,file.path);
for(const file of provenance.files){
  const bytes=await readFile(resolvedFile(file));
  if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw new Error(`${file.path} differs from pinned provenance`);
}
const expectedMorphologyFiles=[...provenance.files.filter(file=>!file.path.startsWith('license/')).map(file=>file.path),'provenance.json'].sort();
if(JSON.stringify(await walk(morphologyRoot))!==JSON.stringify(expectedMorphologyFiles))throw new Error('untracked or missing file in FlyMimic morphology bundle');
if(sha256(Buffer.from(xml))!=='04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531')throw new Error('musculoskeletal XML identity drifted');
if(/<freejoint\b|type="free"/i.test(xml))throw new Error('restrained qualification model unexpectedly has a free root');
if((xml.match(/<spatial name=/g)||[]).length!==15||(xml.match(/class="muscle" tendon=/g)||[]).length!==15)throw new Error('source tendon/muscle counts drifted');
if((xml.match(/ctrlrange="0\.0001 1"/g)||[]).length!==15)throw new Error('source minimum-excitation boundary drifted');
if((xml.match(/_locked" joint1=/g)||[]).length!==7)throw new Error('right-front equality-lock contract drifted');
if(provenance.files.some(file=>/policy|mocap|motion.?capture|reward|controller|trajectory|steps?\.(?:json|js|npy|npz|pkl)$/i.test(file.path)))throw new Error('controller/imitation asset entered musculoskeletal bundle');

const body=await MujocoMusculoskeletalBody.load({
  runtimeUrl:pathToFileURL(runtimePath),
  loadJson:async()=>provenance,
  loadBinary:async url=>{
    const key=new URL(String(url),'https://same-origin.invalid').pathname.replace('/data/morphology/flymimic-frontleg-20260623a/','');
    return readFile(resolve(morphologyRoot,key));
  },
});

const expectedMuscles=[
  'LFC_tergopleural_promotor_a','LFC_tergopleural_promotor_b','LFC_pleural_remotor_and_abductor','LFC_pleural_promotor',
  'LFC_sternal_anterior_rotator','LFC_sternal_posterior_rotator','LFC_sternal_adductor','LFF_trochanter_flexor_b',
  'LFF_sterno-tergo-trochanter_extensor_a','LFF_sterno-tergo-trochanter_extensor_b','LFF_accesory_trochanter_flexor',
  'LFF_trochanter_extensor','LFF_trochanter_flexor_a','LFTibia_flex_93434','LFTibia_extensor_93932',
];
const expectedTendons=expectedMuscles.map(name=>`${name}_tendon`);
const expectedJoints=[
  'joint_LFCoxa_yaw','joint_LFCoxa_pitch','joint_LFCoxa_roll','joint_LFTrochanter_yaw','joint_LFTrochanter_pitch','joint_LFTrochanter_roll','joint_LFTibia_pitch',
  'joint_RFCoxa_roll','joint_RFCoxa_yaw','joint_RFCoxa_pitch','joint_RFTrochanter_yaw','joint_RFTrochanter_pitch','joint_RFTrochanter_roll','joint_RFTibia_pitch',
];

try{
  const {model,mujoco}=body;
  const muscleNames=body.muscles.map(item=>item.name),tendonNames=body.tendonState().map(item=>item.name),jointNames=body.joints.map(item=>item.name);
  if(JSON.stringify(muscleNames)!==JSON.stringify(expectedMuscles)||JSON.stringify(tendonNames)!==JSON.stringify(expectedTendons)||JSON.stringify(jointNames)!==JSON.stringify(expectedJoints))throw new Error('compiled muscle/tendon/joint identity drifted');
  if(!Array.from(model.jnt_type).every(type=>type===3))throw new Error('compiled restrained coordinates are not all hinge joints');
  if(!Array.from(model.actuator_dyntype).every(type=>type===4)||!Array.from(model.actuator_actnum).every(count=>count===1))throw new Error('compiled actuators are not 15 one-state Hill muscles');
  if(!body.muscles.every(item=>item.controlRange[0]===.0001&&item.controlRange[1]===1&&item.tendonId===item.id))throw new Error('compiled excitation/tendon mapping drifted');

  const totalMassGrams=mujoco.mj_getTotalmass(model),viewerMassMilligrams=articulatedReport.compiled.totalMassMilligrams;
  if(Math.abs(totalMassGrams-.0024942714779999996)>1e-15||viewerMassMilligrams!==1.02431)throw new Error('whole-body mass discrepancy baseline drifted');
  const keyframe=body.resetDefault(),requestedZero=new Array(model.nu).fill(0),appliedZero=body.setMuscleExcitations(requestedZero);
  if(!appliedZero.every(value=>value===.0001))throw new Error('requested zero no longer clamps to source minimum excitation');
  mujoco.mj_forward(model,body.data);
  const zeroSnapshot=body.snapshot(),nonzeroPassive=zeroSnapshot.muscles.filter(item=>Math.abs(item.forceMicroNewtons)>1e-12);
  if(nonzeroPassive.length===0)throw new Error('expected passive keyframe muscle force disappeared');

  const serialized=body.serialize();body.step(.001);body.restore(serialized);
  if(JSON.stringify(body.serialize())!==JSON.stringify(serialized))throw new Error('musculoskeletal state does not round-trip exactly');
  let profileRejected=false;try{body.restore({...serialized,physicsProfileKey:'wrong-profile'});}catch(error){profileRejected=/different physics profile/.test(error.message);}
  if(!profileRejected)throw new Error('cross-profile musculoskeletal restore was not rejected');

  body.resetDefault();let maximumAbsoluteState=0;
  for(let sample=0;sample<300;sample++){
    body.step(.001);const values=[...body.data.qpos,...body.data.qvel,...body.data.act,...body.data.actuator_force];
    if(!finite(values))throw new Error(`passive settling became nonfinite at ${body.data.time} seconds`);
    maximumAbsoluteState=Math.max(maximumAbsoluteState,...values.map(Math.abs));
  }
  const passiveEndpoint=body.snapshot();

  body.resetDefault();body.step(.2);const interventionStart=body.serialize();
  const flexor=body.muscles.find(item=>item.name==='LFTibia_flex_93434'),extensor=body.muscles.find(item=>item.name==='LFTibia_extensor_93932');
  const tibiaJoint=body.joints.find(item=>item.name==='joint_LFTibia_pitch');
  const select=()=>{
    const joint=body.jointState()[tibiaJoint.id],muscles=body.muscleState();
    const flex=muscles[flexor.id],ext=muscles[extensor.id];
    return {
      timeSeconds:round(body.data.time),positionRadians:round(joint.positionRadians),velocityRadiansPerSecond:round(joint.velocityRadiansPerSecond),
      actuatorGeneralizedForceMicroNewtonMillimetres:round(joint.actuatorGeneralizedForceMicroNewtonMillimetres),
      flexorActivation:round(flex.activation),flexorForceMicroNewtons:round(flex.forceMicroNewtons),
      extensorActivation:round(ext.activation),extensorForceMicroNewtons:round(ext.forceMicroNewtons),
      flexorMomentArmMm:round(flex.momentArmsMm.find(item=>item.jointName===tibiaJoint.name).momentArmMm),
      extensorMomentArmMm:round(ext.momentArmsMm.find(item=>item.jointName===tibiaJoint.name).momentArmMm),
    };
  };
  const run=actuator=>{
    body.restore(interventionStart);const excitation=new Array(model.nu).fill(0);if(actuator)excitation[actuator.id]=.1;
    body.setMuscleExcitations(excitation);body.step(.01);return select();
  };
  const baseline=run(null),flex=run(flexor),ext=run(extensor);
  const delta=(value,reference)=>Object.fromEntries(Object.keys(value).filter(key=>key!=='timeSeconds'&&!key.endsWith('MomentArmMm')).map(key=>[key,round(value[key]-reference[key])]));
  const flexDelta=delta(flex,baseline),extDelta=delta(ext,baseline);
  if(!(flexDelta.positionRadians>0&&flexDelta.velocityRadiansPerSecond>0&&flexDelta.actuatorGeneralizedForceMicroNewtonMillimetres>0&&flexDelta.flexorForceMicroNewtons<0))throw new Error('isolated flexor intervention lacks the compiled positive pitch/torque response');
  if(!(extDelta.positionRadians<0&&extDelta.velocityRadiansPerSecond<0&&extDelta.actuatorGeneralizedForceMicroNewtonMillimetres<0&&extDelta.extensorForceMicroNewtons<0))throw new Error('isolated extensor intervention lacks the compiled negative pitch/torque response');
  if(!(baseline.flexorMomentArmMm<0&&baseline.extensorMomentArmMm>0))throw new Error('front tibia antagonist moment arms are not oppositely signed');

  const report={
    schema:'fly-umwelt-musculoskeletal-body-qualification-v1',version:'1.0.0',modelVersion:packageJson.version,
    qualificationScope:'Controller-free, restrained FlyMimic left-front-leg muscle/tendon mechanics. This is not the live plant or free-walking validation.',
    provenance:{
      flyGymSourceCommit:provenance.upstream.flyGymSourceCommit,flyMimicCommit:provenance.upstream.flyMimicCommit,
      meshAssetVersion:provenance.upstream.meshAssetVersion,xmlSha256:sha256(Buffer.from(xml)),trackedFiles:provenance.files.length,
      trackedBytes:provenance.files.reduce((sum,file)=>sum+file.bytes,0),license:provenance.upstream.license,citation:provenance.upstream.citation,arxiv:provenance.upstream.arxiv,
    },
    compiled:{
      generalizedCoordinates:model.nq,generalizedVelocities:model.nv,bodies:model.nbody,joints:model.njnt,equalityConstraints:model.neq,
      muscleActuators:model.nu,activationStates:model.na,spatialTendons:model.ntendon,meshes:model.nmesh,geometries:model.ngeom,keyframes:model.nkey,sensors:model.nsensor,
      timeStepSeconds:model.opt.timestep,anchoredRoot:true,allCoordinatesHinge:true,rightFrontEqualityLocks:7,
      keyframeQpos:rounded(keyframe.qpos),muscleNames,tendonNames,jointNames,
      controlRanges:body.muscles.map(item=>rounded(item.controlRange)),muscleDynamicsType:4,
      totalMassGrams:round(totalMassGrams,15),totalMassMilligrams:round(totalMassGrams*1000,12),
      comparisonViewerBodyMassMilligrams:viewerMassMilligrams,massDifferenceMilligrams:round(totalMassGrams*1000-viewerMassMilligrams),massRatioToViewerBody:round(totalMassGrams*1000/viewerMassMilligrams),
    },
    probes:{
      exactStateRoundTrip:true,crossPhysicsProfileRestoreRejected:true,
      zeroEvidenceBoundary:{requestedExcitation:requestedZero,appliedExcitation:appliedZero,sourceMinimumExcitation:.0001,activationAtKeyframe:rounded(zeroSnapshot.act),passiveForceAtKeyframeMicroNewtons:zeroSnapshot.muscles.map(item=>round(item.forceMicroNewtons)),nonzeroPassiveMuscles:nonzeroPassive.map(item=>item.name),automaticNeuralBridgeEnabled:false,result:'FAIL: source minimum excitation and unresolved BANC spike-to-excitation gain violate the project zero-neural-evidence rule'},
      passiveSettling:{durationSeconds:.3,finite:true,maximumAbsoluteSampledState:round(maximumAbsoluteState),endpoint:{timeSeconds:round(passiveEndpoint.time),qpos:rounded(passiveEndpoint.qpos),qvel:rounded(passiveEndpoint.qvel),activation:rounded(passiveEndpoint.act)}},
      antagonistIntervention:{settleSeconds:.2,interventionSeconds:.01,isolatedExcitation:.1,passiveContinuation:baseline,flexor:{name:flexor.name,endpoint:flex,deltaFromPassiveContinuation:flexDelta},extensor:{name:extensor.name,endpoint:ext,deltaFromPassiveContinuation:extDelta},oppositePitchAndGeneralizedForce:true,comparisonUsesIdenticalSerializedStart:true},
    },
    passed:{assetIntegrity:true,compiledContract:true,anchoredRestrainedBoundary:true,finitePassiveSettling:true,exactStateIsolation:true,anatomicalAntagonistMechanics:true,zeroNeuralEvidenceRule:false,automaticBancIntegration:false},
    limitations:[
      'The source validates a restrained left-front-leg model, not untethered whole-fly walking or external contact forces.',
      'Maximum isometric force, contraction velocity and other physiological parameters were not directly measured and include estimates plus multi-behavior optimization.',
      'The 2.494271478 mg compiled whole-body mass differs materially from the 1.02431 mg NeuroMechFly viewer body and the models are not interchangeable.',
      'Every actuator has a 0.0001 minimum excitation and passive muscle/tendon force can be nonzero when requested excitation is zero.',
      'No BANC spike-to-excitation amplitude mapping, adhesion mechanism, policy, motion-capture target, gait phase or contact controller is present or enabled.',
      'The labels LFTibia_flex_93434 and LFTibia_extensor_93932 have a compiled antagonist effect, but BANC cell-type identity and physiological excitation gain remain unpromoted.',
    ],
  };

  const reportPath=resolve(root,`docs/benchmarks/musculoskeletal-body-qualification-${packageJson.version}.json`),serializedReport=`${JSON.stringify(report,null,2)}\n`;
  if(args.has('--write')){await writeFile(reportPath,serializedReport);console.log(`wrote ${relative(root,reportPath)}`);}
  else{
    let frozen;try{frozen=JSON.parse(await readFile(reportPath,'utf8'));}catch{throw new Error(`missing frozen musculoskeletal qualification; run npm run body:musculoskeletal:write`);}
    if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('musculoskeletal qualification report drifted; inspect and regenerate deliberately with --write');
  }
  console.log(`qualified restrained FlyMimic body: ${model.nbody} bodies, ${model.nu} Hill muscles, ${model.ntendon} tendons; flex/ext antagonist response passed; zero-evidence bridge failed and remains disabled`);
}finally{body.dispose();}
