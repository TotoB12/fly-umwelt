import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {csvObjects} from '../src/core/csv.js';
import {parseConnectomePack} from '../src/core/connectome-data.js';

const root=resolve(import.meta.dirname,'..'),args=new Set(process.argv.slice(2));
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const artifactPath=resolve(root,'public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json');
const artifact=JSON.parse(await readFile(artifactPath,'utf8'));
const manifest=JSON.parse(await readFile(resolve(root,'public/data/banc/manifest.json'),'utf8'));
const classificationCompressed=await readFile(resolve(root,'public/data/banc/classification.csv.gz'));
const neuronsCompressed=await readFile(resolve(root,'public/data/banc/neurons.csv.gz'));
const sourceXml=await readFile(resolve(root,'public/data/morphology/flymimic-frontleg-20260623a/model/flymimic-frontleg.xml'),'utf8');
const sha256=value=>createHash('sha256').update(value).digest('hex');

if(artifact.schema!=='fly-umwelt-flymimic-banc-front-tibia-bridge-v1'||artifact.version!=='1.0.0'||artifact.modelVersion!==packageJson.version)throw new Error('FlyMimic/BANC bridge schema or version drifted');
if(artifact.provenance.bancRelease!==manifest.sourceRelease||artifact.provenance.classificationSha256!==manifest.classification.sha256||sha256(classificationCompressed)!==manifest.classification.sha256)throw new Error('bridge BANC classification provenance drifted');
if(artifact.provenance.flyGymSourceCommit!=='ca65a510c2afe6ac61c51df4f274c8d190c2f95f'||artifact.provenance.flyMimicCommit!=='9ea1131626cd76f7203b74076ef8f0e9cab30bef'||artifact.provenance.flyMimicXmlSha256!==sha256(sourceXml))throw new Error('bridge FlyMimic source identity drifted');
if(artifact.mappings.length!==2||artifact.mappings.some(item=>item.mappingStatus!=='identity-only'||item.excitationGain!==null||item.timingTransfer!==null||item.automaticControlEnabled!==false))throw new Error('identity-only bridge silently acquired a gain, timing transfer or control privilege');
if(artifact.gainBoundary.automaticControlEnabled!==false||artifact.gainBoundary.azevedoProbeForceTransferAllowed!==false||artifact.transmitterBoundary.receptorAwareNeuromuscularModelAvailable!==false)throw new Error('bridge evidence boundary drifted');

const classificationText=gunzipSync(classificationCompressed).toString('utf8');
const neuronText=gunzipSync(neuronsCompressed).toString('utf8');
const classificationRows=csvObjects(classificationText),neuronRows=csvObjects(neuronText);
const classificationByRoot=new Map(classificationRows.map(row=>[row.root_id,row]));
const neuronIndexByRoot=new Map(neuronRows.map((row,index)=>[row.root_id,index]));
const verifiedFields=['root_id','cell_type','side','body_part_effector','peripheral_target_type','function_detailed','proofread','status','nt_type','nt_source','nt_confidence'];
for(const mapping of artifact.mappings){
  const row=classificationByRoot.get(mapping.banc.root_id);
  if(!row)throw new Error(`mapped BANC root ${mapping.banc.root_id} is absent from bundled classification`);
  for(const field of verifiedFields)if(row[field]!==mapping.banc[field])throw new Error(`${mapping.banc.root_id} ${field}: ${row[field]} != ${mapping.banc[field]}`);
  const neuron=neuronRows[neuronIndexByRoot.get(mapping.banc.root_id)];
  for(const field of ['nt_type','nt_source','nt_confidence'])if(neuron?.[field]!==mapping.banc[field])throw new Error(`${mapping.banc.root_id} neuron-table ${field} differs from classification bridge`);
  if(!sourceXml.includes(`name="${mapping.flyMimicActuator}"`))throw new Error(`FlyMimic actuator ${mapping.flyMimicActuator} is absent from pinned XML`);
}

const graph=new ArrayBuffer(8+neuronRows.length*3),view=new DataView(graph);
view.setUint32(0,neuronRows.length,true);view.setUint32(4,0,true);
const parsed=parseConnectomePack(neuronText,classificationText,graph,{neuronCount:neuronRows.length,edgeCount:0});
const populationEvidence=[];
for(const mapping of artifact.mappings){
  const expectedIndex=neuronIndexByRoot.get(mapping.banc.root_id),population=parsed.mapping.populations[mapping.runtimePopulation];
  if(expectedIndex===undefined||!population||!Array.from(population).includes(expectedIndex))throw new Error(`${mapping.banc.root_id} is absent from runtime population ${mapping.runtimePopulation}`);
  const populationRoots=Array.from(population,index=>parsed.rootIds[index]);
  populationEvidence.push({runtimePopulation:mapping.runtimePopulation,populationSize:population.length,mappedRootId:mapping.banc.root_id,mappedRootPresent:true,populationRootIds:populationRoots});
}
const seti=artifact.excluded.find(item=>item.cell_type==='tibia_extensor_SETi');
const setiRow=classificationByRoot.get(seti?.root_id);
if(!setiRow||setiRow.cell_type!=='tibia_extensor_SETi')throw new Error('SETi exclusion no longer points to the exact bundled slow-extensor row');
const setiIndex=neuronIndexByRoot.get(seti.root_id),slowPopulation=parsed.mapping.populations.legMotorUnitLFExtensorSlow;
if(!slowPopulation||!Array.from(slowPopulation).includes(setiIndex))throw new Error('excluded SETi root is not retained in its distinct runtime slow-extensor population');
if(artifact.mappings.some(item=>item.banc.root_id===seti.root_id||item.flyMimicActuator.includes('SETi')))throw new Error('SETi was silently promoted to the FlyMimic fast-extensor mapping');

const report={
  schema:'fly-umwelt-flymimic-banc-front-tibia-bridge-qualification-v1',version:'1.0.0',modelVersion:packageJson.version,
  scope:'Exact bundled-row and runtime-population validation for an identity-only two-neuron/two-actuator correspondence. No muscle command is produced.',
  sources:{bridge:relative(root,artifactPath),bancRelease:manifest.sourceRelease,classificationSha256:sha256(classificationCompressed),neuronsSha256:sha256(neuronsCompressed),flyMimicXmlSha256:sha256(sourceXml)},
  verifiedMappings:artifact.mappings.map((item,index)=>({role:item.role,rootId:item.banc.root_id,cellType:item.banc.cell_type,runtimePopulation:item.runtimePopulation,runtimePopulationSize:populationEvidence[index].populationSize,flyMimicActuator:item.flyMimicActuator,mappingStatus:item.mappingStatus,predictedTransmitter:item.banc.nt_type,predictedTransmitterConfidence:Number(item.banc.nt_confidence),lrTypeConflict:item.banc.status.includes('LR_TYPE_CONFLICT'),excitationGain:item.excitationGain,timingTransfer:item.timingTransfer,automaticControlEnabled:item.automaticControlEnabled})),
  exclusions:{seti:{rootId:seti.root_id,cellType:seti.cell_type,runtimePopulation:'legMotorUnitLFExtensorSlow',runtimePopulationSize:slowPopulation.length,retainedAsDistinctSlowIdentity:true,mappedToFlyMimicFastExtensor:false},unresolvedAndAccessoryFlexorsMapped:false,otherFlyMimicMtusMapped:false},
  evidenceBoundary:{predictedGabaRetained:true,predictedGabaReinterpretedAsMuscleInhibition:false,azevedoExternalProbeForceUsedAsFlyMimicTendonForce:false,spikeToExcitationGainAvailable:false,timingTransferAvailable:false,automaticControlEnabled:false},
  passed:{artifactIntegrity:true,exactBundledRows:true,neuronTableAgreement:true,runtimePopulationMembership:true,flyMimicActuatorIdentity:true,fastVersusSlowExtensorSeparation:true,identityMapping:true,gainValidation:false,timingValidation:false,automaticControl:false},
  limitations:artifact.promotionRequirements,
};
const reportPath=resolve(root,`docs/benchmarks/flymimic-banc-front-tibia-bridge-${packageJson.version}.json`),serialized=`${JSON.stringify(report,null,2)}\n`;
if(args.has('--write')){await writeFile(reportPath,serialized);console.log(`wrote ${relative(root,reportPath)}`);}
else{
  let frozen;try{frozen=JSON.parse(await readFile(reportPath,'utf8'));}catch{throw new Error('missing frozen FlyMimic/BANC bridge qualification; run npm run bridge:flymimic-banc:write');}
  if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('FlyMimic/BANC bridge qualification drifted; inspect and regenerate deliberately with --write');
}
console.log(`validated FlyMimic/BANC identity bridge: ${artifact.mappings.length} exact mappings, SETi excluded, excitation gain and automatic control disabled`);
