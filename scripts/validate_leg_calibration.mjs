import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {FEMUR_TIBIA_MOTOR_UNIT_SPECS,LEG_IDS,LEG_MOTOR_ACTION_SPECS} from '../src/core/constants.js';
import {createFecoState,stepFecoTransduction} from '../src/core/feco-transduction.js';
import {PlanarHexapodPlant} from '../src/core/hexapod-plant.js';
import {FEMUR_TIBIA_PROPRIOCEPTION_LENGTH,FRONT_FEMUR_TIBIA_CALIBRATION as frozen} from '../src/core/leg-calibration.js';
import {createFemurTibiaMuscleState,stepFemurTibiaMuscle} from '../src/core/muscle-unit-model.js';

const root=resolve(import.meta.dirname,'..');
const sourcePath=resolve(root,'public/data/calibration/front-leg-femur-tibia.json');
const source=JSON.parse(await readFile(sourcePath,'utf8'));
const degrees=value=>value*Math.PI/180;
const close=(actual,expected,label,tolerance=1e-12)=>{
  if(!Number.isFinite(actual)||Math.abs(actual-expected)>tolerance)throw new Error(`${label}: frozen ${actual} != artifact ${expected}`);
};

if(source.schema!==frozen.schema)throw new Error(`calibration schema mismatch: ${source.schema}`);
if(source.preparation.species!=='Drosophila melanogaster'||source.preparation.stage!=='adult'||source.preparation.leg!=='front/prothoracic')throw new Error('calibration preparation boundary changed');
close(frozen.coordinate.minimumAngleRad,source.coordinate.minimum,'coordinate.minimum');
close(frozen.coordinate.neutralAngleRad,source.coordinate.neutral,'coordinate.neutral');
close(frozen.coordinate.maximumAngleRad,source.coordinate.maximum,'coordinate.maximum');
source.coordinate.naturalWalkingRange.forEach((value,index)=>close(frozen.coordinate.naturalWalkingRangeRad[index],value,`coordinate.naturalWalkingRange[${index}]`));

for(const key of ['activeAcceleration','passiveStiffness','damping'])close(frozen.joint[key],source.engineeringParameters.joint[key],`joint.${key}`);
close(frozen.joint.maximumVelocityRadPerSecond,degrees(source.engineeringParameters.joint.maximumVelocityDegreesPerSecond),'joint.maximumVelocity');
for(const [frozenKey,artifactKey] of [['slowThreshold','slowThreshold'],['intermediateThreshold','intermediateThreshold'],['fastThreshold','fastThreshold'],['thresholdRampWidth','thresholdRampWidth'],['fastRequiresIntermediate','fastIntermediateGate']])close(frozen.recruitment[frozenKey],source.engineeringParameters.recruitment[artifactKey],`recruitment.${frozenKey}`);
close(frozen.recruitment.gateMemorySeconds,source.engineeringParameters.recruitment.gateMemoryMilliseconds/1000,'recruitment.gateMemory');
for(const [unit,key] of [['flexorSlow','slow'],['flexorIntermediate','intermediate'],['flexorFast','fast']])close(frozen.motorUnits[unit].forceGain,source.engineeringParameters.relativeForceGain[key],`${unit}.forceGain`);
for(const [unit,key] of [['flexorSlow','slowRise'],['flexorIntermediate','intermediateRise'],['flexorFast','fastRise']])close(frozen.motorUnits[unit].riseTauSeconds,source.engineeringParameters.activationTauMilliseconds[key]/1000,`${unit}.riseTau`);
for(const [frozenKey,artifactKey] of [['tonicTauSeconds','clawTonic'],['phasicRiseTauSeconds','hookRise'],['phasicFallTauSeconds','hookFall'],['clubAdaptationTauSeconds','clubAdaptation']])close(frozen.feco[frozenKey],source.engineeringParameters.fecoFilterTauMilliseconds[artifactKey]/1000,`feco.${frozenKey}`);
close(frozen.feco.hookSpeedHalfRadPerSecond,degrees(source.engineeringParameters.fecoResponseShape.hookSpeedHalfDegreesPerSecond),'feco.hookSpeedHalf');
close(frozen.feco.clawHistoryGain,source.engineeringParameters.fecoResponseShape.clawHistoryGain,'feco.clawHistoryGain');
close(frozen.feco.clubExtensionAttenuation,source.engineeringParameters.fecoResponseShape.clubFullExtensionAttenuation,'feco.clubExtensionAttenuation');

const recruitmentState=createFemurTibiaMuscleState(),onset={slow:null,intermediate:null,fast:null};
for(let step=0;step<=1000;step++){
  const drive=step/1000;
  stepFemurTibiaMuscle(recruitmentState,{flexorDrive:drive},.001);
  for(const key of Object.keys(onset))if(onset[key]===null&&recruitmentState.commands[key]>.01)onset[key]=drive;
}
const gateState=createFemurTibiaMuscleState();
stepFemurTibiaMuscle(gateState,{motorUnits:[0,0,1,0,0]},.005);const isolatedFast=gateState.commands.fast;
stepFemurTibiaMuscle(gateState,{motorUnits:[0,.8,1,0,0]},.005);const accompaniedFast=gateState.commands.fast;
const responseState=createFemurTibiaMuscleState();
stepFemurTibiaMuscle(responseState,{motorUnits:[0,.8,0,0,0]},.001);
let halfResponseSeconds=0;
while(responseState.activation.fast<.5&&halfResponseSeconds<.05){stepFemurTibiaMuscle(responseState,{motorUnits:[0,.8,1,0,0]},.0001);halfResponseSeconds+=.0001;}
const silentState=createFemurTibiaMuscleState();
for(let i=0;i<100;i++)stepFemurTibiaMuscle(silentState,{},.01);

const feco=createFecoState(frozen.coordinate.neutralAngleRad);
for(let i=0;i<60;i++)stepFecoTransduction(feco,{angle:degrees(40),velocity:0},.01);
const clawFlexed={flexion:feco.clawFlexion,extension:feco.clawExtension};
for(let i=0;i<30;i++)stepFecoTransduction(feco,{angle:degrees(95+i*3),velocity:degrees(180)},.01);
const extensionRamp={hookFlexion:feco.hookFlexion,hookExtension:feco.hookExtension,club:feco.club};
for(let i=0;i<60;i++)stepFecoTransduction(feco,{angle:degrees(175-i*2.7),velocity:degrees(-180)},.01);
const flexionRamp={hookFlexion:feco.hookFlexion,hookExtension:feco.hookExtension,club:feco.club};

const triangle=createFemurTibiaMuscleState();let trianglePeakFast=0;
for(let i=0;i<=200;i++){
  const drive=i<=100?i/100:(200-i)/100;
  stepFemurTibiaMuscle(triangle,{flexorDrive:drive},.001);
  trianglePeakFast=Math.max(trianglePeakFast,triangle.activation.fast);
}

const plant=new PlanarHexapodPlant(),flexAction=LEG_MOTOR_ACTION_SPECS.findIndex(item=>item.id==='femurTibiaFlex');
const symmetricActuators=new Array(LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length).fill(0);
for(let leg=0;leg<LEG_IDS.length;leg++)symmetricActuators[leg*LEG_MOTOR_ACTION_SPECS.length+flexAction]=.55;
for(let i=0;i<50;i++)plant.step({brain:{legs:Array(6).fill(.4),actuators:symmetricActuators},touch:Array(6).fill(0),dt:.01});
const jointAngles=plant.legs.map(leg=>leg.femurTibiaAngle),symmetryError=Math.max(...jointAngles)-Math.min(...jointAngles);
const saved=plant.serialize(),restored=new PlanarHexapodPlant();restored.restore(saved);
plant.step({brain:{legs:Array(6).fill(.2),actuators:symmetricActuators},touch:Array(6).fill(0),dt:.01});
restored.step({brain:{legs:Array(6).fill(.2),actuators:symmetricActuators},touch:Array(6).fill(0),dt:.01});
const continuationExact=JSON.stringify(restored.serialize())===JSON.stringify(plant.serialize());

const checks={
  orderedRecruitment:onset.slow<onset.intermediate&&onset.intermediate<onset.fast,
  fastThreshold:onset.fast>=frozen.recruitment.fastThreshold,
  fastRequiresIntermediate:isolatedFast===0&&accompaniedFast>0,
  halfResponse:Math.abs(halfResponseSeconds-source.motorEvidence.fastIntermediateHalfForceMilliseconds/1000)<.0004,
  zeroActiveForce:silentState.flexorForce===0&&silentState.extensorForce===0,
  clawPolarity:clawFlexed.flexion>.5&&clawFlexed.extension<.05,
  hookDirection:extensionRamp.hookExtension>extensionRamp.hookFlexion&&flexionRamp.hookFlexion>flexionRamp.hookExtension,
  clubBidirectional:extensionRamp.club>.1&&flexionRamp.club>.1,
  triangleRecruitsFast:trianglePeakFast>.1,
  bilateralSymmetry:symmetryError<=1e-12,
  saveRestoreContinuation:continuationExact,
};
for(const [name,passed] of Object.entries(checks))if(!passed)throw new Error(`calibration check failed: ${name}`);

const result={
  schema:'fly-umwelt-leg-calibration-validation-v1',version:source.version,source:'public/data/calibration/front-leg-femur-tibia.json',
  staticContracts:{motorUnitChannels:LEG_IDS.length*FEMUR_TIBIA_MOTOR_UNIT_SPECS.length,proprioceptionValues:FEMUR_TIBIA_PROPRIOCEPTION_LENGTH,bodyRateHertz:source.runtimeBoundary.bodyRateHertz},
  metrics:{recruitmentOnset:onset,isolatedFast,accompaniedFast,halfResponseMilliseconds:halfResponseSeconds*1000,clawFlexed,extensionRamp,flexionRamp,trianglePeakFast,bilateralSymmetryError:symmetryError},
  checks,
  limitations:['Normalized thresholds and passive mechanics are engineering parameters.','Only the adult front-leg preparation is experimentally constrained; other legs are structural extrapolations.','The 100 Hz body loop carries a club movement/impact envelope, not the measured 100-2000 Hz vibration carrier.'],
};
if(process.argv.includes('--write')){
  const output=resolve(root,'docs/benchmarks/femur-tibia-constraints-3.6.0.json');
  await mkdir(resolve(output,'..'),{recursive:true});
  await writeFile(output,`${JSON.stringify(result,null,2)}\n`);
}
console.log(JSON.stringify(result,null,2));
