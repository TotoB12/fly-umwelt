import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateFrontLegBridge} from '../src/core/front-leg-bridge-validation.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=new Set(process.argv.slice(2));
const artifactPath=resolve(root,'public/data/calibration/front-leg-spike-force-bridge-v1.json');
const artifact=JSON.parse(await readFile(artifactPath,'utf8'));
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const evaluation=evaluateFrontLegBridge(artifact,{modelVersion:packageJson.version});
const report={
  ...evaluation,
  artifactPath:'public/data/calibration/front-leg-spike-force-bridge-v1.json',
  reportKind:'experiment-specific spike-force-probe bridge; fit metrics are not untouched validation',
};
const reportPath=resolve(root,`docs/benchmarks/front-leg-spike-force-bridge-${packageJson.version}.json`);
const serialized=`${JSON.stringify(report,null,2)}\n`;
if(args.has('--write'))await writeFile(reportPath,serialized);
if(args.has('--check')){
  const frozen=JSON.parse(await readFile(reportPath,'utf8'));
  if(JSON.stringify(frozen)!==JSON.stringify(report))throw new Error('front-leg spike-force bridge report drifted; inspect and regenerate deliberately with --write');
}
console.table(report.results.map(result=>({id:result.id,role:result.role,status:result.status,predicted:typeof result.predicted==='number'?result.predicted:JSON.stringify(result.predicted)})));
console.log(`front-leg spike-force bridge: ${report.summary.heldOut.pass}/${report.summary.heldOut.total} held-out implementation/causality checks pass; fit metrics ${report.summary.fit.pass}/${report.summary.fit.total}`);
if(args.has('--strict')&&report.summary.all.fail)throw new Error(`front-leg spike-force bridge failed ${report.summary.all.fail} qualification checks`);
