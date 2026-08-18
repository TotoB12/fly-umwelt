import {LabRenderer} from './ui/renderer.js';
import {EthogramView, ETHOGRAM_STATES} from './ui/ethogram.js';
import {RoomEditor} from './editor/room-editor.js';
import {cloneRoom, exportRoom, normalizeRoom} from './core/room.js';
import {APP_VERSION, modelConfigFor, normalizeModelMode} from './core/constants.js';
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
  natural: {label: 'Natural', summary: 'Full graph + disclosed VNC, physiology and memory models'},
  connectome: {label: 'Connectome', summary: 'Graph-dominant output with fewer behavioral priors'},
  evoked: {label: 'Evoked', summary: 'Published-style zero baseline; stimulation experiment'},
});
const MODE_SET = new Set(Object.keys(MODE_COPY));
const NEURAL_COLORS = ['#71809f', '#76d9ef', '#50d7c8', '#88b8ff', '#f0b977', '#c69cff', '#9b8cff', '#ff9f78', '#e3bf72'];

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
function manifestPath() { return new URLSearchParams(location.search).get('fixture') === '1' ? './data/fixture-manifest.json' : './data/manifest.json'; }
function stateMeta(state) {
  return ETHOGRAM_STATES[state] || {label: String(state || 'pause'), color: '#71809f'};
}
async function localPackAvailable(manifest) {
  if (manifest?.testOnly) return true;
  const specs = [manifest?.graph, manifest?.neurons, manifest?.classification];
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
    this.config = modelConfigFor(this.mode);
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
      const [requestedManifest, room] = await Promise.all([fetchJson(manifestPath()), fetchJson('./rooms/default.json')]);
      let manifest = requestedManifest;
      if (!requestedFixture && !(await localPackAvailable(requestedManifest))) {
        manifest = await fetchJson('./data/fixture-manifest.json');
        this.fallbackAttempted = true;
        this.fullGraphError = 'The verified 139k-neuron pack is not installed locally.';
        const query = new URLSearchParams(location.search);
        query.set('fixture', '1');
        history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
      }
      this.manifest = {...manifest, assetBase: new URL('./', document.baseURI).href};
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
    $('retryFullButton').addEventListener('click', () => this.retryDataset(false));
    $('loadFullGraphButton')?.addEventListener('click', () => this.retryDataset(false));
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
    this.brainWorker.onerror = (event) => this.fail(new Error(`Brain worker: ${event.message}`));
    this.worldWorker.onerror = (event) => this.fail(new Error(`World worker: ${event.message}`));
    this.brainWorker.postMessage({type: 'init', manifest: this.manifest, config: this.config, seed: this.seed, port: channel.port1}, [channel.port1]);
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
      this.updateNeuralFieldUI();
      this.maybeReady();
      return;
    }
    if (message.type === 'brain-snapshot') {
      this.brainSnapshot = message.snapshot;
      this.sampleSpikes = message.sampleSpikes || [];
      this.renderer.updateBrain(this.brainSnapshot, this.sampleSpikes);
      this.updateNeuralFieldUI();
      this.updateDOM(true);
      return;
    }
    if (message.type === 'brain-reset' || message.type === 'brain-restored' || message.type === 'config-applied') this.operationAck('brain', message.token);
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
    this.setStatus('loading', 'Loading brain');
  }
  setStatus(kind, text) {
    $('statusDot').className = `status-dot ${kind}`;
    $('statusText').textContent = text;
  }
  setControls(enabled) {
    for (const id of ['playButton', 'stepButton', 'speedSelect', 'modeSelect']) $(id).disabled = !enabled;
  }

  fail(error) {
    const alreadyDemo = this.manifest?.testOnly || new URLSearchParams(location.search).get('fixture') === '1';
    if (!alreadyDemo && !this.fallbackAttempted) console.info('Full connectome unavailable; opening verified demo graph.', error?.message || error);
    else console.error(error);
    this.failed = true;
    this.stopWorkers();
    this.setControls(false);
    if (!alreadyDemo && !this.fallbackAttempted) {
      this.fallbackAttempted = true;
      this.fullGraphError = error.message;
      $('loadingOverlay').hidden = false;
      $('loadingTitle').textContent = 'Opening the bundled demo';
      $('loadingMessage').textContent = 'The 139k-neuron files were not reachable. The same observatory will open with a small verified graph; install the full pack later with npm run data:reference.';
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
    this.setStatus('error', 'Brain unavailable');
  }

  async retryDataset(useFixture = false) {
    try {
      this.failed = false;
      if (!useFixture) this.fallbackAttempted = false;
      this.setLoading(useFixture ? 'Opening verified demo' : 'Retrying full graph', useFixture ? 'Loading the bundled small validation graph…' : 'Trying the verified full-connectome sources again…', .05);
      const path = useFixture ? './data/fixture-manifest.json' : './data/manifest.json';
      this.manifest = {...(await fetchJson(path)), assetBase: new URL('./', document.baseURI).href};
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
    $('datasetBadge').textContent = dataset.testOnly ? 'demo graph' : `${fmt(counts.neurons)} neurons`;
    $('datasetBadge').title = dataset.testOnly
      ? 'Bundled small graph. Run npm run data:reference to install the 139k-neuron pack.'
      : dataset.label || 'loaded connectome';
    $('brainScaleLabel').textContent = dataset.testOnly ? 'bundled demonstration' : 'loaded graph';
    const loadFull = $('loadFullGraphButton');
    if (loadFull) {
      loadFull.disabled = !dataset.testOnly;
      loadFull.textContent = dataset.testOnly ? 'Load full 139k graph' : 'Full graph loaded';
    }
    const provenance = this.brainInfo?.displayAtlas?.provenance;
    $('neuralAtlasLabel').textContent = provenance?.note || 'Group placement is diagrammatic and display-only.';
    if (dataset.testOnly && this.fullGraphError) toast('Demo graph is running. Install the full pack with npm run data:reference.', 'info', 5200);
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
    $('encounterTraceValue').textContent = (behavior.odorEncounterTrace || 0) > .12 ? `${Number(behavior.odorEncounterTrace).toFixed(1)} recent` : 'none';
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
    if (state === 'walk' && brain.odorPresence > .18) {
      const side = brain.odorBias > .08 ? 'right' : brain.odorBias < -.08 ? 'left' : 'neither side strongly';
      text = `A walking bout is active. Current chemical evidence biases finite future turns toward ${side}; it is not a target coordinate or continuous steering command.`;
    } else if (state === 'saccade') {
      text = `A brief ${snapshot.fly?.turnRate > 0 ? 'right' : 'left'} body saccade is active. The disclosed VNC model ends it as a finite turn rather than sustaining arcade-style steering.`;
    } else if (state === 'reverse') {
      text = 'A local tactile/VNC escape reflex is backing the body away from contact.';
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
    const turn = clamp(.5 + .25 * ((Number(brain.turn) || 0) + (Number(brain.odorBias) || 0)));
    const entries = [
      ['forward', brain.forward, 'cyan'],
      ['turn balance', turn, 'violet'],
      ['visual risk', brain.visualRisk, 'risk'],
      ['odor evidence', brain.odorPresence, 'cyan'],
      ['feeding', brain.feedingEvidence, 'food'],
      ['confidence', brain.confidence, 'violet'],
    ];
    $('outputBars').innerHTML = entries.map(([label, value, tone]) => `<div class="output-row ${tone}"><span>${label}</span><i><b style="width:${clamp(value) * 100}%"></b></i><output>${Number(value || 0).toFixed(2)}</output></div>`).join('');
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

  applyModeUI() {
    this.mode = normalizeModelMode(this.mode);
    $('modeSelect').value = this.mode;
    $('modeSummary').textContent = MODE_COPY[this.mode].summary;
    const query = new URLSearchParams(location.search);
    if (this.mode === 'natural') query.delete('mode'); else query.set('mode', this.mode);
    history.replaceState(null, '', `${location.pathname}${query.toString() ? `?${query}` : ''}${location.hash}`);
  }

  changeMode(value) {
    const mode = normalizeModelMode(value);
    if (mode === this.mode || this.pendingOperation) return;
    const resume = Boolean(this.worldSnapshot?.runtime?.running);
    this.mode = mode;
    this.config = modelConfigFor(mode);
    this.applyModeUI();
    const token = uid();
    this.pendingOperation = {token, kind: 'mode', brain: false, world: false, resume};
    this.setControls(false);
    this.worldWorker?.postMessage({type: 'pause'});
    this.worldWorker?.postMessage({type: 'mode', mode, token});
    this.brainWorker?.postMessage({type: 'reset', token, seed: this.seed, config: this.config});
    this.setStatus('loading', `Switching to ${MODE_COPY[mode].label}`);
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
    toast(operation.kind === 'mode' ? `${MODE_COPY[this.mode].label} mode active.` : operation.kind === 'restore' ? 'Saved fly restored.' : 'New fly initialized.');
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
      select: 'Select and drag objects, or use arrow keys. The fly keeps living while you edit.',
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

  async saveFly() {
    const running = Boolean(this.worldSnapshot?.runtime?.running);
    try {
      this.worldWorker?.postMessage({type: 'pause'});
      const [world, brain] = await Promise.all([this.request(this.worldWorker, 'serialize'), this.request(this.brainWorker, 'serialize')]);
      await this.store.put(this.manifest.id, {version: 3, datasetId: this.manifest.id, individualId: this.individualId, seed: this.seed, mode: this.mode, savedAt: Date.now(), running, world, brain});
      toast('Complete fly state saved locally.');
    } catch (error) { toast(error.message, 'error'); }
    finally { if (running) this.worldWorker?.postMessage({type: 'play'}); }
  }

  async restoreFly() {
    if (this.pendingOperation) return;
    try {
      const state = await this.store.get(this.manifest.id);
      if (!state) throw new Error('No saved fly exists for this connectome.');
      this.individualId = state.individualId || this.individualId;
      this.seed = state.seed || this.seed;
      this.mode = normalizeModelMode(state.mode || this.mode);
      this.config = modelConfigFor(this.mode);
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
