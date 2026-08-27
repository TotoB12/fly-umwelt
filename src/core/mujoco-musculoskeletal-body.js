const DEFAULT_RUNTIME_URL='/vendor/mujoco-3.9.0/mujoco.js';
const DEFAULT_MODEL_BASE_URL='/data/morphology/flymimic-frontleg-20260623a';
const VFS_ROOT='/fly-umwelt-flymimic';
const MODEL_PATH=`${VFS_ROOT}/flymimic-frontleg.xml`;
const SOURCE_CONTROL_RANGE='ctrlrange="0.0001 1"';
const ZERO_SAFE_CONTROL_RANGE='ctrlrange="0 1"';
const ZERO_SAFE_REPLACEMENTS=15;
const ZERO_SAFE_DERIVATIVE_SHA256='47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e';
const MUSCULOSKELETAL_PROFILES=Object.freeze({
  source:Object.freeze({id:'source',minimumExcitation:.0001,physicsProfileKey:'fly-umwelt-flymimic-frontleg-20260623a-mujoco-3.9.0-v1',derived:false}),
  'zero-safe':Object.freeze({id:'zero-safe',minimumExcitation:0,physicsProfileKey:'fly-umwelt-flymimic-frontleg-20260623a-mujoco-3.9.0-zero-safe-v1',derived:true}),
});
const MUSCLE_DYNAMICS_TYPE=4;
const PROVENANCE_SCHEMA='fly-umwelt-musculoskeletal-body-provenance-v1';
const MODEL_FILE=/^model\/(?:flymimic-frontleg\.xml|meshes\/stl\/[A-Za-z0-9_.-]+\.stl)$/;

const finiteArray=(value,length,label)=>{
  const output=Array.from(value||[],Number);
  if(output.length!==length||output.some(item=>!Number.isFinite(item)))throw new Error(`${label} must contain ${length} finite values`);
  return output;
};

const fetchOk=async(url,type='arrayBuffer')=>{
  const response=await fetch(url,{mode:'same-origin',credentials:'same-origin'});
  if(!response.ok)throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response[type]();
};

const sha256Hex=async bytes=>{
  if(!globalThis.crypto?.subtle)throw new Error('WebCrypto SHA-256 is required to verify the FlyMimic XML profile');
  const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
};

function ensureDirectory(fs,path){
  let cursor='';
  for(const segment of path.split('/').filter(Boolean)){
    cursor+=`/${segment}`;
    try{fs.mkdir(cursor);}catch(error){if(!/exist/i.test(String(error)))throw error;}
  }
}

/**
 * Deterministically remove only the 15 FlyMimic muscle control floors.
 *
 * The pinned public XML is evidence and is never rewritten. This derivative is
 * made in memory immediately before compilation so passive mechanics and every
 * other source parameter remain inspectable and byte-auditable.
 */
export function deriveZeroSafeMusculoskeletalXml(sourceXml){
  const xml=String(sourceXml),matches=xml.split(SOURCE_CONTROL_RANGE).length-1;
  if(matches!==ZERO_SAFE_REPLACEMENTS)throw new Error(`Zero-safe FlyMimic derivation requires exactly ${ZERO_SAFE_REPLACEMENTS} source muscle control ranges; found ${matches}`);
  const derived=xml.split(SOURCE_CONTROL_RANGE).join(ZERO_SAFE_CONTROL_RANGE);
  if(derived.length!==xml.length-75)throw new Error('Zero-safe FlyMimic derivation changed an unexpected number of bytes');
  return derived;
}

/**
 * Restrained FlyMimic left-front-leg mechanics boundary.
 *
 * This wrapper accepts explicit 15-muscle excitation vectors only. It has no
 * neural decoder, imitation policy, reference trajectory, gait phase, contact
 * controller or adhesion command.
 */
export class MujocoMusculoskeletalBody {
  static async load(options={}){
    const runtimeUrl=options.runtimeUrl||DEFAULT_RUNTIME_URL;
    const modelBaseUrl=options.modelBaseUrl||DEFAULT_MODEL_BASE_URL;
    const importModule=options.importModule||((url)=>import(url));
    const loadBinary=options.loadBinary||((url)=>fetchOk(url,'arrayBuffer'));
    const loadJson=options.loadJson||(async url=>JSON.parse(await fetchOk(url,'text')));
    const profile=MUSCULOSKELETAL_PROFILES[options.profile||'source'];
    if(!profile)throw new Error(`Unsupported musculoskeletal profile: ${options.profile}`);
    const [runtimeModule,provenance]=await Promise.all([importModule(runtimeUrl),loadJson(`${modelBaseUrl}/provenance.json`)]);
    if(provenance?.schema!==PROVENANCE_SCHEMA||provenance?.upstream?.flyMimicCommit!=='9ea1131626cd76f7203b74076ef8f0e9cab30bef')throw new Error('FlyMimic provenance identity differs from the pinned model');
    const loadMujoco=runtimeModule.default||runtimeModule;
    const runtimeBase=new URL('.',runtimeUrl instanceof URL?runtimeUrl:new URL(runtimeUrl,globalThis.location?.href||import.meta.url));
    const mujoco=await loadMujoco({locateFile:name=>new URL(name,runtimeBase).href});
    ensureDirectory(mujoco.FS,VFS_ROOT);
    const modelFiles=provenance.files.filter(file=>MODEL_FILE.test(file.path));
    if(modelFiles.length!==72||new Set(modelFiles.map(file=>file.path)).size!==modelFiles.length)throw new Error('FlyMimic provenance does not contain the exact model inventory');
    for(const file of modelFiles){
      const relative=file.path.slice('model/'.length),destination=`${VFS_ROOT}/${relative}`;
      ensureDirectory(mujoco.FS,destination.slice(0,destination.lastIndexOf('/')));
      const bytes=new Uint8Array(await loadBinary(`${modelBaseUrl}/${file.path}`));
      let output=bytes;
      if(relative==='flymimic-frontleg.xml'){
        if((await sha256Hex(bytes))!==file.sha256)throw new Error('FlyMimic source XML differs from pinned provenance');
        if(profile.derived){
          output=new TextEncoder().encode(deriveZeroSafeMusculoskeletalXml(new TextDecoder().decode(bytes)));
          if((await sha256Hex(output))!==ZERO_SAFE_DERIVATIVE_SHA256)throw new Error('FlyMimic zero-safe XML derivative differs from its frozen identity');
        }
      }
      mujoco.FS.writeFile(destination,output);
    }
    const model=mujoco.MjModel.from_xml_path(MODEL_PATH);
    const body=new MujocoMusculoskeletalBody({mujoco,model,provenance,profile});body.resetDefault();return body;
  }

  constructor({mujoco,model,provenance,profile=MUSCULOSKELETAL_PROFILES.source}){
    this.mujoco=mujoco;this.model=model;this.provenance=provenance;this.profile=profile.id;this.physicsProfileKey=profile.physicsProfileKey;
    this.data=new mujoco.MjData(model);this.disposed=false;
    try{
      if(model.nq!==14||model.nv!==14||model.nu!==15||model.na!==15||model.nbody!==73||model.njnt!==14||model.ntendon!==15||model.nmesh!==71||model.nkey!==1||model.nsensor!==0||model.neq!==7)throw new Error('Compiled FlyMimic body violates the pinned restrained-model contract');
      if(Math.abs(model.opt.timestep-.0001)>1e-12)throw new Error('Compiled FlyMimic timestep differs from the pinned source');
      this.muscles=[];
      for(let index=0;index<model.nu;index++){
        const actuator=model.actuator(index),lower=model.actuator_ctrlrange[index*2],upper=model.actuator_ctrlrange[index*2+1];
        if(model.actuator_dyntype[index]!==MUSCLE_DYNAMICS_TYPE||model.actuator_actadr[index]!==index||model.actuator_actnum[index]!==1||actuator.trnid[0]!==index||lower!==profile.minimumExcitation||upper!==1)throw new Error(`FlyMimic actuator ${index} violates the ${profile.id} stateful Hill-muscle contract`);
        this.muscles.push(Object.freeze({id:index,name:actuator.name,activationAddress:model.actuator_actadr[index],controlRange:Object.freeze([lower,upper]),tendonId:actuator.trnid[0]}));
      }
      this.joints=[];
      for(let index=0;index<model.njnt;index++){
        const joint=model.jnt(index);this.joints.push(Object.freeze({id:index,name:joint.name,qposAddress:model.jnt_qposadr[index],dofAddress:model.jnt_dofadr[index]}));
      }
    }catch(error){this.dispose();throw error;}
  }

  assertLive(){if(this.disposed)throw new Error('Musculoskeletal body has been disposed');}

  resetDefault(){
    this.assertLive();this.mujoco.mj_resetDataKeyframe(this.model,this.data,0);
    this.setMuscleExcitations(new Array(this.model.nu).fill(0));
    this.mujoco.mj_forward(this.model,this.data);return this.snapshot();
  }

  /** Clamp explicit engineering excitations to the selected, profile-audited ranges. */
  setMuscleExcitations(values){
    this.assertLive();const excitations=finiteArray(values,this.model.nu,'muscle excitations');
    for(let index=0;index<excitations.length;index++){
      const [lower,upper]=this.muscles[index].controlRange;
      this.data.ctrl[index]=Math.max(lower,Math.min(upper,excitations[index]));
    }
    return Array.from(this.data.ctrl);
  }

  step(durationSeconds=.002){
    this.assertLive();const duration=Number(durationSeconds),timeStep=this.model.opt.timestep;
    if(!Number.isFinite(duration)||duration<=0||duration>.5)throw new Error('Musculoskeletal step duration must be finite and within (0, 0.5] second');
    const substeps=Math.round(duration/timeStep);
    if(Math.abs(substeps*timeStep-duration)>1e-10)throw new Error(`Musculoskeletal step duration must be an integer multiple of ${timeStep} seconds`);
    for(let index=0;index<substeps;index++)this.mujoco.mj_step(this.model,this.data);
    return this.snapshot();
  }

  muscleState(){
    this.assertLive();return this.muscles.map(item=>({
      id:item.id,name:item.name,tendonId:item.tendonId,controlRange:Array.from(item.controlRange),excitation:this.data.ctrl[item.id],
      activation:this.data.act[item.activationAddress],forceMicroNewtons:this.data.actuator_force[item.id],
      muscleTendonLengthMm:this.data.actuator_length[item.id],muscleTendonVelocityMmPerSecond:this.data.actuator_velocity[item.id],
      momentArmsMm:this.momentArms(item.id),
    }));
  }

  /** Return MuJoCo's sparse actuator moment row without inventing zero couplings. */
  momentArms(actuatorId){
    this.assertLive();const id=Number(actuatorId);
    if(!Number.isInteger(id)||id<0||id>=this.model.nu)throw new Error('Muscle actuator ID is outside the compiled model');
    const address=this.data.moment_rowadr[id],count=this.data.moment_rownnz[id];
    return Array.from({length:count},(_,offset)=>{
      const entry=address+offset,dofAddress=this.data.moment_colind[entry],joint=this.joints.find(item=>item.dofAddress===dofAddress);
      if(!joint)throw new Error(`Sparse muscle moment references unknown DoF ${dofAddress}`);
      return {jointId:joint.id,jointName:joint.name,dofAddress,momentArmMm:this.data.actuator_moment[entry]};
    });
  }

  jointState(){
    this.assertLive();return this.joints.map(item=>({
      id:item.id,name:item.name,positionRadians:this.data.qpos[item.qposAddress],velocityRadiansPerSecond:this.data.qvel[item.dofAddress],
      actuatorGeneralizedForceMicroNewtonMillimetres:this.data.qfrc_actuator[item.dofAddress],
    }));
  }

  tendonState(){
    this.assertLive();return Array.from({length:this.model.ntendon},(_,index)=>({
      id:index,name:this.model.tendon(index).name,lengthMm:this.data.ten_length[index],velocityMmPerSecond:this.data.ten_velocity[index],
    }));
  }

  snapshot(){
    this.assertLive();return {
      schema:'fly-umwelt-musculoskeletal-body-state-v1',time:this.data.time,
      qpos:Array.from(this.data.qpos),qvel:Array.from(this.data.qvel),ctrl:Array.from(this.data.ctrl),act:Array.from(this.data.act),
      muscles:this.muscleState(),joints:this.jointState(),tendons:this.tendonState(),profile:this.profile,physicsProfileKey:this.physicsProfileKey,
    };
  }

  serialize(){
    const state=this.snapshot();return {schema:state.schema,time:state.time,qpos:state.qpos,qvel:state.qvel,ctrl:state.ctrl,act:state.act,physicsProfileKey:state.physicsProfileKey};
  }

  restore(state={}){
    this.assertLive();
    if(state.schema!=='fly-umwelt-musculoskeletal-body-state-v1')throw new Error('Unsupported musculoskeletal-body state schema');
    if(state.physicsProfileKey!==this.physicsProfileKey)throw new Error('Musculoskeletal state belongs to a different physics profile');
    const qpos=finiteArray(state.qpos,this.model.nq,'qpos'),qvel=finiteArray(state.qvel,this.model.nv,'qvel');
    const ctrl=finiteArray(state.ctrl,this.model.nu,'ctrl'),act=finiteArray(state.act,this.model.na,'act');
    const time=Number(state.time);if(!Number.isFinite(time)||time<0)throw new Error('Musculoskeletal state time must be finite and nonnegative');
    this.data.qpos.set(qpos);this.data.qvel.set(qvel);this.setMuscleExcitations(ctrl);this.data.act.set(act);this.data.time=time;
    this.mujoco.mj_forward(this.model,this.data);return this.snapshot();
  }

  dispose(){if(this.disposed)return;this.data?.delete?.();this.model?.delete?.();this.disposed=true;}
}

export const MUSCULOSKELETAL_BODY_ASSETS=Object.freeze({runtimeUrl:DEFAULT_RUNTIME_URL,modelBaseUrl:DEFAULT_MODEL_BASE_URL});
export const MUSCULOSKELETAL_BODY_PROFILES=MUSCULOSKELETAL_PROFILES;
export const MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE=Object.freeze({
  replacements:ZERO_SAFE_REPLACEMENTS,
  sha256:ZERO_SAFE_DERIVATIVE_SHA256,
});
