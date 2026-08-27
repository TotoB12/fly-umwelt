import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {parseShardedConnectomePack,resolveGraphTier} from '../src/core/connectome-data.js';
import {WholeConnectomeEngine} from '../src/core/brain-engine.js';
import {LOCOMOTOR_CALIBRATION as frozen} from '../src/core/locomotor-calibration.js';
import {PlanarHexapodPlant} from '../src/core/hexapod-plant.js';
import {WorldModel} from '../src/core/world-model.js';
import {modelConfigFor} from '../src/core/constants.js';
import {sanitizeMotorPacket} from '../src/core/protocol.js';

const root=resolve(import.meta.dirname,'..'),args=new Set(process.argv.slice(2)),auditOnly=args.has('--audit');
const artifactPath=resolve(root,'public/data/calibration/locomotor-honesty-v1.json');
const artifact=JSON.parse(await readFile(artifactPath,'utf8'));
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const durationSeconds=10,longHorizonSeconds=30,fittingSeed=1,heldOutSeeds=[2,3,5,8],seeds=[fittingSeed,...heldOutSeeds];
const locomotorRecruitmentKeys=['oDN1','P9','BPN','DNp09','DNg_walk','halt','MDN','DNp42'];
const round=(value,digits=6)=>Number(Number(value||0).toFixed(digits));
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const max=values=>values.length?Math.max(...values):0;
const close=(actual,expected,label,tolerance=1e-12)=>{
  if(!Number.isFinite(actual)||Math.abs(actual-expected)>tolerance)throw new Error(`${label}: frozen ${actual} != artifact ${expected}`);
};
const angleDelta=(current,previous)=>{
  let value=current-previous;while(value>Math.PI)value-=Math.PI*2;while(value<-Math.PI)value+=Math.PI*2;return value;
};

if(artifact.schema!==frozen.schema)throw new Error(`locomotor calibration schema mismatch: ${artifact.schema}`);
if(artifact.modelVersion!==packageJson.version)throw new Error(`locomotor artifact targets ${artifact.modelVersion}, package is ${packageJson.version}`);
const sources=Object.fromEntries(artifact.sources.map(source=>[source.id,source]));
close(frozen.evidence.straightBoutSpeedMinMmPerSecond,sources['mendes-2013'].observations.averageSpeedRangeMmPerSecond[0],'speed minimum');
close(frozen.evidence.straightBoutSpeedMaxMmPerSecond,sources['mendes-2013'].observations.averageSpeedRangeMmPerSecond[1],'speed maximum');
close(frozen.evidence.representativeSpeedMmPerSecond,sources['mendes-2013'].observations.mostRepresentedSpeedMmPerSecond,'representative speed');
close(frozen.evidence.activeJointCycleMinHz,sources['azevedo-2020'].observations.walkingFemurTibiaCycleRangeHz[0],'cycle minimum');
close(frozen.evidence.activeJointCycleMaxHz,sources['azevedo-2020'].observations.walkingFemurTibiaCycleRangeHz[1],'cycle maximum');
close(frozen.evidence.representativeAdvancePerCycleMm,artifact.derivedConstraints.representativeAdvancePerCycleMm,'advance per cycle');
close(frozen.engineering.motorSubthresholdSaturationScale,artifact.engineeringBridge.motorDecoder.motorSubthresholdSaturationScale,'motor saturation scale');
close(frozen.engineering.steeringGainRadPerSecond,artifact.engineeringBridge.plant.steeringGainRadPerSecond,'steering gain');
close(frozen.engineering.steeringTractionScale,artifact.engineeringBridge.plant.steeringTractionScale,'steering traction scale');

const base=resolve(root,'public/data/banc'),manifest=JSON.parse(await readFile(resolve(base,'manifest.json'),'utf8'));
const tier=resolveGraphTier(manifest,'balanced');
const asArrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
const neuronText=gunzipSync(await readFile(resolve(base,'neurons.csv.gz'))).toString('utf8');
const classText=gunzipSync(await readFile(resolve(base,'classification.csv.gz'))).toString('utf8');
const shardBuffers=[];
for(const spec of tier.shards){
  const raw=gunzipSync(await readFile(resolve(root,'public',spec.local.replace(/^\.\//,''))));
  shardBuffers.push(asArrayBuffer(raw));
}
const data=parseShardedConnectomePack(neuronText,classText,shardBuffers,{...manifest,edgeCount:tier.edgeCount,graphTier:tier.id});
const defaultRoom=JSON.parse(await readFile(resolve(root,'public/rooms/default.json'),'utf8'));

function directCausalChecks(){
  const zero=new PlanarHexapodPlant(),coordinationOnly=new PlanarHexapodPlant(),tonicOnly=new PlanarHexapodPlant(),tonicAsymmetry=new PlanarHexapodPlant(),steeringOnly=new PlanarHexapodPlant(),contactOnly=new PlanarHexapodPlant();
  let contactBehavior=null;
  for(let i=0;i<300;i++){
    zero.step({brain:sanitizeMotorPacket({}),dt:.01});
    coordinationOnly.step({brain:sanitizeMotorPacket({coordinationDrive:1}),dt:.01});
    tonicOnly.step({brain:sanitizeMotorPacket({legs:[.7,.7,.7,.7,.7,.7]}),dt:.01});
    tonicAsymmetry.step({brain:sanitizeMotorPacket({coordinationDrive:.7,legs:[.85,.82,.8,.35,.38,.4]}),dt:.01});
    steeringOnly.step({brain:sanitizeMotorPacket({coordinationDrive:.7,dna02Right:.9}),dt:.01});
    contactBehavior=contactOnly.step({brain:sanitizeMotorPacket({coordinationDrive:.7,legs:[.7,.7,.7,.7,.7,.7]}),touch:[1.5,0,0,0,0,0],dt:.01});
  }
  const probe=new PlanarHexapodPlant().step({brain:sanitizeMotorPacket({feed:.9}),taste:[0,0,0],dt:.01});
  const contactFeed=new PlanarHexapodPlant().step({brain:sanitizeMotorPacket({feed:.9}),taste:[1,0,0],dt:.01});
  const original=new PlanarHexapodPlant();
  for(let i=0;i<70;i++)original.step({brain:sanitizeMotorPacket({coordinationDrive:.5,legs:[.4,.5,.6,.4,.5,.6]}),dt:.01});
  const restored=new PlanarHexapodPlant();restored.restore(original.serialize());
  const continuation=sanitizeMotorPacket({coordinationDrive:.6,legs:[.6,.4,.5,.6,.4,.5],dna02Right:.2});
  for(let i=0;i<30;i++){original.step({brain:continuation,dt:.01});restored.step({brain:continuation,dt:.01});}
  return {
    zeroOutputImmobile:zero.speed===0&&zero.turnRate===0&&zero.forwardTraction===0,
    coordinationOnlyImmobile:coordinationOnly.speed===0&&coordinationOnly.turnRate===0&&coordinationOnly.forwardTraction===0,
    tonicReadinessDoesNotStartGait:tonicOnly.speed===0&&tonicOnly.turnRate===0&&tonicOnly.gaitFrequencyHz===0&&tonicOnly.legs.every(leg=>leg.amplitude>.5),
    tonicMotorAsymmetryDoesNotSteer:Math.abs(tonicAsymmetry.turnRate)<1e-12,
    steeringWithoutTractionCannotRotate:steeringOnly.speed===0&&steeringOnly.turnRate===0,
    contactDoesNotSelectBehavior:contactBehavior.state==='walk'&&contactBehavior.bias===0&&Math.abs(contactOnly.turnRate)<1e-12&&![...Object.keys(contactOnly.serialize())].some(key=>/^contact(?:Reverse|Turn|Escape|Sequence)/.test(key)),
    bareFloorIsProbe:probe.state==='probe'&&probe.feedAttempt===.9&&probe.feed===0&&probe.ingestionContact===null,
    contactConfirmsFeeding:contactFeed.state==='feed'&&contactFeed.feed===.9&&contactFeed.ingestionContact==='food',
    saveRestoreContinuationExact:JSON.stringify(restored.serialize())===JSON.stringify(original.serialize()),
  };
}

async function runClosedLoop(room,seed,seconds=durationSeconds){
  const engine=new WholeConnectomeEngine(data,modelConfigFor('natural',{warmupMs:0}),seed);
  const world=new WorldModel(room,seed^0x9e3779b9,'natural');
  let nextBrain=0,path=0,absoluteRotation=0,signedRotation=0,priorX=world.fly.x,priorY=world.fly.y,priorHeading=world.fly.heading;
  const speedSamples=[],plantCommandSpeeds=[],activeSpeeds=[],gaitFrequencies=[],legDriveSamples=[],gridCells=new Set();
  let pauseSteps=0,falseIngestionFrames=0,motorSaturationFrames=0,neuralSaturationFrames=0,maxPopulationRateHz=0,maxConflict=0,brainFrames=0;
  let steeringSpikeFrames=0,decodedSteeringFrames=0,maxSteeringPopulationRateHz=0,maxSteeringActivation=0,maxDecodedSteeringAsymmetry=0;
  const recruitment=Object.fromEntries(locomotorRecruitmentKeys.map(key=>[key,{populationSize:data.mapping.populations[key]?.length||0,spikeFrames:0,maxPopulationRateHz:0,maxActivation:0}]));
  let maxBroadDescendingRateHz=0,maxBroadDescendingActivation=0;
  let contactFrames=0,contactEpisodes=0,inContact=false,neuralReverseFrames=0,privateReverseFrames=0;
  let foodContactFrames=0,waterContactFrames=0,feedAttemptFrames=0,feedingFrames=0,initialResourceDistance=Infinity,minResourceDistance=Infinity;
  const resources=world.room.objects.filter(object=>(object.kind==='food'||object.kind==='water')&&object.amount>0);
  const resourceDistance=()=>resources.length?Math.min(...resources.map(object=>Math.hypot(world.fly.x-object.x,world.fly.y-object.y)-object.r)):Infinity;
  initialResourceDistance=resourceDistance();
  for(let step=0;step<Math.round(seconds/.01);step++){
    if(world.time>=nextBrain-1e-9){
      const result=engine.advance(50,world.sense(50));world.setBrain(result.motor);nextBrain+=.05;brainFrames++;
      const motor=result.motor,stats=result.stats;
      const frameDrive=mean(motor.legs);legDriveSamples.push(frameDrive);
      if(motor.legs.every(value=>value>.995))motorSaturationFrames++;
      if(stats.populationRateHz>25||motor.conflict>.95)neuralSaturationFrames++;
      maxPopulationRateHz=Math.max(maxPopulationRateHz,stats.populationRateHz);maxConflict=Math.max(maxConflict,motor.conflict);
      if(motor.reverse>.35)neuralReverseFrames++;
      const steeringKeys=['DNa02_L','DNa02_R','DNa01_L','DNa01_R','DNg13_L','DNg13_R'];
      const steeringRates=steeringKeys.map(key=>Number(stats.rates?.named?.[key])||0);
      const steeringActivations=steeringKeys.map(key=>Number(stats.rates?.activation?.named?.[key])||0);
      const decodedSteering=Math.abs(Number(motor.turnEvidence)||0);
      if(max(steeringRates)>0)steeringSpikeFrames++;
      if(decodedSteering>1e-9)decodedSteeringFrames++;
      maxSteeringPopulationRateHz=Math.max(maxSteeringPopulationRateHz,max(steeringRates));
      maxSteeringActivation=Math.max(maxSteeringActivation,max(steeringActivations));
      maxDecodedSteeringAsymmetry=Math.max(maxDecodedSteeringAsymmetry,decodedSteering);
      for(const key of locomotorRecruitmentKeys){
        const diagnostic=recruitment[key],populationRateHz=Number(stats.rates?.named?.[key])||0,populationActivation=Number(stats.rates?.activation?.named?.[key])||0;
        if(populationRateHz>0)diagnostic.spikeFrames++;
        diagnostic.maxPopulationRateHz=Math.max(diagnostic.maxPopulationRateHz,populationRateHz);
        diagnostic.maxActivation=Math.max(diagnostic.maxActivation,populationActivation);
      }
      maxBroadDescendingRateHz=Math.max(maxBroadDescendingRateHz,Number(stats.rates?.broad?.descending)||0);
      maxBroadDescendingActivation=Math.max(maxBroadDescendingActivation,Number(stats.rates?.activation?.broad?.descending)||0);
    }
    world.step(.01);
    const behavior=world.lastBehavior,stepDistance=Math.hypot(world.fly.x-priorX,world.fly.y-priorY),speed=stepDistance/.01;
    path+=stepDistance;priorX=world.fly.x;priorY=world.fly.y;
    const turn=angleDelta(world.fly.heading,priorHeading);signedRotation+=turn;absoluteRotation+=Math.abs(turn);priorHeading=world.fly.heading;
    const touching=behavior.legs.some(leg=>leg.contact>.08);
    if(touching){contactFrames++;if(!inContact)contactEpisodes++;}inContact=touching;
    speedSamples.push(speed);plantCommandSpeeds.push(Math.abs(behavior.speed));
    // Mendes et al. measured straight uninterrupted bouts. Contact-limited
    // displacement is retained in realized mean speed, but must not be scored
    // as an unobstructed active-bout speed sample.
    if(speed>=1&&!touching){activeSpeeds.push(speed);gaitFrequencies.push(behavior.gaitFrequencyHz);}else if(speed<.5)pauseSteps++;
    if(behavior.state==='reverse'&&world.latestBrain.reverse<=.35)privateReverseFrames++;
    gridCells.add(`${Math.floor(world.fly.x/10)},${Math.floor(world.fly.y/10)}`);
    minResourceDistance=Math.min(minResourceDistance,resourceDistance());
    if(behavior.feedAttempt>.2)feedAttemptFrames++;
    if(behavior.ingestionContact==='food')foodContactFrames++;if(behavior.ingestionContact==='water')waterContactFrames++;
    if(behavior.feed>.18)feedingFrames++;
    if((behavior.feed>0&&behavior.ingestionContact!=='food')||(behavior.drink>0&&behavior.ingestionContact!=='water'))falseIngestionFrames++;
  }
  const displacement=Math.hypot(world.fly.x-room.spawn.x,world.fly.y-room.spawn.y);
  return {
    seed,role:seed===fittingSeed?'fit':'held-out',seconds,pathMm:round(path,4),displacementMm:round(displacement,4),straightness:path?round(displacement/path):1,
    meanSpeedMmPerSecond:round(mean(speedSamples)),plantCommandSpeedMmPerSecond:round(mean(plantCommandSpeeds)),activeSpeedMmPerSecond:{mean:round(mean(activeSpeeds)),max:round(max(activeSpeeds)),sampleFraction:round(activeSpeeds.length/speedSamples.length)},
    gaitFrequencyHz:{mean:round(mean(gaitFrequencies)),min:round(gaitFrequencies.length?Math.min(...gaitFrequencies):0),max:round(max(gaitFrequencies))},
    rotationDegrees:{signed:round(signedRotation*180/Math.PI,4),absolute:round(absoluteRotation*180/Math.PI,4)},
    coverageCells10mm:gridCells.size,pauseFraction:round(pauseSteps/speedSamples.length),
    motor:{meanLegDrive:round(mean(legDriveSamples)),maxMeanLegDrive:round(max(legDriveSamples)),saturationFrames:motorSaturationFrames,maxConflict:round(maxConflict)},
    neural:{
      brainFrames,maxPopulationRateHz:round(maxPopulationRateHz),saturationFrames:neuralSaturationFrames,
      steering:{
        populationKeys:['DNa02_L','DNa02_R','DNa01_L','DNa01_R','DNg13_L','DNg13_R'],
        spikeFrames:steeringSpikeFrames,decodedAsymmetryFrames:decodedSteeringFrames,
        maxPopulationRateHz:round(maxSteeringPopulationRateHz),maxActivation:round(maxSteeringActivation),
        maxDecodedAsymmetry:round(maxDecodedSteeringAsymmetry),
      },
      locomotorRecruitment:{
        interpretation:'observer diagnostic only; no listed population is converted into a start/stop or velocity command by this report',
        exact:Object.fromEntries(Object.entries(recruitment).map(([key,value])=>[key,{...value,maxPopulationRateHz:round(value.maxPopulationRateHz),maxActivation:round(value.maxActivation)}])),
        broadDescendingProxy:{maxPopulationRateHz:round(maxBroadDescendingRateHz),maxActivation:round(maxBroadDescendingActivation)},
      },
    },
    contact:{frames:contactFrames,episodes:contactEpisodes,neuralReverseFrames,privateReverseFrames},
    ingestion:{feedAttemptFrames,feedingFrames,foodContactFrames,waterContactFrames,falseIngestionFrames},
    resourceGeometry:{initialDistanceMm:round(initialResourceDistance,4),minimumDistanceMm:round(minResourceDistance,4),encountered:foodContactFrames+waterContactFrames>0},
    final:{x:round(world.fly.x,3),y:round(world.fly.y,3),heading:round(world.fly.heading,5)},
  };
}

const causalChecks=directCausalChecks();
for(const [name,passed] of Object.entries(causalChecks))if(!passed)throw new Error(`locomotor causal check failed: ${name}`);
const runs=[];for(const seed of seeds)runs.push(await runClosedLoop(defaultRoom,seed));
const longHorizonRun=await runClosedLoop(defaultRoom,fittingSeed,longHorizonSeconds);

// Geometry-only encounter assay: the room places a food patch in the initial
// travel corridor, but the CNS receives only the ordinary retina/odor/taste/
// proprioception packet. Coordinates are read here solely by the validator.
const encounterRoom={version:1,name:'embodied resource-contact assay',width:300,height:220,ambientLight:.5,temperature:.5,spawn:{x:120,y:110,heading:0},objects:[{id:'food-assay',kind:'food',x:148,y:110,r:5,amount:1,odor:1}]};
const resourceAssay=await runClosedLoop(encounterRoom,fittingSeed,5);

const engineeringFailures=[],scientificFailures=[];
for(const run of runs){
  if(run.activeSpeedMmPerSecond.mean<frozen.evidence.straightBoutSpeedMinMmPerSecond||run.activeSpeedMmPerSecond.mean>frozen.evidence.straightBoutSpeedMaxMmPerSecond)scientificFailures.push(`seed ${run.seed} active speed ${run.activeSpeedMmPerSecond.mean} mm/s is outside the published bout envelope`);
  if(run.gaitFrequencyHz.min<frozen.evidence.activeJointCycleMinHz-1e-9||run.gaitFrequencyHz.max>frozen.evidence.activeJointCycleMaxHz+1e-9)scientificFailures.push(`seed ${run.seed} gait frequency left the 10-20 Hz envelope`);
  if(run.motor.meanLegDrive>.9||run.motor.saturationFrames||run.neural.saturationFrames)engineeringFailures.push(`seed ${run.seed} saturated motor/neural output`);
  if(run.ingestion.falseIngestionFrames)engineeringFailures.push(`seed ${run.seed} reported ingestion without matching contact`);
}
if(runs.every(run=>run.neural.steering.spikeFrames===0))scientificFailures.push('exact DNa01/DNa02/DNg13 populations produced zero spikes in every default-room run; spontaneous steering is not qualified');
if(!resourceAssay.resourceGeometry.encountered)engineeringFailures.push('geometry-only resource assay never reached mouth contact');
if(resourceAssay.ingestion.feedingFrames<1)engineeringFailures.push('real BANC resource assay reached contact but never produced contact-confirmed feeding');
if(resourceAssay.ingestion.falseIngestionFrames)engineeringFailures.push('resource assay reported false ingestion');
if(longHorizonRun.contact.privateReverseFrames)throw new Error('long-horizon run exposed plant-side reverse frames without represented reverse output');
if(longHorizonRun.contact.frames>longHorizonSeconds*100*.5&&longHorizonRun.contact.neuralReverseFrames===0)scientificFailures.push(`30 s run remained in contact for ${round(longHorizonRun.contact.frames/100,2)} s without represented reverse recruitment`);
if(longHorizonRun.activeSpeedMmPerSecond.sampleFraction<.5&&longHorizonRun.plantCommandSpeedMmPerSecond>frozen.evidence.straightBoutSpeedMinMmPerSecond)scientificFailures.push('plant continued commanding walking while realized body motion was contact-limited; phasic bout/stop recruitment is not demonstrated');
const legacyEngineeringObservations={
  status:'reported-only',
  explanation:'The former 45 mm path, four-cell coverage and 30 degree turning cutoffs were visual engineering heuristics, not published biological constraints. They remain reproducible observations but cannot determine scientific qualification.',
  pathBelow45MmSeeds:runs.filter(run=>run.pathMm<45).map(run=>run.seed),
  coverageBelow4CellsSeeds:runs.filter(run=>run.coverageCells10mm<4).map(run=>run.seed),
  maximumAbsoluteRotationDegrees:round(max(runs.map(run=>run.rotationDegrees.absolute)),4),
};
if(auditOnly){
  console.table(runs.map(run=>({seed:run.seed,role:run.role,pathMm:run.pathMm,activeSpeed:run.activeSpeedMmPerSecond.mean,gaitHz:run.gaitFrequencyHz.mean,coverage:run.coverageCells10mm,turnDeg:run.rotationDegrees.absolute,meanLegDrive:run.motor.meanLegDrive})));
  console.log(JSON.stringify({engineeringFailures,scientificFailures,legacyEngineeringObservations,longHorizonRun,resourceAssay},null,2));
  process.exit(0);
}
if(engineeringFailures.length)throw new Error(engineeringFailures.join('; '));
if(args.has('--strict')&&scientificFailures.length)throw new Error(scientificFailures.join('; '));

const report={
  schema:'fly-umwelt-locomotor-honesty-report-v1',modelVersion:packageJson.version,
  qualification:'Causal-honesty audit plus deterministic initial-condition observations on the actual bundled Balanced BANC graph. Seeds are not independent animals. Published biological envelopes, engineering integrity gates and reported-only visual heuristics are kept separate. Scientific failures remain report data and make the separate strict competence command fail.',
  dataset:{id:manifest.id,tier:tier.id,neurons:data.N,edges:data.E,weightSemantics:manifest.graph.weightSemantics},
  calibration:'public/data/calibration/locomotor-honesty-v1.json',durationSeconds,longHorizonSeconds,fittingSeed,heldOutSeeds,
  auditStatus:engineeringFailures.length?'failed':'passed',scientificStatus:scientificFailures.length?'not-qualified':'qualified',
  status:scientificFailures.length?'not-qualified':'qualified',engineeringFailures,scientificFailures,legacyEngineeringObservations,causalChecks,runs,longHorizonRun,resourceAssay,
  aggregate:{
    meanPathMm:round(mean(runs.map(run=>run.pathMm)),4),meanActiveSpeedMmPerSecond:round(mean(runs.map(run=>run.activeSpeedMmPerSecond.mean))),
    meanGaitFrequencyHz:round(mean(runs.map(run=>run.gaitFrequencyHz.mean))),meanLegDrive:round(mean(runs.map(run=>run.motor.meanLegDrive))),
    meanCoverageCells10mm:round(mean(runs.map(run=>run.coverageCells10mm)),2),maxAbsoluteRotationDegrees:round(max(runs.map(run=>run.rotationDegrees.absolute)),4),
    totalFalseIngestionFrames:runs.reduce((sum,run)=>sum+run.ingestion.falseIngestionFrames,0),totalSaturationFrames:runs.reduce((sum,run)=>sum+run.motor.saturationFrames+run.neural.saturationFrames,0),
  },
  limitations:artifact.knownLimitations,
};
const reportPath=resolve(root,`docs/benchmarks/locomotor-honesty-${packageJson.version}.json`),serialized=`${JSON.stringify(report,null,2)}\n`;
if(args.has('--write')){await mkdir(resolve(reportPath,'..'),{recursive:true});await writeFile(reportPath,serialized);}
if(args.has('--check')){
  const prior=await readFile(reportPath,'utf8');if(prior!==serialized)throw new Error('locomotor honesty report drifted; inspect and regenerate deliberately with --write');
}
console.table(runs.map(run=>({seed:run.seed,role:run.role,pathMm:run.pathMm,activeSpeed:run.activeSpeedMmPerSecond.mean,gaitHz:run.gaitFrequencyHz.mean,coverage:run.coverageCells10mm,turnDeg:run.rotationDegrees.absolute,meanLegDrive:run.motor.meanLegDrive})));
console.log(`locomotor honesty: causal gates pass; scientific status ${report.status}; ${scientificFailures.length} preserved failure(s); resource contact ${resourceAssay.resourceGeometry.encountered?'reached':'missed'}; false ingestion ${report.aggregate.totalFalseIngestionFrames}`);
