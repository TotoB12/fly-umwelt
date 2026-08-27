import {LabRenderer} from './ui/renderer.js';
import {EthogramView, ETHOGRAM_STATES} from './ui/ethogram.js';
import {RoomEditor} from './editor/room-editor.js';
import {cloneRoom, exportRoom, normalizeRoom} from './core/room.js';
import {APP_VERSION, LEG_IDS, LEG_LABELS, LEG_MOTOR_ACTION_SPECS, modelConfigFor, normalizeModelMode} from './core/constants.js';
import {computeSelection, detectBrowserCapabilities, normalizeNeuralResolution, resolveGraphTierPreference} from './core/compute-profile.js';
import {normalizeComputeBackend} from './core/neural-kernels.js';
import {toast} from './ui/toast.js';

const $ = (id) => document.getElementById(id);
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const fmt = (value) => Number(value || 0).toLocaleString();
const pct = (value) => `${Math.round(clamp(value) * 100)}%`;
const maximum = (values = []) => {
  let max = 0;
  for (const value of values || []) max = Math.max(max, Number(value) || 0);
  return max;
};
const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY']);
const MODE_COPY = Object.freeze({
  natural: {label: 'Natural', summary: 'Whole CNS + disclosed ongoing state, physiology and six-leg body; movement still requires identified leg output'},
  connectome: {label: 'Causal', summary: 'Sensory inputs → CNS → identified motor pools → six-leg body; no post-connectome steering'},
  evoked: {label: 'Evoked', summary: 'Published-style zero baseline; stimulation experiment'},
});
const MODE_SET = new Set(Object.keys(MODE_COPY));
const NEURAL_COLORS = ['#71809f', '#76d9ef', '#50d7c8', '#88b8ff', '#f0b977', '#c69cff', '#9b8cff', '#ff9f78', '#e3bf72'];
const FEMUR_TIBIA_FLEX=LEG_MOTOR_ACTION_SPECS.findIndex(action=>action.id==='femurTibiaFlex');
const FEMUR_TIBIA_EXTEND=LEG_MOTOR_ACTION_SPECS.findIndex(action=>action.id==='femurTibiaExtend');

function formatClock(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}
function formatDuration(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < .15) return 'just changed';
  if (value < 10) return `${value.toFixed(1)} s`;
  return `${Math.round(value)} s`;
}
function seed32() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] || 1;
}
function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function slug(value) { return String(value || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}
function selectedMode() {
  const value = new URLSearchParams(location.search).get('mode');
  return MODE_SET.has(value) ? value : 'natural';
}
function selectedComputeBackend() { return normalizeComputeBackend(new URLSearchParams(location.search).get('engine') || 'auto'); }
function selectedNeuralResolution() { return normalizeNeuralResolution(new URLSearchParams(location.search).get('resolution') || 'auto'); }
function selectedDataset() { return new URLSearchParams(location.search).get('dataset') === 'fafb' ? 'fafb' : 'banc'; }
function selectedGraphTier() {
  const value=new URLSearchParams(location.search).get('tier')||'auto';
  return ['auto','core','balanced','maximal'].includes(value)?value:'auto';
}
function referenceManifestPath(dataset=selectedDataset()) { return dataset === 'fafb' ? './data/manifest.json' : './data/banc/manifest.json'; }
function manifestPath(dataset=selectedDataset()) { return new URLSearchParams(location.search).get('fixture') === '1' ? './data/fixture-manifest.json' : referenceManifestPath(dataset); }
function graphSpecsFor(manifest,tier='auto'){
  const graph=manifest?.graph||{};
  if(graph.tiers&&graph.components){
    const resolved=tier==='auto'?(manifest.defaultGraphTier||'balanced'):tier;
    const config=graph.tiers[resolved]||graph.tiers[manifest.defaultGraphTier]||Object.values(graph.tiers)[0];
    const shards=[];for(const id of config?.components||[])shards.push(...(graph.components[id]?.shards||[]));
    return shards;
  }
  return Array.isArray(graph.shards)?graph.shards:[graph];
}
function stateMeta(state) {
  return ETHOGRAM_STATES[state] || {label: String(state || 'pause'), color: '#71809f'};
}
async function localPackAvailable(manifest, tier='auto') {
  if (manifest?.testOnly) return true;
  const graphSpecs=graphSpecsFor(manifest,tier);
  const specs = [...graphSpecs, manifest?.neurons, manifest?.classification];
  try {
    const checks = await Promise.all(specs.map(async (spec) => {
      if (!spec?.local) return false;
      const response = await fetch(new URL(spec.local, document.baseURI), {method: 'HEAD', cache: 'no-store'});
      return response.ok && Number(response.headers.get('content-length') || 1) > 0;
    }));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}
function download(name, text, type = 'application/json') {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], {type}));
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function fetchJson(url) {
  const response = await fetch(url, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  if (text.trimStart().startsWith('<')) throw new Error(`${url}: received HTML instead of JSON`);
  try { return JSON.parse(text); } catch (error) { throw new Error(`${url}: invalid JSON (${error.message})`); }
}

class OrganismStore {
  async db() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('fly-umwelt-v3', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('individuals')) request.result.createObjectStore('individuals');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async put(key, value) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('individuals', 'readwrite');
      tx.objectStore('individuals').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async get(key) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('individuals', 'readonly');
      const request = tx.objectStore('individuals').get(key);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
}

export class LabApp {
  constructor() {
    this.mode = selectedMode();
    this.dataset = selectedDataset();
    this.graphTierRequested = selectedGraphTier();
    this.computeBackendRequested = selectedComputeBackend();
    this.neuralResolutionRequested = selectedNeuralResolution();
    this.capabilities = detectBrowserCapabilities();
    this.computeProfile = computeSelection({backend:this.computeBackendRequested,resolution:this.neuralResolutionRequested,capabilities:this.capabilities});
    this.config = modelConfigFor(this.mode,{
      brainDtMs:this.computeProfile.resolution.dtMs,
      computeBackendRequested:this.computeBackendRequested,
      neuralResolutionRequested:this.neuralResolutionRequested,
      neuralResolutionResolved:this.computeProfile.resolution.resolved,
    });
    this.seed = seed32();
    this.individualId = `fly-${this.seed.toString(16).padStart(8, '0')}`;
    this.manifest = null;
    this.room = null;
    this.defaultRoom = null;
    this.worldSnapshot = null;
    this.brainSnapshot = null;
    this.brainInfo = null;
    this.sampleSpikes = [];
    this.worldWorker = null;
    this.brainWorker = null;
    this.brainReady = false;
    this.linkReady = false;
    this.failed = false;
    this.pending = new Map();
    this.pendingOperation = null;
    this.roomRevision = 0;
    this.roomTimer = 0;
    this.editing = false;
    this.selected = null;
    this.view = 'world';
    this.activeTab = 'now';
    this.inspectorOpen = false;
    this.inspectorBeforeEdit = false;
    this.cameraBeforeEdit = null;
    this.lastDomUpdate = 0;
    this.store = new OrganismStore();
    this.fallbackAttempted = false;
    this.fullGraphError = '';

    this.renderer = new LabRenderer({
      worldCanvas: $('worldCanvas'),
      umweltCanvas: $('umweltCanvas'),
      retinaChart: $('retinaChart'),
      activityChart: $('activityChart'),
      memoryCanvas: $('memoryCanvas'),
      stripActivityCanvas: $('stripActivityCanvas'),
      umweltDetailCanvas: $('umweltDetailCanvas'),
      neuralFieldCanvas: $('neuralFieldCanvas'),
      overlayElements: [document.querySelector('.living-strip'), $('inspector'), $('editorBar'), $('objectInspector')],
    });
    this.editor = new RoomEditor({
      canvas: $('worldCanvas'),
      renderer: this.renderer,
      onChange: (room) => this.roomChanged(room),
      onSelection: (object) => this.selectedObject(object),
    });
    this.editor.updateHistoryButtons = () => this.updateHistoryButtons();
    this.renderer.setNavigationStartCallback(() => this.editor.cancelGesture());
    this.renderer.setCameraChangeCallback((state) => this.updateCameraUI(state));

    this.ethogram = new EthogramView({
      canvas: $('ethogramCanvas'),
      legend: $('historyLegend'),
      detail: $('historyDetail'),
      recentList: $('historyRecentList'),
      windowSeconds: Number($('historyWindowSelect')?.value) || 60,
    });
  }

  async init() {
    document.documentElement.dataset.appVersion = APP_VERSION;
    this.bindUI();
    this.applyModeUI();
    this.setView('world');
    this.switchTab('now');
    this.setInspector(false);
    $('individualName').textContent = this.individualId;
    try {
      const requestedFixture = new URLSearchParams(location.search).get('fixture') === '1';
      const [requestedManifest, room] = await Promise.all([fetchJson(manifestPath(this.dataset)), fetchJson('./rooms/default.json')]);
      let manifest = requestedManifest;
      if (!requestedFixture && !(await localPackAvailable(requestedManifest,this.effectiveGraphTier(requestedManifest)))) {
        manifest = await fetchJson('./data/fixture-manifest.json');
        this.fallbackAttempted = true;
        this.fullGraphError = `${this.dataset==='banc'?'The bundled BANC whole-CNS pack':'The bundled FAFB comparison pack'} failed its local asset check.`;
        const query = new URLSearchParams(location.search);
        query.set('fixture', '1');
        history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
      }
      this.manifest = {...manifest, assetBase: new URL('./', document.baseURI).href};
      this.refreshComputeConfig();
      this.room = normalizeRoom(room);
      this.defaultRoom = cloneRoom(this.room);
      this.renderer.setRoom(this.room);
      this.editor.setRoom(this.room);
      this.startWorkers();
    } catch (error) {
      this.fail(error);
    }
  }

  bindUI() {
    $('playButton').addEventListener('click', () => this.worldWorker?.postMessage({type: 'toggle'}));
    $('stepButton').addEventListener('click', () => this.worldWorker?.postMessage({type: 'step'}));
    $('speedSelect').addEventListener('change', (event) => this.worldWorker?.postMessage({type: 'speed', speed: event.target.value}));
    $('modeSelect').addEventListener('change', (event) => this.changeMode(event.target.value));
    $('connectomeSelect')?.addEventListener('change', (event) => this.changeStructure({dataset:event.target.value}));
    $('graphTierSelect')?.addEventListener('change', (event) => this.changeStructure({tier:event.target.value}));
    $('computeBackendSelect').addEventListener('change', (event) => this.changeCompute({backend:event.target.value}));
    $('neuralResolutionSelect').addEventListener('change', (event) => this.changeCompute({resolution:event.target.value}));
    $('retryFullButton').addEventListener('click', () => this.retryDataset(false));
    $('useDemoButton').addEventListener('click', () => this.retryDataset(true));

    $('worldViewButton').addEventListener('click', () => this.setView('world'));
    $('umweltViewButton').addEventListener('click', () => this.setView('umwelt'));
    $('editButton').addEventListener('click', () => this.setEditing(!this.editing));
    $('inspectorButton').addEventListener('click', () => this.setInspector(!this.inspectorOpen));
    $('closeInspectorButton').addEventListener('click', () => this.setInspector(false));

    $('cameraFollowButton').addEventListener('click', () => this.renderer.setCameraMode('follow'));
    $('cameraOverviewButton').addEventListener('click', () => this.renderer.setCameraMode('overview'));
    $('cameraZoomOutButton').addEventListener('click', () => this.renderer.zoomCamera(1 / 1.2));
    $('cameraZoomInButton').addEventListener('click', () => this.renderer.zoomCamera(1.2));
    $('cameraResetButton').addEventListener('click', () => this.renderer.resetCamera(this.editing ? 'overview' : undefined));

    const tabs = [...document.querySelectorAll('.inspector-tab')];
    for (const button of tabs) button.addEventListener('click', () => this.switchTab(button.dataset.tab));
    $('inspectorTabs').addEventListener('keydown', (event) => {
      const current = Math.max(0, tabs.findIndex((tab) => tab.dataset.tab === this.activeTab));
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      this.switchTab(tabs[next].dataset.tab, {focus: true});
    });

    $('historyWindowSelect').addEventListener('change', (event) => this.ethogram.setWindow(event.target.value));
    $('clearHistoryButton').addEventListener('click', () => {
      this.ethogram.clear();
      this.updateBehaviorReadout();
      toast('Display history cleared. The fly state was not changed.');
    });

    for (const button of document.querySelectorAll('.editor-tool')) button.addEventListener('click', () => this.setEditorTool(button.dataset.tool));
    $('undoButton').addEventListener('click', () => this.editor.undo());
    $('redoButton').addEventListener('click', () => this.editor.redo());
    $('deleteObjectButton').addEventListener('click', () => this.editor.deleteSelected());
    $('closeObjectInspector').addEventListener('click', () => this.editor.select(null));

    $('newFlyButton').addEventListener('click', () => this.newFly());
    $('saveFlyButton').addEventListener('click', () => this.saveFly());
    $('restoreFlyButton').addEventListener('click', () => this.restoreFly());
    $('saveRoomButton').addEventListener('click', () => this.saveRoom());
    $('loadRoomButton').addEventListener('click', () => this.loadRoom());
    $('exportRoomButton').addEventListener('click', () => download(`${slug(this.room?.name)}.json`, exportRoom(this.room)));
    $('importRoomInput').addEventListener('change', (event) => this.importRoom(event));

    $('infoButton').addEventListener('click', () => $('infoDialog').showModal());
    $('openDocsButton').addEventListener('click', () => this.openDocs());
    for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => $(button.dataset.closeDialog).close());
    $('touchFlyButton').addEventListener('click', () => this.worldWorker?.postMessage({type: 'touch', region: 0, intensity: 1}));
    $('airflowButton').addEventListener('click', () => this.worldWorker?.postMessage({type: 'airflow', intensity: 1}));
    $('lightCycleButton').addEventListener('click', () => this.cycleLight());
    $('clearEventsButton').addEventListener('click', () => this.worldWorker?.postMessage({type: 'clear-events'}));
    $('inspectNeuronButton').addEventListener('click', () => this.inspectNeuron());
    $('neuronRootInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') this.inspectNeuron(); });
    for (const button of document.querySelectorAll('[data-perturb]')) {
      button.addEventListener('click', () => this.brainWorker?.postMessage({type: 'perturb', population: button.dataset.perturb, rateHz: 100, durationMs: 500}));
    }

    window.addEventListener('keydown', (event) => {
      const active = document.activeElement;
      if (event.code === 'Space' && !INTERACTIVE_TAGS.has(active?.tagName) && !active?.isContentEditable) {
        event.preventDefault();
        this.worldWorker?.postMessage({type: 'toggle'});
      }
      if (event.key === 'Escape') {
        if (this.editing) this.setEditing(false);
        else if (this.inspectorOpen) this.setInspector(false);
      }
    });
    window.addEventListener('resize', () => {
      this.renderer.refreshLayout();
      this.ethogram.redraw();
    });
  }

  effectiveGraphTier(manifest=this.manifest) {
    return resolveGraphTierPreference(this.graphTierRequested,manifest||{},this.capabilities||{});
  }

  startWorkers() {
    this.stopWorkers();
    $('loadingActions').hidden = true;
    this.brainReady = false;
    this.linkReady = false;
    this.failed = false;
    const channel = new MessageChannel();
    this.brainWorker = new Worker(new URL('./workers/brain.worker.js', import.meta.url), {type: 'module'});
    this.worldWorker = new Worker(new URL('./workers/world.worker.js', import.meta.url), {type: 'module'});
    this.brainWorker.onmessage = (event) => this.onBrain(event.data);
    this.worldWorker.onmessage = (event) => this.onWorld(event.data);
    this.brainWorker.onerror = (event) => this.fail(new Error(`CNS worker: ${event.message}`));
    this.worldWorker.onerror = (event) => this.fail(new Error(`World worker: ${event.message}`));
    this.brainWorker.postMessage({type: 'init', manifest: this.manifest, graphTier:this.effectiveGraphTier(this.manifest), config: this.config, capabilities:this.capabilities, seed: this.seed, port: channel.port1}, [channel.port1]);
    this.worldWorker.postMessage({type: 'init', room: this.room, seed: this.seed ^ 0x9e3779b9, mode: this.mode, port: channel.port2}, [channel.port2]);
    this.setLoading('Loading the nervous system', 'Reading neuron identities and weighted connections…', .05);
    this.setControls(false);
  }

  stopWorkers() {
    this.brainWorker?.terminate();
    this.worldWorker?.terminate();
    this.brainWorker = null;
    this.worldWorker = null;
  }

  onBrain(message) {
    if (message.type === 'brain-progress') {
      const fractions = {manifest: .06, metadata: .14, graph: .25, neurons: .46, classification: .62, parse: .76, mapping: .9, 'initial-state': .96};
      this.setLoading('Loading the nervous system', message.message || message.phase || 'Preparing…', fractions[message.phase] || .2);
      return;
    }
    if (message.type === 'brain-ready') {
      this.brainReady = true;
      this.brainInfo = message;
      this.config = message.config;
      this.renderer.setNeuralAtlas(message.displayAtlas);
      this.updateBrainIdentity();
      this.updateComputeUI();
      this.updateNeuralFieldUI();
      this.maybeReady();
      return;
    }
    if (message.type === 'brain-snapshot') {
      this.brainSnapshot = message.snapshot;
      this.sampleSpikes = message.sampleSpikes || [];
      this.renderer.updateBrain(this.brainSnapshot, this.sampleSpikes);
      this.updateNeuralFieldUI();
      this.updateComputeUI();
      this.updateDOM(true);
      return;
    }
    if (message.type === 'compute-applied') {
      this.config=message.config||this.config;
      this.brainInfo={...(this.brainInfo||{}),compute:message.compute||this.brainInfo?.compute};
      this.updateComputeUI();
      this.operationAck('brain',message.token);
    }
    if (message.type === 'brain-reset' || message.type === 'brain-restored' || message.type === 'config-applied') {
      this.config=message.config||this.config;
      if(message.compute)this.brainInfo={...(this.brainInfo||{}),compute:message.compute};
      this.updateComputeUI();
      this.operationAck('brain', message.token);
    }
    if (message.type === 'brain-state' || message.type === 'neuron-inspection') this.resolveRequest(message.requestId, message.state ?? message.neuron);
    if (message.type === 'brain-error') this.fail(new Error(message.message));
    if (message.type === 'perturbation') toast(message.ok ? `Stimulated ${message.population}.` : `No mapped ${message.population} population exists.`, message.ok ? 'info' : 'error');
  }

  onWorld(message) {
    if (message.type === 'brain-link-ready') {
      this.linkReady = true;
      this.maybeReady();
      return;
    }
    if (message.type === 'world-snapshot') {
      const snapshot = message.snapshot;
      if (snapshot.runtime?.roomRevision < this.roomRevision) return;
      this.worldSnapshot = snapshot;
      if (snapshot.room && snapshot.runtime.roomRevision >= this.roomRevision) {
        this.room = normalizeRoom(snapshot.room);
        this.editor.setRoom(this.room, {external: !this.editing});
      }
      this.renderer.updateWorld(snapshot);
      this.ethogram.record(snapshot);
      this.updateDOM();
      return;
    }
    if (message.type === 'world-reset' || message.type === 'world-restored') {
      this.worldSnapshot = message.snapshot;
      if (message.snapshot?.room) {
        this.room = normalizeRoom(message.snapshot.room);
        this.editor.setRoom(this.room);
      }
      this.renderer.updateWorld(message.snapshot);
      this.ethogram.record(message.snapshot);
      this.updateDOM(true);
      this.operationAck('world', message.token);
      return;
    }
    if (message.type === 'world-mode-applied') this.operationAck('world', message.token);
    if (message.type === 'world-state') this.resolveRequest(message.requestId, message.state);
    if (message.type === 'world-error') {
      toast(message.message, 'error', 6500);
      this.updateDOM(true);
    }
  }

  maybeReady() {
    if (!this.brainReady || !this.linkReady) return;
    $('loadingOverlay').hidden = true;
    this.setControls(true);
    const running = Boolean(this.worldSnapshot?.runtime?.running);
    this.setStatus(running ? 'running' : 'ready', running ? 'Running' : `${MODE_COPY[this.mode].label} ready`);
    $('saveFlyButton').disabled = false;
    $('restoreFlyButton').disabled = false;
    $('touchFlyButton').disabled = false;
    $('airflowButton').disabled = false;
    document.body.classList.add('app-ready');
  }

  setLoading(title, message, fraction) {
    $('loadingOverlay').hidden = false;
    $('loadingActions').hidden = true;
    $('loadingTitle').textContent = title;
    $('loadingMessage').textContent = message;
    $('loadingProgress').style.width = `${clamp(fraction) * 100}%`;
    this.setStatus('loading', 'Loading CNS');
  }
  setStatus(kind, text) {
    $('statusDot').className = `status-dot ${kind}`;
    $('statusText').textContent = text;
  }
  setControls(enabled) {
    for (const id of ['playButton','stepButton','speedSelect','modeSelect','connectomeSelect','graphTierSelect','computeBackendSelect','neuralResolutionSelect']) if($(id))$(id).disabled=!enabled;
    if(enabled&&$('graphTierSelect'))$('graphTierSelect').disabled=Boolean(this.manifest?.testOnly||!this.manifest?.graph?.tiers);
  }

  fail(error) {
    const alreadyDemo = this.manifest?.testOnly || new URLSearchParams(location.search).get('fixture') === '1';
    if (!alreadyDemo && !this.fallbackAttempted) console.info('Bundled connectome unavailable; opening verified demo graph.', error?.message || error);
    else console.error(error);
    this.failed = true;
    this.stopWorkers();
    this.setControls(false);
    if (!alreadyDemo && !this.fallbackAttempted) {
      this.fallbackAttempted = true;
      this.fullGraphError = error.message;
      $('loadingOverlay').hidden = false;
      $('loadingTitle').textContent = 'Opening the bundled demo';
      $('loadingMessage').textContent = 'A bundled connectome asset failed validation. Opening the small internal verification organism so the interface remains inspectable.';
      $('loadingProgress').style.width = '100%';
      $('loadingActions').hidden = true;
      this.setStatus('loading', 'Opening demo graph');
      setTimeout(() => this.retryDataset(true), 450);
      return;
    }
    $('loadingOverlay').hidden = false;
    $('loadingTitle').textContent = 'The nervous system could not start';
    $('loadingMessage').textContent = error.message;
    $('loadingProgress').style.width = '100%';
    $('loadingActions').hidden = false;
    this.setStatus('error', 'CNS unavailable');
  }

  async retryDataset(useFixture = false) {
    try {
      this.failed = false;
      if (!useFixture) this.fallbackAttempted = false;
      this.setLoading(useFixture ? 'Opening verified demo' : 'Retrying bundled graph', useFixture ? 'Loading the bundled small validation graph…' : 'Revalidating the selected same-origin connectome assets…', .05);
      const path = useFixture ? './data/fixture-manifest.json' : referenceManifestPath(this.dataset);
      this.manifest = {...(await fetchJson(path)), assetBase: new URL('./', document.baseURI).href};
      if(!useFixture&&!(await localPackAvailable(this.manifest,this.effectiveGraphTier(this.manifest))))throw new Error('Bundled connectome assets are incomplete for the selected structural profile.');
      const query = new URLSearchParams(location.search);
      if (useFixture) query.set('fixture', '1'); else query.delete('fixture');
      history.replaceState(null, '', `${location.pathname}${query.toString() ? `?${query}` : ''}${location.hash}`);
      this.startWorkers();
    } catch (error) {
      this.fail(error);
    }
  }

  updateBrainIdentity() {
    const counts = this.brainInfo?.counts || {};
    const dataset = this.brainInfo?.dataset || {};
    $('neuronCount').textContent = fmt(counts.neurons);
    $('edgeCount').textContent = fmt(counts.edges);
    const tier=this.brainInfo?.graphTier||{};
    $('datasetBadge').textContent = dataset.testOnly ? 'verification organism' : `${dataset.shortLabel||dataset.label||'connectome'} · ${tier.label||'graph'}`;
    $('datasetBadge').title = dataset.testOnly
      ? 'Small bundled organism used only for deterministic verification.'
      : `${dataset.label||'Loaded connectome'} · ${tier.label||'loaded graph'} · ${fmt(counts.edges)} directed pairs`;
    $('brainScaleLabel').textContent = dataset.testOnly ? 'verification organism' : `${tier.label||'loaded'} structural tier`;
    if($('connectomeSelect'))$('connectomeSelect').value=this.dataset;
    if($('graphTierSelect')){
      $('graphTierSelect').value=this.graphTierRequested;
      $('graphTierSelect').disabled=Boolean(dataset.testOnly||!this.manifest?.graph?.tiers);
      $('graphTierSelect').title=this.graphTierRequested==='auto'&&tier.label?`Auto selected ${tier.label} for this device.`:'Changing graph tier creates a new individual.';
    }
    const provenance = this.brainInfo?.displayAtlas?.provenance;
    $('neuralAtlasLabel').textContent = provenance?.note || 'Group placement is diagrammatic and display-only.';
    if(dataset.testOnly&&this.fullGraphError)toast('The selected bundled graph failed validation, so the internal verification organism is running instead.','info',5200);
  }

  updateDOM(force = false) {
    const now = performance.now();
    if (!force && now - this.lastDomUpdate < 80) return;
    this.lastDomUpdate = now;
    const snapshot = this.worldSnapshot;
    if (!snapshot) return;
    const runtime = snapshot.runtime || {};
    const fly = snapshot.fly || {};
    const physiology = snapshot.physiology || {};
    const behavior = snapshot.behavior || {};
    const memory = snapshot.memory || {};
    const brain = snapshot.brain || {};

    $('playIcon').innerHTML = runtime.running
      ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>'
      : '<path d="M8 5.5v13l10-6.5z"/>';
    $('playButton').setAttribute('aria-label', runtime.running ? 'Pause' : 'Play');
    $('playButton').title = runtime.running ? 'Pause' : 'Play';
    $('clock').textContent = formatClock(snapshot.time);
    $('actualSpeedBadge').textContent = `${Number(runtime.actualSpeed || 0).toFixed(2)}×`;
    this.setStatus(runtime.running ? 'running' : 'ready', runtime.running ? 'Running' : 'Paused');

    this.updateBehaviorReadout();
    this.setMeter('energy', physiology.energy);
    this.setMeter('hydration', physiology.hydration);
    this.setMeter('hunger', physiology.hunger);
    this.setMeter('thirst', physiology.thirst);
    this.setMeter('fatigue', physiology.fatigue);
    this.setMeter('stress', physiology.stress);

    const memories = [...(memory.food || []), ...(memory.water || []), ...(memory.threats || [])];
    $('memoryValue').textContent = `${memories.length} trace${memories.length === 1 ? '' : 's'}`;
    const guidance = snapshot.senses?.guidance || {};
    $('memoryCue').textContent = guidance.confidence > .08 ? `${guidance.kind} recall · ${pct(guidance.confidence)}` : 'no active recall';
    $('encounterTraceValue').textContent = behavior.forwardTraction>0.02?`${Number(behavior.forwardTraction).toFixed(2)} stance traction`:'none';
    $('activeRecallValue').textContent = guidance.confidence > .08 ? `${guidance.kind} ${pct(guidance.confidence)}` : 'none';

    const stats = this.brainSnapshot?.stats || {};
    $('brainRateValue').textContent = `${Number(stats.populationRateHz || 0).toFixed(2)} Hz`;
    $('brainSpikeValue').textContent = stats.spikes ? `${fmt(stats.spikes)} spikes in the last neural frame` : 'low current activity';

    this.updateInterpretation(snapshot);
    this.updateSenses(snapshot);
    this.updateMemory(memory);
    this.updateEvents(snapshot.events || []);
    this.updateOutputs(brain);
    $('bodySpeedValue').textContent = `${Number(fly.speed || 0).toFixed(1)} mm/s`;
    $('worldCanvasDescription').textContent = `${stateMeta(behavior.state).label}, ${behavior.reason || 'model state evolving'}. ${this.cameraDescription()}.`;
  }

  updateBehaviorReadout() {
    const snapshot = this.worldSnapshot;
    const behavior = snapshot?.behavior || {};
    const state = snapshot?.fly?.alive === false ? 'dead' : behavior.state || 'rest';
    const meta = stateMeta(state);
    $('behaviorLabel').textContent = meta.label;
    $('behaviorLabel').style.setProperty('--behavior-color', meta.color);
    $('behaviorReason').textContent = behavior.reason || 'neural and body state evolving';
    $('behaviorDuration').textContent = formatDuration(this.ethogram.currentDuration());

    const event = snapshot?.events?.[0];
    const latest = $('latestEvent');
    const recent = event && Number(snapshot.time) - Number(event.time) <= 4.5;
    latest.hidden = !recent;
    if (recent) {
      latest.querySelector('span').textContent = event.type || 'event';
      latest.querySelector('b').textContent = event.message || 'state changed';
    }
  }

  setMeter(name, value) {
    const bar = $(`${name}Bar`);
    const output = $(`${name}Value`);
    if (bar) bar.style.width = pct(value);
    if (output) output.textContent = pct(value);
  }

  updateInterpretation(snapshot) {
    const state = snapshot.behavior?.state || 'rest';
    const reason = snapshot.behavior?.reason || '';
    const brain = snapshot.brain || {};
    const guidance = snapshot.senses?.guidance || {};
    const meta = stateMeta(state);
    let title = `${meta.label[0]?.toUpperCase() || ''}${meta.label.slice(1)}.`;
    let text = reason ? `The body model reports ${reason}.` : 'The modeled nervous system and body are evolving.';
    if(state==='walk'){
      const left=Number(brain.legLeft)||0,right=Number(brain.legRight)||0;
      const balance=Math.abs(left-right)<.04?'bilaterally balanced':left>right?'left-biased':'right-biased';
      text=`Identified leg-motor populations are generating stance traction through the six-leg plant. Current output is ${balance}; descending populations coordinate timing but cannot create translation by themselves.`;
    }else if(state==='reverse'){
      text='A local tactile loop has temporarily reversed gait phase while identified leg outputs continue to supply physical traction.';
    } else if (state === 'probe') {
      text = 'Identified proboscis output is active, but the mouthparts have no matching food or water contact; this is an attempted probe, not ingestion.';
    } else if (state === 'feed' || state === 'drink') {
      text = `${meta.label[0].toUpperCase()}${meta.label.slice(1)} requires both local taste/contact and activity-derived ingestion evidence.`;
    } else if (state === 'escape') {
      text = 'Elevated defensive evidence has triggered a finite escape response in the body model.';
    }
    if (guidance.confidence > .15) text += ` A drifting ${guidance.kind || 'stored'} memory cue is active at ${pct(guidance.confidence)} confidence.`;
    $('interpretationTitle').textContent = title;
    $('interpretationText').textContent = text;
  }

  updateSenses(snapshot) {
    const senses = snapshot.senses || {};
    const left = senses.odorLeft || [0, 0, 0];
    const right = senses.odorRight || [0, 0, 0];
    this.setSenseBar('foodOdor', left[0], right[0]);
    this.setSenseBar('waterOdor', left[1], right[1]);
    this.setSenseBar('threatOdor', left[2], right[2]);

    const proximity = snapshot.retina?.proximity || [];
    const loom = snapshot.retina?.loom || [];
    let nearest = 0;
    let nearestIndex = 0;
    for (let index = 0; index < proximity.length; index++) {
      if (Number(proximity[index]) > nearest) { nearest = Number(proximity[index]); nearestIndex = index; }
    }
    const side = nearestIndex < proximity.length * .42 ? 'left' : nearestIndex > proximity.length * .58 ? 'right' : 'ahead';
    const strongestLoom = maximum(Array.from(loom, (value) => Math.abs(Number(value) || 0)));
    $('visionSummary').textContent = nearest > .2
      ? `The strongest nearby visual structure is ${side}: proximity ${pct(nearest)}, looming ${pct(strongestLoom)}.`
      : `No close structure dominates the retina; strongest looming evidence ${pct(strongestLoom)}.`;

    const touch = senses.touch || [];
    const taste = senses.taste || [];
    $('touchValue').textContent = maximum(touch) > .1 ? 'contact' : 'none';
    $('tasteValue').textContent = (taste[0] || 0) > .1 ? 'food' : (taste[1] || 0) > .1 ? 'water' : (taste[2] || 0) > .1 ? 'aversive' : 'none';
    $('lightValue').textContent = Number(senses.light || 0).toFixed(2);

    const food = Math.max(Number(left[0]) || 0, Number(right[0]) || 0);
    const water = Math.max(Number(left[1]) || 0, Number(right[1]) || 0);
    const threat = Math.max(Number(left[2]) || 0, Number(right[2]) || 0);
    $('umweltCanvasDescription').textContent = `Fly-relative sensory field. Food odor ${food.toFixed(2)}, water odor ${water.toFixed(2)}, threat odor ${threat.toFixed(2)}, strongest proximity ${pct(nearest)}, touch ${maximum(touch) > .1 ? 'present' : 'absent'}, and ${senses.guidance?.confidence > .08 ? `${senses.guidance.kind} memory guidance ${pct(senses.guidance.confidence)}` : 'no active memory guidance'}. No room coordinates are shown.`;
  }

  setSenseBar(prefix, left, right) {
    $(`${prefix}Left`).style.width = `${clamp(Number(left) / 1.5) * 100}%`;
    $(`${prefix}Right`).style.width = `${clamp(Number(right) / 1.5) * 100}%`;
    $(`${prefix}Text`).textContent = `${Number(left || 0).toFixed(2)} / ${Number(right || 0).toFixed(2)}`;
  }

  updateMemory(memory) {
    const pose = memory.estimatedPose || {};
    $('memoryDrift').textContent = `drift ${pct(pose.drift || 0)}`;
    const entries = [...(memory.food || []), ...(memory.water || []), ...(memory.threats || [])]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8);
    $('memoryList').innerHTML = entries.length
      ? entries.map((item) => `<div class="memory-item ${escapeHtml(item.kind)}"><i></i><span><strong>${escapeHtml(item.kind)} trace</strong><small>${Number(item.visits) || 1} encounter${(Number(item.visits) || 1) === 1 ? '' : 's'}</small></span><time>${pct(item.strength)} · ${Math.round(item.age)} s</time></div>`).join('')
      : '<p class="empty">No reward or threat trace has formed.</p>';
  }

  updateEvents(events) {
    const items = events.slice(0, 12);
    $('eventList').innerHTML = items.length
      ? items.map((item) => `<div class="event-item"><time>${formatClock(item.time)}</time><span><b>${escapeHtml(item.type || 'event')}</b>${escapeHtml(item.message)}</span></div>`).join('')
      : '<p class="empty">No events yet.</p>';
  }

  updateOutputs(brain) {
    const legs=Array.isArray(brain.legs)?brain.legs:[];
    const actuators=Array.isArray(brain.actuators)?brain.actuators:[];
    const bodyLegs=this.worldSnapshot?.behavior?.legs||[];
    const steering=clamp(.5+.5*(Number(brain.turnEvidence)||0));
    const entries=[
      ['leg traction',brain.locomotorDrive,'cyan'],
      ['coordination',brain.coordinationDrive,'violet'],
      ['steering balance',steering,'violet'],
      ['reverse',brain.reverse,'risk'],
      ['proboscis attempt',brain.feed,'food'],
      ['conflict',brain.conflict,'risk'],
    ];
    const rows=entries.map(([label,value,tone])=>`<div class="output-row ${tone}"><span>${label}</span><i><b style="width:${clamp(value)*100}%"></b></i><output>${Number(value||0).toFixed(2)}</output></div>`);
    if(legs.length===6)rows.push(`<div class="leg-output-grid">${LEG_IDS.map((id,index)=>`<div title="${escapeHtml(LEG_LABELS[id])}"><span>${id}</span><i><b style="width:${clamp(legs[index])*100}%"></b></i><output>${Number(legs[index]||0).toFixed(2)}</output></div>`).join('')}</div>`);
    if(actuators.length===LEG_IDS.length*LEG_MOTOR_ACTION_SPECS.length){
      rows.push(`<div class="joint-output-heading"><span>femur–tibia loop</span><small>actions · activation · angle · resolved spike force</small></div>`);
      rows.push(`<div class="joint-output-grid">${LEG_IDS.map((id,index)=>{
        const base=index*LEG_MOTOR_ACTION_SPECS.length,flex=clamp(actuators[base+FEMUR_TIBIA_FLEX]),extend=clamp(actuators[base+FEMUR_TIBIA_EXTEND]);
        const modeledLeg=bodyLegs[index]||{},activation=modeledLeg.muscle?.activation||{};
        const angle=Number(modeledLeg.femurTibiaAngle),angleDegrees=angle*180/Math.PI;
        const slow=clamp(activation.slow),intermediate=clamp(activation.intermediate),fast=clamp(activation.fast);
        const absoluteForce=Math.max(0,Number(modeledLeg.calibratedFlexorForceMicroNewtons)||0);
        const absoluteTorque=Math.max(0,Number(modeledLeg.calibratedFlexorTorqueNewtonMeters)||0)*1e12;
        const unresolved=Math.max(0,Number(modeledLeg.unresolvedMotorSpikes)||0);
        const evidence=modeledLeg.absoluteForceEvidence||'no resolved spike evidence';
        return `<div title="${escapeHtml(LEG_LABELS[id])} femur–tibia joint; S/I/F are modeled activations. Absolute force uses only resolved slow/fast spike counts; ${escapeHtml(evidence)}; unresolved frame spikes ${unresolved}."><span>${id}</span><em>F</em><i class="flex"><b style="width:${flex*100}%"></b></i><em>E</em><i class="extend"><b style="width:${extend*100}%"></b></i><output>${Number.isFinite(angleDegrees)?angleDegrees.toFixed(1):'—'}°</output><small class="muscle-unit-readout"><b>S ${slow.toFixed(2)}</b><b>I ${intermediate.toFixed(2)}</b><b>F ${fast.toFixed(2)}</b><b>${absoluteForce.toFixed(3)} µN · ${absoluteTorque.toFixed(1)} nN·mm</b></small></div>`;
      }).join('')}</div>`);
    }
    $('outputBars').innerHTML=rows.join('');
  }

  updateNeuralFieldUI() {
    const summary = this.renderer.getNeuralFrameSummary();
    const stats = this.brainSnapshot?.stats || {};
    const cumulativeSeconds = Number(this.brainSnapshot?.simulatedMs || 0) / 1000;
    $('neuralFrameSampleCount').textContent = summary.sampleCount
      ? `${fmt(summary.sampleCount)} sampled indices · ${fmt(summary.totalSpikes)} frame spikes`
      : '0 sampled spikes';
    $('neuralFrameTime').textContent = this.brainSnapshot
      ? `${Number(stats.simulatedMs || 0).toFixed(0)} ms frame · neural time ${cumulativeSeconds.toFixed(1)} s`
      : 'waiting for a frame';
    const groups = summary.groups?.length ? summary.groups : this.brainInfo?.displayAtlas?.groups || [];
    $('neuralGroupList').innerHTML = groups.length
      ? groups.map((group, index) => `<div class="neural-group-row" style="--group-color:${NEURAL_COLORS[index] || NEURAL_COLORS[0]}"><i></i><span><strong>${escapeHtml(group.label)}</strong><small>${fmt(group.count)} mapped neurons</small></span><output>${fmt(group.sampleCount || 0)}</output></div>`).join('')
      : '<p class="empty">Population mappings are loading.</p>';
    $('neuralFieldCanvas').setAttribute('aria-label', summary.sampleCount
      ? `Diagrammatic neural field showing ${summary.sampleCount} sampled firing-neuron indices grouped into labeled model populations.`
      : 'Diagrammatic sampled neural activity field. Waiting for a neural frame.');
  }

  refreshComputeConfig() {
    this.computeBackendRequested=normalizeComputeBackend(this.computeBackendRequested);
    this.neuralResolutionRequested=normalizeNeuralResolution(this.neuralResolutionRequested);
    this.computeProfile=computeSelection({
      backend:this.computeBackendRequested,
      resolution:this.neuralResolutionRequested,
      manifest:this.manifest||{},
      capabilities:this.capabilities,
    });
    this.config=modelConfigFor(this.mode,{
      brainDtMs:this.computeProfile.resolution.dtMs,
      computeBackendRequested:this.computeProfile.backendRequested,
      neuralResolutionRequested:this.neuralResolutionRequested,
      neuralResolutionResolved:this.computeProfile.resolution.resolved,
    });
    return this.config;
  }

  updatePreferenceUrl() {
    const query = new URLSearchParams(location.search);
    if (this.mode === 'natural') query.delete('mode'); else query.set('mode', this.mode);
    if(this.dataset==='banc')query.delete('dataset');else query.set('dataset',this.dataset);
    if(this.graphTierRequested==='auto')query.delete('tier');else query.set('tier',this.graphTierRequested);
    if(this.computeBackendRequested==='auto')query.delete('engine');else query.set('engine',this.computeBackendRequested);
    if(this.neuralResolutionRequested==='auto')query.delete('resolution');else query.set('resolution',this.neuralResolutionRequested);
    history.replaceState(null, '', `${location.pathname}${query.toString() ? `?${query}` : ''}${location.hash}`);
  }

  updateComputeUI() {
    const backendSelect=$('computeBackendSelect'),resolutionSelect=$('neuralResolutionSelect');
    if(backendSelect)backendSelect.value=this.computeBackendRequested;
    if(resolutionSelect)resolutionSelect.value=this.neuralResolutionRequested;
    const compute=this.brainInfo?.compute||{};
    const kernel=compute.kernel||this.brainSnapshot?.computeBackend||this.brainSnapshot?.stats?.computeBackend||{};
    const resolved=compute.resolved||kernel.id||'pending';
    const backendLabel=resolved==='wasm'?'WebAssembly + JS sparse graph':resolved==='js'?'JavaScript worker':'starting';
    if($('computeBackendValue'))$('computeBackendValue').textContent=backendLabel;
    const resolution=this.computeProfile?.resolution;
    const resolvedResolution=compute.resolutionResolved||this.config?.neuralResolutionResolved||resolution?.resolved;
    const resolvedLabel=resolvedResolution&&resolvedResolution!=='auto'?(resolvedResolution[0].toUpperCase()+resolvedResolution.slice(1)):'';
    const autoLabel=this.neuralResolutionRequested==='auto'&&resolvedLabel?`Auto → ${resolvedLabel} · `:'';
    if($('computeStepValue'))$('computeStepValue').textContent=`${autoLabel}${Number(this.config?.brainDtMs||resolution?.dtMs||0).toFixed(Number(this.config?.brainDtMs||0)<1?1:0)} ms · ${compute.integrator||this.brainSnapshot?.integrator||'exact linear'}`;
    const stats=this.brainSnapshot?.stats||{};
    const load=Number(stats.simulatedMs)>0?Number(stats.wallMs||0)/Number(stats.simulatedMs||1):0;
    if($('computeLoadValue'))$('computeLoadValue').textContent=stats.wallMs?`${(load*100).toFixed(0)}% real-time neural cost`:'waiting for a frame';
    const caps=this.capabilities||{};
    if($('computeCapabilityValue'))$('computeCapabilityValue').textContent=`${caps.hardwareConcurrency||1} logical cores${caps.deviceMemory?` · ${caps.deviceMemory} GB hint`:''} · WebGPU ${caps.webGPU?'available':'not detected'} · shared memory ${caps.sharedArrayBuffer?'ready':'off'}`;
    if($('computeWarning')){
      const warnings=compute.warnings||[];
      $('computeWarning').hidden=!warnings.length;
      $('computeWarning').textContent=warnings.join(' ');
    }
    if($('causalPathValue'))$('causalPathValue').textContent='identified leg outputs required';
  }

  applyModeUI() {
    this.mode = normalizeModelMode(this.mode);
    $('modeSelect').value = this.mode;
    $('modeSummary').textContent = MODE_COPY[this.mode].summary;
    this.updatePreferenceUrl();
    this.updateComputeUI();
  }

  changeMode(value) {
    const mode = normalizeModelMode(value);
    if (mode === this.mode || this.pendingOperation) return;
    const resume = Boolean(this.worldSnapshot?.runtime?.running);
    this.mode = mode;
    this.refreshComputeConfig();
    this.applyModeUI();
    const token = uid();
    this.pendingOperation = {token, kind: 'mode', brain: false, world: false, resume};
    this.setControls(false);
    this.worldWorker?.postMessage({type: 'pause'});
    this.worldWorker?.postMessage({type: 'mode', mode, token});
    this.brainWorker?.postMessage({type: 'reset', token, seed: this.seed, config: this.config});
    this.setStatus('loading', `Switching to ${MODE_COPY[mode].label}`);
  }

  async changeStructure({dataset=this.dataset,tier=this.graphTierRequested}={}) {
    const nextDataset=dataset==='fafb'?'fafb':'banc';
    const nextTier=['auto','core','balanced','maximal'].includes(tier)?tier:'auto';
    if((nextDataset===this.dataset&&nextTier===this.graphTierRequested)||this.pendingOperation)return;
    this.dataset=nextDataset;this.graphTierRequested=nextTier;
    this.updatePreferenceUrl();this.setControls(false);this.worldWorker?.postMessage({type:'pause'});
    this.stopWorkers();this.ethogram.clear();this.brainSnapshot=null;this.brainInfo=null;this.worldSnapshot=null;
    this.seed=seed32();this.individualId=`fly-${this.seed.toString(16).padStart(8,'0')}`;$('individualName').textContent=this.individualId;
    this.setLoading('Changing the nervous system','Loading the selected bundled structural model…',.04);
    try{
      const manifest=await fetchJson(referenceManifestPath(this.dataset));
      if(!(await localPackAvailable(manifest,this.effectiveGraphTier(manifest))))throw new Error('Selected bundled structural assets are incomplete.');
      this.manifest={...manifest,assetBase:new URL('./',document.baseURI).href};
      this.refreshComputeConfig();this.startWorkers();
      toast('Structural model changed. A new individual was created.');
    }catch(error){this.fail(error);}
  }

  changeCompute({backend=this.computeBackendRequested,resolution=this.neuralResolutionRequested}={}) {
    const nextBackend=normalizeComputeBackend(backend),nextResolution=normalizeNeuralResolution(resolution);
    if((nextBackend===this.computeBackendRequested&&nextResolution===this.neuralResolutionRequested)||this.pendingOperation)return;
    const resume=Boolean(this.worldSnapshot?.runtime?.running);
    this.computeBackendRequested=nextBackend;
    this.neuralResolutionRequested=nextResolution;
    this.refreshComputeConfig();
    this.updatePreferenceUrl();
    this.updateComputeUI();
    const token=uid();
    this.pendingOperation={token,kind:'compute',brain:false,world:true,resume};
    this.setControls(false);
    this.worldWorker?.postMessage({type:'pause'});
    this.brainWorker?.postMessage({type:'compute',token,config:this.config});
    this.setStatus('loading','Switching browser compute');
  }

  operationAck(side, token) {
    const operation = this.pendingOperation;
    if (!operation || operation.token !== token) return;
    operation[side] = true;
    if (!operation.brain || !operation.world) return;
    this.pendingOperation = null;
    this.setControls(true);
    this.setStatus('ready', `${MODE_COPY[this.mode].label} ready`);
    if (operation.resume) this.worldWorker?.postMessage({type: 'play'});
    toast(operation.kind === 'mode' ? `${MODE_COPY[this.mode].label} mode active.` : operation.kind === 'compute' ? 'Browser compute updated without replacing the individual.' : operation.kind === 'restore' ? 'Saved fly restored.' : 'New fly initialized.');
  }

  setView(view) {
    const next = view === 'umwelt' ? 'umwelt' : 'world';
    if (next === 'umwelt' && this.editing) this.setEditing(false);
    this.view = next;
    this.renderer.setView(next);
    $('worldViewButton').classList.toggle('active', next === 'world');
    $('worldViewButton').setAttribute('aria-pressed', String(next === 'world'));
    $('umweltViewButton').classList.toggle('active', next === 'umwelt');
    $('umweltViewButton').setAttribute('aria-pressed', String(next === 'umwelt'));
    $('cameraControls').hidden = next !== 'world';
    $('viewContext').querySelector('span').textContent = next.toUpperCase();
    $('viewContext').querySelector('b').textContent = next === 'world' ? this.cameraDescription() : 'fly-relative sensory evidence';
    document.body.classList.toggle('view-umwelt', next === 'umwelt');
    this.renderer.refreshLayout();
  }

  setInspector(open) {
    this.inspectorOpen = Boolean(open);
    const inspector = $('inspector');
    inspector.classList.toggle('open', this.inspectorOpen);
    inspector.setAttribute('aria-hidden', String(!this.inspectorOpen));
    inspector.inert = !this.inspectorOpen;
    $('inspectorButton').setAttribute('aria-pressed', String(this.inspectorOpen));
    document.body.classList.toggle('inspector-open', this.inspectorOpen);
    this.renderer.refreshLayout();
    setTimeout(() => this.renderer.refreshLayout(), 260);
  }

  switchTab(name, {focus = false} = {}) {
    const valid = new Set(['now', 'umwelt', 'neural', 'history', 'memory', 'brain']);
    this.activeTab = valid.has(name) ? name : 'now';
    for (const button of document.querySelectorAll('.inspector-tab')) {
      const active = button.dataset.tab === this.activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }
    for (const panel of document.querySelectorAll('.inspector-panel')) {
      const active = panel.dataset.panel === this.activeTab;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    }
    if (this.activeTab === 'umwelt') {
      this.renderer.drawUmweltDetail();
      this.renderer.drawRetina();
    } else if (this.activeTab === 'neural') this.renderer.drawNeuralField(performance.now());
    else if (this.activeTab === 'history') this.ethogram.redraw();
    else if (this.activeTab === 'memory') this.renderer.drawMemory();
    else if (this.activeTab === 'brain') this.renderer.drawActivity();
  }

  updateCameraUI(state) {
    if (!state) return;
    const follow = state.mode === 'follow';
    const overview = state.mode === 'overview';
    $('cameraFollowButton').classList.toggle('active', follow);
    $('cameraFollowButton').setAttribute('aria-pressed', String(follow));
    $('cameraOverviewButton').classList.toggle('active', overview);
    $('cameraOverviewButton').setAttribute('aria-pressed', String(overview));
    // Zoom should describe the user's camera adjustment, not the automatic
    // difference between a follow view and the whole-room overview.
    $('cameraScaleValue').textContent = `${Math.max(.1, Number(state.zoom) || 1).toFixed(1)}×`;
    $('cameraModeLabel').textContent = this.cameraDescription(state.mode);
  }

  cameraDescription(mode = this.renderer.getCameraState().mode) {
    if (mode === 'follow') return 'following the fly';
    if (mode === 'overview') return 'whole-room overview';
    return 'free camera';
  }

  setEditing(value) {
    const next = Boolean(value);
    if (next === this.editing) return;
    if (next) {
      this.cameraBeforeEdit = this.renderer.getCameraState();
      this.inspectorBeforeEdit = this.inspectorOpen;
      this.setInspector(false);
      this.setView('world');
      this.editing = true;
      document.body.classList.add('editing-room');
      $('editorBar').hidden = false;
      $('editButton').setAttribute('aria-pressed', 'true');
      $('editButton').textContent = 'Finish editing';
      this.renderer.setEditing(true);
      this.editor.setEnabled(true);
      this.renderer.setCameraMode('overview');
      this.setEditorTool('select');
    } else {
      this.editing = false;
      document.body.classList.remove('editing-room');
      $('editorBar').hidden = true;
      $('editButton').setAttribute('aria-pressed', 'false');
      $('editButton').textContent = 'Edit room';
      this.renderer.setNavigationEnabled(false);
      this.editor.setEnabled(false);
      this.renderer.setEditing(false);
      this.selectedObject(null);
      if (this.cameraBeforeEdit) this.renderer.restoreCameraState(this.cameraBeforeEdit);
      this.setInspector(this.inspectorBeforeEdit);
    }
    this.renderer.refreshLayout();
    setTimeout(() => this.renderer.refreshLayout(), 40);
  }

  setEditorTool(tool) {
    const valid = new Set(['select', 'pan', 'wall', 'shelter', 'food', 'water', 'light', 'threat']);
    const next = valid.has(tool) ? tool : 'select';
    this.editor.setTool(next);
    this.renderer.setNavigationEnabled(next === 'pan');
    for (const button of document.querySelectorAll('.editor-tool')) {
      const active = button.dataset.tool === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const hints = {
      select: 'Select and drag objects, or use arrow keys. The simulation continues while you edit.',
      pan: 'Drag or pinch to move the whole-room camera; use the zoom controls above.',
      wall: 'Drag to create a wall, or click for a standard wall.',
      shelter: 'Drag to create a shelter, or click for a standard shelter.',
      food: 'Click to place food; drag immediately to refine its position.',
      water: 'Click to place water; drag immediately to refine its position.',
      light: 'Click to place a local light field; drag immediately to refine its position.',
      threat: 'Click to place a moving threat; drag immediately to refine its position.',
    };
    $('editHint').textContent = hints[next];
  }

  roomChanged(room) {
    this.room = normalizeRoom(room);
    this.renderer.setRoom(this.room);
    clearTimeout(this.roomTimer);
    const revision = ++this.roomRevision;
    this.roomTimer = setTimeout(() => this.worldWorker?.postMessage({type: 'room-update', room: this.room, revision}), 35);
    this.updateHistoryButtons();
  }

  selectedObject(object) {
    this.selected = object;
    this.renderer.setSelection(object?.id || null);
    $('deleteObjectButton').disabled = !object;
    $('objectInspector').hidden = !object || !this.editing;
    if (!object) return;
    $('objectTitle').textContent = object.kind[0].toUpperCase() + object.kind.slice(1);
    this.renderObjectFields(object);
    this.renderer.refreshLayout();
  }

  renderObjectFields(object) {
    const fields = [['x', object.x, .1], ['y', object.y, .1]];
    if (object.w !== undefined) fields.push(['w', object.w, .1], ['h', object.h, .1]);
    if (object.r !== undefined) fields.push(['r', object.r, .1]);
    if (object.amount !== undefined) fields.push(['amount', object.amount, .05]);
    if (object.odor !== undefined) fields.push(['odor', object.odor, .05]);
    if (object.strength !== undefined) fields.push(['strength', object.strength, .05]);
    if (object.speed !== undefined) fields.push(['speed', object.speed, .1]);
    $('objectFields').innerHTML = fields.map(([key, value, step]) => `<label><span>${key}</span><input data-field="${key}" type="number" step="${step}" value="${Number(value).toFixed(2)}"></label>`).join('');
    for (const input of $('objectFields').querySelectorAll('input')) {
      input.addEventListener('change', () => this.editor.updateSelected({[input.dataset.field]: Number(input.value)}));
    }
  }

  updateHistoryButtons() {
    $('undoButton').disabled = !this.editor.history.canUndo;
    $('redoButton').disabled = !this.editor.history.canRedo;
  }

  cycleLight() {
    const levels = [.12, .46, .82];
    const current = this.room.ambientLight;
    const index = levels.findIndex((value) => Math.abs(value - current) < .05);
    const next = levels[(index + 1) % levels.length];
    this.room = normalizeRoom({...this.room, ambientLight: next});
    this.editor.setRoom(this.room, {external: false});
    this.roomChanged(this.room);
    toast(`Ambient light ${next < .2 ? 'dim' : next > .7 ? 'bright' : 'moderate'}.`);
  }

  saveRoom() {
    localStorage.setItem('fly-umwelt-room', exportRoom(this.room));
    toast('Room saved in this browser.');
  }
  loadRoom() {
    const value = localStorage.getItem('fly-umwelt-room');
    if (!value) { toast('No saved room exists.', 'error'); return; }
    try {
      this.replaceRoom(JSON.parse(value));
      toast('Saved room loaded without resetting the fly.');
    } catch (error) { toast(error.message, 'error'); }
  }
  replaceRoom(raw) {
    this.room = normalizeRoom(raw);
    this.editor.setRoom(this.room);
    this.renderer.setRoom(this.room);
    this.roomRevision++;
    this.worldWorker?.postMessage({type: 'room-update', room: this.room, revision: this.roomRevision});
  }
  async importRoom(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      this.replaceRoom(JSON.parse(await file.text()));
      toast('Room imported without resetting the fly.');
    } catch (error) { toast(`Import failed: ${error.message}`, 'error'); }
    event.target.value = '';
  }

  request(worker, type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(new Error(`${type}: worker unavailable`)); return; }
      const requestId = uid();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${type} timed out`));
      }, 30000);
      this.pending.set(requestId, {resolve: (value) => { clearTimeout(timer); resolve(value); }, reject});
      worker.postMessage({type, requestId, ...payload});
    });
  }
  resolveRequest(id, value) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.resolve(value);
  }

  async newFly() {
    if (this.pendingOperation) return;
    this.ethogram.clear();
    this.seed = seed32();
    this.individualId = `fly-${this.seed.toString(16).padStart(8, '0')}`;
    $('individualName').textContent = this.individualId;
    if (this.brainInfo?.displayAtlas) this.renderer.setNeuralAtlas(this.brainInfo.displayAtlas);
    const token = uid();
    this.pendingOperation = {token, kind: 'new', brain: false, world: false, resume: false};
    this.setControls(false);
    this.worldWorker?.postMessage({type: 'reset', token, room: this.room, seed: this.seed ^ 0x9e3779b9, mode: this.mode, revision: this.roomRevision});
    this.brainWorker?.postMessage({type: 'reset', token, seed: this.seed, config: this.config});
  }

  storageKey() {
    const tier=this.brainInfo?.graphTier?.id||((this.manifest?.graph?.tiers&&this.graphTierRequested==='auto')?(this.manifest.defaultGraphTier||'balanced'):this.graphTierRequested)||'legacy';
    return `${this.manifest?.id||'unknown'}:${tier}`;
  }

  async saveFly() {
    const running = Boolean(this.worldSnapshot?.runtime?.running);
    try {
      this.worldWorker?.postMessage({type: 'pause'});
      const [world, brain] = await Promise.all([this.request(this.worldWorker, 'serialize'), this.request(this.brainWorker, 'serialize')]);
      await this.store.put(this.storageKey(), {version: 6, datasetId: this.manifest.id, dataset:this.dataset, graphTierRequested:this.graphTierRequested, graphTierResolved:this.brainInfo?.graphTier?.id||null, individualId: this.individualId, seed: this.seed, mode: this.mode, computeBackendRequested:this.computeBackendRequested, neuralResolutionRequested:this.neuralResolutionRequested, savedAt: Date.now(), running, world, brain});
      toast('Complete fly state saved locally.');
    } catch (error) { toast(error.message, 'error'); }
    finally { if (running) this.worldWorker?.postMessage({type: 'play'}); }
  }

  async restoreFly() {
    if (this.pendingOperation) return;
    try {
      const state = await this.store.get(this.storageKey());
      if (!state) throw new Error('No saved fly exists for this connectome and structural tier.');
      if(state.datasetId!==this.manifest.id)throw new Error('Saved fly belongs to a different nervous-system dataset.');
      const activeTier=this.brainInfo?.graphTier?.id||null;
      if(state.graphTierResolved&&activeTier&&state.graphTierResolved!==activeTier)throw new Error('Saved fly belongs to a different structural graph tier.');
      this.individualId = state.individualId || this.individualId;
      this.seed = state.seed || this.seed;
      this.mode = normalizeModelMode(state.mode || this.mode);
      this.refreshComputeConfig();
      this.applyModeUI();
      $('individualName').textContent = this.individualId;
      const token = uid();
      this.pendingOperation = {token, kind: 'restore', brain: false, world: false, resume: Boolean(state.running)};
      this.setControls(false);
      this.worldWorker?.postMessage({type: 'restore', token, state: state.world, revision: ++this.roomRevision});
      this.brainWorker?.postMessage({type: 'restore', token, state: state.brain});
    } catch (error) { toast(error.message, 'error'); }
  }

  async inspectNeuron() {
    const rootId = $('neuronRootInput').value.trim();
    if (!rootId) { toast('Enter a root ID.', 'error'); return; }
    try {
      const neuron = await this.request(this.brainWorker, 'inspect-root', {rootId});
      $('neuronInspection').innerHTML = neuron
        ? `<strong>${escapeHtml(neuron.rootId)}</strong><p>${escapeHtml(neuron.annotation)}</p><small>${escapeHtml(neuron.detail || 'No detailed annotation')}</small><dl><div><dt>membrane v</dt><dd>${Number(neuron.v).toFixed(2)}</dd></div><div><dt>synaptic g</dt><dd>${Number(neuron.g).toFixed(2)}</dd></div><div><dt>out-degree</dt><dd>${fmt(neuron.outDegree)}</dd></div></dl>`
        : 'No neuron with that root ID exists in this pack.';
    } catch (error) { toast(error.message, 'error'); }
  }

  async openDocs() {
    $('infoDialog').close();
    $('docsDialog').showModal();
    $('docsContent').textContent = 'Loading…';
    try {
      const response = await fetch('./docs/SCIENTIFIC_MODEL.md');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      $('docsContent').innerHTML = markdownLite(await response.text());
    } catch (error) { $('docsContent').textContent = error.message; }
  }
}

function markdownLite(text) {
  let inCode = false;
  let codeLines = [];
  const output = [];
  const flushCode = () => {
    if (!codeLines.length) return;
    output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (line.startsWith('### ')) output.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) output.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith('# ')) output.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    else if (line.startsWith('- ')) output.push(`<p class="docs-list">• ${escapeHtml(line.slice(2))}</p>`);
    else if (!line.trim()) output.push('<br>');
    else output.push(`<p>${escapeHtml(line).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`);
  }
  flushCode();
  return output.join('');
}
