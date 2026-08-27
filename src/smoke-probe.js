const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wait = (fn, ms = 15000, label = 'condition') => new Promise((resolve, reject) => {
  const end = performance.now() + ms;
  const tick = () => {
    try { const value = fn(); if (value) return resolve(value); } catch {}
    if (performance.now() > end) return reject(new Error(`timeout: ${label}`));
    setTimeout(tick, 45);
  };
  tick();
});
const mark = (status, detail) => {
  document.documentElement.dataset.smoke = status;
  document.documentElement.dataset.smokeDetail = detail;
};
const click = (id) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  node.click();
};
const select = (id, value) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  node.value = value;
  node.dispatchEvent(new Event('change', {bubbles: true}));
};
const stageRect = () => {
  const rect = document.getElementById('stage').getBoundingClientRect();
  return {x: rect.x, y: rect.y, w: rect.width, h: rect.height};
};
const sameRect = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 && Math.abs(a.w - b.w) < 2 && Math.abs(a.h - b.h) < 2;
const pointer = (canvas, type, clientX, clientY, pointerId = 91, pointerType = 'mouse') => canvas.dispatchEvent(new PointerEvent(type, {
  pointerId, pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, clientX, clientY,
}));

(async () => {
  try {
    const app = await wait(() => globalThis.__flyCnsLab?.brainReady && globalThis.__flyCnsLab?.linkReady && globalThis.__flyCnsLab?.worldSnapshot && globalThis.__flyCnsLab, 30000, 'workers ready');
    if (document.querySelectorAll('#modeSelect option').length !== 3) throw new Error('three brain modes are not visible');
    if (document.querySelectorAll('#computeBackendSelect option').length !== 3) throw new Error('three neural compute engines are not visible');
    if (document.querySelectorAll('#neuralResolutionSelect option').length !== 5) throw new Error('five temporal-resolution choices are not visible');
    if (document.querySelectorAll('#connectomeSelect option').length !== 2) throw new Error('two bundled connectome choices are not visible');
    if (document.querySelectorAll('#graphTierSelect option').length !== 4) throw new Error('four structural graph tiers are not visible');
    if (!Array.isArray(app.worldSnapshot?.brain?.legs) || app.worldSnapshot.brain.legs.length !== 6) throw new Error('six leg-effector channels are not present');
    if (document.querySelectorAll('.inspector-tab').length !== 6) throw new Error('six observation views are not visible');
    if (app.renderer.getCameraState().mode !== 'follow') throw new Error('camera did not start in follow mode');
    if (document.getElementById('inspector').classList.contains('open')) throw new Error('observer should start closed');

    click('inspectorButton');
    await wait(() => document.getElementById('inspector').classList.contains('open'), 2000, 'open observer');
    const baseRect = stageRect();
    for (const tab of ['now', 'umwelt', 'neural', 'history', 'memory', 'brain']) {
      document.querySelector(`[data-tab="${tab}"]`).click();
      await sleep(90);
      if (!sameRect(baseRect, stageRect())) throw new Error(`${tab} tab moved the chamber`);
      if (document.getElementById(`panel-${tab}`).hidden) throw new Error(`${tab} panel did not activate`);
    }
    document.querySelector('[data-tab="now"]').click();
    click('closeInspectorButton');
    await wait(() => !document.getElementById('inspector').classList.contains('open'), 2000, 'close observer');

    click('cameraOverviewButton');
    await wait(() => app.renderer.getCameraState().mode === 'overview', 2000, 'overview camera');
    click('cameraFollowButton');
    await wait(() => app.renderer.getCameraState().mode === 'follow', 2000, 'follow camera');

    const t0 = app.worldSnapshot.time;
    click('stepButton');
    await wait(() => app.worldSnapshot.time >= t0 + .04, 6000, 'single step');
    if (app.worldSnapshot.runtime.running) throw new Error('single step started playback');

    const start = {x: app.worldSnapshot.fly.x, y: app.worldSnapshot.fly.y};
    click('playButton');
    await wait(() => app.worldSnapshot.runtime.running, 4000, 'play');
    const frameStart = app.renderer.frameCount;
    const frameWall = performance.now();
    await sleep(1100);
    const measuredFps = (app.renderer.frameCount - frameStart) / ((performance.now() - frameWall) / 1000);
    await wait(() => Math.hypot(app.worldSnapshot.fly.x - start.x, app.worldSnapshot.fly.y - start.y) > .08 || app.worldSnapshot.time > t0 + .8, 7000, 'world advances');
    if (measuredFps < 15) throw new Error(`renderer too slow: ${measuredFps.toFixed(1)} FPS`);
    if (!app.ethogram.history.segments.length) throw new Error('ethogram did not record behavior');
    if (!app.brainInfo?.displayAtlas?.groupByNeuron?.length) throw new Error('neural display atlas is missing');

    click('playButton');
    await wait(() => !app.worldSnapshot.runtime.running, 4000, 'pause');
    const paused = app.worldSnapshot.time;
    await sleep(180);
    if (app.worldSnapshot.time > paused + .025) throw new Error('pause was not stable');

    const neuralBeforeComputeSwap = app.brainSnapshot?.simulatedMs ?? 0;
    select('computeBackendSelect', 'js');
    await wait(() => !app.pendingOperation && app.brainInfo?.compute?.resolved === 'js', 15000, 'JavaScript compute');
    select('neuralResolutionSelect', 'balanced');
    await wait(() => !app.pendingOperation && app.brainInfo?.compute?.resolved === 'js' && Math.abs((app.config?.brainDtMs ?? 0) - 2) < 1e-6, 15000, 'JavaScript balanced compute');
    if (!app.brainReady || !app.linkReady) throw new Error('neural link was lost during JavaScript compute swap');
    if (app.worldSnapshot.time > paused + .025) throw new Error('compute swap advanced the paused body');
    const neuralAfterJsSwap = app.brainSnapshot?.simulatedMs ?? 0;
    if (neuralAfterJsSwap + 1e-6 < neuralBeforeComputeSwap || neuralAfterJsSwap - neuralBeforeComputeSwap > 100) throw new Error('JavaScript compute swap did not preserve neural time');

    select('computeBackendSelect', 'wasm');
    await wait(() => !app.pendingOperation && app.brainInfo?.compute?.resolved === 'wasm', 15000, 'WebAssembly compute');
    select('neuralResolutionSelect', 'research');
    await wait(() => !app.pendingOperation && app.brainInfo?.compute?.resolved === 'wasm' && Math.abs((app.config?.brainDtMs ?? 0) - .5) < 1e-6, 15000, 'WebAssembly research compute');
    if (!app.brainReady || !app.linkReady) throw new Error('neural link was lost during WebAssembly compute swap');
    if (app.worldSnapshot.time > paused + .025) throw new Error('WebAssembly compute swap advanced the paused body');
    const neuralAfterWasmSwap = app.brainSnapshot?.simulatedMs ?? 0;
    if (neuralAfterWasmSwap + 1e-6 < neuralAfterJsSwap || neuralAfterWasmSwap - neuralAfterJsSwap > 100) throw new Error('WebAssembly compute swap did not preserve neural time');

    click('worldViewButton');
    click('editButton');
    if (!app.editing) throw new Error('edit mode did not open');
    if (app.renderer.getCameraState().mode !== 'overview') throw new Error('editing did not enter overview');
    const beforeCount = app.room.objects.length;
    const canvas = document.getElementById('worldCanvas');
    let rect = canvas.getBoundingClientRect();

    document.querySelector('[data-tool="pan"]').click();
    pointer(canvas, 'pointerdown', rect.left + rect.width * .53, rect.top + rect.height * .42, 71);
    pointer(canvas, 'pointermove', rect.left + rect.width * .59, rect.top + rect.height * .48, 71);
    pointer(canvas, 'pointerup', rect.left + rect.width * .59, rect.top + rect.height * .48, 71);
    click('cameraZoomInButton');
    await sleep(180);

    document.querySelector('[data-tool="wall"]').click();
    click('playButton');
    await wait(() => app.worldSnapshot.runtime.running, 4000, 'play during edit');
    const editTime = app.worldSnapshot.time;
    rect = canvas.getBoundingClientRect();
    const a = app.renderer.worldToScreen(app.room.width * .23, app.room.height * .23);
    const b = app.renderer.worldToScreen(app.room.width * .35, app.room.height * .31);
    pointer(canvas, 'pointerdown', rect.left + a.x, rect.top + a.y, 91);
    pointer(canvas, 'pointermove', rect.left + b.x, rect.top + b.y, 91);
    pointer(canvas, 'pointerup', rect.left + b.x, rect.top + b.y, 91);
    await wait(() => app.room.objects.length === beforeCount + 1, 5000, 'create wall through transformed camera');
    await wait(() => app.worldSnapshot.time > editTime + .2, 6000, 'time continues while editing');
    click('undoButton');
    await wait(() => app.room.objects.length === beforeCount, 4000, 'undo');
    click('redoButton');
    await wait(() => app.room.objects.length === beforeCount + 1, 4000, 'redo');
    click('editButton');
    if (app.editing) throw new Error('edit mode did not close');

    click('umweltViewButton');
    if (!document.getElementById('worldCanvas').hidden || document.getElementById('umweltCanvas').hidden) throw new Error('Umwelt view did not activate');
    click('worldViewButton');
    if (document.getElementById('worldCanvas').hidden) throw new Error('World view did not return');

    for (const mode of ['connectome', 'evoked', 'natural']) {
      select('modeSelect', mode);
      await wait(() => app.mode === mode && !app.pendingOperation && app.brainReady, 15000, `${mode} mode`);
    }
    click('touchFlyButton');
    click('airflowButton');
    click('lightCycleButton');
    await sleep(160);

    click('saveRoomButton');
    const savedName = app.room.name;
    app.replaceRoom({...app.room, name: 'temporary smoke room'});
    click('loadRoomButton');
    await wait(() => app.room.name === savedName, 4000, 'room save/load');

    if (app.worldSnapshot.runtime.running) click('playButton');
    await wait(() => !app.worldSnapshot.runtime.running, 4000, 'final pause');
    click('saveFlyButton');
    await wait(() => document.getElementById('toastRegion').textContent.includes('saved locally'), 10000, 'fly save');
    const savedTime = app.worldSnapshot.time;
    click('stepButton');
    await wait(() => app.worldSnapshot.time > savedTime, 6000, 'advance after save');
    click('restoreFlyButton');
    await wait(() => !app.pendingOperation && Math.abs(app.worldSnapshot.time - savedTime) < .08, 15000, 'fly restore');

    if (document.querySelector('.toast.error')) throw new Error(document.querySelector('.toast.error').textContent);
    if (document.getElementById('inspector').classList.contains('open')) click('closeInspectorButton');
    mark('passed', `render ${measuredFps.toFixed(1)} FPS; camera, six observation views, JS/WASM live compute continuity, sampled neural field, bounded ethogram, live transformed editor, modes, Umwelt and persistence`);
  } catch (error) {
    console.error(error);
    mark('failed', error.message);
  }
})();
