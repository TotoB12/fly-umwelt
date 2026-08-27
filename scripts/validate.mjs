import {readdir, stat, readFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {WORLD_TO_BRAIN_FIELDS, assertSensoryPacket} from '../src/core/protocol.js';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'index.html', 'src/main.js', 'src/app.js', 'src/styles.css', 'src/full-pack-probe.js',
  'src/ui/renderer.js', 'src/ui/ethogram.js',
  'src/editor/room-editor.js', 'src/editor/history.js',
  'src/core/protocol.js', 'src/core/connectome-data.js', 'src/core/brain-engine.js',
  'src/core/vnc-controller.js', 'src/core/hexapod-plant.js', 'src/core/memory-model.js', 'src/core/neural-kernels.js', 'src/core/compute-profile.js',
  'src/core/front-leg-biophysics.js', 'src/core/front-leg-bridge-validation.js',
  'src/core/locomotor-calibration.js', 'src/core/mujoco-articulated-body.js', 'src/core/mujoco-musculoskeletal-body.js',
  'src/workers/brain.worker.js', 'src/workers/world.worker.js',
  'public/data/manifest.json', 'public/data/fixture-manifest.json', 'public/data/fixture.bin.gz',
  'public/data/banc/manifest.json', 'public/data/banc/audit.json', 'public/data/banc/edge-stats.json',
  'public/data/calibration/front-leg-spike-force-bridge-v1.json',
  'public/data/calibration/articulated-body-bridge-v1.json',
  'public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json',
  'public/data/calibration/locomotor-competence-v1.json', 'public/data/calibration/locomotor-honesty-v1.json',
  'public/data/morphology/neuromechfly-v2.1.0/provenance.json',
  'public/data/morphology/neuromechfly-v2.1.0/model_meta.json',
  'public/data/morphology/neuromechfly-v2.1.0/model/fly.xml',
  'public/data/morphology/flymimic-frontleg-20260623a/provenance.json',
  'public/data/morphology/flymimic-frontleg-20260623a/mesh_metadata.yaml',
  'public/data/morphology/flymimic-frontleg-20260623a/model/flymimic-frontleg.xml',
  'public/vendor/mujoco-3.9.0/mujoco.js', 'public/vendor/mujoco-3.9.0/mujoco.wasm',
  'public/vendor/licenses/flygym-v2.1.0-LICENSE', 'public/vendor/licenses/mujoco-3.9.0-LICENSE', 'public/vendor/licenses/flymimic-9ea1131-LICENSE',
  'public/wasm/lif-kernel.wasm', 'native/lif_kernel.c',
  'public/rooms/default.json', 'docs/README.md', 'docs/NEXT_DEVELOPER_HANDOFF.md', 'docs/SCIENTIFIC_MODEL.md', 'docs/CLAIMS_AND_ETHICS.md', 'docs/MUSCULOSKELETAL_BODY_3_8.md', 'docs/MUSCULOSKELETAL_INTEGRATION_3_8.md',
  'docs/FRONT_LEG_SPIKE_FORCE_BRIDGE_3_6.md', 'docs/benchmarks/front-leg-spike-force-bridge-3.6.0.json',
  'docs/benchmarks/front-leg-validation-3.7.0.json', 'docs/benchmarks/front-leg-spike-force-bridge-3.7.0.json',
  'docs/benchmarks/front-leg-validation-3.8.0.json', 'docs/benchmarks/front-leg-spike-force-bridge-3.8.0.json',
  'docs/benchmarks/locomotor-competence-3.7.0.json', 'docs/benchmarks/locomotor-honesty-3.8.0.json',
  'docs/benchmarks/articulated-body-qualification-3.8.0.json',
  'docs/benchmarks/musculoskeletal-body-qualification-3.8.0.json',
  'docs/benchmarks/musculoskeletal-zero-safe-qualification-3.8.0.json',
  'docs/benchmarks/flymimic-banc-front-tibia-bridge-3.8.0.json',
  'docs/benchmarks/body-reconciliation-3.8.0.json',
  'scripts/build.mjs', 'scripts/build_wasm.mjs', 'scripts/smoke.mjs', 'scripts/visual_preview.mjs', 'scripts/build_banc_pack.py', 'scripts/validate_documentation.mjs', 'scripts/validate_banc_pack.mjs', 'scripts/validate_front_leg_bridge.mjs', 'scripts/validate_locomotor_competence.mjs', 'scripts/validate_articulated_body.mjs', 'scripts/validate_musculoskeletal_body.mjs', 'scripts/validate_musculoskeletal_zero_safe.mjs', 'scripts/validate_flymimic_banc_bridge.mjs', 'scripts/validate_body_reconciliation.mjs', 'scripts/vendor_neuromechfly_browser_assets.mjs', 'scripts/vendor_flymimic_musculoskeletal_assets.mjs', 'scripts/banc_dynamics.mjs',
];

async function walk(dir) {
  const output = [];
  for (const name of await readdir(dir)) {
    const path = resolve(dir, name);
    const metadata = await stat(path);
    if (metadata.isDirectory() && !['dist', 'node_modules', '.git', '.cache', '.venv', '.venv-oai', '__pycache__'].includes(name)) output.push(...await walk(path));
    else if (metadata.isFile()) output.push(path);
  }
  return output;
}
const files = await walk(root);
const fileSet = new Set(files);
for (const file of requiredFiles) if (!fileSet.has(resolve(root, file))) throw new Error(`missing ${file}`);

const source = async (path) => readFile(resolve(root, path), 'utf8');
const js = files.filter((file) => /\.(m?js)$/.test(file));
for (const file of js) {
  const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${relative(root, file)}\n${result.stderr}`);
}

const [html, css, app, renderer, ethogram, editor, connectome, brainWorker, protocol, buildScript, packageText, kernels, computeProfile, headers, bancBuilder, wasmBytes, constants, brainEngine, motorDecoder, plant, bridgeArtifact, locomotorCalibration, locomotorValidator] = await Promise.all([
  source('index.html'), source('src/styles.css'), source('src/app.js'), source('src/ui/renderer.js'),
  source('src/ui/ethogram.js'), source('src/editor/room-editor.js'), source('src/core/connectome-data.js'),
  source('src/workers/brain.worker.js'), source('src/core/protocol.js'), source('scripts/build.mjs'), source('package.json'),
  source('src/core/neural-kernels.js'), source('src/core/compute-profile.js'), source('_headers'), source('scripts/build_banc_pack.py'), readFile(resolve(root,'public/wasm/lif-kernel.wasm')),
  source('src/core/constants.js'), source('src/core/brain-engine.js'), source('src/core/motor-decoder.js'), source('src/core/hexapod-plant.js'), source('public/data/calibration/front-leg-spike-force-bridge-v1.json'), source('public/data/calibration/locomotor-honesty-v1.json'), source('scripts/validate_locomotor_competence.mjs'),
]);

// Preserve all original operations while adding the redesigned observation surfaces.
const requiredIds = [
  'playButton', 'stepButton', 'speedSelect', 'modeSelect', 'worldCanvas', 'umweltCanvas',
  'editButton', 'inspectorButton', 'saveRoomButton', 'loadRoomButton', 'exportRoomButton', 'importRoomInput',
  'newFlyButton', 'saveFlyButton', 'restoreFlyButton', 'connectomeSelect', 'graphTierSelect',
  'cameraFollowButton', 'cameraOverviewButton', 'cameraZoomOutButton', 'cameraZoomInButton', 'cameraResetButton',
  'behaviorLabel', 'behaviorReason', 'behaviorDuration', 'stripActivityCanvas', 'energyValue', 'hydrationValue',
  'umweltDetailCanvas', 'neuralFieldCanvas', 'ethogramCanvas', 'memoryCanvas', 'activityChart',
  'historyWindowSelect', 'clearHistoryButton', 'retinaChart', 'eventList', 'outputBars', 'objectInspector',
  'computeBackendSelect', 'neuralResolutionSelect', 'computeBackendValue', 'computeStepValue', 'computeLoadValue', 'computeCapabilityValue', 'computeWarning', 'causalPathValue',
];
for (const id of requiredIds) if (!html.includes(`id="${id}"`)) throw new Error(`index missing #${id}`);
for (const mode of ['natural', 'connectome', 'evoked']) if (!html.includes(`value="${mode}"`)) throw new Error(`index missing ${mode} mode`);
if (!html.includes('<option value="connectome">Causal</option>')) throw new Error('connectome-dominant mode must be presented as Causal');
if (!html.includes('<option value="banc">BANC · whole CNS</option>') || !html.includes('<option value="fafb">FAFB · brain comparison</option>')) throw new Error('bundled connectome selector is incomplete');
if (!html.includes('<option value="maximal">Maximal')) throw new Error('graph-tier selector is incomplete');
if (/https?:\/\//.test(html.match(/<(?:script|link)[^>]+>/g)?.join('') || '')) throw new Error('runtime scripts/styles must remain local static assets');

const tabs = ['now', 'umwelt', 'neural', 'history', 'memory', 'brain'];
for (const tab of tabs) {
  if (!html.includes(`id="tab-${tab}"`) || !html.includes(`data-tab="${tab}"`) || !html.includes(`id="panel-${tab}"`)) throw new Error(`missing ${tab} observation tab/panel`);
  if (!html.includes(`aria-controls="panel-${tab}"`)) throw new Error(`${tab} tab missing aria-controls`);
  if (!html.includes(`aria-labelledby="tab-${tab}"`)) throw new Error(`${tab} panel missing aria-labelledby`);
}
if ((html.match(/role="tab"/g) || []).length !== tabs.length) throw new Error('observation surface must expose exactly six ARIA tabs');
if (!html.includes('role="tablist"') || !html.includes('role="tabpanel"')) throw new Error('observation tabs are missing ARIA structure');
if (!app.includes("event.key === 'ArrowRight'") || !app.includes("event.key === 'Home'") || !app.includes("event.key === 'End'")) throw new Error('ARIA tab keyboard navigation is incomplete');

// Camera, editor, observer history, and sampled neural visualization must stay display-side.
for (const method of ['setCameraMode', 'zoomCamera', 'panCamera', 'worldPoint', 'worldToScreen', 'restoreCameraState']) {
  if (!renderer.includes(`${method}(`)) throw new Error(`renderer missing camera method ${method}`);
}
if (!renderer.includes("mode: 'follow'") || !renderer.includes("mode === 'overview'") || !renderer.includes("mode === 'free'")) throw new Error('renderer camera modes are incomplete');
if (!renderer.includes("addEventListener('wheel'") || !renderer.includes("pointerMap.size > 1") || !renderer.includes("event.key === 'ArrowLeft'")) throw new Error('camera lacks wheel, pinch, or keyboard navigation');
if (!editor.includes('this.renderer.worldPoint(event.clientX, event.clientY)')) throw new Error('room editor does not use camera-aware screen-to-room conversion');
if (!editor.includes("this.tool === 'pan'") || !editor.includes('cancelGesture')) throw new Error('editor pan/gesture compatibility is incomplete');
if (!app.includes("this.renderer.setCameraMode('overview')") || !app.includes('this.cameraBeforeEdit')) throw new Error('editing does not enter overview and restore prior camera state');
if (!app.includes('this.worldWorker?.postMessage({type: \'room-update\'')) throw new Error('live room editing no longer reaches the world worker');

if (!ethogram.includes('maxSeconds = 180') || !ethogram.includes('maxSegments = 1400') || !ethogram.includes('maxMarkers = 1000')) throw new Error('ethogram is not explicitly bounded');
if (!ethogram.includes('observer-side history') || !ethogram.includes('never mutates')) throw new Error('ethogram observer-only boundary is not documented in code');
if (!app.includes('this.ethogram.record(snapshot)') || !app.includes('this.ethogram.clear()')) throw new Error('ethogram lifecycle is not wired to world snapshots/reset');
for (const file of ['src/core/brain-engine.js', 'src/core/world-model.js', 'src/core/vnc-controller.js', 'src/workers/world.worker.js']) {
  const text = await source(file);
  if (text.includes("ui/ethogram") || text.includes('EthogramHistory') || text.includes('EthogramView')) throw new Error(`${file} must not depend on display history`);
}

if (!connectome.includes('export function buildDisplayAtlas') || !connectome.includes('groupByNeuron = new Uint8Array')) throw new Error('sampled-spike display atlas is missing');
if (!connectome.includes("source: 'connectome population mappings'") || !connectome.includes('not anatomy or a full recording')) throw new Error('neural field provenance/limitation is missing');
if (!brainWorker.includes('buildDisplayAtlas(data)') || !brainWorker.includes('[displayAtlas.groupByNeuron.buffer]')) throw new Error('brain worker does not transfer the compact display atlas');
if (!brainWorker.includes('sampleSpikes:result.sampleSpikes') || !renderer.includes('ingestNeuralFrame')) throw new Error('sampleSpikes are not rendered as a neural field');
if (!html.includes('not a biological image') || !html.includes('full-CNS recording')) throw new Error('neural visualization limitations are not visible');

// Browser-local compute must be real, selectable and state-preserving.
if (!WebAssembly.validate(wasmBytes)) throw new Error('bundled neural WebAssembly binary is invalid');
for (const token of ['class JavaScriptLifKernel', 'class WasmLifKernel', 'exactLinearCoefficients', 'instantiateStreaming']) if (!kernels.includes(token)) throw new Error(`neural kernel implementation missing ${token}`);
for (const profile of ['economy', 'balanced', 'fine', 'research']) if (!computeProfile.includes(`${profile}:Object.freeze`)) throw new Error(`temporal profile missing ${profile}`);
if (!brainWorker.includes("msg.type==='compute'") || !brainWorker.includes('engine.serialize()') || !brainWorker.includes('createLifKernel')) throw new Error('brain worker cannot switch compute kernels while preserving state');
if (!app.includes('changeCompute(') || !app.includes('computeBackendRequested') || !app.includes('neuralResolutionRequested')) throw new Error('compute controls are not wired to application state');
if (!app.includes('femurTibiaFlex') || !app.includes('joint-output-grid') || !app.includes('femurTibiaAngle')) throw new Error('identified joint state is not exposed on the observer output surface');
for (const token of ['calibratedFlexorForceMicroNewtons', 'calibratedFlexorTorqueNewtonMeters', 'unresolvedMotorSpikes', 'absoluteForceEvidence']) if (!app.includes(token)) throw new Error(`absolute-force observer is missing ${token}`);
if (!app.includes('changeStructure(') || !app.includes('graphTierRequested') || !app.includes('connectomeSelect')) throw new Error('bundled connectome/tier controls are not wired to application state');
if (!headers.includes("'wasm-unsafe-eval'") || !headers.includes('Cross-Origin-Embedder-Policy: require-corp') || !headers.includes('Cross-Origin-Opener-Policy: same-origin')) throw new Error('Cloudflare headers do not permit WASM and cross-origin isolation');
if (!headers.includes("connect-src 'self';") || /connect-src[^;]*https?:\/\//.test(headers)) throw new Error('Cloudflare CSP must enforce same-origin runtime connections');
for (const token of ["EDGE_VERSION = \"v3\"", 'BAD_OBJECT_TOKENS', 'IS_REAL_NEURON', 'proofread', 'roughly_proofread', '(contacts>=5)', '(contacts>=3)', '(contacts>=1)', 'edges[\"norm\"]', 'mtime=0']) if (!bancBuilder.includes(token)) throw new Error(`audited BANC builder missing ${token}`);
if (!connectome.includes('zeroInstantaneousFastGain') || !connectome.includes('classifyLegSensorySubtype') || !connectome.includes('legMotor${legId}') || !connectome.includes('legSensory${legId}')) throw new Error('whole-CNS parser lacks conservative fast channels or six-leg mappings');
if (!connectome.includes("mode:'same-origin'") || !connectome.includes('No bundled same-origin source') || /RAW_BASE|spec\?\.remote|spec\?\.remotes|mode:'cors'/.test(connectome)) throw new Error('runtime graph loader must use bundled same-origin assets only');

// Strict causal boundary: UI/camera/history data may never enter the sensory packet.
for (const key of ['x', 'y', 'position', 'heading', 'room', 'objects', 'target', 'desiredHeading', 'nearest', 'distance', 'bearing', 'camera', 'ethogram', 'history']) {
  if (WORLD_TO_BRAIN_FIELDS.includes(key)) throw new Error(`privileged/display field exposed to brain: ${key}`);
}
for (const key of ['foodPosition', 'desiredHeading', 'objects', 'camera', 'ethogram', 'history']) {
  let rejected = false;
  try { assertSensoryPacket({retinaBrightness: [], [key]: key === 'objects' ? [] : [1, 2]}); } catch { rejected = true; }
  if (!rejected) throw new Error(`protocol failed to reject ${key}`);
}
if (!protocol.includes("'memoryCue'") || !protocol.includes('body-relative memory cue')) throw new Error('allowed memory cue boundary is no longer explicit');
if (protocol.includes("'camera'") || protocol.includes("'ethogram'") || protocol.includes("'history'")) throw new Error('display state leaked into protocol source');

// Readable, responsive, non-decorative motion and non-color equivalents.
const pxSizes = [...css.matchAll(/font-size\s*:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
if (!pxSizes.length || Math.min(...pxSizes) < 11) throw new Error(`CSS contains text below 11 px (${Math.min(...pxSizes)} px)`);
if (!/body\s*\{[^}]*font-size:\s*14px/s.test(css)) throw new Error('default body type must remain 14 px');
for (const token of ['--bg:', '--cyan:', '--violet:', '--food:', '--water:', '--risk:', '--line:']) if (!css.includes(token)) throw new Error(`design token missing ${token}`);
if (!css.includes('@media (prefers-reduced-motion: reduce)')) throw new Error('reduced-motion support is missing');
if (!css.includes('@media (pointer: coarse)') || !css.includes('min-height: 44px')) throw new Error('coarse-pointer targets are not enlarged');
if (!css.includes('@media (forced-colors: active)')) throw new Error('forced-colors support is missing');
if (!html.includes('aria-describedby="worldCanvasDescription"') || !html.includes('aria-describedby="umweltCanvasDescription"')) throw new Error('canvas visualizations lack text descriptions');
if (!html.includes('Every color-coded') && !app.includes('neuralGroupList')) {
  throw new Error('color-coded neural groups need textual equivalents');
}

// Static build and project identity.
const packageJson = JSON.parse(packageText);
if (packageJson.name !== 'fly-umwelt' || packageJson.version !== '3.8.0') throw new Error('package identity is not Fly Umwelt 3.8.0');
const appVersion=constants.match(/export const APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]/i)?.[1];
if (appVersion!==packageJson.version) throw new Error(`APP_VERSION ${appVersion||'(missing)'} does not match package version ${packageJson.version}`);
for (const script of ['build', 'wasm:build', 'docs:check', 'check', 'check:banc', 'calibration:leg', 'experiments:leg', 'bridge:leg', 'body:articulated', 'body:musculoskeletal', 'body:musculoskeletal:zero-safe', 'bridge:flymimic-banc', 'body:reconcile', 'audit:locomotion', 'competence:locomotion', 'test', 'smoke', 'smoke:full', 'smoke:articulated', 'smoke:musculoskeletal', 'validate', 'preview:visual', 'benchmark', 'stress', 'behavior', 'banc:dynamics', 'data:morphology', 'data:musculoskeletal']) if (!packageJson.scripts?.[script]) throw new Error(`package script missing ${script}`);
if (!packageJson.scripts.validate.includes('npm run docs:check')) throw new Error('aggregate validation does not include the documentation gate');
if (!packageJson.scripts.validate.includes('npm run bridge:leg')) throw new Error('aggregate validation does not include the spike-force bridge gate');
if (!packageJson.scripts.validate.includes('npm run body:articulated')||!packageJson.scripts.validate.includes('npm run smoke:articulated')) throw new Error('aggregate validation does not qualify the articulated body in Node and a browser Worker');
if (!packageJson.scripts.validate.includes('npm run body:musculoskeletal')||!packageJson.scripts.validate.includes('npm run smoke:musculoskeletal')) throw new Error('aggregate validation does not qualify the musculoskeletal body in Node and a browser Worker');
for(const gate of ['body:musculoskeletal:zero-safe','bridge:flymimic-banc','body:reconcile'])if(!packageJson.scripts.validate.includes(`npm run ${gate}`))throw new Error(`aggregate validation does not include ${gate}`);
if (!packageJson.scripts.validate.includes('npm run audit:locomotion')||packageJson.scripts.validate.includes('npm run competence:locomotion')) throw new Error('aggregate validation must include the honesty audit without converting the expected scientific failure into a green competence claim');
JSON.parse(bridgeArtifact);
const articulatedBridge=JSON.parse(await source('public/data/calibration/articulated-body-bridge-v1.json'));
const morphologyProvenance=JSON.parse(await source('public/data/morphology/neuromechfly-v2.1.0/provenance.json'));
const morphologyMeta=JSON.parse(await source('public/data/morphology/neuromechfly-v2.1.0/model_meta.json'));
const articulatedWrapper=await source('src/core/mujoco-articulated-body.js');
const worldWorker=await source('src/workers/world.worker.js');
const smokeScript=await source('scripts/smoke.mjs');
if(articulatedBridge.modelVersion!==packageJson.version||articulatedBridge.packet?.channels!==72)throw new Error('articulated action bridge version/packet contract is incoherent');
if(JSON.stringify(articulatedBridge.mapped.map(item=>item.actionId).sort())!==JSON.stringify(['femurTibiaExtend','femurTibiaFlex'].sort()))throw new Error('unsupported action promoted to articulated mapped status');
if(articulatedBridge.structurallyInferred.some(item=>item.controlStatus!=='disabled'))throw new Error('structurally inferred articulated action is not disabled');
if(JSON.stringify(articulatedBridge.unresolved.map(item=>item.actionId).sort())!==JSON.stringify(['longTendonPull','unknownLegMovement'].sort()))throw new Error('articulated bridge no longer preserves unresolved motor channels');
if(morphologyProvenance.modelVersion!==packageJson.version||morphologyProvenance.upstream?.commit!=='0884af08981994543634563d95e9b1eb49945082'||morphologyProvenance.runtime?.version!=='3.9.0')throw new Error('articulated morphology/runtime provenance is not pinned');
if(morphologyMeta.nq!==133||morphologyMeta.nu!==42||morphologyMeta.nbody!==70||morphologyMeta.actuators?.length!==42)throw new Error('articulated model metadata contract drifted');
if(morphologyProvenance.files.some(file=>/cpg|tripod|preprogrammed|game(?:play|controller)/i.test(file.path)))throw new Error('controller/game asset entered morphology bundle');
for(const token of ["fetch(url,{mode:'same-origin'",'class MujocoArticulatedBody','contactState()','proprioceptionState()','mj_resetDataKeyframe','mj_step'])if(!articulatedWrapper.includes(token))throw new Error(`articulated browser wrapper missing ${token}`);
if(/sanitizeMotorPacket|phaseClock|randomTurn|targetHeading/i.test(articulatedWrapper))throw new Error('articulated mechanics wrapper contains an unauthorized behavioral/motor controller');
if(!worldWorker.includes("msg.type==='articulated-body-qualification'")||!worldWorker.includes('qualification-only; not selected as the live locomotor plant'))throw new Error('world Worker lacks explicit staged articulated-body initialization');
if(!smokeScript.includes("process.argv.includes('--articulated')")||!smokeScript.includes("type:'articulated-body-qualification'"))throw new Error('browser smoke does not compile the articulated body inside a Worker');
const musculoskeletalProvenance=JSON.parse(await source('public/data/morphology/flymimic-frontleg-20260623a/provenance.json'));
const musculoskeletalWrapper=await source('src/core/mujoco-musculoskeletal-body.js');
const musculoskeletalReport=JSON.parse(await source(`docs/benchmarks/musculoskeletal-body-qualification-${packageJson.version}.json`));
const zeroSafeReport=JSON.parse(await source(`docs/benchmarks/musculoskeletal-zero-safe-qualification-${packageJson.version}.json`));
const flymimicBancBridge=JSON.parse(await source('public/data/calibration/flymimic-banc-front-tibia-bridge-v1.json'));
const flymimicBancReport=JSON.parse(await source(`docs/benchmarks/flymimic-banc-front-tibia-bridge-${packageJson.version}.json`));
const bodyReconciliation=JSON.parse(await source(`docs/benchmarks/body-reconciliation-${packageJson.version}.json`));
if(musculoskeletalProvenance.modelVersion!==packageJson.version||musculoskeletalProvenance.upstream?.flyGymSourceCommit!=='ca65a510c2afe6ac61c51df4f274c8d190c2f95f'||musculoskeletalProvenance.upstream?.flyMimicCommit!=='9ea1131626cd76f7203b74076ef8f0e9cab30bef'||musculoskeletalProvenance.runtime?.version!=='3.9.0')throw new Error('musculoskeletal model/runtime provenance is not pinned');
if(musculoskeletalProvenance.files?.length!==74||musculoskeletalProvenance.sourceContract?.minimumExcitation!==.0001||musculoskeletalProvenance.sourceContract?.scope!=='restrained/tethered left-front leg only')throw new Error('musculoskeletal source contract drifted');
if(musculoskeletalProvenance.files.some(file=>/policy|mocap|motion.?capture|reward|controller|trajectory/i.test(file.path)))throw new Error('controller/imitation asset entered musculoskeletal bundle');
for(const token of ["fetch(url,{mode:'same-origin'",'class MujocoMusculoskeletalBody','setMuscleExcitations','momentArms(','mj_resetDataKeyframe','mj_step'])if(!musculoskeletalWrapper.includes(token))throw new Error(`musculoskeletal browser wrapper missing ${token}`);
if(/sanitizeMotorPacket|motorFrame|phaseClock|targetTrajectory|targetBearing|randomController|rewardFunction|motionCapture|ppoPolicy/i.test(musculoskeletalWrapper))throw new Error('musculoskeletal wrapper contains an unauthorized neural/behavioral controller');
if(musculoskeletalReport.modelVersion!==packageJson.version||musculoskeletalReport.compiled?.muscleActuators!==15||musculoskeletalReport.compiled?.spatialTendons!==15||musculoskeletalReport.passed?.zeroNeuralEvidenceRule!==false||musculoskeletalReport.passed?.automaticBancIntegration!==false)throw new Error('musculoskeletal qualification report is incoherent or hides its negative neural-bridge result');
if(zeroSafeReport.provenance?.sourceXmlSha256!=='04f6070d6733940357be005ca72c02ba0d9455538ff018da70c74de7458e9531'||zeroSafeReport.provenance?.derivedXmlSha256!=='47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e'||zeroSafeReport.provenance?.exactReplacements!==15||zeroSafeReport.passed?.exactZeroFromZeroState!==true||zeroSafeReport.passed?.postActivityFiniteTimeExactZero!==false||zeroSafeReport.passed?.automaticBancIntegration!==false)throw new Error('zero-safe qualification hides a source edit, numerical boundary or neural bridge');
if(flymimicBancBridge.mappings?.length!==2||flymimicBancBridge.mappings.some(item=>item.mappingStatus!=='identity-only'||item.excitationGain!==null||item.timingTransfer!==null||item.automaticControlEnabled!==false)||flymimicBancBridge.gainBoundary?.azevedoProbeForceTransferAllowed!==false)throw new Error('FlyMimic/BANC bridge exceeds its identity-only evidence');
if(flymimicBancReport.passed?.identityMapping!==true||flymimicBancReport.passed?.gainValidation!==false||flymimicBancReport.passed?.automaticControl!==false)throw new Error('FlyMimic/BANC qualification is incoherent');
if(bodyReconciliation.decision?.mechanicallyMergeable!==false||bodyReconciliation.decision?.livePlantReplacementAllowed!==false||bodyReconciliation.contact?.externalLoadTransferReady!==false||bodyReconciliation.compiledComparison?.sameRootTopology!==false)throw new Error('body reconciliation silently promotes an incompatible merge');
if(!musculoskeletalWrapper.includes('deriveZeroSafeMusculoskeletalXml')||!musculoskeletalWrapper.includes("'zero-safe'")||!musculoskeletalWrapper.includes('MUSCULOSKELETAL_ZERO_SAFE_DERIVATIVE'))throw new Error('musculoskeletal wrapper lacks deterministic zero-safe profile identity');
if(!worldWorker.includes("msg.type==='musculoskeletal-body-qualification'")||!worldWorker.includes('qualification-only zero-safe restrained left-front-leg mechanics')||!worldWorker.includes("profile:'zero-safe'"))throw new Error('world Worker lacks explicit zero-safe staged musculoskeletal initialization');
if(!smokeScript.includes("process.argv.includes('--musculoskeletal')")||!smokeScript.includes("type:'musculoskeletal-body-qualification'"))throw new Error('browser smoke does not compile the musculoskeletal body inside a Worker');
const locomotorArtifact=JSON.parse(locomotorCalibration);
if(locomotorArtifact.modelVersion!==packageJson.version||locomotorArtifact.engineeringBridge?.motorDecoder?.zeroRule===undefined)throw new Error('locomotor calibration artifact is incoherent');
for(const token of ['heldOutSeeds=[2,3,5,8]', 'locomotorRecruitmentKeys', 'broadDescendingProxy', 'coordinationOnlyImmobile', 'tonicReadinessDoesNotStartGait', 'tonicMotorAsymmetryDoesNotSteer', 'steeringWithoutTractionCannotRotate', 'contactDoesNotSelectBehavior', 'bareFloorIsProbe', 'falseIngestionFrames', 'legacyEngineeringObservations', "resolveGraphTier(manifest,'balanced')"])if(!locomotorValidator.includes(token))throw new Error(`locomotor validator missing ${token}`);
if(!motorDecoder.includes('motorSubthresholdSaturationScale')||!motorDecoder.includes('1-(1-spikeEvidence)*(1-analogEvidence)'))throw new Error('motor decoder lacks the disclosed excitability bridge');
if(!plant.includes('representativeAdvancePerCycleMm')||!plant.includes('feedAttempt')||!plant.includes('ingestionContact'))throw new Error('plant lacks calibrated frequency transfer or contact-confirmed ingestion semantics');
for (const [name,text] of Object.entries({brainEngine,motorDecoder,protocol,plant})) if (!text.includes('motorUnitSpikeCounts')) throw new Error(`${name} drops the discrete identified motor-unit spike-count path`);
if (!protocol.includes('motorFrameId') || !protocol.includes('motorFrameDurationMs')) throw new Error('protocol lacks one-shot motor frame identity/duration');
if (!plant.includes('lastMotorSpikeFrameId') || !plant.includes('motorFrameId!==leg.lastMotorSpikeFrameId')) throw new Error('plant does not guard against repeated delivery of a held motor frame');
if (!buildScript.includes("for(const dir of ['src','docs'])") || !buildScript.includes("'BUILD_REPORT.md'") || !buildScript.includes("'THIRD_PARTY_NOTICES.md'") || !buildScript.includes("await cp(resolve(root,'public'),dist")) throw new Error('static build no longer copies current/root docs, source/docs and public into dist');
if (/express|fastify|next|nuxt|database|telemetry/i.test(JSON.stringify(packageJson.dependencies || {}))) throw new Error('server/database dependency added to static application');

for(const file of files){
  if(!file.startsWith(resolve(root,'public'))||!(await stat(file)).isFile())continue;
  if((await stat(file)).size>25*1024*1024)throw new Error(`${relative(root,file)} exceeds the Cloudflare Pages 25 MiB static asset cap`);
}

console.log(`validated ${files.length} files and ${js.length} JavaScript modules; bundled tiered BANC whole CNS, direct six-leg effector path, real JS/WASM kernels, Cloudflare isolation, accessibility and causal boundary intact`);
