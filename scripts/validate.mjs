import {readdir, stat, readFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {WORLD_TO_BRAIN_FIELDS, assertSensoryPacket} from '../src/core/protocol.js';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'index.html', 'src/main.js', 'src/app.js', 'src/styles.css',
  'src/ui/renderer.js', 'src/ui/ethogram.js',
  'src/editor/room-editor.js', 'src/editor/history.js',
  'src/core/protocol.js', 'src/core/connectome-data.js', 'src/core/brain-engine.js',
  'src/core/vnc-controller.js', 'src/core/memory-model.js',
  'src/workers/brain.worker.js', 'src/workers/world.worker.js',
  'public/data/manifest.json', 'public/data/fixture-manifest.json', 'public/data/fixture.bin.gz',
  'public/rooms/default.json', 'docs/SCIENTIFIC_MODEL.md', 'docs/CLAIMS_AND_ETHICS.md',
  'scripts/build.mjs', 'scripts/smoke.mjs', 'scripts/visual_preview.mjs',
];

async function walk(dir) {
  const output = [];
  for (const name of await readdir(dir)) {
    const path = resolve(dir, name);
    const metadata = await stat(path);
    if (metadata.isDirectory() && !['dist', 'node_modules', '.git'].includes(name)) output.push(...await walk(path));
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

const [html, css, app, renderer, ethogram, editor, connectome, brainWorker, protocol, buildScript, packageText] = await Promise.all([
  source('index.html'), source('src/styles.css'), source('src/app.js'), source('src/ui/renderer.js'),
  source('src/ui/ethogram.js'), source('src/editor/room-editor.js'), source('src/core/connectome-data.js'),
  source('src/workers/brain.worker.js'), source('src/core/protocol.js'), source('scripts/build.mjs'), source('package.json'),
]);

// Preserve all original operations while adding the redesigned observation surfaces.
const requiredIds = [
  'playButton', 'stepButton', 'speedSelect', 'modeSelect', 'worldCanvas', 'umweltCanvas',
  'editButton', 'inspectorButton', 'saveRoomButton', 'loadRoomButton', 'exportRoomButton', 'importRoomInput',
  'newFlyButton', 'saveFlyButton', 'restoreFlyButton', 'loadFullGraphButton',
  'cameraFollowButton', 'cameraOverviewButton', 'cameraZoomOutButton', 'cameraZoomInButton', 'cameraResetButton',
  'behaviorLabel', 'behaviorReason', 'behaviorDuration', 'stripActivityCanvas', 'energyValue', 'hydrationValue',
  'umweltDetailCanvas', 'neuralFieldCanvas', 'ethogramCanvas', 'memoryCanvas', 'activityChart',
  'historyWindowSelect', 'clearHistoryButton', 'retinaChart', 'eventList', 'outputBars', 'objectInspector',
];
for (const id of requiredIds) if (!html.includes(`id="${id}"`)) throw new Error(`index missing #${id}`);
for (const mode of ['natural', 'connectome', 'evoked']) if (!html.includes(`value="${mode}"`)) throw new Error(`index missing ${mode} mode`);
if (html.includes('id="datasetSelect"')) throw new Error('dataset selector must not clutter the normal interface');
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
if (!html.includes('not a biological image') || !html.includes('full-brain recording')) throw new Error('neural visualization limitations are not visible');

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
if (packageJson.name !== 'fly-umwelt' || packageJson.version !== '3.0.0') throw new Error('package identity is not Fly Umwelt 3.0.0');
for (const script of ['build', 'check', 'test', 'smoke', 'validate', 'preview:visual']) if (!packageJson.scripts?.[script]) throw new Error(`package script missing ${script}`);
if (!buildScript.includes("for(const dir of ['src','docs'])") || !buildScript.includes("await cp(resolve(root,'public'),dist")) throw new Error('static build no longer copies source/docs/public into dist');
if (/express|fastify|next|nuxt|database|telemetry/i.test(JSON.stringify(packageJson.dependencies || {}))) throw new Error('server/database dependency added to static application');

console.log(`validated ${files.length} files and ${js.length} JavaScript modules; six observation views, camera/editor transforms, bounded history, sampled neural atlas, accessibility and causal boundary intact`);
