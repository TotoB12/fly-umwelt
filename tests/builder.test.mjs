import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {parseShardedConnectomePack} from '../src/core/connectome-data.js';

const runPython=(script,args=[])=>spawnSync(process.execPath,[resolve('scripts/run_python.mjs'),resolve(script),...args],{encoding:'utf8'});

test('BANC builder encodes the audited whole-CNS boundary and reproducible graph tiers',async()=>{
  const script=await readFile(resolve('scripts/build_banc_pack.py'),'utf8');
  const run=runPython('scripts/build_banc_pack.py',['--help']);
  assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout,/strict-known-source/i);
  assert.match(run.stdout,/max-records-per-shard/i);
  for(const token of ['BAD_OBJECT_TOKENS','IS_REAL_NEURON','proofread','roughly_proofread','edges[\"norm\"]','mtime=0','(contacts>=5)','(contacts>=3)','(contacts>=1)'])assert(script.includes(token),`missing audited builder token ${token}`);
  assert.match(script,/Keep proofread or roughly-proofread objects/i);
  assert.match(script,/Core\s+: >= 5 aggregate contacts/i);
  assert.match(script,/Balanced : Core plus 3-4 contacts/i);
  assert.match(script,/Maximal\s+: Balanced plus 1-2 contacts/i);
  const manifest=JSON.parse(await readFile(resolve('public/data/banc/manifest.json'),'utf8'));
  assert.equal(manifest.neuronCount,155855);
  assert.equal(manifest.defaultGraphTier,'balanced');
  assert.equal(manifest.graph.weightSemantics,'count / postsynaptic total input');
  assert.equal(manifest.graph.tiers.core.edgeCount,1912731);
  assert.equal(manifest.graph.tiers.balanced.edgeCount,3730893);
  assert.equal(manifest.graph.tiers.maximal.edgeCount,13366470);
});

test('official FAFB builder aggregates neuropil rows and emits a valid static shard pack', async () => {
  const root=await mkdtemp(join(tmpdir(),'fly-cns-builder-'));
  try{
    const connections='pre_root_id,post_root_id,syn_count,neuropil,nt_type\n1,2,2,AL,ACH\n1,2,4,LH,ACH\n2,3,5,CX,GABA\n3,1,4,MB,GLUT\n';
    const neurons='root_id,nt_type,flow,super_class,class\n1,ACH,afferent,sensory,olfactory\n2,GABA,intrinsic,central,interneuron\n3,GLUT,efferent,descending,descending\n';
    const types='root_id,cell_type,side,label\n1,Or22a_ORN,left,food receptor\n2,interneuron,,central\n3,DNa02,right,descending output\n';
    await Promise.all([
      writeFile(join(root,'connections.csv.gz'),gzipSync(connections)),
      writeFile(join(root,'neurons.csv.gz'),gzipSync(neurons)),
      writeFile(join(root,'types.csv.gz'),gzipSync(types)),
    ]);
    const out=join(root,'out');
    const run=runPython('scripts/build_codex_fafb_pack.py',['--connections-file',join(root,'connections.csv.gz'),'--neurons-file',join(root,'neurons.csv.gz'),'--cell-types-file',join(root,'types.csv.gz'),'--output-dir',out,'--min-synapses','5','--expected-neurons','3','--expected-connections','2','--strict-counts']);
    assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);
    const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
    assert.equal(manifest.neuronCount,3);assert.equal(manifest.edgeCount,2);assert.equal(manifest.builder.minSynapses,5);
    const neuronText=gunzipSync(await readFile(join(out,'neurons.csv.gz'))).toString('utf8');
    const classText=gunzipSync(await readFile(join(out,'classification.csv.gz'))).toString('utf8');
    const shardNames=(await readdir(out)).filter(name=>/^edges-.*\.bin\.gz$/.test(name)).sort();
    const shards=[];for(const name of shardNames){const b=gunzipSync(await readFile(join(out,name)));shards.push(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
    const pack=parseShardedConnectomePack(neuronText,classText,shards,manifest);
    assert.equal(pack.N,3);assert.equal(pack.E,2);assert.equal(pack.mapping.populations.DNa02_R.length,1);
    assert(pack.mapping.populations.olfactoryFoodAnnotatedLeft.length>0);
  } finally {await rm(root,{recursive:true,force:true});}
});
