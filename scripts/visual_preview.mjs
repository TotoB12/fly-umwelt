import {spawn} from 'node:child_process';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {findChromiumExecutable, stopBrowserProcess} from './browser-path.mjs';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'docs', 'previews');
const profile = resolve('/tmp', 'fly-umwelt-visual-profile');
const debugPort = Number(process.env.VISUAL_DEBUG_PORT || 9347);
const chromiumPath = findChromiumExecutable();
if (!chromiumPath) throw new Error('no Chromium-family browser found; set CHROMIUM_BIN to run visual previews');

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.onopen = resolveOpen;
      this.ws.onerror = rejectOpen;
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
      }
    };
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({id, method, params}));
    return new Promise((resolveCall, rejectCall) => this.pending.set(id, {resolve: resolveCall, reject: rejectCall}));
  }
  close() { this.ws?.close(); }
}

async function waitFor(fn, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); } catch { last = false; }
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Chromium; last=${JSON.stringify(last)}`);
}

async function removeProfile() {
  // Edge keeps a Crashpad metrics handle for a moment after Browser.close on
  // Windows. Retrying prevents an otherwise successful visual review from
  // being reported as a failure during cleanup.
  for (let attempt = 0; attempt < 12; attempt++) {
    try { await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 80}); return; }
    catch (error) { if (attempt === 11) throw error; await sleep(100); }
  }
}

function exposeRenderer(source) {
  return `(() => {\n${source.replace('export class LabRenderer', 'class LabRenderer')}\nglobalThis.LabRenderer = LabRenderer;\n})();`;
}
function exposeEthogram(source) {
  return `(() => {\n${source
    .replace('export const ETHOGRAM_STATES', 'const ETHOGRAM_STATES')
    .replace('export const ETHOGRAM_MARKERS', 'const ETHOGRAM_MARKERS')
    .replace('export class EthogramHistory', 'class EthogramHistory')
    .replace('export class EthogramView', 'class EthogramView')}\nObject.assign(globalThis, {ETHOGRAM_STATES, ETHOGRAM_MARKERS, EthogramHistory, EthogramView});\n})();`;
}

const [rawHtml, css, rendererSource, ethogramSource, room] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'src', 'styles.css'), 'utf8'),
  readFile(resolve(root, 'src', 'ui', 'renderer.js'), 'utf8'),
  readFile(resolve(root, 'src', 'ui', 'ethogram.js'), 'utf8'),
  readFile(resolve(root, 'public', 'rooms', 'default.json'), 'utf8').then(JSON.parse),
]);
const html = rawHtml
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace(/<link rel="stylesheet"[^>]*>/, `<style>${css}</style>`)
  .replace(/<script type="module"[^>]*><\/script>/, '');

const setupSource = `(() => {
  const $ = (id) => document.getElementById(id);
  const room = ${JSON.stringify(room)};
  const wave = (length, fn) => Array.from({length}, (_, index) => fn(index, index / Math.max(1, length - 1)));
  const retina = {
    brightness: wave(64, (i, t) => .18 + .48 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 - .45)), 2) + .34 * Math.exp(-Math.pow((i - 18) / 7, 2))),
    proximity: wave(64, (i) => .06 + .5 * Math.exp(-Math.pow((i - 15) / 5, 2)) + .22 * Math.exp(-Math.pow((i - 49) / 8, 2))),
    motion: wave(64, (i) => .04 + .38 * Math.exp(-Math.pow((i - 20) / 5, 2))),
    loom: wave(64, (i) => .04 + .27 * Math.exp(-Math.pow((i - 49) / 4, 2))),
  };
  const trail = wave(78, (i, t) => ({x: 39 + t * 20, y: 48 + Math.sin(t * Math.PI * 3.2) * 4.2 - t * 6.3}));
  const snapshot = {
    time: 24.8,
    room,
    runtime: {running: true, achievedSpeed: 1.00},
    fly: {x: 58.2, y: 42.0, heading: -.17, radius: 1, speed: 2.25, alive: true},
    behavior: {state:'walk', reason:'identified leg-motor traction with mild right-biased DNa steering', coordinationDrive:.58, legs:[{id:'LF',phase:.4,stance:false,load:.04,lift:.8,contact:0,footX:1.8,footY:-1.4},{id:'LM',phase:3.6,stance:true,load:.64,lift:.08,contact:0,footX:.1,footY:-1.7},{id:'LH',phase:.5,stance:false,load:.05,lift:.76,contact:0,footX:-1.5,footY:-1.4},{id:'RF',phase:3.5,stance:true,load:.66,lift:.06,contact:0,footX:1.5,footY:1.5},{id:'RM',phase:.45,stance:false,load:.05,lift:.78,contact:0,footX:.0,footY:1.7},{id:'RH',phase:3.65,stance:true,load:.63,lift:.07,contact:0,footX:-1.6,footY:1.4}]},
    physiology: {energy: .73, hydration: .61, fatigue: .24, stress: .17, hunger: .43, thirst: .39},
    senses: {
      odorLeft: [.42, .09, .035], odorRight: [.18, .06, .05],
      touch: [0, .03, 0, 0], taste: [.02, 0, 0], light: .52, airflow: .13,
      guidance: {kind: 'food', angle: -.48, confidence: .44},
      bodySpeed: 2.25,
    },
    retina,
    brain: {coordinationDrive:.58, locomotorDrive:.66, legs:[.69,.64,.67,.66,.63,.65], dna02Left:.12, dna02Right:.31, dna01Left:.18, dna01Right:.25, dng13Left:.08, dng13Right:.14, reverse:.08, feed:.19, conflict:.06},
    memory: {
      estimatedPose: {x: 14.2, y: -4.7, heading: -.23}, drift: .16,
      guidance: {kind: 'food', angle: -.48, confidence: .44},
      encounter: {kind: 'food', confidence: .58},
      food: [{kind:'food', x:22, y:-8, strength:.72, visits:2}, {kind:'food', x:3, y:11, strength:.34, visits:1}],
      water: [{kind:'water', x:-13, y:3, strength:.48, visits:1}],
      threats: [{kind:'threat', x:6, y:-18, strength:.31, visits:1}],
    },
    trail,
    events: [{time:24.1, type:'observer', message:'food volatile weakened on the right antenna'}],
  };
  const brain = {
    populationRate: 8.42,
    activityHistory: wave(70, (i, t) => 5.3 + Math.sin(t * Math.PI * 7.1) * 1.6 + Math.sin(t * Math.PI * 2.4) * .75),
    stats: {spikes: 924, simulatedMs: 24800},
  };
  const groups = [
    ['Other / unmapped', 76], ['Visual afferents', 980], ['Olfactory afferents', 430],
    ['Body senses', 360], ['Interoceptive / endocrine', 230], ['Memory-guidance mapping', 310],
    ['Central network', 1940], ['Descending output', 420], ['Motor / feeding output', 190],
  ].map(([label, count], id) => ({id, label, count, key: label.toLowerCase().replace(/[^a-z]+/g, '-')}));
  const groupByNeuron = new Uint8Array(4200);
  for (let index = 0; index < groupByNeuron.length; index++) {
    const roll = (index * 1103515245 + 12345) >>> 0;
    groupByNeuron[index] = roll % 100 < 39 ? 6 : roll % 100 < 59 ? 1 : roll % 100 < 72 ? 2 : roll % 100 < 80 ? 3 : roll % 100 < 85 ? 5 : roll % 100 < 90 ? 7 : roll % 100 < 94 ? 8 : roll % 100 < 97 ? 4 : 0;
  }
  const atlas = {groups, groupByNeuron, provenance: 'Existing population mappings; diagrammatic display placement.'};
  const sampleSpikes = [];
  for (let i = 0; i < 346; i++) sampleSpikes.push((i * 83 + (i % 13) * 17) % groupByNeuron.length);

  $('loadingOverlay').hidden = true;
  for (const id of ['playButton','stepButton','speedSelect','modeSelect','saveFlyButton','restoreFlyButton']) $(id).disabled = false;
  $('playIcon').textContent = 'Ⅱ';
  $('playButton').setAttribute('aria-label', 'Pause');
  $('clock').textContent = '00:24.8';
  $('statusText').textContent = 'Running';
  $('statusDot').className = 'status-dot ready';
  $('datasetBadge').textContent = 'DEMO GRAPH';
  $('actualSpeedBadge').textContent = '1.00×';
  $('individualName').textContent = 'fly-7ac12fe9';
  $('modeSummary').textContent = 'Natural · BANC whole CNS · direct six-leg effector loop';
  $('behaviorDuration').textContent = 'for 2.8 s';
  $('behaviorLabel').textContent = 'walking';
  $('behaviorReason').textContent = snapshot.behavior.reason;
  $('latestEvent').hidden = false;
  $('latestEvent').querySelector('span').textContent = 'SENSORY';
  $('latestEvent').querySelector('b').textContent = 'food volatile weakened on the right antenna';
  $('brainRateValue').textContent = '8.42 Hz';
  $('brainSpikeValue').textContent = '346 firing indices sampled from the latest frame';
  $('energyBar').style.width = '73%'; $('energyValue').textContent = '73%';
  $('hydrationBar').style.width = '61%'; $('hydrationValue').textContent = '61%';
  $('memoryValue').textContent = '3 traces'; $('memoryCue').textContent = 'food recall · 44%';
  $('interpretationTitle').textContent = 'Walking under changing odor evidence.';
  $('interpretationText').textContent = 'Mapped leg-motor pools are producing stance traction. Food-odor evidence has weakened on the right antenna; any effect must propagate through neural populations before the six-leg body changes.';
  const meterValues = {energy:.73,hydration:.61,hunger:.43,thirst:.39,fatigue:.24,stress:.17};
  for (const [key, value] of Object.entries(meterValues)) { const bar=$(key+'Bar'), out=$(key+'Value'); if(bar)bar.style.width=(value*100)+'%'; if(out)out.textContent=Math.round(value*100)+'%'; }
  $('retinaHeading').textContent = '64 angular samples · brightness, motion, proximity and looming';
  $('antennaHeading').textContent = 'bilateral chemical evidence';
  $('bodySenseHeading').textContent = 'contact, taste, light and self-motion';
  $('foodOdorLeft').style.width='42%'; $('foodOdorRight').style.width='18%'; $('foodOdorText').textContent='left 0.42 · right 0.18';
  $('waterOdorLeft').style.width='9%'; $('waterOdorRight').style.width='6%'; $('waterOdorText').textContent='left 0.09 · right 0.06';
  $('threatOdorLeft').style.width='4%'; $('threatOdorRight').style.width='5%'; $('threatOdorText').textContent='left 0.04 · right 0.05';
  $('visionSummary').textContent='localized brightness with low motion and one mild looming cue';
  $('touchValue').textContent='quiet'; $('tasteValue').textContent='trace food contact'; $('lightValue').textContent='52%'; $('bodySpeedValue').textContent='2.25 mm/s';
  $('encounterTraceValue').textContent='food · 58%'; $('activeRecallValue').textContent='food · 44%'; $('memoryDrift').textContent='16%';
  $('memoryList').innerHTML = '<article class="memory-item"><i style="--memory-color:#e3bf72"></i><div><strong>Food trace</strong><small>72% strength · 2 encounters</small></div></article><article class="memory-item"><i style="--memory-color:#68bde8"></i><div><strong>Water trace</strong><small>48% strength · 1 encounter</small></div></article><article class="memory-item"><i style="--memory-color:#ff746d"></i><div><strong>Threat trace</strong><small>31% strength · 1 encounter</small></div></article>';
  $('brainScaleLabel').textContent = '8.42 Hz'; $('neuronCount').textContent='4,200'; $('edgeCount').textContent='fixture display';
  $('outputBars').innerHTML = [['coordination',.58],['left leg traction',.67],['right leg traction',.65],['DNa02 left',.12],['DNa02 right',.31],['feeding',.19],['conflict',.06]].map(([name,value])=>'<div class="output-row"><span>'+name+'</span><i><b style="width:'+Math.round(value*100)+'%"></b></i><output>'+value.toFixed(2)+'</output></div>').join('');
  $('neuralAtlasLabel').textContent='Group placement is diagrammatic and display-only. Membership comes from the graph parser’s existing population mappings.';
  $('neuralGroupList').innerHTML = groups.slice(1).map((group, index)=>'<div class="neural-group-row"><i style="--group-color:'+${JSON.stringify(['#71809f', '#76d9ef', '#50d7c8', '#88b8ff', '#f0b977', '#c69cff', '#9b8cff', '#ff9f78', '#e3bf72'])}[group.id]+'"></i><span><strong>'+group.label+'</strong><small>'+group.count.toLocaleString()+' mapped neurons</small></span><b><i style="width:'+Math.min(100, 12+index*10)+'%"></i></b><output>—</output></div>').join('');
  $('neuralFrameSampleCount').textContent='346 sampled spikes'; $('neuralFrameTime').textContent='924 total spikes · 24.80 s neural time';

  const renderer = new LabRenderer({
    worldCanvas:$('worldCanvas'), umweltCanvas:$('umweltCanvas'), retinaChart:$('retinaChart'), activityChart:$('activityChart'), memoryCanvas:$('memoryCanvas'), stripActivityCanvas:$('stripActivityCanvas'), umweltDetailCanvas:$('umweltDetailCanvas'), neuralFieldCanvas:$('neuralFieldCanvas'),
    overlayElements:[document.querySelector('.living-strip'),$('inspector'),$('editorBar'),$('objectInspector')],
  });
  renderer.setRoom(room); renderer.setNeuralAtlas(atlas); renderer.updateWorld(snapshot); renderer.updateBrain(brain, sampleSpikes);
  renderer.camera.centerX=renderer.cameraTarget.centerX=snapshot.fly.x; renderer.camera.centerY=renderer.cameraTarget.centerY=snapshot.fly.y; renderer.camera.scale=renderer.cameraTarget.scale=renderer.followScale();
  renderer.drawWorld(performance.now());

  const ethogram = new EthogramView({canvas:$('ethogramCanvas'),legend:$('historyLegend'),detail:$('historyDetail'),recentList:$('historyRecentList'),windowSeconds:60});
  const schedule = [
    [0,'rest','quiet pause'],[4.2,'walk','walking bout under changing odor evidence'],[10.7,'walk','brief DNa-biased steering within the leg loop'],[12.4,'walk','continued neural-effector walking'],[14.5,'rest','brief pause'],[16.0,'walk','walking bout under changing odor evidence'],[18.4,'reverse','tactile escape reversal'],[20.2,'walk','walking bout under changing odor evidence'],[22.0,'feed','feeding evidence sustained'],[23.8,'walk','walking bout under changing odor evidence'],
  ];
  for (let t=0; t<=24.8; t+=.2) {
    const entry=[...schedule].reverse().find(([start])=>t>=start) || schedule[0];
    const s=structuredClone(snapshot); s.time=t; s.behavior={state:entry[1],reason:entry[2]}; s.events=[];
    s.senses.touch=t>18.3&&t<18.8?[.65,0,0,0]:[0,0,0,0];
    s.senses.taste=t>22&&t<22.5?[.72,0,0]:[0,0,0];
    s.senses.guidance.confidence=t>12?.32:0;
    s.retina.loom=s.retina.loom.map((value)=>t>10.5&&t<11?Math.min(1,value+.45):value*.2);
    if(Math.abs(t-8.2)<.11)s.events=[{time:t,type:'observer',message:'food odor rose on the left antenna'}];
    ethogram.record(s);
  }
  ethogram.select(ethogram.history.segments.at(-1));

  function switchTab(name) {
    for (const button of document.querySelectorAll('.inspector-tab')) { const active=button.dataset.tab===name; button.classList.toggle('active',active); button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1; }
    for (const panel of document.querySelectorAll('.inspector-panel')) { const active=panel.dataset.panel===name; panel.classList.toggle('active',active); panel.hidden=!active; }
    if(name==='umwelt'){renderer.drawUmweltDetail();renderer.drawRetina();}
    if(name==='neural')renderer.drawNeuralField(performance.now());
    if(name==='history')ethogram.redraw();
    if(name==='memory')renderer.drawMemory();
    if(name==='brain')renderer.drawActivity();
  }
  function setInspector(open, tab='now') {
    $('inspector').classList.toggle('open',open); $('inspector').setAttribute('aria-hidden',String(!open)); $('inspector').inert=!open;
    $('inspectorButton').setAttribute('aria-pressed',String(open)); document.body.classList.toggle('inspector-open',open); if(open)switchTab(tab); renderer.refreshLayout();
  }
  function setView(view) {
    renderer.setView(view); const umwelt=view==='umwelt'; $('worldViewButton').classList.toggle('active',!umwelt); $('worldViewButton').setAttribute('aria-pressed',String(!umwelt)); $('umweltViewButton').classList.toggle('active',umwelt); $('umweltViewButton').setAttribute('aria-pressed',String(umwelt)); $('cameraControls').hidden=umwelt; $('viewContext').querySelector('span').textContent=view.toUpperCase(); $('viewContext').querySelector('b').textContent=umwelt?'fly-relative sensory evidence':'following the fly'; document.body.classList.toggle('view-umwelt',umwelt); renderer.refreshLayout();
  }
  function setEditing(open) {
    setInspector(false); setView('world'); document.body.classList.toggle('editing-room',open); $('editorBar').hidden=!open; $('editButton').textContent=open?'Finish editing':'Edit room'; $('editButton').setAttribute('aria-pressed',String(open)); renderer.setEditing(open); if(open){renderer.setCameraMode('overview');renderer.setSelection('wall-a');$('objectInspector').hidden=false;$('objectTitle').textContent='Wall';$('objectFields').innerHTML='<label><span>X position</span><input value="17.00"></label><label><span>Y position</span><input value="17.00"></label><label><span>Width</span><input value="23.00"></label><label><span>Height</span><input value="4.00"></label>';}else{$('objectInspector').hidden=true;renderer.setSelection(null);renderer.setCameraMode('follow');} renderer.refreshLayout();
  }
  async function settle() { renderer.refreshLayout(); ethogram.redraw(); await new Promise(r=>setTimeout(r,420)); renderer.drawWorld(performance.now()); renderer.drawUmweltDetail(); renderer.drawNeuralField(performance.now()); ethogram.redraw(); }
  Object.assign(globalThis,{__preview:{renderer,ethogram,snapshot,room,setInspector,switchTab,setView,setEditing,settle}});
})();`;

await removeProfile();
await mkdir(outputDir, {recursive: true});
const chromium = spawn(chromiumPath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-timer-throttling', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
let chromeError = '';
chromium.stderr.on('data', (chunk) => { chromeError += chunk; });
let cdp;
const diagnostics = [];
try {
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).ok; } catch { return false; }
  });
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find((candidate) => candidate.type === 'page');
  if (!target) throw new Error('No Chromium page target');
  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  cdp.on('Runtime.exceptionThrown', (params) => diagnostics.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'runtime exception'));
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (['error','warning'].includes(params.type)) diagnostics.push(`console.${params.type}: ${(params.args || []).map((arg) => arg.value || arg.description || '').join(' ')}`);
  });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const frameTree = await cdp.send('Page.getFrameTree');
  await cdp.send('Page.setDocumentContent', {frameId: frameTree.frameTree.frame.id, html});
  for (const source of [exposeRenderer(rendererSource), exposeEthogram(ethogramSource), setupSource]) {
    const result = await cdp.send('Runtime.evaluate', {expression: source, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }

  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function viewport(width, height, scale = 1) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
    await evaluate('__preview.settle()');
  }
  async function screenshot(name) {
    await sleep(160);
    const image = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false, fromSurface: true});
    await writeFile(resolve(outputDir, name), Buffer.from(image.data, 'base64'));
    console.log(`wrote docs/previews/${name}`);
  }

  await viewport(1600, 1000);
  await evaluate("__preview.setEditing(false);__preview.setInspector(false);__preview.setView('world');__preview.renderer.setCameraMode('follow');__preview.settle()");
  await screenshot('desktop-world.png');

  await evaluate("__preview.setInspector(false);__preview.setView('umwelt');__preview.settle()");
  await screenshot('desktop-umwelt.png');

  await evaluate("__preview.setView('world');__preview.setInspector(true,'neural');__preview.settle()");
  await screenshot('desktop-neural.png');

  await evaluate("__preview.setInspector(true,'brain');__preview.settle()");
  await screenshot('desktop-cns.png');

  await evaluate("__preview.setInspector(true,'history');__preview.settle()");
  await screenshot('desktop-history.png');

  await viewport(720, 900);
  await evaluate("__preview.setInspector(false);__preview.setView('world');__preview.renderer.setCameraMode('follow');__preview.settle()");
  await screenshot('narrow-world.png');

  await viewport(1920, 1080);
  await evaluate("__preview.setEditing(true);__preview.settle()");
  await screenshot('wide-edit.png');

  const report = await evaluate(`(() => {
    const targetSelectors=['#playButton','#stepButton','#cameraZoomOutButton','#cameraZoomInButton','#editButton','#inspectorButton','.inspector-tab'];
    const tooSmall=[];
    for(const selector of targetSelectors)for(const element of document.querySelectorAll(selector)){const r=element.getBoundingClientRect();if(r.width<24||r.height<24)tooSmall.push({selector,id:element.id,w:r.width,h:r.height});}
    const body=getComputedStyle(document.body); const labels=[...document.querySelectorAll('.eyebrow,.control-field>span,.readout-heading>span,.behavior-kicker')].map(el=>parseFloat(getComputedStyle(el).fontSize));
    return {bodyFont:parseFloat(body.fontSize),minLabel:Math.min(...labels),canvasFrames:__preview.renderer.frameCount,historySegments:__preview.ethogram.history.segments.length,historyMarkers:__preview.ethogram.history.markers.length,tooSmall,scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,innerWidth,innerHeight}};
  })()`);
  if (diagnostics.length) throw new Error(`Browser diagnostics:\n${diagnostics.join('\n')}`);
  if (report.bodyFont < 13 || report.minLabel < 11 || report.canvasFrames < 2 || report.historySegments < 5 || report.tooSmall.length) throw new Error(`Visual preview assertion failed: ${JSON.stringify(report)}`);
  await writeFile(resolve(outputDir, 'visual-preview-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`visual preview passed: ${report.canvasFrames} canvas frames, ${report.historySegments} ethogram segments, body ${report.bodyFont}px`);
} catch (error) {
  throw new Error(`${error.message}\nChromium: ${chromeError.slice(-2400)}`);
} finally {
  try { await cdp?.send('Browser.close'); } catch {}
  cdp?.close();
  await stopBrowserProcess(chromium);
  await removeProfile();
}
process.exit(0);
