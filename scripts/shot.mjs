// Dev-only screenshot helper. Drives a headless Chromium/Edge over CDP and
// writes PNGs to /tmp so UI work can be inspected without a manual browser.
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {writeFile, rm, mkdir} from 'node:fs/promises';
import {findChromiumExecutable, stopBrowserProcess} from './browser-path.mjs';

const binary = findChromiumExecutable();
if (!binary) throw new Error('no Chromium-family browser found; set CHROMIUM_BIN to use this helper');

const debugPort = Number(process.env.SHOT_PORT || 9412);
const url = process.env.SHOT_URL || 'http://127.0.0.1:4173/';
const outDir = process.env.SHOT_OUT || '/tmp/fly-shots';
const size = (process.env.SHOT_SIZE || '1600,1000').split(',').map(Number);
const profile = `/tmp/fly-shot-profile-${debugPort}`;
// Each entry: [name, waitMs, script run before the capture]
const steps = JSON.parse(process.env.SHOT_STEPS || '[["ready", 2500, ""]]');

await rm(profile, {recursive: true, force: true});
await mkdir(outDir, {recursive: true});

const browser = spawn(binary, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-timer-throttling', '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  `--window-size=${size[0]},${size[1]}`, 'about:blank',
], {stdio: ['ignore', 'pipe', 'pipe']});
let browserErr = '';
browser.stderr.on('data', chunk => { browserErr += chunk; });

class CDP {
  constructor(endpoint) { this.endpoint = endpoint; this.id = 0; this.pending = new Map(); this.logs = []; }
  async open() {
    this.ws = new WebSocket(this.endpoint);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === 'Runtime.consoleAPICalled') {
        this.logs.push(`${message.params.type}: ${message.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.logs.push(`exception: ${message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text}`);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({id, method, params}));
    return new Promise((resolve, reject) => this.pending.set(id, {resolve, reject}));
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'eval failed');
    return result.result?.value;
  }
}

async function waitFor(fn, limit = 15000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { if (await fn()) return true; await sleep(120); }
  return false;
}

let cdp;
try {
  const up = await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; }
  }, 12000);
  if (!up) throw new Error(`devtools never came up: ${browserErr}`);

  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = targets.find(target => target.type === 'page');
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false});
  await cdp.send('Page.navigate', {url});
  await sleep(1200);

  for (const [name, waitMs, script] of steps) {
    if (script) await cdp.eval(script);
    await sleep(waitMs);
    const shot = await cdp.send('Page.captureScreenshot', {format: 'png'});
    await writeFile(`${outDir}/${name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`wrote ${outDir}/${name}.png`);
  }
  if (cdp.logs.length) console.log('--- console ---\n' + cdp.logs.slice(-40).join('\n'));
} finally {
  cdp?.ws?.close();
  await stopBrowserProcess(browser);
  await rm(profile, {recursive: true, force: true});
}
