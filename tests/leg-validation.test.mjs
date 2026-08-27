import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  directionSelectivity,evaluateFrontLegModel,generateMamiyaRampHoldProtocols,
  generateMamiyaSwingProtocol,protocolById,validateLegEvidenceArtifact,
} from '../src/core/leg-validation.js';

const evidence=JSON.parse(await readFile(new URL('../public/data/calibration/front-leg-validation-v1.json',import.meta.url),'utf8'));
const frozenBaseline=JSON.parse(await readFile(new URL('../docs/benchmarks/front-leg-validation-baseline-3.5.0.json',import.meta.url),'utf8'));

test('leg experiment evidence has complete provenance and a disjoint locked split',()=>{
  assert.deepEqual(validateLegEvidenceArtifact(evidence),{
    sourceCount:3,protocolCount:5,observationCount:21,fitCount:6,heldOutCount:13,
  });
  const invalid=structuredClone(evidence);
  invalid.splitPolicy.fitIds.push(invalid.splitPolicy.heldOutIds[0]);
  assert.throws(()=>validateLegEvidenceArtifact(invalid),/fit and held-out overlap/);
});

test('Mamiya swing generator reproduces angles, speed, intervals and repeats',()=>{
  const protocol=protocolById(evidence,'mamiya-swing-360');
  const generated=generateMamiyaSwingProtocol(protocol,{dt:.001});
  const moves=generated.segments.filter(segment=>segment.kind==='move');
  const directionHolds=generated.segments.filter(segment=>segment.pass==='between-directions');
  const trialHolds=generated.segments.filter(segment=>segment.pass==='inter-trial');
  assert.equal(moves.length,6);
  assert.equal(directionHolds.length,3);
  assert.equal(trialHolds.length,2);
  assert.ok(moves.every(segment=>Math.abs(segment.durationSeconds-.45)<1e-12));
  assert.ok(directionHolds.every(segment=>segment.durationSeconds===5));
  assert.ok(trialHolds.every(segment=>segment.durationSeconds===5));
  assert.deepEqual(moves.map(segment=>[segment.fromAngleDeg,segment.toAngleDeg]),[
    [180,18],[18,180],[180,18],[18,180],[180,18],[18,180],
  ]);
  assert.ok(Math.abs(generated.durationSeconds-27.7)<1e-12);
});

test('Mamiya ramp-and-hold generator preserves both histories and commanded acceleration',()=>{
  const protocol=protocolById(evidence,'mamiya-ramp-hold');
  const generated=generateMamiyaRampHoldProtocols(protocol,{dt:.001});
  assert.equal(generated.length,4);
  assert.deepEqual(generated.map(item=>item.startingDirection),['flexion','flexion','extension','extension']);
  for(const experiment of generated){
    const moves=experiment.segments.filter(segment=>segment.kind==='move');
    const holds=experiment.segments.filter(segment=>segment.kind==='hold');
    assert.equal(moves.length,18);
    assert.equal(holds.length,18);
    assert.ok(moves.every(segment=>segment.profileMode==='trapezoidal-acceleration'));
    assert.ok(moves.every(segment=>Math.abs(segment.durationSeconds-(.0033333333333333335+.07166666666666667+.0033333333333333335))<1e-12));
    assert.ok(holds.every(segment=>segment.durationSeconds===3));
    assert.equal(moves[0].direction,experiment.startingDirection);
    assert.equal(moves.at(-1).toAngleDeg,experiment.startingDirection==='flexion'?180:18);
  }
});

test('direction selectivity retains the published sign convention',()=>{
  assert.equal(directionSelectivity(1,0),1);
  assert.equal(directionSelectivity(0,1),-1);
  assert.equal(directionSelectivity(1,1),0);
});

test('frozen 3.5 baseline retains the pre-refinement falsifications',()=>{
  assert.deepEqual(frozenBaseline.summary.heldOut,{total:13,pass:8,fail:5,notEvaluable:0,expectedLimitation:0});
  assert.deepEqual(frozenBaseline.results.filter(result=>result.role==='held-out'&&result.status==='fail').map(result=>result.id),[
    'mamiya-club-dsi',
    'mamiya-hook-flexion-dsi',
    'mamiya-claw-steady-state-hysteresis',
    'mamiya-club-angle-modulation',
    'mamiya-hook-velocity-flatness',
  ]);
});

test('3.6 evidence-supported response shapes improve diagnostics without hiding remaining failures',()=>{
  const report=evaluateFrontLegModel(evidence,{dt:.001,modelVersion:'3.6.0'});
  assert.deepEqual(report.summary.heldOut,{total:13,pass:11,fail:2,notEvaluable:0,expectedLimitation:0});
  assert.deepEqual(report.results.filter(result=>result.role==='held-out'&&result.status==='fail').map(result=>result.id),[
    'mamiya-club-dsi','mamiya-hook-flexion-dsi',
  ]);
  const vibration=report.results.find(result=>result.id==='mamiya-club-vibration-band');
  assert.equal(vibration.status,'expected-limitation');
  assert.match(vibration.reason,/100–2000 Hz carrier/);
});

test('publisher-figure force artifact is explicitly derived, calibrated and compact',async()=>{
  const digitized=JSON.parse(await readFile(new URL('../public/data/calibration/azevedo-force-figure4d-v1.json',import.meta.url),'utf8'));
  assert.equal(digitized.evidenceClass,'publisher-figure-digitized');
  assert.equal(digitized.source.imageRedistributed,false);
  assert.match(digitized.source.downloadedImageSha256,/^[a-f0-9]{64}$/);
  assert.equal(digitized.reportedScalarCrossChecks.slowLinearSlopeMicroNewtonsPerSpike,0.013);
  assert.deepEqual(Object.fromEntries(Object.entries(digitized.points).map(([key,points])=>[key,points.length])),{fast:8,intermediate:10,slow:7});
  for(const points of Object.values(digitized.points))for(const point of points){
    assert.ok(point.spikes>0&&point.medianMicroNewtons>0);
    assert.ok(point.coloredPixelP10MicroNewtons<=point.medianMicroNewtons);
    assert.ok(point.medianMicroNewtons<=point.coloredPixelP90MicroNewtons);
  }
});
