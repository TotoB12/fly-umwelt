import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  deriveZeroSafeMusculoskeletalXml,
  MujocoMusculoskeletalBody,
  MUSCULOSKELETAL_BODY_PROFILES,
  MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE,
} from '../src/core/mujoco-musculoskeletal-body.js';

const root=resolve(import.meta.dirname,'..'),args=new Set(process.argv.slice(2));
const morphologyRoot=resolve(root,'public/data/morphology/flymimic-frontleg-20260623a');
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const provenance=JSON.parse(await readFile(resolve(morphologyRoot,'provenance.json'),'utf8'));
const sourceXml=await readFile(resolve(morphologyRoot,'model/flymimic-frontleg.xml'),'utf8');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const round=(value,digits=12)=>Number(Number(value).toFixed(digits));
const rounded=values=>Array.from(values,value=>round(value));
const exact=(actual,expected,label)=>{
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${label} differs between source and zero-safe profiles`);
};

const sourceSha256=sha256(sourceXml),derivedXml=deriveZeroSafeMusculoskeletalXml(sourceXml),derivedSha256=sha256(derivedXml);
if(sourceSha256!=='04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531')throw new Error('pinned source XML identity drifted');
if(derivedSha256!==MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE.sha256)throw new Error('zero-safe XML derivative identity drifted');
if((sourceXml.match(/ctrlrange="0\.0001 1"/g)||[]).length!==MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE.replacements)throw new Error('source XML no longer exposes exactly 15 muscle control floors');
if((derivedXml.match(/ctrlrange="0\.0001 1"/g)||[]).length!==0)throw new Error('derived XML retained a muscle control floor');
if(sourceXml===derivedXml||Buffer.byteLength(sourceXml)-Buffer.byteLength(derivedXml)!==75)throw new Error('zero-safe derivation does not have the exact expected edit extent');

const runtimeUrl=pathToFileURL(resolve(root,'public/vendor/mujoco-3.9.0/mujoco.js'));
const loadBody=profile=>MujocoMusculoskeletalBody.load({
  profile,runtimeUrl,loadJson:async()=>provenance,
  loadBinary:async url=>{
    const key=new URL(String(url),'https://same-origin.invalid').pathname.replace('/data/morphology/flymimic-frontleg-20260623a/','');
    return readFile(resolve(morphologyRoot,key));
  },
});

const source=await loadBody('source'),zeroSafe=await loadBody('zero-safe');
try{
  if(source.physicsProfileKey===zeroSafe.physicsProfileKey||source.profile!=='source'||zeroSafe.profile!=='zero-safe')throw new Error('musculoskeletal profiles are not state-isolated');
  if(!source.muscles.every(item=>item.controlRange[0]===.0001)||!zeroSafe.muscles.every(item=>item.controlRange[0]===0))throw new Error('compiled profile control ranges drifted');
  const sourceKeyframe=source.resetDefault(),zeroKeyframe=zeroSafe.resetDefault();
  exact(sourceKeyframe.qpos,zeroKeyframe.qpos,'keyframe qpos');
  exact(sourceKeyframe.qvel,zeroKeyframe.qvel,'keyframe qvel');
  exact(sourceKeyframe.act,zeroKeyframe.act,'keyframe activation');
  exact(sourceKeyframe.tendons,zeroKeyframe.tendons,'keyframe tendon state');
  exact(sourceKeyframe.muscles.map(item=>item.forceMicroNewtons),zeroKeyframe.muscles.map(item=>item.forceMicroNewtons),'keyframe passive force');
  exact(sourceKeyframe.muscles.map(item=>item.muscleTendonLengthMm),zeroKeyframe.muscles.map(item=>item.muscleTendonLengthMm),'keyframe muscle-tendon length');
  exact(sourceKeyframe.muscles.map(item=>item.momentArmsMm),zeroKeyframe.muscles.map(item=>item.momentArmsMm),'keyframe sparse moment arms');
  const sourceMass=source.mujoco.mj_getTotalmass(source.model),zeroMass=zeroSafe.mujoco.mj_getTotalmass(zeroSafe.model);
  if(sourceMass!==zeroMass)throw new Error('zero-safe derivation changed compiled mass');

  const requestedZero=new Array(zeroSafe.model.nu).fill(0),appliedZero=zeroSafe.setMuscleExcitations(requestedZero);
  if(!appliedZero.every(value=>value===0))throw new Error('zero-safe requested zero did not remain exactly zero');
  zeroSafe.step(.05);const zeroHold=zeroSafe.snapshot();
  if(!zeroHold.ctrl.every(value=>value===0)||!zeroHold.act.every(value=>value===0))throw new Error('zero-safe zero-initial activation did not remain exactly zero');
  const passiveAtKeyframe=zeroKeyframe.muscles.filter(item=>Math.abs(item.forceMicroNewtons)>1e-12);
  const passiveAfterHold=zeroHold.muscles.filter(item=>Math.abs(item.forceMicroNewtons)>1e-12);
  if(!passiveAtKeyframe.length||!passiveAfterHold.length)throw new Error('zero-safe profile erased inspectable passive elastic force');

  const sourceState=source.serialize(),zeroState=zeroSafe.serialize();
  let sourceIntoZeroRejected=false,zeroIntoSourceRejected=false;
  try{zeroSafe.restore(sourceState);}catch(error){sourceIntoZeroRejected=/different physics profile/.test(error.message);}
  try{source.restore(zeroState);}catch(error){zeroIntoSourceRejected=/different physics profile/.test(error.message);}
  if(!sourceIntoZeroRejected||!zeroIntoSourceRejected)throw new Error('cross-profile state restore was not rejected in both directions');

  zeroSafe.resetDefault();zeroSafe.step(.2);const interventionStart=zeroSafe.serialize();
  const flexor=zeroSafe.muscles.find(item=>item.name==='LFTibia_flex_93434');
  const extensor=zeroSafe.muscles.find(item=>item.name==='LFTibia_extensor_93932');
  const tibiaJoint=zeroSafe.joints.find(item=>item.name==='joint_LFTibia_pitch');
  const select=()=>{
    const joint=zeroSafe.jointState()[tibiaJoint.id],muscles=zeroSafe.muscleState();
    return {positionRadians:round(joint.positionRadians),velocityRadiansPerSecond:round(joint.velocityRadiansPerSecond),actuatorGeneralizedForceMicroNewtonMillimetres:round(joint.actuatorGeneralizedForceMicroNewtonMillimetres),flexorActivation:round(muscles[flexor.id].activation),flexorForceMicroNewtons:round(muscles[flexor.id].forceMicroNewtons),extensorActivation:round(muscles[extensor.id].activation),extensorForceMicroNewtons:round(muscles[extensor.id].forceMicroNewtons)};
  };
  const run=actuator=>{
    zeroSafe.restore(interventionStart);const controls=new Array(zeroSafe.model.nu).fill(0);
    if(actuator)controls[actuator.id]=.1;
    zeroSafe.setMuscleExcitations(controls);zeroSafe.step(.01);return select();
  };
  const baseline=run(null),flex=run(flexor),ext=run(extensor);
  const delta=(value,reference)=>Object.fromEntries(Object.keys(value).map(key=>[key,round(value[key]-reference[key])]));
  const flexDelta=delta(flex,baseline),extDelta=delta(ext,baseline);
  if(!(flexDelta.positionRadians>0&&flexDelta.velocityRadiansPerSecond>0&&flexDelta.actuatorGeneralizedForceMicroNewtonMillimetres>0&&flexDelta.flexorForceMicroNewtons<0))throw new Error('zero-safe flexor intervention lost causal antagonist response');
  if(!(extDelta.positionRadians<0&&extDelta.velocityRadiansPerSecond<0&&extDelta.actuatorGeneralizedForceMicroNewtonMillimetres<0&&extDelta.extensorForceMicroNewtons<0))throw new Error('zero-safe extensor intervention lost causal antagonist response');

  zeroSafe.resetDefault();zeroSafe.data.act.fill(.5);zeroSafe.setMuscleExcitations(requestedZero);zeroSafe.mujoco.mj_forward(zeroSafe.model,zeroSafe.data);zeroSafe.step(.5);
  const postActivityResidual=Math.max(...zeroSafe.data.act);
  if(!(postActivityResidual>0&&postActivityResidual<1e-250))throw new Error('post-activity zero-control decay boundary changed unexpectedly');

  const report={
    schema:'fly-umwelt-musculoskeletal-zero-safe-qualification-v1',version:'1.0.0',modelVersion:packageJson.version,
    qualificationScope:'In-memory, controller-free removal of exactly 15 source muscle excitation floors. The pinned public XML remains unchanged and this profile is not the live plant.',
    provenance:{flyMimicCommit:provenance.upstream.flyMimicCommit,sourceXmlSha256:sourceSha256,derivedXmlSha256:derivedSha256,sourceBytes:Buffer.byteLength(sourceXml),derivedBytes:Buffer.byteLength(derivedXml),exactReplacements:MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE.replacements,publicSourceXmlModified:false},
    profiles:{
      source:{physicsProfileKey:MUSCULOSKELETAL_BODY_PROFILES.source.physicsProfileKey,minimumExcitation:.0001,originalQualification:'docs/benchmarks/musculoskeletal-body-qualification-3.8.0.json',originalZeroNeuralEvidenceRule:false},
      zeroSafe:{physicsProfileKey:MUSCULOSKELETAL_BODY_PROFILES['zero-safe'].physicsProfileKey,minimumExcitation:0,automaticBancIntegration:false,selectedAsLivePlant:false},
    },
    invariantMechanics:{compiledMassGrams:round(zeroMass,15),keyframeQpos:rounded(zeroKeyframe.qpos),activationAtKeyframe:rounded(zeroKeyframe.act),tendonNames:zeroKeyframe.tendons.map(item=>item.name),passiveForceAtKeyframeMicroNewtons:zeroKeyframe.muscles.map(item=>round(item.forceMicroNewtons)),nonzeroPassiveMusclesAtKeyframe:passiveAtKeyframe.map(item=>item.name),keyframeQposExactMatch:true,keyframeTendonStateExactMatch:true,keyframeMomentArmsExactMatch:true,keyframePassiveForceExactMatch:true,compiledMassExactMatch:true},
    probes:{
      exactZero:{requested:requestedZero,applied:appliedZero,holdSeconds:.05,activationRemainedExactlyZero:true,passiveForceRemainedInspectable:true,nonzeroPassiveMusclesAfterHold:passiveAfterHold.map(item=>item.name)},
      postActivityZeroControl:{initialActivation:.5,durationSeconds:.5,maximumResidualActivation:postActivityResidual,interpretation:'The state decays to a positive IEEE-754 subnormal, not mathematical zero; an explicit keyframe reset returns exact zero. No hidden threshold or motion floor is added.'},
      stateIsolation:{sourceIntoZeroSafeRejected:sourceIntoZeroRejected,zeroSafeIntoSourceRejected:zeroIntoSourceRejected},
      antagonistIntervention:{identicalSerializedStart:true,settleSeconds:.2,interventionSeconds:.01,isolatedExcitation:.1,baseline,flexor:{name:flexor.name,endpoint:flex,deltaFromBaseline:flexDelta},extensor:{name:extensor.name,endpoint:ext,deltaFromBaseline:extDelta},oppositePitchAndGeneralizedForce:true},
    },
    passed:{deterministicDerivative:true,pinnedSourceUnmodified:true,onlyMuscleControlFloorsChanged:true,exactZeroFromZeroState:true,passiveMechanicsPreserved:true,profileStateIsolation:true,anatomicalAntagonistMechanics:true,postActivityFiniteTimeExactZero:false,automaticBancIntegration:false},
    limitations:[
      'This profile changes a numerical actuation boundary; it does not validate the source paper physiological parameter estimates.',
      'After prior nonzero activity, zero control decays activation to a positive floating-point subnormal rather than exact mathematical zero. Resetting the pinned keyframe restores exact zero without a hidden threshold.',
      'Passive elastic muscle force is intentionally retained and must not be confused with neural activation.',
      'No spike-to-excitation gain, timing transfer, external contact, adhesion, free root or other-leg muscle routes are supplied.',
    ],
  };
  const reportPath=resolve(root,`docs/benchmarks/musculoskeletal-zero-safe-qualification-${packageJson.version}.json`),serialized=`${JSON.stringify(report,null,2)}\n`;
  if(args.has('--write')){await writeFile(reportPath,serialized);console.log(`wrote ${relative(root,reportPath)}`);}
  else{
    let frozen;try{frozen=JSON.parse(await readFile(reportPath,'utf8'));}catch{throw new Error('missing frozen zero-safe qualification; run npm run body:musculoskeletal:zero-safe:write');}
    if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('zero-safe musculoskeletal qualification drifted; inspect and regenerate deliberately with --write');
  }
  console.log(`qualified zero-safe FlyMimic profile: ${MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE.replacements} exact in-memory edits, exact zero from zero state, passive mechanics preserved, BANC control disabled`);
}finally{source.dispose();zeroSafe.dispose();}
