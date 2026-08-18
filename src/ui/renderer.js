const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const CAMERA_MIN_ZOOM = .70;
const CAMERA_MAX_ZOOM = 8;
const wrapAngle = (value) => {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
const maximum = (values = []) => {
  let max = 0;
  for (const value of values || []) max = Math.max(max, Number(value) || 0);
  return max;
};
const sum = (values = []) => {
  let total = 0;
  for (const value of values || []) total += Number(value) || 0;
  return total;
};
const hash01 = (value) => {
  let x = (Number(value) || 0) | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
};
const COLORS = {
  bg: '#e4e3da', deep: '#d5d8cf', chamber: '#f2f3ed', chamber2: '#e8ece4',
  text: '#26332f', soft: '#46534e', muted: '#68746e', cyan: '#147b71', cyanBright: '#0b635c',
  violet: '#7668ad', food: '#b87e2b', water: '#2b82ad', threat: '#bd524a', amber: '#b96831',
};
const GROUP_COLORS = ['#72807a', '#3885a8', '#147b71', '#5b79b9', '#ba7b34', '#8b6cab', '#7668ad', '#b96831', '#b87e2b'];
const GROUP_LAYOUT = [
  [.50, .12], [.22, .27], [.78, .27], [.20, .58], [.80, .58], [.50, .36], [.50, .65], [.25, .84], [.75, .84],
];
const GROUP_CANVAS_LABELS = [
  'Unmapped', 'Visual', 'Olfactory', 'Body senses', 'Interoception',
  'Memory mapping', 'Central network', 'Descending', 'Feeding output',
];

function resizeCanvas(canvas, cap = 1.5, alpha = false) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(cap, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round((rect.width || 1) * ratio));
  const height = Math.max(1, Math.round((rect.height || 1) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d', {alpha, desynchronized: true});
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {ctx, width: rect.width || 1, height: rect.height || 1, ratio};
}

function pathRoundedRect(ctx, x, y, width, height, radius = 10) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
}

function drawLineSeries(ctx, values, width, height, {color, max = null, fill = null, baseline = height - 6, top = 6, lineWidth = 1.5} = {}) {
  if (!values?.length) return;
  const ceiling = max || Math.max(0.001, ...values.map((value) => Number(value) || 0));
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = i / Math.max(1, values.length - 1) * width;
    const y = baseline - clamp((Number(values[i]) || 0) / ceiling) * (baseline - top);
    if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  if (fill) {
    ctx.lineTo(width, baseline); ctx.lineTo(0, baseline); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = i / Math.max(1, values.length - 1) * width;
      const y = baseline - clamp((Number(values[i]) || 0) / ceiling) * (baseline - top);
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export class LabRenderer {
  constructor({
    worldCanvas, umweltCanvas, retinaChart, activityChart, memoryCanvas,
    stripActivityCanvas, umweltDetailCanvas, neuralFieldCanvas, overlayElements = [],
  }) {
    this.worldCanvas = worldCanvas;
    this.umweltCanvas = umweltCanvas;
    this.retinaChart = retinaChart;
    this.activityChart = activityChart;
    this.memoryCanvas = memoryCanvas;
    this.stripActivityCanvas = stripActivityCanvas;
    this.umweltDetailCanvas = umweltDetailCanvas;
    this.neuralFieldCanvas = neuralFieldCanvas;
    this.overlayElements = overlayElements.filter(Boolean);

    this.room = null;
    this.previous = null;
    this.current = null;
    this.receivedAt = performance.now();
    this.previousAt = this.receivedAt - 40;
    this.brain = null;
    this.sampleSpikes = [];
    this.view = 'world';
    this.selection = null;
    this.preview = null;
    this.editing = false;
    this.navigationEnabled = false;
    this.running = false;
    this.reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;

    this.camera = {mode: 'follow', centerX: 0, centerY: 0, scale: 1, zoom: 1};
    this.cameraTarget = {...this.camera};
    this.layoutDirty = true;
    this.lastFrameAt = performance.now();
    this.frameCount = 0;
    this.lastCameraNotice = '';
    this.pointerMap = new Map();
    this.gesture = null;
    this.cameraChangeCallback = null;
    this.navigationStartCallback = null;

    this.neuralAtlas = null;
    this.neuralParticles = new Map();
    this.neuralGroupCounts = [];
    this.neuralClock = 0;
    this.lastNeuralSummary = {sampleCount: 0, totalSpikes: 0, timeMs: 0, groups: []};
    this.dust = [];

    this.bindNavigation();
    this.resizeObserver = new ResizeObserver(() => this.refreshLayout());
    for (const canvas of [worldCanvas, umweltCanvas, retinaChart, activityChart, memoryCanvas, stripActivityCanvas, umweltDetailCanvas, neuralFieldCanvas].filter(Boolean)) this.resizeObserver.observe(canvas);
    this.animation = requestAnimationFrame((time) => this.frame(time));
  }

  destroy() {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
  }
  invalidate() { this.layoutDirty = true; }
  refreshLayout() { this.layoutDirty = true; }
  setCameraChangeCallback(callback) { this.cameraChangeCallback = callback; this.notifyCamera(true); }
  setNavigationStartCallback(callback) { this.navigationStartCallback = callback; }
  setNavigationEnabled(value) {
    this.navigationEnabled = Boolean(value);
    this.worldCanvas.classList.toggle('camera-navigation', this.navigationEnabled);
  }

  setRoom(room) {
    if (!room) return;
    const changed = !this.room || this.room.width !== room.width || this.room.height !== room.height;
    this.room = structuredClone(room);
    if (!this.dust.length || changed) this.buildDust();
    if (changed || !Number.isFinite(this.camera.centerX)) this.resetCamera('follow');
    this.layoutDirty = true;
  }

  buildDust() {
    const width = this.room?.width || 120;
    const height = this.room?.height || 80;
    this.dust = Array.from({length: 110}, (_, index) => ({
      x: hash01(index * 17 + 3) * width,
      y: hash01(index * 29 + 7) * height,
      r: 0.05 + hash01(index * 47 + 11) * 0.16,
      a: 0.08 + hash01(index * 61 + 13) * 0.22,
    }));
  }

  setView(view) {
    this.view = view === 'umwelt' ? 'umwelt' : 'world';
    this.worldCanvas.hidden = this.view !== 'world';
    this.umweltCanvas.hidden = this.view !== 'umwelt';
    this.layoutDirty = true;
    this.notifyCamera(true);
    if (this.view === 'umwelt') this.drawUmweltDetail();
  }
  setSelection(id) { this.selection = id; }
  setEditing(value) { this.editing = Boolean(value); this.layoutDirty = true; }

  updateWorld(snapshot) {
    if (!snapshot) return;
    this.previous = this.current;
    this.previousAt = this.receivedAt;
    this.current = snapshot;
    this.receivedAt = performance.now();
    this.running = snapshot.runtime?.running !== false;
    if (snapshot.room) this.setRoom(snapshot.room);
    this.drawRetina();
    this.drawMemory();
    this.drawUmweltDetail();
  }

  setNeuralAtlas(atlas) {
    if (!atlas) return;
    this.neuralAtlas = atlas;
    this.neuralGroupCounts = new Array(atlas.groups?.length || 0).fill(0);
    this.neuralParticles.clear();
    this.drawNeuralField(performance.now());
  }

  updateBrain(snapshot, sampleSpikes = []) {
    this.brain = snapshot;
    this.sampleSpikes = Array.from(sampleSpikes || []);
    this.drawActivity();
    this.ingestNeuralFrame();
  }

  ingestNeuralFrame() {
    const atlas = this.neuralAtlas;
    if (!atlas?.groupByNeuron) return;
    const counts = new Array(atlas.groups?.length || 0).fill(0);
    const maxParticles = 1900;
    for (let i = 0; i < this.sampleSpikes.length; i++) {
      const index = Number(this.sampleSpikes[i]);
      if (!Number.isFinite(index) || index < 0 || index >= atlas.groupByNeuron.length) continue;
      const group = Number(atlas.groupByNeuron[index]) || 0;
      if (group < counts.length) counts[group]++;
      if (i < 1400) {
        const existing = this.neuralParticles.get(index);
        if (existing) { existing.seen = this.neuralClock; existing.energy = 1; }
        else this.neuralParticles.set(index, {index, group, seen: this.neuralClock, energy: 1});
      }
    }
    while (this.neuralParticles.size > maxParticles) this.neuralParticles.delete(this.neuralParticles.keys().next().value);
    this.neuralGroupCounts = counts;
    const stats = this.brain?.stats || {};
    this.lastNeuralSummary = {
      sampleCount: this.sampleSpikes.length,
      totalSpikes: Number(stats.spikes) || 0,
      timeMs: Number(stats.simulatedMs) || 0,
      groups: (atlas.groups || []).map((group) => ({...group, sampleCount: counts[group.id] || 0})),
    };
    this.drawNeuralField(performance.now());
  }
  getNeuralFrameSummary() { return structuredClone(this.lastNeuralSummary); }

  computeInsets(canvas = this.view === 'umwelt' ? this.umweltCanvas : this.worldCanvas) {
    const rect = canvas.getBoundingClientRect();
    const insets = {left: 0, top: 0, right: 0, bottom: 0};
    if (!rect.width || !rect.height) return insets;
    for (const element of this.overlayElements) {
      if (!element || element.hidden) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const other = element.getBoundingClientRect();
      const overlapX = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
      const overlapY = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
      if (!overlapX || !overlapY) continue;
      const centerX = (other.left + other.right) / 2;
      const centerY = (other.top + other.bottom) / 2;
      if (overlapX > rect.width * .45 && centerY > rect.top + rect.height / 2) insets.bottom = Math.max(insets.bottom, rect.bottom - other.top + 8);
      else if (overlapX > rect.width * .45 && centerY < rect.top + rect.height / 2) insets.top = Math.max(insets.top, other.bottom - rect.top + 8);
      if (overlapY > rect.height * .45 && centerX > rect.left + rect.width / 2) insets.right = Math.max(insets.right, rect.right - other.left + 8);
      else if (overlapY > rect.height * .45 && centerX < rect.left + rect.width / 2) insets.left = Math.max(insets.left, other.right - rect.left + 8);
    }
    return insets;
  }

  viewport(canvas = this.worldCanvas) {
    const {width, height} = resizeCanvas(canvas);
    const insets = this.computeInsets(canvas);
    const x = insets.left;
    const y = insets.top;
    const w = Math.max(1, width - insets.left - insets.right);
    const h = Math.max(1, height - insets.top - insets.bottom);
    return {width, height, insets, x, y, w, h, cx: x + w / 2, cy: y + h / 2};
  }

  overviewScale(viewport = this.viewport(this.worldCanvas)) {
    if (!this.room) return 1;
    const padding = Math.min(42, Math.max(20, Math.min(viewport.w, viewport.h) * .045));
    return Math.max(.1, Math.min((viewport.w - padding * 2) / this.room.width, (viewport.h - padding * 2) / this.room.height));
  }
  followScale(viewport = this.viewport(this.worldCanvas)) {
    const fit = this.overviewScale(viewport);
    return clamp(Math.max(fit * 1.55, Math.min(viewport.w, viewport.h) / 42), fit, 24);
  }

  setCameraMode(mode) {
    const next = ['follow', 'overview', 'free'].includes(mode) ? mode : 'follow';
    const zoom = clamp(this.cameraTarget.zoom || this.camera.zoom || 1, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
    const viewport = this.viewport(this.worldCanvas);
    const fly = this.current?.fly;
    this.camera.mode = next;
    this.camera.zoom = zoom;
    this.cameraTarget.mode = next;
    this.cameraTarget.zoom = zoom;
    if (this.room) {
      const base = next === 'overview' ? this.overviewScale(viewport) : next === 'follow' ? this.followScale(viewport) : this.cameraTarget.scale / Math.max(.001, zoom);
      this.cameraTarget.scale = clamp(base * zoom, .08, 42);
      if (next === 'overview') {
        this.cameraTarget.centerX = this.room.width / 2;
        this.cameraTarget.centerY = this.room.height / 2;
      } else if (next === 'follow' && fly) {
        const lead = clamp((fly.speed || 0) * 1.3, 0, 9);
        this.cameraTarget.centerX = fly.x + Math.cos(fly.heading) * lead;
        this.cameraTarget.centerY = fly.y + Math.sin(fly.heading) * lead;
      }
      this.constrainCamera(this.cameraTarget, viewport);
    }
    this.layoutDirty = true;
    this.notifyCamera(true);
  }

  resetCamera(mode = this.camera.mode === 'free' ? 'follow' : this.camera.mode) {
    this.camera.mode = ['follow', 'overview'].includes(mode) ? mode : 'follow';
    this.camera.zoom = 1;
    this.cameraTarget = {...this.camera};
    if (this.room) {
      this.camera.centerX = this.cameraTarget.centerX = this.room.width / 2;
      this.camera.centerY = this.cameraTarget.centerY = this.room.height / 2;
    }
    this.layoutDirty = true;
    this.notifyCamera(true);
  }

  zoomCamera(factor, anchor = null, {preserveMode = false} = {}) {
    if (!this.room) return;
    const before = anchor ? this.worldPoint(anchor.clientX, anchor.clientY) : null;
    const viewport = this.viewport(this.worldCanvas);
    const previousMode = this.cameraTarget.mode || this.camera.mode;
    const previousZoom = this.cameraTarget.zoom || 1;
    const nextZoom = clamp(previousZoom * factor, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
    // Measure from the mode the user was looking at before moving into the
    // free camera. Otherwise the first zoom from Overview can use stale scale
    // 1 and shrink the entire room far beyond the chosen zoom factor.
    const base = previousMode === 'overview' ? this.overviewScale(viewport)
      : previousMode === 'follow' ? this.followScale(viewport)
        : this.cameraTarget.scale / Math.max(.001, previousZoom);
    if (!preserveMode) this.camera.mode = this.cameraTarget.mode = 'free';
    this.camera.zoom = this.cameraTarget.zoom = nextZoom;
    this.cameraTarget.scale = clamp(base * nextZoom, .08, 42);
    this.camera.scale = this.reducedMotion ? this.cameraTarget.scale : this.camera.scale;
    if (before && anchor) {
      const rect = this.worldCanvas.getBoundingClientRect();
      const sx = anchor.clientX - rect.left;
      const sy = anchor.clientY - rect.top;
      this.cameraTarget.centerX = before.x - (sx - viewport.cx) / this.cameraTarget.scale;
      this.cameraTarget.centerY = before.y - (sy - viewport.cy) / this.cameraTarget.scale;
      if (this.reducedMotion) { this.camera.centerX = this.cameraTarget.centerX; this.camera.centerY = this.cameraTarget.centerY; }
    }
    this.constrainCamera(this.cameraTarget, viewport);
    this.notifyCamera(true);
  }

  panCamera(dxPixels, dyPixels) {
    if (!this.room) return;
    this.camera.mode = this.cameraTarget.mode = 'free';
    const scale = Math.max(.001, this.cameraTarget.scale || this.camera.scale);
    this.cameraTarget.centerX -= dxPixels / scale;
    this.cameraTarget.centerY -= dyPixels / scale;
    if (this.reducedMotion) { this.camera.centerX = this.cameraTarget.centerX; this.camera.centerY = this.cameraTarget.centerY; }
    this.constrainCamera(this.cameraTarget, this.viewport(this.worldCanvas));
    this.notifyCamera(true);
  }

  constrainCamera(camera, viewport) {
    if (!this.room || !camera) return;
    const halfW = viewport.w / Math.max(.001, camera.scale) / 2;
    const halfH = viewport.h / Math.max(.001, camera.scale) / 2;
    const margin = Math.max(4, Math.min(this.room.width, this.room.height) * .08);
    camera.centerX = clamp(camera.centerX, -margin + Math.min(halfW, this.room.width / 2), this.room.width + margin - Math.min(halfW, this.room.width / 2));
    camera.centerY = clamp(camera.centerY, -margin + Math.min(halfH, this.room.height / 2), this.room.height + margin - Math.min(halfH, this.room.height / 2));
  }

  updateCamera(now, viewport, fly) {
    if (!this.room) return;
    const baseScale = this.camera.mode === 'overview' ? this.overviewScale(viewport) : this.camera.mode === 'follow' ? this.followScale(viewport) : this.cameraTarget.scale / Math.max(.001, this.cameraTarget.zoom || 1);
    if (this.camera.mode === 'overview') {
      this.cameraTarget.centerX = this.room.width / 2;
      this.cameraTarget.centerY = this.room.height / 2;
      this.cameraTarget.scale = baseScale * this.cameraTarget.zoom;
    } else if (this.camera.mode === 'follow' && fly) {
      const lead = clamp((fly.speed || 0) * 1.3, 0, 9);
      this.cameraTarget.centerX = fly.x + Math.cos(fly.heading) * lead;
      this.cameraTarget.centerY = fly.y + Math.sin(fly.heading) * lead;
      this.cameraTarget.scale = baseScale * this.cameraTarget.zoom;
    }
    this.constrainCamera(this.cameraTarget, viewport);
    const t = this.reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, now - this.lastFrameAt) / 145);
    this.camera.centerX = lerp(this.camera.centerX, this.cameraTarget.centerX, t);
    this.camera.centerY = lerp(this.camera.centerY, this.cameraTarget.centerY, t);
    this.camera.scale = lerp(this.camera.scale, this.cameraTarget.scale, t);
    this.camera.mode = this.cameraTarget.mode;
    this.notifyCamera(false, viewport);
  }

  getCameraState() {
    const viewport = this.viewport(this.worldCanvas);
    const overview = this.overviewScale(viewport);
    return {mode: this.camera.mode, centerX: this.camera.centerX, centerY: this.camera.centerY, scale: this.camera.scale, zoom: this.cameraTarget.zoom || 1, relativeScale: this.camera.scale / Math.max(.001, overview), view: this.view};
  }

  restoreCameraState(state) {
    if (!state || !this.room) return;
    const mode = ['follow', 'overview', 'free'].includes(state.mode) ? state.mode : 'follow';
    const viewport = this.viewport(this.worldCanvas);
    const zoom = clamp(Number(state.zoom) || 1, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
    const scale = clamp(Number(state.scale) || this.overviewScale(viewport), .08, 42);
    this.camera = {mode, centerX: Number(state.centerX) || this.room.width / 2, centerY: Number(state.centerY) || this.room.height / 2, scale, zoom};
    this.cameraTarget = {...this.camera};
    this.constrainCamera(this.camera, viewport);
    this.constrainCamera(this.cameraTarget, viewport);
    this.layoutDirty = true;
    this.notifyCamera(true);
  }

  notifyCamera(force = false, viewport = null) {
    if (!this.cameraChangeCallback) return;
    const state = this.getCameraState();
    const key = `${state.view}|${state.mode}|${state.relativeScale.toFixed(2)}`;
    if (!force && key === this.lastCameraNotice) return;
    this.lastCameraNotice = key;
    this.cameraChangeCallback(state);
  }

  worldPoint(clientX, clientY) {
    const rect = this.worldCanvas.getBoundingClientRect();
    const viewport = this.viewport(this.worldCanvas);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x: this.camera.centerX + (x - viewport.cx) / Math.max(.001, this.camera.scale),
      y: this.camera.centerY + (y - viewport.cy) / Math.max(.001, this.camera.scale),
    };
  }
  worldToScreen(x, y, viewport = this.viewport(this.worldCanvas)) {
    return {x: viewport.cx + (x - this.camera.centerX) * this.camera.scale, y: viewport.cy + (y - this.camera.centerY) * this.camera.scale};
  }

  shouldHandlePointer() {
    return this.pointerMap.size > 1 || this.navigationEnabled || !this.editing || this.gesture?.kind === 'pinch';
  }

  bindNavigation() {
    const canvas = this.worldCanvas;
    canvas.addEventListener('wheel', (event) => {
      if (this.view !== 'world') return;
      event.preventDefault();
      this.navigationStartCallback?.();
      this.zoomCamera(Math.exp(-event.deltaY * .0012), {clientX: event.clientX, clientY: event.clientY});
    }, {passive: false});

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.pointerMap.set(event.pointerId, {x: event.clientX, y: event.clientY});
      const shouldNavigate = !this.editing || this.navigationEnabled || this.pointerMap.size > 1;
      if (!shouldNavigate) return;
      event.preventDefault();
      this.navigationStartCallback?.();
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      this.startGesture();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.pointerMap.has(event.pointerId)) return;
      const previous = this.pointerMap.get(event.pointerId);
      this.pointerMap.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if ((!this.editing || this.navigationEnabled || this.pointerMap.size > 1) && this.gesture) {
        event.preventDefault();
        if (this.pointerMap.size >= 2) this.updatePinch();
        else this.panCamera(event.clientX - previous.x, event.clientY - previous.y);
      }
    });
    const end = (event) => {
      this.pointerMap.delete(event.pointerId);
      if (this.pointerMap.size) this.startGesture(); else this.gesture = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('keydown', (event) => {
      if (this.view !== 'world' || (this.editing && !this.navigationEnabled)) return;
      const step = event.shiftKey ? 64 : 28;
      if (event.key === 'ArrowLeft') this.panCamera(step, 0);
      else if (event.key === 'ArrowRight') this.panCamera(-step, 0);
      else if (event.key === 'ArrowUp') this.panCamera(0, step);
      else if (event.key === 'ArrowDown') this.panCamera(0, -step);
      else if (event.key === '+' || event.key === '=') this.zoomCamera(1.2, null, {preserveMode: true});
      else if (event.key === '-' || event.key === '_') this.zoomCamera(1 / 1.2, null, {preserveMode: true});
      else if (event.key.toLowerCase() === 'f') this.setCameraMode('follow');
      else if (event.key.toLowerCase() === 'o') this.setCameraMode('overview');
      else if (event.key === '0' || event.key === 'Home') this.resetCamera();
      else return;
      event.preventDefault();
    });
  }

  startGesture() {
    const points = [...this.pointerMap.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      this.gesture = {kind: 'pinch', distance: Math.hypot(b.x - a.x, b.y - a.y), midpoint: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}};
      this.camera.mode = this.cameraTarget.mode = 'free';
    } else if (points.length === 1) this.gesture = {kind: 'pan'};
  }

  updatePinch() {
    const [a, b] = [...this.pointerMap.values()];
    if (!a || !b) return;
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const midpoint = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
    if (this.gesture?.kind === 'pinch') {
      const dx = midpoint.x - this.gesture.midpoint.x;
      const dy = midpoint.y - this.gesture.midpoint.y;
      this.panCamera(dx, dy);
      this.zoomCamera(distance / Math.max(1, this.gesture.distance), {clientX: midpoint.x, clientY: midpoint.y}, {preserveMode: true});
    }
    this.gesture = {kind: 'pinch', distance, midpoint};
  }

  interpolatedFly(now) {
    const current = this.current?.fly;
    if (!current) return null;
    const previous = this.previous?.fly;
    if (!previous || this.current?.runtime?.running === false) return current;
    const interval = clamp(this.receivedAt - this.previousAt, 16, 120);
    const t = clamp((now - this.receivedAt) / interval, 0, 1);
    return {
      ...current,
      x: lerp(previous.x, current.x, t), y: lerp(previous.y, current.y, t),
      heading: lerpAngle(previous.heading, current.heading, t),
      speed: lerp(previous.speed || 0, current.speed || 0, t),
      turnRate: lerp(previous.turnRate || 0, current.turnRate || 0, t),
    };
  }

  frame(now) {
    this.frameCount++;
    const dt = Math.min(80, Math.max(0, now - this.lastFrameAt));
    if (this.running) this.neuralClock += dt;
    if (this.view === 'world') this.drawWorld(now); else this.drawUmwelt(now);
    if (this.neuralFieldCanvas && !this.neuralFieldCanvas.closest('[hidden]')) this.drawNeuralField(now);
    this.lastFrameAt = now;
    this.animation = requestAnimationFrame((time) => this.frame(time));
  }

  drawWorld(now) {
    const viewport = this.viewport(this.worldCanvas);
    const {ctx, width, height} = resizeCanvas(this.worldCanvas);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    if (!this.room) return;
    const fly = this.interpolatedFly(now);
    this.updateCamera(now, viewport, fly);

    // Quiet chamber background remains visible even outside room boundaries.
    const back = ctx.createRadialGradient(viewport.cx, viewport.cy, 20, viewport.cx, viewport.cy, Math.max(width, height) * .72);
    back.addColorStop(0, '#eef0e8'); back.addColorStop(1, COLORS.deep);
    ctx.fillStyle = back; ctx.fillRect(0, 0, width, height);

    const topLeft = this.worldToScreen(0, 0, viewport);
    const bottomRight = this.worldToScreen(this.room.width, this.room.height, viewport);
    const roomX = topLeft.x, roomY = topLeft.y, roomW = bottomRight.x - topLeft.x, roomH = bottomRight.y - topLeft.y;
    ctx.save();
    pathRoundedRect(ctx, roomX, roomY, roomW, roomH, Math.max(8, Math.min(18, this.camera.scale * 1.2)));
    ctx.clip();

    const surface = ctx.createLinearGradient(roomX, roomY, roomX, roomY + roomH);
    surface.addColorStop(0, '#f6f5ef'); surface.addColorStop(.58, '#eaede5'); surface.addColorStop(1, '#dfe5dc');
    ctx.fillStyle = surface; ctx.fillRect(roomX, roomY, roomW, roomH);
    this.drawGrid(ctx, viewport);
    this.drawDust(ctx, viewport);
    this.drawFields(ctx, viewport, now);
    this.drawObjects(ctx, viewport, now);
    this.drawTrail(ctx, viewport);
    if (fly) this.drawFly(ctx, fly, viewport, now);
    if (this.preview) this.drawPreview(ctx, this.preview, viewport);
    ctx.restore();

    ctx.strokeStyle = 'rgba(86,105,96,.32)';
    ctx.lineWidth = 1.1;
    pathRoundedRect(ctx, roomX + .5, roomY + .5, roomW - 1, roomH - 1, Math.max(8, Math.min(18, this.camera.scale * 1.2)));
    ctx.stroke();
    if (this.editing && this.selection) this.drawSelection(ctx, viewport);
  }

  drawGrid(ctx, viewport) {
    const spacing = 10;
    ctx.strokeStyle = 'rgba(71,95,83,.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.room.width; x += spacing) {
      const a = this.worldToScreen(x, 0, viewport), b = this.worldToScreen(x, this.room.height, viewport);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (let y = 0; y <= this.room.height; y += spacing) {
      const a = this.worldToScreen(0, y, viewport), b = this.worldToScreen(this.room.width, y, viewport);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  drawDust(ctx, viewport) {
    for (const particle of this.dust) {
      const p = this.worldToScreen(particle.x, particle.y, viewport);
      const r = Math.max(.6, particle.r * this.camera.scale);
      ctx.fillStyle = `rgba(91,117,104,${particle.a * .72})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.min(2.2, r), 0, Math.PI * 2); ctx.fill();
    }
  }

  drawFields(ctx, viewport, now) {
    const simTime = Number(this.current?.time) || now / 1000;
    for (const object of this.room.objects) {
      const p = this.worldToScreen(object.x, object.y, viewport);
      if (!['food', 'water', 'threat'].includes(object.kind) || (object.amount ?? 1) <= 0) continue;
      const hue = object.kind === 'food' ? '184,126,43' : object.kind === 'water' ? '43,130,173' : '189,82,74';
      const field = (object.kind === 'threat' ? 15 : 22) * this.camera.scale;
      const alpha = .035 * clamp(object.odor || 0.8, 0, 2);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, field);
      gradient.addColorStop(0, `rgba(${hue},${alpha * 1.5})`); gradient.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(p.x, p.y, field, 0, Math.PI * 2); ctx.fill();
      const pulse = this.running && !this.reducedMotion ? .5 + .5 * Math.sin(simTime * 1.7 + hash01(object.id?.length || 1) * 8) : .55;
      ctx.strokeStyle = `rgba(${hue},${.06 + pulse * .04})`;
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 2; ring++) { ctx.beginPath(); ctx.arc(p.x, p.y, field * (.38 + ring * .22), 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  drawObjects(ctx, viewport) {
    for (const object of this.room.objects) {
      const p = this.worldToScreen(object.x, object.y, viewport);
      const selected = object.id === this.selection;
      ctx.save();
      if (object.kind === 'wall' || object.kind === 'shelter') {
        const width = object.w * this.camera.scale, height = object.h * this.camera.scale;
        if (object.kind === 'wall') this.drawWall(ctx, p, width, height);
        else this.drawShelter(ctx, p, width, height);
      } else {
        this.drawRoundObject(ctx, object, p);
      }
      if (selected) this.drawObjectSelection(ctx, object, p);
      ctx.restore();
    }
  }

  drawWall(ctx, p, width, height) {
    const radius = Math.min(7, height * .16);
    const gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + height);
    gradient.addColorStop(0, '#aeb9b0'); gradient.addColorStop(.5, '#98a59c'); gradient.addColorStop(1, '#79887e');
    ctx.shadowColor = 'rgba(45,58,50,.20)'; ctx.shadowBlur = 10; ctx.fillStyle = gradient;
    pathRoundedRect(ctx, p.x, p.y, width, height, radius); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(55,77,67,.34)'; ctx.lineWidth = 1; ctx.stroke();
  }

  drawShelter(ctx, p, width, height) {
    // A shelter is visually the same material as a wall, only translucent.
    // This keeps its role clear without inventing a competing illustration.
    ctx.save(); ctx.globalAlpha = .30; this.drawWall(ctx, p, width, height); ctx.restore();
  }

  drawRoundObject(ctx, object, p) {
    const r = Math.max(4, object.r * this.camera.scale);
    if (object.kind === 'food') {
      ctx.shadowColor = 'rgba(184,126,43,.24)'; ctx.shadowBlur = 10;
      const skin = ctx.createRadialGradient(p.x - r * .26, p.y - r * .22, r * .08, p.x, p.y, r);
      skin.addColorStop(0, '#f3c96f'); skin.addColorStop(.54, '#d98d38'); skin.addColorStop(1, '#98511f');
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * .83, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,231,160,.66)'; ctx.beginPath(); ctx.ellipse(p.x - r * .08, p.y + r * .04, r * .67, r * .54, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b16b27';
      for (const [x, y] of [[-.24,-.1],[.11,-.22],[.25,.13],[-.08,.25]]) { ctx.beginPath(); ctx.arc(p.x + x * r, p.y + y * r, Math.max(1, r * .075), 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#6c7136'; ctx.lineWidth = Math.max(1, r * .07); ctx.beginPath(); ctx.moveTo(p.x, p.y - r * .66); ctx.quadraticCurveTo(p.x + r * .2, p.y - r * 1.17, p.x + r * .56, p.y - r * .98); ctx.stroke();
      ctx.fillStyle = '#79934c'; ctx.beginPath(); ctx.ellipse(p.x + r * .5, p.y - r * .96, r * .25, r * .11, -.42, 0, Math.PI * 2); ctx.fill();
    } else if (object.kind === 'water') {
      ctx.shadowColor = 'rgba(43,130,173,.22)'; ctx.shadowBlur = 10;
      const basin = ctx.createLinearGradient(p.x, p.y - r, p.x, p.y + r);
      basin.addColorStop(0, '#d4e8df'); basin.addColorStop(.42, '#8bb7b8'); basin.addColorStop(1, '#4b7779');
      ctx.fillStyle = basin; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.08, r * .68, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      const water = ctx.createRadialGradient(p.x - r * .2, p.y - r * .15, 1, p.x, p.y, r);
      water.addColorStop(0, '#e7fbf8'); water.addColorStop(.5, '#58a9c2'); water.addColorStop(1, '#2d718f');
      ctx.fillStyle = water; ctx.beginPath(); ctx.ellipse(p.x, p.y - r * .06, r * .85, r * .48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(239,255,250,.70)'; ctx.lineWidth = Math.max(1, r * .045);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * .06, r * .57, r * .27, 0, Math.PI * 1.06, Math.PI * 1.9); ctx.stroke();
    } else if (object.kind === 'light') {
      // The field supplies illumination; the object is only a compact flush
      // emitter so it stays legible without becoming a cartoon lamp.
      // The marker is a UI-scale source symbol; its sensory light field above
      // remains room-relative, but the visible source itself does not zoom.
      const emitter = 16;
      const housing = ctx.createRadialGradient(p.x - emitter * .14, p.y - emitter * .14, 1, p.x, p.y, emitter * .55);
      housing.addColorStop(0, '#fff6cd'); housing.addColorStop(.42, '#e8c66a'); housing.addColorStop(1, '#ad8131');
      ctx.fillStyle = housing; ctx.shadowColor = 'rgba(226,183,81,.30)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, emitter * .52, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(111,81,29,.58)'; ctx.lineWidth = Math.max(1, emitter * .05); ctx.beginPath(); ctx.arc(p.x, p.y, emitter * .52, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,239,.78)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, emitter * .3, 0, Math.PI * 2); ctx.stroke();
    } else if (object.kind === 'threat') {
      const gradient = ctx.createRadialGradient(p.x - r * .2, p.y - r * .2, 0, p.x, p.y, r);
      gradient.addColorStop(0, '#f1a097'); gradient.addColorStop(.35, '#c95e55'); gradient.addColorStop(1, '#7d3840');
      ctx.fillStyle = gradient; ctx.shadowColor = 'rgba(189,82,74,.30)'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,244,238,.78)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x - r * .5, p.y - r * .5); ctx.lineTo(p.x + r * .5, p.y + r * .5); ctx.moveTo(p.x + r * .5, p.y - r * .5); ctx.lineTo(p.x - r * .5, p.y + r * .5); ctx.stroke();
    }
    if ((object.kind === 'food' || object.kind === 'water') && object.amount < 1) {
      ctx.strokeStyle = 'rgba(45,55,47,.56)'; ctx.lineWidth = Math.max(2, r * .2); ctx.beginPath(); ctx.arc(p.x, p.y, r * .68, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(object.amount || 0)); ctx.stroke();
    }
  }

  drawObjectSelection(ctx, object, p) {
    ctx.strokeStyle = COLORS.cyanBright; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
    if (object.kind === 'wall' || object.kind === 'shelter') ctx.strokeRect(p.x - 5, p.y - 5, object.w * this.camera.scale + 10, object.h * this.camera.scale + 10);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, object.r * this.camera.scale + 6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  drawTrail(ctx, viewport) {
    const trail = this.current?.trail;
    if (!trail?.length) return;
    const visible = trail.slice(-320);
    ctx.lineWidth = Math.max(1, this.camera.scale * .12);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < visible.length; i++) {
        const p = this.worldToScreen(visible[i].x, visible[i].y, viewport);
        if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = pass ? 'rgba(20,123,113,.28)' : 'rgba(118,104,173,.18)';
      ctx.lineWidth = pass ? Math.max(1, this.camera.scale * .12) : Math.max(3, this.camera.scale * .36);
      ctx.stroke();
    }
  }

  drawFly(ctx, fly, viewport, now, local = false, localScale = 1) {
    const p = local ? {x: 0, y: 0} : this.worldToScreen(fly.x, fly.y, viewport);
    const scale = local ? localScale : this.camera.scale;
    const size = local ? localScale : Math.max(15, (fly.radius || 1) * scale * 2.3);
    const state = this.current?.behavior?.state || 'rest';
    const moving = Math.abs(fly.speed || 0) > .15;
    const phase = (Number(this.current?.time) || 0) * 14;
    const gait = moving ? Math.sin(phase) : 0;
    const stress = clamp(this.current?.physiology?.stress || 0);
    const energy = clamp(this.current?.physiology?.energy ?? 1);

    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(fly.heading); ctx.lineCap = 'round';
    if (!local) {
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
      halo.addColorStop(0, `rgba(20,123,113,${.09 + energy * .06})`); halo.addColorStop(1, 'rgba(20,123,113,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, size * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(68,146,160,.045)'; ctx.beginPath(); ctx.moveTo(size * .2, 0); ctx.arc(0, 0, size * 3.4, -.52, .52); ctx.closePath(); ctx.fill();
    }

    ctx.strokeStyle = 'rgba(72,105,104,.76)'; ctx.lineWidth = Math.max(1, size * .07);
    for (let pair = -1; pair <= 1; pair++) for (const side of [-1, 1]) {
      const anchorX = pair * size * .14, anchorY = side * size * .2;
      const swing = gait * (pair === 0 ? -1 : pair) * side * .22;
      ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(anchorX - size * .12 + Math.cos(swing) * size * .26, anchorY + side * size * .44); ctx.lineTo(anchorX - size * .34 + Math.sin(swing) * size * .22, anchorY + side * size * .72); ctx.stroke();
    }

    const wingAlpha = state === 'saccade' ? .48 : moving ? .36 : .28;
    for (const side of [-1, 1]) {
      // Rounded wings attach by the forward thorax and sweep down/outward.
      // The ellipse keeps the soft original silhouette, while its offset and
      // rotation put the outer end behind the fly rather than across its body.
      const wing = ctx.createLinearGradient(size * .16, side * size * .08, -size * .8, side * size * .9);
      wing.addColorStop(0, `rgba(137,121,185,${wingAlpha * .42})`); wing.addColorStop(1, `rgba(225,244,239,${wingAlpha * .88})`);
      ctx.fillStyle = wing; ctx.beginPath(); ctx.ellipse(-size * .18, side * size * .36, size * .62, size * .18, -side * .60, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(75,124,121,${wingAlpha * .70})`; ctx.lineWidth = 1; ctx.stroke();
    }

    const abdomen = ctx.createLinearGradient(-size, 0, size * .1, 0);
    abdomen.addColorStop(0, '#41586d'); abdomen.addColorStop(.45, '#6f8495'); abdomen.addColorStop(1, '#3e5668');
    ctx.fillStyle = abdomen; ctx.beginPath(); ctx.ellipse(-size * .43, 0, size * .58, size * .31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(38,55,61,.54)'; ctx.lineWidth = 1;
    for (let x = -.75; x < -.18; x += .16) { ctx.beginPath(); ctx.moveTo(x * size, -size * .25); ctx.lineTo(x * size, size * .25); ctx.stroke(); }

    const thorax = ctx.createRadialGradient(size * .05, -size * .12, 0, 0, 0, size * .5);
    thorax.addColorStop(0, stress > .55 ? '#a16072' : '#748d99'); thorax.addColorStop(1, '#435e69');
    ctx.fillStyle = thorax; ctx.beginPath(); ctx.ellipse(0, 0, size * .42, size * .35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#67858e'; ctx.beginPath(); ctx.arc(size * .43, 0, size * .29, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) {
      const eye = ctx.createRadialGradient(size * .5, side * size * .15, 0, size * .5, side * size * .15, size * .17);
      eye.addColorStop(0, '#f5a0ad'); eye.addColorStop(.55, '#c55372'); eye.addColorStop(1, '#742e5f');
      ctx.fillStyle = eye; ctx.beginPath(); ctx.ellipse(size * .5, side * size * .16, size * .18, size * .12, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#5b8f92'; ctx.lineWidth = Math.max(.9, size * .045);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(size * .58, side * size * .08); ctx.quadraticCurveTo(size * .78, side * size * .15, size * .97, side * size * .31); ctx.stroke(); }
    if (state === 'feed' || state === 'drink') { ctx.strokeStyle = state === 'drink' ? COLORS.water : COLORS.food; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(size * .68, 0); ctx.lineTo(size * 1.18, 0); ctx.stroke(); }
    if (state === 'reverse' || state === 'escape') { ctx.strokeStyle = COLORS.threat; ctx.globalAlpha = .45; ctx.beginPath(); ctx.arc(-size * .45, 0, size * .85, -1.1, 1.1); ctx.stroke(); ctx.globalAlpha = 1; }
    if (!fly.alive) { ctx.strokeStyle = COLORS.threat; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-size, -size); ctx.lineTo(size, size); ctx.moveTo(size, -size); ctx.lineTo(-size, size); ctx.stroke(); }
    ctx.restore();
  }

  drawPreview(ctx, object, viewport) {
    const p = this.worldToScreen(object.x, object.y, viewport);
    ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = COLORS.cyan;
    pathRoundedRect(ctx, p.x, p.y, object.w * this.camera.scale, object.h * this.camera.scale, 5); ctx.fill(); ctx.restore();
  }
  drawSelection(ctx, viewport) {
    const object = this.room?.objects.find((item) => item.id === this.selection);
    if (!object) return;
    const p = this.worldToScreen(object.x, object.y, viewport);
    ctx.save(); this.drawObjectSelection(ctx, object, p); ctx.restore();
  }

  drawUmwelt(now) {
    const {ctx, width, height} = resizeCanvas(this.umweltCanvas);
    this.drawUmweltComposition(ctx, width, height, {detail: false, now});
  }
  drawUmweltDetail() {
    if (!this.umweltDetailCanvas) return;
    const {ctx, width, height} = resizeCanvas(this.umweltDetailCanvas, 1.5);
    this.drawUmweltComposition(ctx, width, height, {detail: true, now: performance.now()});
  }

  drawUmweltComposition(ctx, width, height, {detail = false, now = 0} = {}) {
    ctx.fillStyle = detail ? '#f0f1eb' : COLORS.deep;
    ctx.fillRect(0, 0, width, height);
    const retina = this.current?.retina;
    const fly = this.interpolatedFly(now);
    const senses = this.current?.senses;
    if (!retina || !fly || !senses) {
      ctx.fillStyle = 'rgba(70,83,76,.70)'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Sensory evidence will appear after the first world snapshot.', width / 2, height / 2); return;
    }
    const insets = detail ? {top: 0, bottom: 0} : this.computeInsets(this.umweltCanvas);
    const usableTop = 40 + insets.top;
    const usableBottom = height - Math.max(18, insets.bottom);
    const cx = width / 2;
    const cy = detail ? height * .58 : usableTop + (usableBottom - usableTop) * .52;
    const radius = Math.max(70, Math.min(width * (detail ? .40 : .34), (usableBottom - usableTop) * .46));
    const count = retina.brightness?.length || 0;
    const fov = Math.PI * 1.55;
    const start = -Math.PI / 2 - fov / 2;

    const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.1);
    aura.addColorStop(0, `rgba(20,123,113,${.04 + clamp(senses.light || 0) * .04})`); aura.addColorStop(1, 'rgba(20,123,113,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(83,109,100,.21)'; ctx.lineWidth = 1;
    for (const ring of [.34, .58, .82, 1]) { ctx.beginPath(); ctx.arc(cx, cy, radius * ring, start, start + fov); ctx.stroke(); }

    for (let i = 0; i < count; i++) {
      const a0 = start + i / count * fov;
      const a1 = start + (i + 1.12) / count * fov;
      const brightness = clamp((retina.brightness?.[i] || 0) / 1.5);
      const proximity = clamp(retina.proximity?.[i] || 0);
      const motion = clamp(retina.motion?.[i] || 0);
      const loom = clamp(Math.abs(retina.loom?.[i] || 0));
      const inner = radius * .24;
      const outer = radius * (1 - proximity * .62);
      const hue = loom > .35 ? '189,82,74' : motion > .3 ? '118,104,173' : '43,130,173';
      ctx.fillStyle = `rgba(${hue},${.04 + brightness * .14 + motion * .06})`;
      ctx.beginPath(); ctx.arc(cx, cy, outer, a0, a1); ctx.arc(cx, cy, inner, a1, a0, true); ctx.closePath(); ctx.fill();
      if (loom > .25) { ctx.strokeStyle = `rgba(189,82,74,${.18 + loom * .34})`; ctx.beginPath(); ctx.moveTo(cx + Math.cos((a0 + a1) / 2) * inner, cy + Math.sin((a0 + a1) / 2) * inner); ctx.lineTo(cx + Math.cos((a0 + a1) / 2) * outer, cy + Math.sin((a0 + a1) / 2) * outer); ctx.stroke(); }
    }

    const odorL = senses.odorLeft || [0, 0, 0], odorR = senses.odorRight || [0, 0, 0];
    this.drawOdorArcs(ctx, cx, cy, radius, odorL, -1);
    this.drawOdorArcs(ctx, cx, cy, radius, odorR, 1);

    const guidance = senses.guidance || {};
    if ((guidance.confidence || 0) > .02) {
      const angle = -Math.PI / 2 + (Number(guidance.angle) || 0);
      const length = radius * (.36 + clamp(guidance.confidence) * .36);
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = `rgba(118,104,173,${.45 + clamp(guidance.confidence) * .42})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length); ctx.stroke(); ctx.setLineDash([]);
      const ex = cx + Math.cos(angle) * length, ey = cy + Math.sin(angle) * length;
      ctx.fillStyle = COLORS.violet; ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    const touch = senses.touch || [], taste = senses.taste || [];
    const touchMax = maximum(touch), tasteMax = maximum(taste);
    if (touchMax > .02) { ctx.strokeStyle = `rgba(185,104,49,${.4 + touchMax * .5})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, detail ? 18 : 24, 0, Math.PI * 2); ctx.stroke(); }
    if (tasteMax > .02) { ctx.fillStyle = `rgba(184,126,43,${.35 + tasteMax * .55})`; ctx.beginPath(); ctx.arc(cx, cy - (detail ? 25 : 32), 4 + tasteMax * 4, 0, Math.PI * 2); ctx.fill(); }

    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2); this.drawFly(ctx, {...fly, x: 0, y: 0, heading: 0}, null, now, true, detail ? 15 : 18); ctx.restore();

    ctx.fillStyle = 'rgba(54,76,67,.76)'; ctx.textAlign = 'center'; ctx.font = '700 11px system-ui';
    if (!detail) { ctx.fillText('FLY-RELATIVE SENSORY FIELD', cx, Math.max(24, usableTop - 18)); ctx.font = '12px system-ui'; ctx.fillText('retinal brightness · motion · proximity · loom', cx, Math.max(42, usableTop)); }
    const antennaY = Math.min(usableBottom - 46, cy + radius * .94);
    ctx.font = '700 11px system-ui'; ctx.fillText('LEFT ANTENNA', cx - radius * .72, antennaY); ctx.fillText('RIGHT ANTENNA', cx + radius * .72, antennaY);
    ctx.font = '12px system-ui'; ctx.fillStyle = 'rgba(64,79,72,.82)';
    const footer = guidance.confidence > .02 ? `${guidance.kind || 'stored'} memory guidance · ${Math.round(clamp(guidance.confidence) * 100)}% confidence` : 'no active memory guidance';
    ctx.fillText(footer, cx, Math.min(usableBottom - 8, antennaY + 42));
  }

  drawOdorArcs(ctx, cx, cy, radius, channels, side) {
    const colors = [COLORS.food, COLORS.water, COLORS.threat];
    for (let channel = 0; channel < 3; channel++) {
      const value = clamp((Number(channels[channel]) || 0) / 1.5);
      if (value <= .005) continue;
      const offset = radius * (.58 + channel * .035);
      const x0 = cx + side * 14, y0 = cy - 2;
      const x1 = cx + side * offset, y1 = cy + radius * .58;
      ctx.strokeStyle = colors[channel]; ctx.globalAlpha = .2 + value * .7; ctx.lineWidth = 1.4 + value * 1.8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx + side * radius * .75, cy + radius * .18, x1, y1); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  drawRetina() {
    if (!this.retinaChart) return;
    const {ctx, width, height} = resizeCanvas(this.retinaChart, 1.25);
    ctx.fillStyle = '#f0f1eb'; ctx.fillRect(0, 0, width, height);
    const retina = this.current?.retina; if (!retina) return;
    ctx.strokeStyle = 'rgba(83,109,100,.16)'; ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
    drawLineSeries(ctx, retina.brightness || [], width, height, {color: COLORS.cyan, max: 1.5, fill: 'rgba(20,123,113,.10)'});
    drawLineSeries(ctx, retina.proximity || [], width, height, {color: COLORS.food, max: 1, baseline: height - 6, top: height * .43, lineWidth: 1.2});
    drawLineSeries(ctx, retina.motion || [], width, height, {color: COLORS.violet, max: 1, baseline: height - 6, top: height * .6, lineWidth: 1});
  }

  drawActivity() {
    const history = this.brain?.activityHistory || [];
    for (const canvas of [this.activityChart, this.stripActivityCanvas].filter(Boolean)) {
      const {ctx, width, height} = resizeCanvas(canvas, 1.25);
      // These canvases are opaque for performance. Use a fully opaque paper
      // fill so the compact chart cannot inherit an implementation-default
      // black backing surface.
      ctx.fillStyle = '#f0f1eb'; ctx.fillRect(0, 0, width, height);
      if (!history.length) continue;
      const max = Math.max(.01, ...history);
      drawLineSeries(ctx, history, width, height, {color: COLORS.cyan, max, fill: 'rgba(20,123,113,.15)', top: 5, baseline: height - 4, lineWidth: 1.5});
    }
  }

  drawMemory() {
    if (!this.memoryCanvas) return;
    const {ctx, width, height} = resizeCanvas(this.memoryCanvas, 1.25);
    ctx.fillStyle = '#f0f1eb'; ctx.fillRect(0, 0, width, height);
    const memory = this.current?.memory; if (!memory) return;
    const all = [...(memory.food || []), ...(memory.water || []), ...(memory.threats || [])];
    const pose = memory.estimatedPose || {x: 0, y: 0, heading: 0};
    let extent = 12;
    for (const item of all) extent = Math.max(extent, Math.abs(item.x - pose.x), Math.abs(item.y - pose.y));
    const scale = Math.min(width, height) / (extent * 2.55), cx = width / 2, cy = height / 2;
    ctx.strokeStyle = 'rgba(83,109,100,.16)'; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.moveTo(0, cy); ctx.lineTo(width, cy); ctx.stroke();
    for (const item of all) {
      const x = cx + (item.x - pose.x) * scale, y = cy + (item.y - pose.y) * scale;
      const color = item.kind === 'threat' ? COLORS.threat : item.kind === 'water' ? COLORS.water : COLORS.food;
      const strength = clamp(item.strength);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 5 + strength * 11); glow.addColorStop(0, color); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = .28 + .72 * strength; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 5 + strength * 11, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(pose.heading || 0); ctx.fillStyle = COLORS.cyan; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  drawNeuralField(now) {
    if (!this.neuralFieldCanvas) return;
    const {ctx, width, height} = resizeCanvas(this.neuralFieldCanvas, 1.5);
    ctx.fillStyle = '#f0f1eb'; ctx.fillRect(0, 0, width, height);
    const atlas = this.neuralAtlas;
    if (!atlas?.groups?.length) {
      ctx.fillStyle = 'rgba(70,83,76,.68)'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Population mappings are loading.', width / 2, height / 2); return;
    }
    const centers = atlas.groups.map((group, index) => {
      const layout = GROUP_LAYOUT[index] || [.5, .5];
      return {x: width * layout[0], y: height * layout[1], group};
    });
    ctx.strokeStyle = 'rgba(118,104,173,.16)'; ctx.lineWidth = 1;
    const central = centers[6] || centers[0];
    for (const center of centers) { if (center === central) continue; ctx.beginPath(); ctx.moveTo(central.x, central.y); ctx.lineTo(center.x, center.y); ctx.stroke(); }

    for (let i = 0; i < centers.length; i++) {
      const center = centers[i]; const color = GROUP_COLORS[i] || GROUP_COLORS[0]; const count = this.neuralGroupCounts[i] || 0;
      const radius = 15 + Math.sqrt(Math.max(1, count)) * 2.2;
      const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 1.6);
      gradient.addColorStop(0, `${color}28`); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(center.x, center.y, radius * 1.6, 0, Math.PI * 2); ctx.fill();
    }

    const stale = [];
    for (const particle of this.neuralParticles.values()) {
      const age = this.neuralClock - particle.seen;
      const strength = this.running ? Math.exp(-Math.max(0, age) / 1150) : Math.exp(-Math.max(0, age) / 1150);
      if (strength < .035) { stale.push(particle.index); continue; }
      const center = centers[particle.group] || centers[0];
      const angle = hash01(particle.index * 3 + 1) * Math.PI * 2;
      const radial = Math.sqrt(hash01(particle.index * 7 + 2));
      const spread = particle.group === 6 ? Math.min(width, height) * .13 : Math.min(width, height) * .075;
      const x = center.x + Math.cos(angle) * radial * spread;
      const y = center.y + Math.sin(angle) * radial * spread * .68;
      const color = GROUP_COLORS[particle.group] || GROUP_COLORS[0];
      ctx.globalAlpha = .25 + strength * .75; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = strength > .6 ? 8 : 2;
      ctx.beginPath(); ctx.arc(x, y, 1.2 + strength * 2.3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    for (const index of stale) this.neuralParticles.delete(index);

    ctx.textAlign = 'center'; ctx.font = '11px system-ui';
    for (let i = 0; i < centers.length; i++) {
      const center = centers[i]; const label = GROUP_CANVAS_LABELS[i] || center.group.label; const labelY = clamp(center.y + (i === 6 ? 48 : 34), 14, height - 8);
      ctx.fillStyle = 'rgba(54,76,67,.74)'; ctx.fillText(label, center.x, labelY);
    }
  }
}
