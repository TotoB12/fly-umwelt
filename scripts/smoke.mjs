import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {writeFile, rm, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {findChromiumExecutable, stopBrowserProcess} from './browser-path.mjs';

const root = resolve(import.meta.dirname, '..');
const debugPort = 9337;
const webPort = 4287;
const profile = resolve('/tmp', 'fly-umwelt-smoke-profile');
const strict = process.env.SMOKE_STRICT === '1' || process.argv.includes('--strict');
const windowSize = process.env.SMOKE_WINDOW || '1440,940';
const screenshotName = process.env.SMOKE_SCREENSHOT || 'fly-umwelt-screenshot.png';
const chromiumPath = findChromiumExecutable();
const articulated = process.argv.includes('--articulated');
const musculoskeletal = process.argv.includes('--musculoskeletal');

async function managedBrowserBlocksEveryUrl() {
  const policyFiles = [
    '/etc/chromium/policies/managed/000_policy_merge.json',
    '/etc/opt/chrome/policies/managed/000_policy_merge.json',
  ];
  for (const file of policyFiles) {
    try {
      const policy = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(policy.URLBlocklist) && policy.URLBlocklist.includes('*')) return true;
    } catch {
      // No readable policy at this path.
    }
  }
  return false;
}

if (await managedBrowserBlocksEveryUrl()) {
  const message = 'managed Chromium policy URLBlocklist=["*"] blocks local pages in this environment';
  if (strict) throw new Error(`browser smoke unavailable: ${message}`);
  console.warn(`browser smoke skipped: ${message}`);
  process.exit(0);
}

if (!chromiumPath) {
  const message = 'no Chromium-family browser found; set CHROMIUM_BIN to run the browser smoke check';
  if (strict) throw new Error(`browser smoke unavailable: ${message}`);
  console.warn(`browser smoke skipped: ${message}`);
  process.exit(0);
}

async function removeProfile() {
  for (let attempt=0; attempt<12; attempt++) {
    try { await rm(profile, {recursive:true, force:true, maxRetries:3, retryDelay:80}); return; }
    catch (error) { if (attempt===11) throw error; await sleep(100); }
  }
}
await removeProfile();
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: root,
  env: {...process.env, PORT: String(webPort), HOST: '127.0.0.1', SERVE_DIST: '1'},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const chromium = spawn(chromiumPath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  `--window-size=${windowSize}`,
  'about:blank',
], {stdio: ['ignore', 'pipe', 'pipe']});
let chromeErr = '';
chromium.stderr.on('data', (d) => { chromeErr += d; });

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
    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, {resolve: resolveCall, reject: rejectCall});
    });
  }

  close() {
    this.ws?.close();
  }
}

async function waitFor(fn, limit = 15000) {
  const end = Date.now() + limit;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`timeout; last=${JSON.stringify(last)}`);
}

let cdp;
const diagnostics = [];
try {
  await waitFor(() => serverLog.includes('http://'), 5000);
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return response.ok;
    } catch {
      return false;
    }
  }, 8000);

  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find((candidate) => candidate.type === 'page');
  if (!target) throw new Error('No Chromium page target');

  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  cdp.on('Runtime.exceptionThrown', (params) => {
    diagnostics.push(`exception: ${params.exceptionDetails?.text} ${params.exceptionDetails?.exception?.description ?? ''}`);
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    diagnostics.push(`console.${params.type}: ${(params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ')}`);
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  const pageArg=process.argv.find((arg)=>arg.startsWith('--page='));
  const path = process.env.SMOKE_PAGE || pageArg?.slice('--page='.length) || '/?fixture=1&smoke=1';
  const page = `http://127.0.0.1:${webPort}${path}`;
  await cdp.send('Page.navigate', {url: page});
  await waitFor(async () => {
    const result = await cdp.send('Runtime.evaluate', {expression: 'document.readyState', returnByValue: true});
    return result.result.value === 'complete';
  }, 8000);

  const result = await waitFor(async () => {
    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: '({status:document.documentElement.dataset.smoke||"",detail:document.documentElement.dataset.smokeDetail||"",ready:!!globalThis.__flyCnsLab?.brainReady,link:!!globalThis.__flyCnsLab?.linkReady,href:location.href,loader:document.getElementById("loaderMessage")?.textContent||""})',
      returnByValue: true,
    });
    const value = evaluation.result.value;
    if (value.status === 'failed') throw new Error(`probe: ${value.detail}`);
    return value.status === 'passed' ? value : false;
  }, 30000);

  let articulatedResult=null;
  if(articulated){
    const evaluation=await cdp.send('Runtime.evaluate',{
      expression:`(async()=>{
        const room=await fetch('/rooms/default.json').then(response=>response.json());
        return new Promise((resolve,reject)=>{
        const worker=new Worker('/src/workers/world.worker.js',{type:'module'});
        const channel=new MessageChannel();
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('articulated worker qualification timed out'));},30000);
        worker.onmessage=event=>{
          if(event.data?.type==='articulated-body-ready'){
            clearTimeout(timeout);const value=event.data;worker.postMessage({type:'articulated-body-dispose'});worker.terminate();resolve(value);
          }else if(event.data?.type==='articulated-body-error'){
            clearTimeout(timeout);worker.terminate();reject(new Error(event.data.message));
          }
        };
        worker.onerror=event=>{clearTimeout(timeout);worker.terminate();reject(new Error(event.message||'articulated worker failed'));};
        worker.postMessage({type:'init',room,seed:1,mode:'evoked',port:channel.port1},[channel.port1]);
        worker.postMessage({type:'articulated-body-qualification',token:'browser-smoke'});
        });
      })()`,
      awaitPromise:true,returnByValue:true,
    });
    if(evaluation.exceptionDetails)throw new Error(evaluation.exceptionDetails.exception?.description||evaluation.exceptionDetails.text);
    articulatedResult=evaluation.result.value;
    if(articulatedResult?.contract?.bodies!==70||articulatedResult?.contract?.actuators!==42||articulatedResult?.contract?.contactSensors!==6||articulatedResult?.contract?.roomPhysics!==true||articulatedResult?.contract?.roomColliders!==7)throw new Error(`articulated browser contract mismatch: ${JSON.stringify(articulatedResult)}`);
  }

  let musculoskeletalResult=null;
  if(musculoskeletal){
    const evaluation=await cdp.send('Runtime.evaluate',{
      expression:`(async()=>new Promise((resolve,reject)=>{
        const worker=new Worker('/src/workers/world.worker.js',{type:'module'});
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('musculoskeletal worker qualification timed out'));},30000);
        worker.onmessage=event=>{
          if(event.data?.type==='musculoskeletal-body-ready'){
            clearTimeout(timeout);const value=event.data;worker.postMessage({type:'musculoskeletal-body-dispose'});worker.terminate();resolve(value);
          }else if(event.data?.type==='musculoskeletal-body-error'){
            clearTimeout(timeout);worker.terminate();reject(new Error(event.data.message));
          }
        };
        worker.onerror=event=>{clearTimeout(timeout);worker.terminate();reject(new Error(event.message||'musculoskeletal worker failed'));};
        worker.postMessage({type:'musculoskeletal-body-qualification',token:'browser-smoke'});
      }))()`,
      awaitPromise:true,returnByValue:true,
    });
    if(evaluation.exceptionDetails)throw new Error(evaluation.exceptionDetails.exception?.description||evaluation.exceptionDetails.text);
    musculoskeletalResult=evaluation.result.value;
    const contract=musculoskeletalResult?.contract;
    if(contract?.profile!=='zero-safe'||contract?.derivedXmlSha256!=='47b766ebce3cf507d5b0fbe1cc6c2a81ef234bebf58f475e81a957afd707678e'||contract?.bodies!==73||contract?.muscleActuators!==15||contract?.activationStates!==15||contract?.spatialTendons!==15||contract?.meshes!==71||contract?.equalityConstraints!==7||contract?.sensors!==0||contract?.minimumExcitation!==0||contract?.anchoredRoot!==true)throw new Error(`musculoskeletal browser contract mismatch: ${JSON.stringify(musculoskeletalResult)}`);
    if(!musculoskeletalResult.neutral?.requestedZeroApplied?.every(value=>value===0)||!musculoskeletalResult.neutral?.activation?.every(value=>value===0)||!musculoskeletalResult.neutral?.nonzeroPassiveMuscles?.length||musculoskeletalResult.sourceBoundary?.minimumExcitation!==.0001||musculoskeletalResult.sourceBoundary?.zeroNeuralEvidenceRule!==false||musculoskeletalResult.neuralBridge?.automaticControlEnabled!==false)throw new Error(`musculoskeletal browser zero/passive boundary mismatch: ${JSON.stringify(musculoskeletalResult)}`);
  }

  await sleep(3400);
  const shot = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  await writeFile(resolve(root, 'docs', screenshotName), Buffer.from(shot.data, 'base64'));
  console.log(`browser smoke passed: ${result.detail}`);
  if(articulatedResult)console.log(`articulated browser worker passed: ${articulatedResult.contract.bodies} bodies, ${articulatedResult.contract.actuators} actuators, ${articulatedResult.contract.contactSensors} contact sensors, ${articulatedResult.contract.roomColliders} room colliders`);
  if(musculoskeletalResult)console.log(`musculoskeletal zero-safe browser worker passed: ${musculoskeletalResult.contract.bodies} bodies, ${musculoskeletalResult.contract.muscleActuators} Hill muscles, exact zero control; neural bridge remains disabled`);
} catch (error) {
  let state = '';
  try {
    const response = await cdp?.send('Runtime.evaluate', {
      expression: 'JSON.stringify({href:location.href,status:document.documentElement.dataset.smoke,detail:document.documentElement.dataset.smokeDetail,body:document.body?.innerText?.slice(0,1200),app:globalThis.__flyCnsLab?{brainReady:__flyCnsLab.brainReady,linkReady:__flyCnsLab.linkReady,world:!!__flyCnsLab.worldSnapshot}:null})',
      returnByValue: true,
    });
    state = response?.result?.value ?? '';
  } catch {
    // The browser may already have terminated.
  }

  const detail = `${error.message}\nstate=${state}\ndiagnostics=${diagnostics.join('\n')}\nchromium=${chromeErr.slice(-2000)}`;
  const managedPolicy = /organization.{0,80}(allow|block)|ERR_BLOCKED_BY_ADMINISTRATOR|chrome-error:\/\/chromewebdata/i.test(detail);
  if (managedPolicy && !strict) {
    console.warn('browser smoke skipped: managed Chromium policy blocks all local pages in this environment');
  } else {
    throw new Error(detail);
  }
} finally {
  try {
    await cdp?.send('Browser.close');
  } catch {
    // Ignore teardown errors.
  }
  cdp?.close();
  server.kill('SIGTERM');
  await stopBrowserProcess(chromium);
  await Promise.race([
    new Promise(resolveExit=>server.once('exit',resolveExit)),
    sleep(1600),
  ]).catch(()=>{});
  await removeProfile();
}
