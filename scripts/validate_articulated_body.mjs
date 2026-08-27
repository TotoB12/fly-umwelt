import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LEG_IDS,LEG_MOTOR_ACTION_SPECS} from '../src/core/constants.js';
import {createSpikeForceState,stepSpikeForceState,triggerMotorUnitBurst} from '../src/core/front-leg-biophysics.js';
import {ARTICULATED_ROOM_COLLISION,MujocoArticulatedBody} from '../src/core/mujoco-articulated-body.js';

const root=resolve(import.meta.dirname,'..'),args=new Set(process.argv.slice(2));
const morphologyRoot=resolve(root,'public/data/morphology/neuromechfly-v2.1.0');
const modelRoot=resolve(morphologyRoot,'model'),runtimeRoot=resolve(root,'public/vendor/mujoco-3.9.0');
const licenseRoot=resolve(root,'public/vendor/licenses');
const bridgePath=resolve(root,'public/data/calibration/articulated-body-bridge-v1.json');
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const provenance=JSON.parse(await readFile(resolve(morphologyRoot,'provenance.json'),'utf8'));
const meta=JSON.parse(await readFile(resolve(morphologyRoot,'model_meta.json'),'utf8'));
const bridge=JSON.parse(await readFile(bridgePath,'utf8'));
const xml=await readFile(resolve(modelRoot,'fly.xml'),'utf8');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const round=(value,digits=9)=>Number(Number(value).toFixed(digits));
const roundArray=(values,digits=9)=>Array.from(values,value=>round(value,digits));
const norm=values=>Math.hypot(...values);
const close=(actual,expected,label,tolerance=1e-10)=>{
  if(!Number.isFinite(actual)||Math.abs(actual-expected)>tolerance)throw new Error(`${label}: ${actual} != ${expected}`);
};
const assertThrowsProfile=(operation,expectedMessage)=>{
  let error=null;try{operation();}catch(caught){error=caught;}
  if(!error||!String(error.message).includes(expectedMessage))throw new Error(`Expected articulated restore rejection containing "${expectedMessage}"`);
};

if(provenance.schema!=='fly-umwelt-articulated-body-provenance-v1'||provenance.modelVersion!==packageJson.version)throw new Error('articulated-body provenance schema/version mismatch');
if(bridge.schema!=='fly-umwelt-articulated-body-bridge-v1'||bridge.modelVersion!==packageJson.version)throw new Error('articulated-body bridge schema/version mismatch');
if(provenance.upstream.commit!=='0884af08981994543634563d95e9b1eb49945082'||provenance.upstream.release!=='v2.1.0')throw new Error('NeuroMechFly browser assets are not commit pinned');
if(provenance.runtime.version!=='3.9.0'||provenance.runtime.license!=='Apache-2.0'||provenance.upstream.license!=='Apache-2.0')throw new Error('runtime/model license contract drifted');

const resolvedFile=file=>file.path.startsWith('runtime/')
  ?resolve(runtimeRoot,file.path.slice('runtime/'.length))
  :file.path.startsWith('license/')?resolve(licenseRoot,file.path.slice('license/'.length)):resolve(morphologyRoot,file.path);
for(const file of provenance.files){
  const bytes=await readFile(resolvedFile(file));
  if(bytes.length!==file.bytes)throw new Error(`${file.path} byte length drifted`);
  const actual=sha256(bytes);if(actual!==file.sha256)throw new Error(`${file.path} hash ${actual} != ${file.sha256}`);
}
const modelNames=(await readdir(modelRoot)).sort(),runtimeNames=(await readdir(runtimeRoot)).sort();
const meshNames=modelNames.filter(name=>name.endsWith('.stl'));
const xmlMeshes=[...new Set([...xml.matchAll(/<mesh[^>]*\bfile="([^"]+\.stl)"/g)].map(match=>match[1]))].sort();
if(meshNames.length!==39||JSON.stringify(meshNames)!==JSON.stringify(xmlMeshes))throw new Error('flattened mesh inventory differs from the 39 XML-referenced meshes');
if(JSON.stringify(runtimeNames)!==JSON.stringify(['mujoco.js','mujoco.wasm']))throw new Error('unexpected files in pinned MuJoCo runtime directory');
const forbiddenAsset=/cpg|tripod|preprogrammed|game(?:play|controller)|steps?\.(?:json|js|npy|npz|pkl)$/i;
for(const file of provenance.files)if(forbiddenAsset.test(file.path))throw new Error(`controller/behavior asset entered articulated-body bundle: ${file.path}`);

if(meta.nq!==133||meta.nu!==42||meta.nbody!==70||meta.actuators.length!==42||meta.timestep!==.0001)throw new Error('model metadata contract drifted');
if(JSON.stringify(meta.gravity)!==JSON.stringify([0,0,-9810]))throw new Error('model gravity contract drifted');
if(provenance.modelContract.massUnit!=='gram'||provenance.modelContract.coordinateUnit!=='millimetre'||provenance.modelContract.derivedForceUnit!=='micronewton')throw new Error('NeuroMechFly native unit contract drifted');
const actionCoverage=[
  ...bridge.mapped.map(item=>item.actionId),
  ...bridge.structurallyInferred.flatMap(item=>item.actionIds),
  ...bridge.unresolved.map(item=>item.actionId),
].sort();
const expectedActions=LEG_MOTOR_ACTION_SPECS.map(item=>item.id).sort();
if(JSON.stringify(actionCoverage)!==JSON.stringify(expectedActions))throw new Error('articulated bridge does not classify every stable action exactly once');
if(bridge.packet.channels!==LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length||bridge.packet.channels!==72)throw new Error('articulated bridge packet width drifted');
if(JSON.stringify(bridge.mapped.map(item=>item.actionId).sort())!==JSON.stringify(['femurTibiaExtend','femurTibiaFlex'].sort()))throw new Error('unsupported channel promoted to mapped status');
if(JSON.stringify(bridge.unresolved.map(item=>item.actionId).sort())!==JSON.stringify(['longTendonPull','unknownLegMovement'].sort()))throw new Error('unresolved motor actions were silently assigned');
if(bridge.structurallyInferred.some(item=>item.controlStatus!=='disabled'))throw new Error('structurally inferred action was enabled as control');
if(!bridge.packet.gainRule.includes('No normalized-population-activity to joint-angle gain'))throw new Error('missing explicit unresolved-gain boundary');
if(bridge.mapped.find(item=>item.actionId==='femurTibiaFlex')?.coordinateSign!==1||bridge.mapped.find(item=>item.actionId==='femurTibiaExtend')?.coordinateSign!==-1)throw new Error('femur-tibia action signs do not match the compiled anatomical-angle convention');
if(bridge.torqueQualification?.runtimeStatus!=='explicit qualification interface only; not connected to the live motor packet or default body')throw new Error('articulated torque qualification escaped its declared runtime boundary');
if(!bridge.afferentQualification?.strainTransfer?.startsWith('disabled')||bridge.afferentQualification.excludedPrivilegedFields.length<4)throw new Error('articulated afferent evidence boundary drifted');
if(bridge.version!=='1.3.0'||bridge.roomQualification?.runtimeStatus!=='explicit qualification profile only; the articulated body remains outside the live neural locomotor loop')throw new Error('articulated room qualification escaped its declared runtime boundary');
const roomEngineering=bridge.roomQualification.engineeringParameters;
if(roomEngineering.colliderHeightMm!==ARTICULATED_ROOM_COLLISION.colliderHeightMm||roomEngineering.boundaryThicknessMm!==ARTICULATED_ROOM_COLLISION.boundaryThicknessMm||roomEngineering.contactBodyGeoms!==ARTICULATED_ROOM_COLLISION.contactBodyGeoms||JSON.stringify(roomEngineering.pairFriction)!==JSON.stringify(ARTICULATED_ROOM_COLLISION.pairFriction)||JSON.stringify(roomEngineering.solverReference)!==JSON.stringify(ARTICULATED_ROOM_COLLISION.solverReference)||JSON.stringify(roomEngineering.solverImpedance)!==JSON.stringify(ARTICULATED_ROOM_COLLISION.solverImpedance)||roomEngineering.marginMm!==ARTICULATED_ROOM_COLLISION.marginMm)throw new Error('articulated room collision parameters drifted from the frozen bridge');
if(bridge.adhesionQualification?.enabled!==false||bridge.adhesionQualification?.viewerActuators!==0||!/CPG\/preprogrammed step phase/.test(bridge.adhesionQualification.browserGameBoundary))throw new Error('articulated adhesion evidence boundary drifted');

const runtimeUrl=new URL('../public/vendor/mujoco-3.9.0/mujoco.js',import.meta.url);
const modelBaseUrl=new URL('../public/data/morphology/neuromechfly-v2.1.0/',import.meta.url);
const localJson=async url=>JSON.parse(await readFile(fileURLToPath(new URL(url)),'utf8'));
const localBinary=async url=>{
  const bytes=await readFile(fileURLToPath(new URL(url)));
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
};
const body=await MujocoArticulatedBody.load({
  runtimeUrl,modelBaseUrl:modelBaseUrl.href.replace(/\/$/,''),bridgeUrl:new URL(`file://${bridgePath}`),
  loadJson:localJson,loadBinary:localBinary,
});
const {model,mujoco}=body;
if(model.nq!==meta.nq||model.nu!==meta.nu||model.nbody!==meta.nbody||model.nsensor!==6||model.nkey!==1)throw new Error('compiled MuJoCo model differs from metadata');
close(model.opt.timestep,.0001,'compiled timestep');
for(let index=0;index<3;index++)close(model.opt.gravity[index],meta.gravity[index],`compiled gravity[${index}]`);
const freeJoints=[];for(let index=0;index<model.njnt;index++)if(model.jnt(index).type===0)freeJoints.push(model.jnt(index).name);
if(JSON.stringify(freeJoints)!==JSON.stringify(['nmf']))throw new Error(`expected one free root joint, found ${freeJoints.join(', ')}`);
if(model.key(0).name!=='neutral')throw new Error('compiled model lacks neutral keyframe');
for(let index=0;index<meta.neutral_qpos.length;index++)close(model.key(0).qpos[index],meta.neutral_qpos[index],`neutral qpos[${index}]`,1e-9);
for(let index=0;index<meta.actuators.length;index++){
  const compiled=model.actuator(index),expected=meta.actuators[index];
  if(compiled.name!==`nmf/${expected.name}`||compiled.trnid[0]!==expected.jointId)throw new Error(`actuator ${index} identity drifted`);
  if(model.jnt(compiled.trnid[0]).qposadr!==expected.qposadr)throw new Error(`actuator ${index} qpos address drifted`);
}
const adhesionActuatorNames=meta.actuators.map(item=>item.name).filter(name=>/adhesion/i.test(name));
if(adhesionActuatorNames.length!==0)throw new Error(`controller-free viewer unexpectedly contains adhesion actuators: ${adhesionActuatorNames.join(', ')}`);
const sensorNames=[];for(let index=0;index<model.nsensor;index++){
  const sensor=model.sensor(index);sensorNames.push(sensor.name);
  if(sensor.dim!==16||sensor.adr!==index*16)throw new Error(`contact sensor ${sensor.name} data layout drifted`);
}
const expectedSensors=LEG_IDS.map(id=>`ground_contact_${id.toLowerCase()}_leg`);
if(JSON.stringify(sensorNames)!==JSON.stringify(expectedSensors))throw new Error('six-leg ground-contact sensor order drifted');

const neutral=body.snapshot(),neutralState=body.serialize(),coordinateSignProbes=[];
if(neutral.compiledContacts!==0||neutral.contacts.some(contact=>contact.found!==0))throw new Error('neutral reset unexpectedly begins in ground contact');
for(let index=0;index<neutral.femurTibia.length;index++){
  const before=body.femurTibiaState()[index],qposAddress=meta.actuators[before.actuatorId].qposadr;
  body.data.qpos[qposAddress]+=.05;mujoco.mj_forward(model,body.data);
  const after=body.femurTibiaState()[index],anatomicalDelta=after.anatomicalAngle-before.anatomicalAngle;
  if(anatomicalDelta>=-.0499||anatomicalDelta<=-.0501)throw new Error(`${before.leg} positive femur-tibia coordinate did not produce equal-and-opposite anatomical flexion`);
  coordinateSignProbes.push({leg:before.leg,coordinateIncrementRadians:.05,anatomicalAngleBeforeRadians:round(before.anatomicalAngle),anatomicalAngleAfterRadians:round(after.anatomicalAngle),anatomicalAngleDeltaRadians:round(anatomicalDelta)});
  body.restore(neutralState);
}
body.step(.5);const settled=body.snapshot();
body.step(.1);const settledLater=body.snapshot();
const settlingDrift=norm(settledLater.root.position.map((value,index)=>value-settled.root.position[index]));
if(settled.compiledContacts<6||settled.contacts.some(contact=>contact.found<1))throw new Error('passive settling did not produce body-derived contact on every leg');
if(settlingDrift>1e-3||norm(settledLater.root.linearVelocity)>1e-3)throw new Error('neutral body did not reach a stable passive-contact state');
const afferentState=body.afferentState(),afferentVector=body.afferentVector();
if(afferentVector.length!==92||afferentState.legs.length!==6)throw new Error('articulated afferent boundary does not match the six-leg subtype schema');
const afferentJson=JSON.stringify(afferentState).toLowerCase();
for(const forbidden of ['"position"','"normal"','"tangent"','"world"','"collisionnormal"','"objects"'])if(afferentJson.includes(forbidden))throw new Error(`privileged field escaped articulated afferent boundary: ${forbidden}`);
if(afferentState.legs.some(leg=>leg.contact!==1||leg.contactForceMicroNewtons<=0))throw new Error('body-derived contact did not reach every local articulated afferent channel');

const restoredReference=body.serialize();
body.perturbRootVelocity({linear:[5,0,2],angular:[0,0,2]});
const perturbedInitial=body.snapshot();body.step(.01);const perturbedResponse=body.snapshot();body.step(.49);const perturbRecovered=body.snapshot();
const perturbDisplacement=norm(perturbedResponse.root.position.map((value,index)=>value-settledLater.root.position[index]));
if(perturbDisplacement<1e-5)throw new Error('explicit root perturbation produced no physical displacement');
if(norm(perturbRecovered.root.linearVelocity)>1e-3||norm(perturbRecovered.root.angularVelocity)>1e-3)throw new Error('perturbed neutral body did not dissipate motion through the pinned mechanics');
const restored=body.restore(restoredReference);
if(JSON.stringify(body.serialize())!==JSON.stringify(restoredReference))throw new Error('articulated body serialize/restore is not exact');

const actuatorIndex=5,qposAddress=meta.actuators[actuatorIndex].qposadr,dofAddress=model.jnt_dofadr[meta.actuators[actuatorIndex].jointId];
const controlBefore=restored.ctrl.slice(),jointBefore=restored.qpos[qposAddress];controlBefore[actuatorIndex]+=.1;
body.setPositionTargets(controlBefore);body.step(.05);const actuatorResponse=body.snapshot(),jointAfter=actuatorResponse.qpos[qposAddress];
if(jointAfter<=jointBefore)throw new Error('positive explicit femur-tibia position-target probe did not increase the compiled coordinate');

body.restore(restoredReference);body.setPositionActuatorsEnabled(false);
body.setAppliedJointTorques(new Array(model.nu).fill(0));const torqueStart=body.serialize();
body.step(.05);const zeroTorqueResponse=body.snapshot(),zeroTorqueFront=zeroTorqueResponse.femurTibia[0];
if(zeroTorqueResponse.appliedJointTorques.some(value=>value!==0))throw new Error('zero torque control produced nonzero applied generalized force');
if(zeroTorqueResponse.proprioception.some(item=>item.actuatorForce!==0))throw new Error('disabled position servo produced actuator force in zero-torque control');

body.restore(torqueStart);const twitch=createSpikeForceState();triggerMotorUnitBurst(twitch,'fast',1);
const torqueValues=new Array(model.nu).fill(0),torqueUnitNewtonMetres=1e-9;
for(let index=0;index<500;index++){
  stepSpikeForceState(twitch,model.opt.timestep);
  torqueValues[actuatorIndex]=twitch.totalFlexorTorqueNewtonMeters/torqueUnitNewtonMetres;
  body.setAppliedJointTorques(torqueValues);body.step(model.opt.timestep);
}
const spikeTorqueResponse=body.snapshot(),spikeTorqueFront=spikeTorqueResponse.femurTibia[0];
if(spikeTorqueFront.coordinatePosition<=zeroTorqueFront.coordinatePosition||spikeTorqueFront.anatomicalAngle>=zeroTorqueFront.anatomicalAngle)throw new Error('resolved fast-flexor spike torque did not flex the geometry-derived front femur-tibia angle');
if(spikeTorqueResponse.proprioception.some(item=>item.actuatorForce!==0))throw new Error('position actuator contributed force during torque-only qualification');
if(twitch.totalFlexorTorqueNewtonMeters<=0||Math.abs(spikeTorqueFront.appliedTorqueMicroNewtonMillimetres-twitch.totalFlexorTorqueNewtonMeters/torqueUnitNewtonMetres)>1e-12)throw new Error('front-leg spike torque unit conversion drifted');
const spikeAfferent=body.afferentState().legs[0],zeroAfferent=zeroTorqueResponse.afferents.legs[0];
if(spikeAfferent.feco.hookFlexion<=zeroAfferent.feco.hookFlexion||spikeAfferent.feco.club<=zeroAfferent.feco.club)throw new Error('physical spike-driven flexion did not close the FeCO hook/club afferent boundary');
const torqueState=body.serialize();body.setPositionActuatorsEnabled(true);body.setAppliedJointTorques(new Array(model.nu).fill(0));body.restore(torqueState);
if(JSON.stringify(body.serialize())!==JSON.stringify(torqueState))throw new Error('torque-mode articulated state serialize/restore is not exact');

const roomDefinition={
  version:1,name:'Articulated contact qualification',width:40,height:30,ambientLight:.5,temperature:.5,
  spawn:{x:20,y:15,heading:Math.PI/2},
  objects:[
    {id:'qualification-wall',kind:'wall',x:15,y:17.5,w:10,h:2},
    {id:'qualification-shelter',kind:'shelter',x:2,y:2,w:3,h:3},
    {id:'nonblocking-food',kind:'food',x:34,y:6,r:2,amount:1,odor:1},
  ],
};
const roomBody=await MujocoArticulatedBody.load({
  runtimeUrl,modelBaseUrl:modelBaseUrl.href.replace(/\/$/,''),bridgeUrl:new URL(`file://${bridgePath}`),
  loadJson:localJson,loadBinary:localBinary,room:roomDefinition,
});
const roomProfile=roomBody.roomProfile,roomNeutral=roomBody.snapshot();
if(roomBody.model.nbody!==70||roomBody.model.nu!==42||roomBody.model.nsensor!==6||roomBody.model.nkey!==1)throw new Error('room-derived XML changed the articulated core contract');
if(roomBody.model.ngeom!==model.ngeom+roomProfile.colliders.length)throw new Error('room-derived collider inventory differs from the compiled geometry count');
const explicitRoomPairCount=roomProfile.colliders.length*ARTICULATED_ROOM_COLLISION.contactBodyGeoms;
if(roomBody.model.npair!==model.npair+explicitRoomPairCount)throw new Error('room-derived explicit contact-pair inventory drifted');
const pairArrays=[
  ['friction',roomBody.model.pair_friction,5,ARTICULATED_ROOM_COLLISION.pairFriction],
  ['solref',roomBody.model.pair_solref,2,ARTICULATED_ROOM_COLLISION.solverReference],
  ['solimp',roomBody.model.pair_solimp,5,ARTICULATED_ROOM_COLLISION.solverImpedance],
  ['margin',roomBody.model.pair_margin,1,[ARTICULATED_ROOM_COLLISION.marginMm]],
];
const compiledRoomPairIndices=[];
for(let pair=0;pair<roomBody.model.npair;pair++){
  const geom1=roomBody.model.geom(roomBody.model.pair_geom1[pair]).name,geom2=roomBody.model.geom(roomBody.model.pair_geom2[pair]).name;
  if(geom1.startsWith('room_')||geom2.startsWith('room_'))compiledRoomPairIndices.push(pair);
}
if(compiledRoomPairIndices.length!==explicitRoomPairCount)throw new Error('compiled room-pair identification drifted');
for(const pair of compiledRoomPairIndices)for(const [label,values,width,expected] of pairArrays)for(let offset=0;offset<width;offset++)close(values[pair*width+offset],expected[offset],`room pair ${pair} ${label}[${offset}]`,1e-12);
if(roomProfile.colliders.length!==6||roomProfile.ignoredObjectKinds.join(',')!=='food')throw new Error('room collision-kind policy drifted');
for(let index=0;index<3;index++)close(roomNeutral.root.position[index],roomProfile.rootPosition[index],`room spawn root position[${index}]`,1e-12);
for(let index=0;index<4;index++)close(roomNeutral.root.quaternion[index],roomProfile.rootQuaternion[index],`room spawn root quaternion[${index}]`,1e-12);
const roomSensorNames=[];for(let index=0;index<roomBody.model.nsensor;index++)roomSensorNames.push(roomBody.model.sensor(index).name);
if(roomSensorNames.some(name=>!name.startsWith('local_contact_')))throw new Error('room-derived contact sensor remained ground-only');

roomBody.step(.6);const roomSettled=roomBody.snapshot(),roomSettledState=roomBody.serialize();
const rootTranslation=[0,1.6,0],roomImmediate=roomBody.perturbRootPosition(rootTranslation),obstacleContacts=[];
for(let index=0;index<roomBody.data.ncon;index++){
  const contact=roomBody.data.contact.get(index),geom1=roomBody.model.geom(contact.geom1).name,geom2=roomBody.model.geom(contact.geom2).name;
  if(geom1.startsWith('room_obstacle_')||geom2.startsWith('room_obstacle_'))obstacleContacts.push({geom1,geom2,distanceMm:contact.dist});
}
if(obstacleContacts.length<2||!obstacleContacts.every(contact=>/nmf\/[lr]f_tarsus/.test(`${contact.geom1} ${contact.geom2}`)))throw new Error('root translation did not produce compiled front-tarsus obstacle contact');
const sensorCountDeltas=roomImmediate.contacts.map((contact,index)=>contact.found-roomSettled.contacts[index].found);
if(sensorCountDeltas[0]<1||sensorCountDeltas[3]<1)throw new Error('wall contact did not enter both local front-leg contact sensors');
const roomAfferentJson=JSON.stringify(roomImmediate.afferents).toLowerCase();
for(const forbidden of ['"position"','"normal"','"tangent"','"world"','"collisionnormal"','"objects"','"room"'])if(roomAfferentJson.includes(forbidden))throw new Error(`room privilege escaped articulated afferent boundary: ${forbidden}`);
roomBody.step(.02);const roomCollisionResponse=roomBody.snapshot();
const unconstrainedTranslatedY=roomSettled.root.position[1]+rootTranslation[1],wallReactionDisplacement=unconstrainedTranslatedY-roomCollisionResponse.root.position[1];
if(wallReactionDisplacement<1e-5)throw new Error('compiled wall contact did not change root motion after the intervention');
roomBody.restore(roomSettledState);
if(JSON.stringify(roomBody.serialize())!==JSON.stringify(roomSettledState))throw new Error('room-derived articulated state serialize/restore is not exact');
const roomDefinitionB=structuredClone(roomDefinition);
roomDefinitionB.objects.find(object=>object.kind==='wall').y-=1;
const differentRoomBody=await MujocoArticulatedBody.load({
  runtimeUrl,modelBaseUrl:modelBaseUrl.href.replace(/\/$/,''),bridgeUrl:new URL(`file://${bridgePath}`),
  loadJson:localJson,loadBinary:localBinary,room:roomDefinitionB,
});
if(differentRoomBody.physicsProfileKey===roomBody.physicsProfileKey)throw new Error('physically different articulated rooms share a physics-profile identity');
assertThrowsProfile(()=>differentRoomBody.restore(roomSettledState),'different physics profile');
const unkeyedRoomState=structuredClone(roomSettledState);delete unkeyedRoomState.physicsProfileKey;
assertThrowsProfile(()=>roomBody.restore(unkeyedRoomState),'lacks a physics-profile identity');

const report={
  schema:'fly-umwelt-articulated-body-qualification-v1',version:'1.2.0',modelVersion:packageJson.version,
  qualificationScope:'artifact integrity, browser-WASM compilation, passive mechanics, explicit perturbation, source-matched normalized-room contact pairs, physics-profile state isolation, contact/proprioception extraction, state serialization and disabled-adhesion boundary; not biological locomotion validation',
  provenance:{
    flyGymRelease:provenance.upstream.release,flyGymSourceCommit:provenance.upstream.sourceCommit,flyGymBrowserAssetCommit:provenance.upstream.browserAssetCommit,
    neuroMechFlyDoi:provenance.upstream.citationDoi,mujocoVersion:provenance.runtime.version,
    verifiedFiles:provenance.files.length,verifiedBytes:provenance.files.reduce((sum,file)=>sum+file.bytes,0),meshCount:meshNames.length,
  },
  compiled:{
    bodies:model.nbody,generalizedCoordinates:model.nq,generalizedVelocities:model.nv,joints:model.njnt,
    positionActuators:model.nu,adhesionActuators:adhesionActuatorNames.length,contactSensors:model.nsensor,sensorValues:model.nsensordata,keyframes:model.nkey,
    freeJoints,timeStepSeconds:model.opt.timestep,gravityMmPerSecondSquared:Array.from(model.opt.gravity),
    totalMassGrams:round(mujoco.mj_getTotalmass(model),12),totalMassMilligrams:round(mujoco.mj_getTotalmass(model)*1000,9),physicsSubstepsPerWorldStep:Math.round(.01/model.opt.timestep),
  },
  bridge:{
    packetChannels:bridge.packet.channels,mappedActions:bridge.mapped.map(item=>item.actionId),
    structurallyInferredActions:bridge.structurallyInferred.flatMap(item=>item.actionIds),
    unresolvedActions:bridge.unresolved.map(item=>item.actionId),automaticNeuralControlEnabled:false,
    normalizedActivityGainEnabled:false,frontLegResolvedSpikeTorqueQualificationEnabled:true,physicalAfferentQualificationEnabled:true,roomPhysicsQualificationEnabled:true,
  },
  probes:{
    neutral:{rootPositionMm:roundArray(neutral.root.position),compiledContacts:neutral.compiledContacts,legContactCounts:neutral.contacts.map(contact=>contact.found)},
    femurTibiaCoordinateSigns:{method:'finite compiled-geometry perturbation; anatomical angle between proximal femur and distal tibia/tarsus vectors',positiveCoordinateMeans:'flexion',results:coordinateSignProbes},
    passiveSettling:{durationSeconds:.6,rootPositionMm:roundArray(settledLater.root.position),rootLinearSpeedMmPerSecond:round(norm(settledLater.root.linearVelocity),12),compiledContacts:settledLater.compiledContacts,legContactCounts:settledLater.contacts.map(contact=>contact.found),legNetForceNorms:roundArray(settledLater.contacts.map(contact=>norm(contact.force)),6),positionDriftOverFinal100msMm:round(settlingDrift,12)},
    afferentBoundary:{
      schema:afferentState.schema,vectorValues:afferentVector.length,legs:afferentState.legs.length,
      localEvidence:['anatomical femur-tibia angle','angular velocity','binary contact','raw contact-force magnitude','applied joint torque','claw/hook/club state'],
      forbiddenEvidenceAbsent:['world position','contact normal/tangent','object identity','room geometry'],
      strainTransferEnabled:false,contactLegs:afferentState.legs.filter(leg=>leg.contact>0).map(leg=>leg.leg),
    },
    explicitRootPerturbation:{inputLinearVelocityMmPerSecond:[5,0,2],inputAngularVelocityRadPerSecond:[0,0,2],initialLinearSpeedMmPerSecond:round(norm(perturbedInitial.root.linearVelocity),9),displacementAfter10msMm:round(perturbDisplacement,9),linearSpeedAfter500msMmPerSecond:round(norm(perturbRecovered.root.linearVelocity),12),angularSpeedAfter500msRadPerSecond:round(norm(perturbRecovered.root.angularVelocity),12)},
    normalizedRoomPhysics:{
      roomSizeMm:[roomProfile.room.width,roomProfile.room.height],spawnRoomCoordinates:[roomProfile.room.spawn.x,roomProfile.room.spawn.y],spawnHeadingRadians:roomProfile.room.spawn.heading,
      spawnTranslationMm:roundArray(roomProfile.spawnTranslation),compiledRootPositionMm:roundArray(roomNeutral.root.position),compiledRootQuaternion:roundArray(roomNeutral.root.quaternion),
      coordinateRule:'MuJoCo x = room x - width/2; MuJoCo y = room y - height/2; upstream neutral root offset retained',
      colliderHeightMm:ARTICULATED_ROOM_COLLISION.colliderHeightMm,boundaryThicknessMm:ARTICULATED_ROOM_COLLISION.boundaryThicknessMm,
      contactBodyGeoms:ARTICULATED_ROOM_COLLISION.contactBodyGeoms,explicitContactPairs:explicitRoomPairCount,
      pairFriction:ARTICULATED_ROOM_COLLISION.pairFriction,solverReference:ARTICULATED_ROOM_COLLISION.solverReference,solverImpedance:ARTICULATED_ROOM_COLLISION.solverImpedance,marginMm:ARTICULATED_ROOM_COLLISION.marginMm,
      colliderKinds:['boundary',...ARTICULATED_ROOM_COLLISION.collidingKinds],compiledColliders:roomProfile.colliders.length,
      ignoredObjectKinds:roomProfile.ignoredObjectKinds,contactSensorNames:roomSensorNames,rootTranslationInterventionMm:rootTranslation,
      localContactCountBefore:roomSettled.contacts.map(contact=>contact.found),localContactCountAtWall:roomImmediate.contacts.map(contact=>contact.found),localContactCountDelta:sensorCountDeltas,
      obstacleContacts:obstacleContacts.map(contact=>({...contact,distanceMm:round(contact.distanceMm)})),wallReactionDisplacementAfter20msMm:round(wallReactionDisplacement,12),
      cnsPrivilegeBoundaryPreserved:true,stateRoundTripExact:true,crossPhysicsProfileRestoreRejected:true,unkeyedRoomRestoreRejected:true,
      claimBoundary:'2-D room footprints extruded with frozen engineering height and source-matched explicit-pair parameters; physical collision qualification, not measured wall/shelter material mechanics',
    },
    explicitPositionTarget:{actuator:meta.actuators[actuatorIndex].name,engineeringTargetIncrementRadians:.1,positionBeforeRadians:round(jointBefore),positionAfter50msRadians:round(jointAfter),velocityAfter50msRadiansPerSecond:round(actuatorResponse.qvel[dofAddress])},
    resolvedFastFlexorTorque:{
      preparation:'adult front-leg restrained force probe',resolvedSpikes:1,twitchDurationSeconds:.05,
      peakEquivalentForceMicroNewtons:round(twitch.totalFlexorForceMicroNewtons,9),appliedTorqueNewtonMetres:round(twitch.totalFlexorTorqueNewtonMeters,15),
      appliedTorqueMicroNewtonMillimetres:round(spikeTorqueFront.appliedTorqueMicroNewtonMillimetres,9),positionActuatorsEnabled:false,
      maximumPositionActuatorForce:round(Math.max(...spikeTorqueResponse.proprioception.map(item=>Math.abs(item.actuatorForce))),12),
      zeroSpikeAppliedTorqueMicroNewtonMillimetres:round(zeroTorqueFront.appliedTorqueMicroNewtonMillimetres,12),
      controlCoordinateRadians:round(zeroTorqueFront.coordinatePosition),spikeCoordinateRadians:round(spikeTorqueFront.coordinatePosition),
      controlAnatomicalAngleRadians:round(zeroTorqueFront.anatomicalAngle),spikeAnatomicalAngleRadians:round(spikeTorqueFront.anatomicalAngle),
      controlHookFlexion:round(zeroAfferent.feco.hookFlexion),spikeHookFlexion:round(spikeAfferent.feco.hookFlexion),
      controlClub:round(zeroAfferent.feco.club),spikeClub:round(spikeAfferent.feco.club),
      claimBoundary:'experiment-specific probe-equivalent joint torque; not an internal tendon moment arm or free-walking muscle validation',
    },
    stateRoundTripExact:true,torqueModeStateRoundTripExact:true,
    adhesion:{enabled:false,compiledActuators:adhesionActuatorNames.length,reason:'upstream adhesion requires active per-leg phase commands; no experimentally justified neural timing bridge is available'},
  },
  passed:true,
  limitations:[
    'The upstream neutral position actuators, gains, friction and solver configuration are engineering model parameters, not fitted fly muscle physiology.',
    'The position-target probe remains an upstream mechanics check and is not driven by BANC population activity.',
    'The torque probe uses only resolved adult front-leg spikes and the measured external probe lever arm; no internal muscle/tendon geometry, extensor force or other-leg transfer is asserted.',
    'Ground contact, joint state and FeCO state now have a CNS-safe qualification vector, but it is not yet selected by the live whole-CNS loop.',
    'Raw contact force is retained, while its strain-afferent transfer stays disabled until a source-supported gain is available.',
    'Room width, depth and footprints are user-authored millimetre geometry; 5 mm extrusion height, 1 mm boundary thickness and source-matched contact/solver parameters are disclosed engineering parameters rather than measured chamber materials.',
    'Adhesion is disabled: upstream FlyGym attachment is an active tarsal actuator whose browser-game timing comes from excluded CPG/preprogrammed stepping, and no defensible neural control bridge is yet available.',
    'Food, water, light and threat remain nonblocking in articulated physics; wall and shelter footprints are static colliders and cannot yet move or deform.',
    'A stable passive body and a causal actuator response do not demonstrate walking competence or behavioral validity.'
  ],
};
const reportPath=resolve(root,`docs/benchmarks/articulated-body-qualification-${packageJson.version}.json`),serialized=`${JSON.stringify(report,null,2)}\n`;
if(args.has('--write'))await writeFile(reportPath,serialized);
if(args.has('--check')){
  const frozen=JSON.parse(await readFile(reportPath,'utf8'));
  if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('articulated-body qualification report drifted; inspect and regenerate deliberately with --write');
}
console.table([
  {probe:'compile',result:`${report.compiled.bodies} bodies / ${report.compiled.positionActuators} actuators / ${report.compiled.contactSensors} contact sensors`},
  {probe:'passive settle',result:`${settledLater.compiledContacts} contacts; drift ${report.probes.passiveSettling.positionDriftOverFinal100msMm} mm`},
  {probe:'root perturbation',result:`${report.probes.explicitRootPerturbation.displacementAfter10msMm} mm at 10 ms; recovered ${report.probes.explicitRootPerturbation.linearSpeedAfter500msMmPerSecond} mm/s`},
  {probe:'room collision',result:`${report.probes.normalizedRoomPhysics.compiledColliders} colliders; LF/RF sensor delta ${sensorCountDeltas[0]}/${sensorCountDeltas[3]}; wall reaction ${report.probes.normalizedRoomPhysics.wallReactionDisplacementAfter20msMm} mm`},
  {probe:'position target',result:`${report.probes.explicitPositionTarget.positionBeforeRadians} -> ${report.probes.explicitPositionTarget.positionAfter50msRadians} rad`},
  {probe:'coordinate sign',result:`+0.05 rad flexes all ${coordinateSignProbes.length} legs by 0.05 rad`},
  {probe:'spike torque',result:`1 resolved fast spike: ${report.probes.resolvedFastFlexorTorque.controlAnatomicalAngleRadians} -> ${report.probes.resolvedFastFlexorTorque.spikeAnatomicalAngleRadians} rad; servo force 0`},
  {probe:'afferent boundary',result:`${report.probes.afferentBoundary.vectorValues} values; ${report.probes.afferentBoundary.contactLegs.length} local contacts; no world geometry`},
]);
console.log('articulated body qualification passed within its declared mechanics-only scope');
differentRoomBody.dispose();roomBody.dispose();body.dispose();
