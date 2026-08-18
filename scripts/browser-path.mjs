import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join} from 'node:path';

// Headless checks are useful on contributor machines as well as Linux CI.
// Prefer an explicit executable, then look only in standard install paths.
export function findChromiumExecutable(explicit = process.env.CHROMIUM_BIN || process.env.BROWSER_BIN) {
  const candidates = [explicit];
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || process.env.PROGRAMFILES;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env.LOCALAPPDATA;
    for (const root of [programFiles, programFilesX86, localAppData].filter(Boolean)) {
      candidates.push(
        join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/ungoogled-chromium', '/usr/bin/microsoft-edge');
  }
  return [...new Set(candidates.filter(Boolean))].find((path) => existsSync(path)) || null;
}

// Chromium-based browsers are multiprocess. On Windows, killing only the
// launcher can leave renderer and Crashpad children running after a test.
export async function stopBrowserProcess(browser) {
  if (!browser?.pid || browser.exitCode !== null) return;
  const exited = new Promise((resolveExit) => {
    browser.once('exit', resolveExit);
    browser.once('error', resolveExit);
  });
  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
    await Promise.race([
      exited,
      new Promise((resolveExit) => { taskkill.once('exit', resolveExit); taskkill.once('error', resolveExit); }),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1800)),
    ]);
  } else {
    browser.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1800))]);
  }
}
