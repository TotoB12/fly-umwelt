import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {parseShardedConnectomePack} from '../src/core/connectome-data.js';

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
    const run=spawnSync('python',[resolve('scripts/build_codex_fafb_pack.py'),'--connections-file',join(root,'connections.csv.gz'),'--neurons-file',join(root,'neurons.csv.gz'),'--cell-types-file',join(root,'types.csv.gz'),'--output-dir',out,'--min-synapses','5','--expected-neurons','3','--expected-connections','2','--strict-counts'],{encoding:'utf8'});
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
