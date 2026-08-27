import {createFecoState,stepFecoTransduction} from './feco-transduction.js';
import {FEMUR_TIBIA_PROPRIOCEPTION_FIELDS,FRONT_FEMUR_TIBIA_CALIBRATION} from './leg-calibration.js';
import {normalizeRoom} from './room.js';

const DEFAULT_RUNTIME_URL='/vendor/mujoco-3.9.0/mujoco.js';
const DEFAULT_MODEL_BASE_URL='/data/morphology/neuromechfly-v2.1.0';
const DEFAULT_BRIDGE_URL='/data/calibration/articulated-body-bridge-v1.json';
const VFS_ROOT='/fly-umwelt-neuromechfly';
const CONTACT_FIELDS=Object.freeze({found:0,force:1,torque:4,position:7,normal:10,tangent:13});
const ACTUATOR_PARAMETER_WIDTH=10;
const ROOM_MODEL_PATH=`${VFS_ROOT}/fly-room.xml`;

// Room JSON is two-dimensional, so collider height and boundary thickness
// cannot be recovered from the file. These are frozen engineering parameters,
// expressed in the pinned model's millimetre convention, not measurements.
export const ARTICULATED_ROOM_COLLISION=Object.freeze({
  colliderHeightMm:5,
  boundaryThicknessMm:1,
  contactBodyGeoms:55,
  collidingKinds:Object.freeze(['wall','shelter']),
  pairFriction:Object.freeze([1,1,.02,.0001,.0001]),
  solverReference:Object.freeze([.0002,1]),
  solverImpedance:Object.freeze([.98,.99,.00001,.5,3]),
  marginMm:.001,
  source:'FlyGym v2.1.0 ContactParams defaults and official browser-game obstacle pairs at pinned commit 0884af08981994543634563d95e9b1eb49945082',
});
const FLAT_GROUND_PROFILE_KEY='fly-umwelt-articulated-flat-ground-v1';

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

function ensureDirectory(fs,path){
  let cursor='';
  for(const segment of path.split('/').filter(Boolean)){
    cursor+=`/${segment}`;
    try{fs.mkdir(cursor);}catch(error){if(!/exist/i.test(String(error)))throw error;}
  }
}

const xmlNumber=value=>{
  const number=Number(value);
  if(!Number.isFinite(number)||Math.abs(number)>1e6)throw new Error('Room collider contains an invalid coordinate');
  return Object.is(number,-0)?'0':String(number);
};

/**
 * Convert normalized top-left room coordinates to a centred MuJoCo frame.
 * The upstream neutral root offset is retained, then the whole morphology is
 * translated to the room spawn and yawed about the vertical axis.
 */
export function createArticulatedRoomProfile(rawRoom,neutralRoot=[.496,0,2.1]){
  const room=normalizeRoom(rawRoom),height=ARTICULATED_ROOM_COLLISION.colliderHeightMm;
  const halfWidth=room.width/2,halfHeight=room.height/2,halfZ=height/2;
  const obstacleObjects=room.objects.filter(object=>ARTICULATED_ROOM_COLLISION.collidingKinds.includes(object.kind));
  const colliders=[
    {name:'room_boundary_0',kind:'boundary',center:[-halfWidth-ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,0,halfZ],size:[ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,halfHeight+ARTICULATED_ROOM_COLLISION.boundaryThicknessMm,halfZ]},
    {name:'room_boundary_1',kind:'boundary',center:[halfWidth+ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,0,halfZ],size:[ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,halfHeight+ARTICULATED_ROOM_COLLISION.boundaryThicknessMm,halfZ]},
    {name:'room_boundary_2',kind:'boundary',center:[0,-halfHeight-ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,halfZ],size:[halfWidth,ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,halfZ]},
    {name:'room_boundary_3',kind:'boundary',center:[0,halfHeight+ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,halfZ],size:[halfWidth,ARTICULATED_ROOM_COLLISION.boundaryThicknessMm/2,halfZ]},
    ...obstacleObjects.map((object,index)=>({
      name:`room_obstacle_${index}`,kind:object.kind,
      center:[object.x+object.w/2-halfWidth,object.y+object.h/2-halfHeight,halfZ],
      size:[object.w/2,object.h/2,halfZ],
    })),
  ];
  const rawHeading=Number(room.spawn.heading);
  const heading=Number.isFinite(rawHeading)?Math.atan2(Math.sin(rawHeading),Math.cos(rawHeading)):0,halfHeading=heading/2;
  const freezeCollider=collider=>Object.freeze({...collider,center:Object.freeze(collider.center),size:Object.freeze(collider.size)});
  const profile={
    schema:'fly-umwelt-articulated-room-profile-v1',room,
    spawnTranslation:Object.freeze([room.spawn.x-halfWidth,room.spawn.y-halfHeight,0]),
    rootPosition:Object.freeze([Number(neutralRoot[0])+room.spawn.x-halfWidth,Number(neutralRoot[1])+room.spawn.y-halfHeight,Number(neutralRoot[2])]),
    rootQuaternion:Object.freeze([Math.cos(halfHeading),0,0,Math.sin(halfHeading)]),
    colliders:Object.freeze(colliders.map(freezeCollider)),
    ignoredObjectKinds:Object.freeze(room.objects.filter(object=>!ARTICULATED_ROOM_COLLISION.collidingKinds.includes(object.kind)).map(object=>object.kind)),
  };
  profile.physicsProfileKey=JSON.stringify({
    schema:profile.schema,rootPosition:profile.rootPosition,rootQuaternion:profile.rootQuaternion,
    colliders:profile.colliders.map(({kind,center,size})=>({kind,center,size})),
    contact:{pairFriction:ARTICULATED_ROOM_COLLISION.pairFriction,solverReference:ARTICULATED_ROOM_COLLISION.solverReference,solverImpedance:ARTICULATED_ROOM_COLLISION.solverImpedance,marginMm:ARTICULATED_ROOM_COLLISION.marginMm},
  });
  return Object.freeze(profile);
}

/** Build a deterministic in-memory room variant; the pinned source XML stays unchanged. */
export function deriveArticulatedRoomXml(sourceXml,profile){
  if(typeof sourceXml!=='string'||!sourceXml.includes('<worldbody>'))throw new Error('Pinned articulated XML has no worldbody');
  if(profile?.schema!=='fly-umwelt-articulated-room-profile-v1')throw new Error('Invalid articulated room profile');
  let xml=sourceXml;
  const contactGeomNames=[...sourceXml.matchAll(/<pair\s+geom1="ground_plane"\s+geom2="(nmf\/[^"]+)"/g)].map(match=>match[1]);
  if(contactGeomNames.length!==ARTICULATED_ROOM_COLLISION.contactBodyGeoms||new Set(contactGeomNames).size!==ARTICULATED_ROOM_COLLISION.contactBodyGeoms)throw new Error('Pinned FlyGym contact-body inventory drifted');
  const colliderXml=profile.colliders.map(collider=>
    `    <geom name="${collider.name}" type="box" pos="${collider.center.map(xmlNumber).join(' ')}" size="${collider.size.map(xmlNumber).join(' ')}" contype="0" conaffinity="0" rgba="0.16 0.18 0.2 0.35"/>`
  ).join('\n');
  xml=xml.replace('<worldbody>',`<worldbody>\n${colliderXml}`);
  const pairFriction=ARTICULATED_ROOM_COLLISION.pairFriction.map(xmlNumber).join(' '),solverReference=ARTICULATED_ROOM_COLLISION.solverReference.map(xmlNumber).join(' '),solverImpedance=ARTICULATED_ROOM_COLLISION.solverImpedance.map(xmlNumber).join(' ');
  const contactPairs=profile.colliders.flatMap((collider,colliderIndex)=>contactGeomNames.map((geomName,geomIndex)=>
    `    <pair geom1="${collider.name}" geom2="${geomName}" name="room_pair_${colliderIndex}_${geomIndex}" margin="${xmlNumber(ARTICULATED_ROOM_COLLISION.marginMm)}" solref="${solverReference}" solimp="${solverImpedance}" friction="${pairFriction}"/>`
  )).join('\n');
  xml=xml.replace('<contact>',`<contact>\n${contactPairs}`);
  let sensorChanges=0;
  xml=xml.replace(/(<contact\s+subtree1="nmf\/[lr][fmh]_coxa")\s+geom2="ground_plane"([^>]*\bname=")ground_contact_([^\"]+"\s*\/\>)/g,(_,start,end,suffix)=>{
    sensorChanges++;return `${start}${end}local_contact_${suffix}`;
  });
  if(sensorChanges!==6)throw new Error(`Expected six room contact sensors, changed ${sensorChanges}`);
  return xml;
}

/**
 * Controller-free browser boundary around the pinned NeuroMechFly/MuJoCo body.
 * It accepts explicit position targets or actuator-ordered generalized torques
 * and exposes physical state. It does not turn decoded neural activity into a
 * gait, joint amplitude, torque, or target pose.
 */
export class MujocoArticulatedBody {
  static async load(options={}){
    const runtimeUrl=options.runtimeUrl||DEFAULT_RUNTIME_URL;
    const modelBaseUrl=options.modelBaseUrl||DEFAULT_MODEL_BASE_URL;
    const bridgeUrl=options.bridgeUrl||DEFAULT_BRIDGE_URL;
    const importModule=options.importModule||((url)=>import(url));
    const loadBinary=options.loadBinary||((url)=>fetchOk(url,'arrayBuffer'));
    const loadJson=options.loadJson||(async url=>JSON.parse(await fetchOk(url,'text')));
    const [runtimeModule,meta,provenance,bridge]=await Promise.all([
      importModule(runtimeUrl),loadJson(`${modelBaseUrl}/model_meta.json`),
      loadJson(`${modelBaseUrl}/provenance.json`),loadJson(bridgeUrl),
    ]);
    const loadMujoco=runtimeModule.default||runtimeModule;
    const runtimeBase=new URL('.',runtimeUrl instanceof URL?runtimeUrl:new URL(runtimeUrl,globalThis.location?.href||import.meta.url));
    const mujoco=await loadMujoco({locateFile:name=>new URL(name,runtimeBase).href});
    const modelFiles=provenance.files.filter(file=>file.path.startsWith('model/'));
    ensureDirectory(mujoco.FS,VFS_ROOT);
    let sourceXml='';
    for(const file of modelFiles){
      const relative=file.path.slice('model/'.length),destination=`${VFS_ROOT}/${relative}`;
      ensureDirectory(mujoco.FS,destination.slice(0,destination.lastIndexOf('/')));
      const bytes=new Uint8Array(await loadBinary(`${modelBaseUrl}/${file.path}`));
      mujoco.FS.writeFile(destination,bytes);
      if(relative==='fly.xml')sourceXml=new TextDecoder().decode(bytes);
    }
    const roomProfile=options.room===undefined||options.room===null?null:createArticulatedRoomProfile(options.room,meta.neutral_qpos.slice(0,3));
    const modelPath=roomProfile?ROOM_MODEL_PATH:`${VFS_ROOT}/fly.xml`;
    if(roomProfile)mujoco.FS.writeFile(modelPath,new TextEncoder().encode(deriveArticulatedRoomXml(sourceXml,roomProfile)));
    const model=mujoco.MjModel.from_xml_path(modelPath);
    const body=new MujocoArticulatedBody({mujoco,model,meta,provenance,bridge,roomProfile});
    body.resetNeutral();
    return body;
  }

  constructor({mujoco,model,meta,provenance,bridge,roomProfile=null}){
    this.mujoco=mujoco;this.model=model;this.meta=meta;this.provenance=provenance;this.bridge=bridge;this.roomProfile=roomProfile;
    this.physicsProfileKey=roomProfile?.physicsProfileKey||FLAT_GROUND_PROFILE_KEY;
    this.data=new mujoco.MjData(model);this.disposed=false;
    if(model.nq!==133||model.nv!==132||model.nu!==42||model.nbody!==70||model.nsensor!==6||model.nkey!==1){
      this.dispose();throw new Error('Compiled articulated body violates the pinned model contract');
    }
    if(Math.abs(model.opt.timestep-meta.timestep)>1e-12)throw new Error('Compiled MuJoCo timestep differs from model metadata');
    this.positionActuatorsEnabled=true;
    this.defaultActuatorGain=Array.from(model.actuator_gainprm);
    this.defaultActuatorBias=Array.from(model.actuator_biasprm);
    this.appliedJointTorques=new Float64Array(model.nu);
    this.femurTibiaGeometry=this.#resolveFemurTibiaGeometry();
    this.fecoStates=[];
  }

  assertLive(){if(this.disposed)throw new Error('Articulated body has been disposed');}

  resetNeutral(){
    this.assertLive();this.mujoco.mj_resetDataKeyframe(this.model,this.data,0);
    if(this.roomProfile){
      this.data.qpos.set(this.roomProfile.rootPosition,0);
      this.data.qpos.set(this.roomProfile.rootQuaternion,3);
    }
    this.setAppliedJointTorques(new Array(this.model.nu).fill(0));this.mujoco.mj_forward(this.model,this.data);this.#resetAfferents();
    return this.snapshot();
  }

  #resolveFemurTibiaGeometry(){
    const bodyIds=new Map();
    for(let index=0;index<this.model.nbody;index++)bodyIds.set(this.model.body(index).name,index);
    return this.meta.actuators.filter((_,index)=>index%7===5).map(actuator=>{
      const prefix=actuator.group.slice(0,2),names=[`${prefix}_trochanterfemur`,`${prefix}_tibia`,`${prefix}_tarsus1`];
      const ids=names.map(name=>bodyIds.get(`nmf/${name}`));
      if(ids.some(id=>!Number.isInteger(id)))throw new Error(`Missing femur-tibia geometry for ${prefix.toUpperCase()}`);
      return {leg:prefix.toUpperCase(),actuatorId:actuator.id,jointId:actuator.jointId,qposadr:actuator.qposadr,dofadr:this.model.jnt_dofadr[actuator.jointId],bodyIds:ids};
    });
  }

  #resetAfferents(){this.fecoStates=this.femurTibiaState().map(item=>createFecoState(item.anatomicalAngle));}

  #advanceAfferents(durationSeconds){
    const joints=this.femurTibiaState(),contacts=this.contactState();
    for(let index=0;index<joints.length;index++)stepFecoTransduction(this.fecoStates[index],{
      angle:joints[index].anatomicalAngle,velocity:joints[index].anatomicalAngularVelocity,contact:contacts[index].found>0?1:0,
    },durationSeconds);
  }

  setPositionTargets(values){
    this.assertLive();const targets=finiteArray(values,this.model.nu,'position targets');
    for(let index=0;index<targets.length;index++){
      const lower=this.model.actuator_ctrlrange[index*2],upper=this.model.actuator_ctrlrange[index*2+1];
      this.data.ctrl[index]=Math.max(lower,Math.min(upper,targets[index]));
    }
  }

  /**
   * Toggle the upstream engineering position servos. Torque qualification
   * disables them so actuator_force is exactly zero; passive joint mechanics
   * remain part of the pinned model and are reported separately.
   */
  setPositionActuatorsEnabled(enabled=true){
    this.assertLive();this.positionActuatorsEnabled=Boolean(enabled);
    for(let actuator=0;actuator<this.model.nu;actuator++){
      const start=actuator*ACTUATOR_PARAMETER_WIDTH;
      for(let offset=0;offset<ACTUATOR_PARAMETER_WIDTH;offset++){
        this.model.actuator_gainprm[start+offset]=this.positionActuatorsEnabled?this.defaultActuatorGain[start+offset]:0;
        this.model.actuator_biasprm[start+offset]=this.positionActuatorsEnabled?this.defaultActuatorBias[start+offset]:0;
      }
    }
    this.mujoco.mj_forward(this.model,this.data);return this.positionActuatorsEnabled;
  }

  /** Apply actuator-ordered generalized joint torques in µN·mm. */
  setAppliedJointTorques(values){
    this.assertLive();const torques=finiteArray(values,this.model.nu,'applied joint torques');
    this.appliedJointTorques.set(torques);this.data.qfrc_applied.fill(0);
    for(let index=0;index<torques.length;index++){
      const dof=this.model.jnt_dofadr[this.meta.actuators[index].jointId];
      this.data.qfrc_applied[dof]=torques[index];
    }
  }

  perturbRootVelocity({linear=[0,0,0],angular=[0,0,0]}={}){
    this.assertLive();const velocity=finiteArray([...linear,...angular],6,'root perturbation');
    for(let index=0;index<6;index++)this.data.qvel[index]+=velocity[index];
    this.mujoco.mj_forward(this.model,this.data);
  }

  /** Instantaneous translation used only for causal contact qualification. */
  perturbRootPosition(translation=[0,0,0]){
    this.assertLive();const offset=finiteArray(translation,3,'root-position perturbation');
    if(offset.some(value=>Math.abs(value)>1000))throw new Error('Root-position perturbation exceeds 1000 mm');
    for(let index=0;index<3;index++)this.data.qpos[index]+=offset[index];
    this.mujoco.mj_forward(this.model,this.data);return this.snapshot();
  }

  step(durationSeconds=.01){
    this.assertLive();const duration=Number(durationSeconds),timeStep=this.model.opt.timestep;
    if(!Number.isFinite(duration)||duration<=0||duration>1)throw new Error('Step duration must be finite and within (0, 1] second');
    const substeps=Math.round(duration/timeStep);
    if(Math.abs(substeps*timeStep-duration)>1e-10)throw new Error(`Step duration must be an integer multiple of ${timeStep} seconds`);
    for(let index=0;index<substeps;index++)this.mujoco.mj_step(this.model,this.data);
    this.#advanceAfferents(duration);
    return this.snapshot();
  }

  contactState(){
    this.assertLive();const contacts=[];
    for(let index=0;index<this.model.nsensor;index++){
      const sensor=this.model.sensor(index),start=sensor.adr,read3=offset=>Array.from(this.data.sensordata.slice(start+offset,start+offset+3));
      contacts.push({
        name:sensor.name,found:this.data.sensordata[start+CONTACT_FIELDS.found],
        force:read3(CONTACT_FIELDS.force),torque:read3(CONTACT_FIELDS.torque),
        position:read3(CONTACT_FIELDS.position),normal:read3(CONTACT_FIELDS.normal),tangent:read3(CONTACT_FIELDS.tangent),
      });
    }
    return contacts;
  }

  proprioceptionState(){
    this.assertLive();return this.meta.actuators.map((actuator,index)=>({
      actuatorId:index,name:actuator.name,joint:actuator.joint,leg:actuator.group,
      position:this.data.qpos[actuator.qposadr],velocity:this.data.qvel[this.model.jnt_dofadr[actuator.jointId]],
      control:this.data.ctrl[index],controlRange:Array.from(actuator.ctrlrange),
      actuatorForce:this.data.actuator_force[index],appliedTorqueMicroNewtonMillimetres:this.appliedJointTorques[index],
    }));
  }

  femurTibiaState(){
    this.assertLive();return this.femurTibiaGeometry.map(item=>{
      const positions=item.bodyIds.map(id=>Array.from(this.data.xpos.slice(id*3,id*3+3)));
      const proximal=positions[0].map((value,index)=>value-positions[1][index]);
      const distal=positions[2].map((value,index)=>value-positions[1][index]);
      const cosine=Math.max(-1,Math.min(1,proximal.reduce((sum,value,index)=>sum+value*distal[index],0)/(Math.hypot(...proximal)*Math.hypot(...distal))));
      return {
        leg:item.leg,actuatorId:item.actuatorId,coordinatePosition:this.data.qpos[item.qposadr],
        coordinateVelocity:this.data.qvel[item.dofadr],anatomicalAngle:Math.acos(cosine),
        anatomicalAngularVelocity:-this.data.qvel[item.dofadr],
        appliedTorqueMicroNewtonMillimetres:this.appliedJointTorques[item.actuatorId],
      };
    });
  }

  /** CNS-safe physical afferent evidence with no world coordinates or normals. */
  afferentState(){
    this.assertLive();const joints=this.femurTibiaState(),contacts=this.contactState();
    return {
      schema:'fly-umwelt-articulated-afferent-state-v1',time:this.data.time,
      legs:joints.map((joint,index)=>({
        leg:joint.leg,anatomicalAngleRadians:joint.anatomicalAngle,angularVelocityRadiansPerSecond:joint.anatomicalAngularVelocity,
        contact:contacts[index].found>0?1:0,contactForceMicroNewtons:Math.hypot(...contacts[index].force),
        appliedJointTorqueMicroNewtonMillimetres:joint.appliedTorqueMicroNewtonMillimetres,
        feco:{
          clawFlexion:this.fecoStates[index].clawFlexion,clawExtension:this.fecoStates[index].clawExtension,
          hookFlexion:this.fecoStates[index].hookFlexion,hookExtension:this.fecoStates[index].hookExtension,club:this.fecoStates[index].club,
        },
      })),
      strainTransfer:'disabled: physical contact force is retained in µN but no source-supported force-to-afferent gain is available',
    };
  }

  /** Existing 92-value subtype schema; unavailable phase/strain fields stay zero. */
  afferentVector(){
    const c=FRONT_FEMUR_TIBIA_CALIBRATION.coordinate,maximumVelocity=FRONT_FEMUR_TIBIA_CALIBRATION.joint.maximumVelocityRadPerSecond;
    const values=[0,0];
    for(const leg of this.afferentState().legs){
      const angleScale=leg.anatomicalAngleRadians<c.neutralAngleRad?c.neutralAngleRad-c.minimumAngleRad:c.maximumAngleRad-c.neutralAngleRad;
      const angle=Math.max(-1,Math.min(1,(leg.anatomicalAngleRadians-c.neutralAngleRad)/angleScale));
      const velocity=Math.max(-1,Math.min(1,leg.angularVelocityRadiansPerSecond/maximumVelocity));
      values.push(angle,velocity,0,0,0,0,0,leg.contact,leg.contact,0,
        leg.feco.clawFlexion,leg.feco.clawExtension,leg.feco.hookFlexion,leg.feco.hookExtension,leg.feco.club);
    }
    const expected=2+this.femurTibiaGeometry.length*FEMUR_TIBIA_PROPRIOCEPTION_FIELDS.length;
    if(values.length!==expected)throw new Error('Articulated afferent-vector schema length mismatch');
    return Float32Array.from(values);
  }

  snapshot(){
    this.assertLive();return {
      schema:'fly-umwelt-articulated-body-state-v1',time:this.data.time,
      qpos:Array.from(this.data.qpos),qvel:Array.from(this.data.qvel),ctrl:Array.from(this.data.ctrl),
      root:{position:Array.from(this.data.qpos.slice(0,3)),quaternion:Array.from(this.data.qpos.slice(3,7)),linearVelocity:Array.from(this.data.qvel.slice(0,3)),angularVelocity:Array.from(this.data.qvel.slice(3,6))},
      contacts:this.contactState(),proprioception:this.proprioceptionState(),femurTibia:this.femurTibiaState(),afferents:this.afferentState(),compiledContacts:this.data.ncon,
      positionActuatorsEnabled:this.positionActuatorsEnabled,appliedJointTorques:Array.from(this.appliedJointTorques),
      physicsProfileKey:this.physicsProfileKey,
    };
  }

  serialize(){
    const state=this.snapshot();return {
      schema:state.schema,time:state.time,qpos:state.qpos,qvel:state.qvel,ctrl:state.ctrl,
      positionActuatorsEnabled:state.positionActuatorsEnabled,appliedJointTorques:state.appliedJointTorques,
      fecoStates:structuredClone(this.fecoStates),physicsProfileKey:this.physicsProfileKey,
    };
  }

  restore(state={}){
    this.assertLive();if(state.schema!=='fly-umwelt-articulated-body-state-v1')throw new Error('Unsupported articulated-body state schema');
    if(state.physicsProfileKey===undefined&&this.roomProfile)throw new Error('Room-derived articulated state lacks a physics-profile identity');
    if(state.physicsProfileKey!==undefined&&state.physicsProfileKey!==this.physicsProfileKey)throw new Error('Articulated state belongs to a different physics profile');
    const qpos=finiteArray(state.qpos,this.model.nq,'qpos'),qvel=finiteArray(state.qvel,this.model.nv,'qvel'),ctrl=finiteArray(state.ctrl,this.model.nu,'ctrl');
    const torques=state.appliedJointTorques===undefined?new Array(this.model.nu).fill(0):finiteArray(state.appliedJointTorques,this.model.nu,'applied joint torques');
    this.data.qpos.set(qpos);this.data.qvel.set(qvel);this.setPositionTargets(ctrl);
    this.setPositionActuatorsEnabled(state.positionActuatorsEnabled!==false);this.setAppliedJointTorques(torques);this.data.time=Math.max(0,Number(state.time)||0);
    this.mujoco.mj_forward(this.model,this.data);
    if(Array.isArray(state.fecoStates)&&state.fecoStates.length===this.femurTibiaGeometry.length){
      this.fecoStates=state.fecoStates.map((source,index)=>{
        const restored=createFecoState(this.femurTibiaState()[index].anatomicalAngle);
        for(const key of Object.keys(restored))if(Number.isFinite(Number(source?.[key])))restored[key]=Number(source[key]);
        return restored;
      });
    }else this.#resetAfferents();
    return this.snapshot();
  }

  dispose(){
    if(this.disposed)return;this.data?.delete?.();this.model?.delete?.();this.disposed=true;
  }
}

export const ARTICULATED_BODY_ASSETS=Object.freeze({runtimeUrl:DEFAULT_RUNTIME_URL,modelBaseUrl:DEFAULT_MODEL_BASE_URL,bridgeUrl:DEFAULT_BRIDGE_URL});
