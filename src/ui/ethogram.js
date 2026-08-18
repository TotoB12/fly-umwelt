const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const maximum = (values = []) => {
  let max = 0;
  for (const value of values || []) max = Math.max(max, Number(value) || 0);
  return max;
};
const fmtClock = (seconds = 0) => {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export const ETHOGRAM_STATES = Object.freeze({
  walk: {label: 'walk', color: '#50d7c8'},
  rest: {label: 'pause', color: '#71809f'},
  pause: {label: 'pause', color: '#71809f'},
  saccade: {label: 'saccade', color: '#9b8cff'},
  reverse: {label: 'reverse', color: '#ff9f78'},
  feed: {label: 'feeding', color: '#e3bf72'},
  drink: {label: 'drinking', color: '#68bde8'},
  escape: {label: 'escape', color: '#ff746d'},
  dead: {label: 'still', color: '#8790a8'},
});

export const ETHOGRAM_MARKERS = Object.freeze({
  touch: {label: 'touch', color: '#ff9f78'},
  taste: {label: 'taste', color: '#e3bf72'},
  vision: {label: 'visual risk', color: '#9b8cff'},
  odor: {label: 'odor encounter', color: '#50d7c8'},
  memory: {label: 'memory cue', color: '#c69cff'},
  observer: {label: 'observer event', color: '#aab4cc'},
  model: {label: 'model event', color: '#8790a8'},
});

function stateMeta(state) {
  return ETHOGRAM_STATES[state] || {label: String(state || 'unknown'), color: '#8790a8'};
}
function markerMeta(type) {
  return ETHOGRAM_MARKERS[type] || {label: String(type || 'event'), color: '#aab4cc'};
}
function eventKey(item) {
  return `${Number(item?.time || 0).toFixed(4)}|${item?.type || ''}|${item?.message || ''}`;
}

/**
 * Bounded, observer-side history. It only consumes snapshots and never mutates
 * them or sends data back to either Worker.
 */
export class EthogramHistory {
  constructor({maxSeconds = 180, maxSegments = 1400, maxMarkers = 1000} = {}) {
    this.maxSeconds = maxSeconds;
    this.maxSegments = maxSegments;
    this.maxMarkers = maxMarkers;
    this.clear();
  }

  clear() {
    this.segments = [];
    this.markers = [];
    this.lastTime = null;
    this.lastSignals = {touch: 0, taste: 0, vision: 0, odor: 0, memory: 0};
    this.eventKeys = new Set();
  }

  record(snapshot) {
    const time = Number(snapshot?.time);
    if (!Number.isFinite(time)) return false;
    if (this.lastTime !== null && time < this.lastTime - 0.001) this.clear();

    const state = snapshot?.fly?.alive === false ? 'dead' : String(snapshot?.behavior?.state || 'rest');
    const reason = String(snapshot?.behavior?.reason || 'neural and body state evolving');
    const current = this.segments[this.segments.length - 1];
    if (!current || current.state !== state) {
      if (current) current.end = Math.max(current.start, this.lastTime ?? time);
      this.segments.push({
        id: `segment-${time.toFixed(3)}-${this.segments.length}`,
        state,
        label: stateMeta(state).label,
        reason,
        start: time,
        end: time,
      });
    } else {
      current.end = time;
      current.reason = reason;
    }

    const senses = snapshot?.senses || {};
    const brain = snapshot?.brain || {};
    const guidance = senses.guidance || {};
    const signals = {
      touch: maximum(senses.touch),
      taste: maximum(senses.taste),
      vision: Math.max(Number(brain.visualRisk) || 0, maximum(snapshot?.retina?.loom)),
      odor: Math.max(maximum(senses.odorLeft), maximum(senses.odorRight)),
      memory: Number(guidance.confidence) || 0,
    };
    const thresholds = {touch: 0.12, taste: 0.12, vision: 0.48, odor: 0.24, memory: 0.15};
    const labels = {
      touch: 'body contact',
      taste: 'taste at the mouthparts',
      vision: 'strong visual risk',
      odor: 'chemical evidence rose',
      memory: `${guidance.kind || 'stored'} guidance became active`,
    };
    for (const [type, value] of Object.entries(signals)) {
      if (value >= thresholds[type] && (this.lastSignals[type] || 0) < thresholds[type]) {
        this.addMarker({time, type, label: labels[type], value});
      }
    }
    this.lastSignals = signals;

    // Each snapshot carries a rolling world event log, so keys prevent repeats.
    for (const item of snapshot?.events || []) {
      const key = eventKey(item);
      if (this.eventKeys.has(key)) continue;
      this.eventKeys.add(key);
      this.addMarker({
        time: Number(item.time) || time,
        type: item.type === 'memory' ? 'memory' : item.type === 'observer' ? 'observer' : 'model',
        label: String(item.message || item.type || 'event'),
        value: 1,
        source: 'world log',
        eventKey: key,
      });
    }

    this.lastTime = time;
    this.trim(time);
    return true;
  }

  addMarker(marker) {
    this.markers.push({id: `marker-${marker.time.toFixed(3)}-${this.markers.length}`, ...marker});
  }

  trim(now = this.lastTime || 0) {
    const cutoff = now - this.maxSeconds;
    while (this.segments.length > 1 && this.segments[0].end < cutoff) this.segments.shift();
    if (this.segments[0] && this.segments[0].start < cutoff) this.segments[0].start = cutoff;
    this.markers = this.markers.filter((marker) => marker.time >= cutoff).slice(-this.maxMarkers);
    if (this.segments.length > this.maxSegments) this.segments = this.segments.slice(-this.maxSegments);
    if (this.eventKeys.size > 1800) {
      this.eventKeys = new Set(this.markers.filter((marker) => marker.source === 'world log' && marker.eventKey).map((marker) => marker.eventKey));
    }
  }

  visible(windowSeconds = 60) {
    const end = this.lastTime ?? 0;
    const start = end - Math.max(5, Number(windowSeconds) || 60);
    return {
      start,
      end,
      segments: this.segments.filter((segment) => segment.end >= start && segment.start <= end),
      markers: this.markers.filter((marker) => marker.time >= start && marker.time <= end),
    };
  }

  current() {
    return this.segments[this.segments.length - 1] || null;
  }

  duration(segment = this.current()) {
    if (!segment || this.lastTime === null) return 0;
    const end = segment === this.current() ? this.lastTime : segment.end;
    return Math.max(0, end - segment.start);
  }
}

function resizeCanvas(canvas, cap = 1.5) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(cap, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round((rect.width || 1) * ratio));
  const height = Math.max(1, Math.round((rect.height || 1) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {ctx, width: rect.width || 1, height: rect.height || 1};
}

export class EthogramView {
  constructor({canvas, legend, detail, recentList, windowSeconds = 60}) {
    this.canvas = canvas;
    this.legend = legend;
    this.detail = detail;
    this.recentList = recentList;
    this.windowSeconds = windowSeconds;
    this.history = new EthogramHistory();
    this.hovered = null;
    this.selected = null;
    this.hitRegions = [];
    this.bind();
    this.renderLegend();
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
    this.draw();
  }

  bind() {
    this.canvas.addEventListener('pointermove', (event) => this.pointer(event));
    this.canvas.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.draw();
      this.renderDetail();
    });
    this.canvas.addEventListener('click', (event) => {
      this.pointer(event);
      if (this.hovered?.kind === 'segment') this.select(this.hovered.value);
    });
    this.canvas.addEventListener('keydown', (event) => {
      const segments = this.history.visible(this.windowSeconds).segments;
      if (!segments.length) return;
      let index = Math.max(0, segments.findIndex((segment) => segment.id === this.selected?.id));
      if (event.key === 'ArrowRight') index = Math.min(segments.length - 1, index + 1);
      else if (event.key === 'ArrowLeft') index = Math.max(0, index - 1);
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = segments.length - 1;
      else return;
      event.preventDefault();
      this.select(segments[index]);
    });
  }

  destroy() { this.resizeObserver?.disconnect(); }
  record(snapshot) {
    const changed = this.history.record(snapshot);
    if (!changed) return false;
    if (this.selected && !this.history.segments.some((segment) => segment.id === this.selected.id)) this.selected = null;
    this.draw();
    this.renderRecent();
    this.renderDetail();
    return true;
  }
  clear() {
    this.history.clear();
    this.hovered = null;
    this.selected = null;
    this.draw();
    this.renderRecent();
    this.renderDetail();
  }
  setWindow(seconds) {
    this.windowSeconds = Math.max(5, Number(seconds) || 60);
    this.draw();
    this.renderRecent();
  }
  current() { return this.history.current(); }
  currentDuration() { return this.history.duration(); }
  redraw() { this.draw(); this.renderRecent(); this.renderDetail(); }
  select(segment) { this.selected = segment || null; this.draw(); this.renderDetail(); }

  pointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.hovered = this.hitRegions.find((region) => x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h) || null;
    this.draw();
    this.renderDetail();
  }

  renderLegend() {
    if (!this.legend) return;
    const preferred = ['walk', 'rest', 'saccade', 'reverse', 'feed', 'drink', 'escape'];
    this.legend.innerHTML = preferred.map((key) => {
      const meta = stateMeta(key);
      return `<span><i style="--legend-color:${meta.color}"></i>${meta.label}</span>`;
    }).join('');
  }

  renderDetail() {
    if (!this.detail) return;
    const target = this.hovered?.value || this.selected || this.history.current();
    if (!target) {
      this.detail.innerHTML = '<span>Select or hover a segment</span><strong>No history yet</strong><small>Behavior snapshots will appear here.</small>';
      return;
    }
    if (this.hovered?.kind === 'marker') {
      const meta = markerMeta(target.type);
      this.detail.innerHTML = `<span>${fmtClock(target.time)} · ${meta.label}</span><strong>${escapeHtml(target.label)}</strong><small>display-side sensory/event marker</small>`;
      return;
    }
    const duration = Math.max(0, (target === this.history.current() ? (this.history.lastTime ?? target.end) : target.end) - target.start);
    const meta = stateMeta(target.state);
    this.detail.innerHTML = `<span>${fmtClock(target.start)} · ${duration.toFixed(1)} s</span><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(target.reason)}</small>`;
  }

  renderRecent() {
    if (!this.recentList) return;
    const segments = this.history.visible(this.windowSeconds).segments.slice(-8).reverse();
    this.recentList.innerHTML = segments.length ? segments.map((segment) => {
      const duration = Math.max(0, segment.end - segment.start);
      const meta = stateMeta(segment.state);
      return `<button type="button" data-segment="${escapeHtml(segment.id)}"><i style="--segment-color:${meta.color}"></i><span><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(segment.reason)}</small></span><time>${duration.toFixed(1)} s</time></button>`;
    }).join('') : '<p class="empty">No behavior segments recorded yet.</p>';
    this.recentList.querySelectorAll('[data-segment]').forEach((button) => button.addEventListener('click', () => {
      this.select(this.history.segments.find((segment) => segment.id === button.dataset.segment));
    }));
  }

  draw() {
    const {ctx, width, height} = resizeCanvas(this.canvas);
    ctx.fillStyle = '#080b1b';
    ctx.fillRect(0, 0, width, height);
    this.hitRegions = [];
    const data = this.history.visible(this.windowSeconds);
    const pad = {left: 18, right: 14, top: 28, bottom: 23};
    const innerW = Math.max(1, width - pad.left - pad.right);
    const bandY = 50;
    const bandH = Math.max(40, height * 0.34);
    const markerTop = bandY + bandH + 13;
    const markerBottom = height - pad.bottom;
    const xFor = (time) => pad.left + clamp((time - data.start) / Math.max(0.001, data.end - data.start)) * innerW;

    ctx.font = '11px system-ui';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(205,215,239,.64)';
    ctx.textAlign = 'center';
    const ticks = width < 390 ? 3 : 5;
    for (let i = 0; i <= ticks; i++) {
      const x = pad.left + (i / ticks) * innerW;
      const time = data.start + (i / ticks) * (data.end - data.start);
      ctx.strokeStyle = 'rgba(151,167,205,.09)';
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, height - pad.bottom); ctx.stroke();
      ctx.fillText(i === ticks ? 'now' : `−${Math.round(data.end - time)}s`, x, 15);
    }

    ctx.fillStyle = 'rgba(23,29,54,.86)';
    ctx.beginPath(); ctx.roundRect(pad.left, bandY, innerW, bandH, 9); ctx.fill();
    for (const segment of data.segments) {
      const x = xFor(Math.max(data.start, segment.start));
      const x2 = xFor(Math.min(data.end, segment.end || data.end));
      const w = Math.max(2, x2 - x);
      const meta = stateMeta(segment.state);
      const active = this.hovered?.value?.id === segment.id || this.selected?.id === segment.id;
      ctx.globalAlpha = active ? 1 : 0.8;
      ctx.fillStyle = meta.color;
      ctx.beginPath(); ctx.roundRect(x, bandY + 4, w, bandH - 8, Math.min(6, w / 2)); ctx.fill();
      ctx.globalAlpha = 1;
      if (active) { ctx.strokeStyle = 'rgba(244,248,255,.94)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (w > 48) { ctx.fillStyle = 'rgba(5,8,20,.84)'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(meta.label, x + 7, bandY + bandH / 2); }
      this.hitRegions.push({kind: 'segment', value: segment, x, y: bandY, w, h: bandH});
    }

    const markerRows = ['touch', 'taste', 'vision', 'odor', 'memory', 'observer', 'model'];
    const rowH = Math.max(10, (markerBottom - markerTop) / markerRows.length);
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    for (let row = 0; row < markerRows.length; row++) {
      const type = markerRows[row];
      const meta = markerMeta(type);
      const y = markerTop + row * rowH + rowH / 2;
      ctx.fillStyle = 'rgba(201,211,235,.48)';
      if (width > 470) ctx.fillText(meta.label, pad.left, y);
      ctx.strokeStyle = 'rgba(151,167,205,.055)';
      ctx.beginPath(); ctx.moveTo(pad.left, y + rowH / 2); ctx.lineTo(width - pad.right, y + rowH / 2); ctx.stroke();
    }
    for (const marker of data.markers) {
      const row = Math.max(0, markerRows.indexOf(marker.type));
      const x = xFor(marker.time);
      const y = markerTop + row * rowH + rowH / 2;
      const meta = markerMeta(marker.type);
      const active = this.hovered?.value?.id === marker.id;
      ctx.fillStyle = meta.color;
      ctx.globalAlpha = active ? 1 : 0.84;
      ctx.beginPath(); ctx.arc(x, y, active ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      this.hitRegions.push({kind: 'marker', value: marker, x: x - 7, y: y - 7, w: 14, h: 14});
    }
    if (!data.segments.length) {
      ctx.fillStyle = 'rgba(205,215,239,.52)';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Behavior history will accumulate while the model runs.', width / 2, height / 2);
    }
  }
}
