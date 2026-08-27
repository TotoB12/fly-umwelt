import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateFrontLegModel} from '../src/core/leg-validation.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const evidencePath=resolve(root,'public/data/calibration/front-leg-validation-v1.json');
const args=new Set(process.argv.slice(2));
const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const reportPath=resolve(root,`docs/benchmarks/front-leg-validation-${packageJson.version}.json`);
const evaluation=evaluateFrontLegModel(evidence,{dt:.001,modelVersion:packageJson.version});
const report={
  schema:evaluation.schema,evidenceSchema:evaluation.evidenceSchema,evidenceVersion:evaluation.evidenceVersion,
  modelVersion:evaluation.modelVersion,integrationStepSeconds:evaluation.integrationStepSeconds,
  integrity:evaluation.integrity,summary:evaluation.summary,
  results:evaluation.results.map(result=>({
    id:result.id,role:result.role,status:result.status,
    predicted:result.predicted,error:result.error,
    ...(result.reason?{reason:result.reason}:{}),
  })),
  interpretation:evaluation.interpretation,
  reportKind:'current-model-after-evidence-supported-3.6-refinement',
  evidencePath:'public/data/calibration/front-leg-validation-v1.json',
  baselinePolicy:'The unchanged 3.5 report remains frozen separately. Failures remain scientific findings; --strict requires every still-designated held-out record to pass.',
};
const serialized=`${JSON.stringify(report,null,2)}\n`;

if(args.has('--write'))await writeFile(reportPath,serialized);
if(args.has('--check')){
  const frozen=JSON.parse(await readFile(reportPath,'utf8'));
  if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('front-leg experimental report drifted; inspect results and regenerate deliberately with --write');
}

const rows=report.results.map(result=>({
  id:result.id,role:result.role,status:result.status,
  predicted:typeof result.predicted==='number'?result.predicted:'—',
}));
console.table(rows);
console.log(`front-leg experiments: ${report.summary.heldOut.pass}/${report.summary.heldOut.total} designated held-out pass; ${report.summary.heldOut.fail} falsified; ${report.summary.fit.notEvaluable+report.summary.fit.expectedLimitation} fit observations await a unit/carrier bridge`);

if(args.has('--strict')){
  const unresolved=evaluation.results.filter(result=>result.role==='held-out'&&result.status!=='pass');
  if(unresolved.length)throw new Error(`strict held-out gate failed: ${unresolved.map(result=>result.id).join(', ')}`);
}
