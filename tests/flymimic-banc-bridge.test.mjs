import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {csvObjects} from '../src/core/csv.js';

const root=resolve(import.meta.dirname,'..');

test('FlyMimic/BANC bridge freezes exactly two identities and no neural gain',async()=>{
  const bridge=JSON.parse(await readFile(resolve(root,'public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json'),'utf8'));
  assert.equal(bridge.mappings.length,2);
  assert.deepEqual(bridge.mappings.map(item=>[item.banc.root_id,item.banc.cell_type,item.flyMimicActuator]),[
    ['720575941481179066','tibia_flexor_Fast','LFTibia_flex_93434'],
    ['720575941639281525','tibia_extensor_FETi','LFTibia_extensor_93932'],
  ]);
  for(const mapping of bridge.mappings){
    assert.equal(mapping.mappingStatus,'identity-only');
    assert.equal(mapping.banc.nt_type,'GABA');
    assert.equal(mapping.banc.nt_source,'predicted');
    assert.equal(mapping.excitationGain,null);
    assert.equal(mapping.timingTransfer,null);
    assert.equal(mapping.automaticControlEnabled,false);
  }
  assert.equal(bridge.gainBoundary.azevedoProbeForceTransferAllowed,false);
  assert.equal(bridge.excluded.find(item=>item.cell_type==='tibia_extensor_SETi').root_id,'720575941478577231');
});

test('identity bridge rows remain exact in the bundled BANC classification',async()=>{
  const bridge=JSON.parse(await readFile(resolve(root,'public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json'),'utf8'));
  const rows=csvObjects(gunzipSync(await readFile(resolve(root,'public/data/banc/classification.csv.gz'))).toString('utf8'));
  const byRoot=new Map(rows.map(row=>[row.root_id,row]));
  for(const mapping of bridge.mappings){
    const row=byRoot.get(mapping.banc.root_id);
    for(const field of Object.keys(mapping.banc))assert.equal(row[field],mapping.banc[field],`${mapping.banc.root_id} ${field}`);
  }
});

test('reconciliation keeps the two bodies mechanically separate',async()=>{
  const report=JSON.parse(await readFile(resolve(root,'docs/benchmarks/body-reconciliation-3.8.0.json'),'utf8'));
  assert.equal(report.decision.mechanicallyMergeable,false);
  assert.equal(report.decision.livePlantReplacementAllowed,false);
  assert.equal(report.contact.externalLoadTransferReady,false);
  assert.equal(report.compiledComparison.sameRootTopology,false);
  assert.ok(report.compiledComparison.massRatioFlyMimicToViewer>2);
  assert.equal(report.bodyIdentity.leftFrontTrochanterFemurSegmentation.inertiaComparisonValid,false);
});
