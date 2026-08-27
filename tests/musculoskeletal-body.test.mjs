import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deriveZeroSafeMusculoskeletalXml,MujocoMusculoskeletalBody,MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE} from '../src/core/mujoco-musculoskeletal-body.js';

const root=resolve(import.meta.dirname,'..');
const morphologyRoot=resolve(root,'public/data/morphology/flymimic-frontleg-20260623a');

async function loadBody(profile='source'){
  return MujocoMusculoskeletalBody.load({
    profile,
    runtimeUrl:pathToFileURL(resolve(root,'public/vendor/mujoco-3.9.0/mujoco.js')),
    loadJson:async()=>JSON.parse(await readFile(resolve(morphologyRoot,'provenance.json'),'utf8')),
    loadBinary:async url=>{
      const relative=new URL(String(url),'https://same-origin.invalid').pathname.replace('/data/morphology/flymimic-frontleg-20260623a/','');
      return readFile(resolve(morphologyRoot,relative));
    },
  });
}

test('FlyMimic bundle preserves its restrained qualification and controller exclusion boundary',async()=>{
  const provenance=JSON.parse(await readFile(resolve(morphologyRoot,'provenance.json'),'utf8'));
  const wrapper=await readFile(resolve(root,'src/core/mujoco-musculoskeletal-body.js'),'utf8');
  const worker=await readFile(resolve(root,'src/workers/world.worker.js'),'utf8');
  assert.equal(provenance.sourceContract.scope,'restrained/tethered left-front leg only');
  assert.equal(provenance.sourceContract.minimumExcitation,.0001);
  assert.equal(provenance.sourceContract.muscleActuators,15);
  assert.equal(provenance.sourceContract.spatialTendons,15);
  assert.equal(provenance.files.length,74);
  assert.deepEqual(provenance.excluded,[
    'FlyMimic PPO policy','motion-capture clips','imitation reward','preprogrammed gait/adhesion timing','mid-/hind-leg anatomical prototypes',
  ]);
  assert.equal(provenance.files.some(file=>/policy|mocap|motion.?capture|reward|controller|trajectory|\.npy$|\.npz$|\.pkl$/i.test(file.path)),false);
  assert.match(wrapper,/fetch\(url,\{mode:'same-origin',credentials:'same-origin'\}\)/);
  assert.doesNotMatch(wrapper,/sanitizeMotorPacket|motorFrame|phaseClock|targetTrajectory|targetBearing|randomController|rewardFunction|motionCapture|ppoPolicy/i);
  assert.match(worker,/msg\.type==='musculoskeletal-body-qualification'/);
  assert.match(worker,/qualification-only zero-safe restrained left-front-leg mechanics/);
  assert.match(worker,/profile:'zero-safe'/);
  assert.match(worker,/automaticControlEnabled:false/);
  assert.doesNotMatch(worker,/world\.(?:plant|body)\s*=\s*musculoskeletalBody/);
});

test('zero-safe derivative is exact, in-memory and leaves the pinned XML untouched',async()=>{
  const source=await readFile(resolve(morphologyRoot,'model/flymimic-frontleg.xml'),'utf8');
  const derived=deriveZeroSafeMusculoskeletalXml(source),digest=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(digest(source),'04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531');
  assert.equal(digest(derived),MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE.sha256);
  assert.equal((source.match(/ctrlrange="0\.0001 1"/g)||[]).length,15);
  assert.equal((derived.match(/ctrlrange="0\.0001 1"/g)||[]).length,0);
  assert.equal(Buffer.byteLength(source)-Buffer.byteLength(derived),75);
  assert.throws(()=>deriveZeroSafeMusculoskeletalXml(source.replace('ctrlrange="0.0001 1"','ctrlrange="0 1"')),/exactly 15/);
});

test('compiled Hill-muscle wrapper clamps zero evidence and restores only exact-profile state',async t=>{
  const body=await loadBody();t.after(()=>body.dispose());
  assert.deepEqual(
    {nq:body.model.nq,nv:body.model.nv,nu:body.model.nu,na:body.model.na,nbody:body.model.nbody,njnt:body.model.njnt,ntendon:body.model.ntendon,nmesh:body.model.nmesh,nkey:body.model.nkey,nsensor:body.model.nsensor,neq:body.model.neq},
    {nq:14,nv:14,nu:15,na:15,nbody:73,njnt:14,ntendon:15,nmesh:71,nkey:1,nsensor:0,neq:7},
  );
  assert.deepEqual(body.setMuscleExcitations(new Array(15).fill(0)),new Array(15).fill(.0001));
  assert.deepEqual(body.setMuscleExcitations(new Array(15).fill(2)),new Array(15).fill(1));
  body.resetDefault();

  const flexor=body.muscles.find(item=>item.name==='LFTibia_flex_93434');
  const extensor=body.muscles.find(item=>item.name==='LFTibia_extensor_93932');
  const flexMoment=body.momentArms(flexor.id).find(item=>item.jointName==='joint_LFTibia_pitch');
  const extMoment=body.momentArms(extensor.id).find(item=>item.jointName==='joint_LFTibia_pitch');
  assert.ok(flexMoment.momentArmMm<0);
  assert.ok(extMoment.momentArmMm>0);

  const state=body.serialize();body.step(.001);body.restore(state);
  assert.deepEqual(body.serialize(),state);
  assert.throws(()=>body.restore({...state,physicsProfileKey:'different-model'}),/different physics profile/);
  assert.throws(()=>body.restore({...state,time:Infinity}),/finite and nonnegative/);
  assert.throws(()=>body.step(.00105),/integer multiple/);
});

test('zero-safe profile preserves passive mechanics while enforcing exact zero and profile isolation',async t=>{
  const source=await loadBody('source'),zeroSafe=await loadBody('zero-safe');
  t.after(()=>{source.dispose();zeroSafe.dispose();});
  const sourceSnapshot=source.resetDefault(),zeroSnapshot=zeroSafe.resetDefault();
  assert.equal(zeroSafe.profile,'zero-safe');
  assert.notEqual(source.physicsProfileKey,zeroSafe.physicsProfileKey);
  assert.deepEqual(zeroSnapshot.ctrl,new Array(15).fill(0));
  assert.deepEqual(zeroSnapshot.act,new Array(15).fill(0));
  assert.deepEqual(zeroSnapshot.qpos,sourceSnapshot.qpos);
  assert.deepEqual(zeroSnapshot.tendons,sourceSnapshot.tendons);
  assert.deepEqual(zeroSnapshot.muscles.map(item=>item.forceMicroNewtons),sourceSnapshot.muscles.map(item=>item.forceMicroNewtons));
  assert.ok(zeroSnapshot.muscles.some(item=>Math.abs(item.forceMicroNewtons)>1e-12));
  zeroSafe.step(.05);
  assert.deepEqual(Array.from(zeroSafe.data.ctrl),new Array(15).fill(0));
  assert.deepEqual(Array.from(zeroSafe.data.act),new Array(15).fill(0));
  assert.throws(()=>zeroSafe.restore(source.serialize()),/different physics profile/);
  assert.throws(()=>source.restore(zeroSafe.serialize()),/different physics profile/);
});
