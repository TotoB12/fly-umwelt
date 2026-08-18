import {cloneRoom, findObject, makeId, normalizeObject, normalizeRoom, removeObject} from '../core/room.js';
import {clamp, pointInCircle, pointInRect, rectFromDrag} from '../core/geometry.js';
import {History} from './history.js';

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const RECT_TOOLS = new Set(['wall', 'shelter']);

export class RoomEditor {
  constructor({canvas, renderer, onChange, onSelection}) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onChange = onChange;
    this.onSelection = onSelection;
    this.room = null;
    this.tool = 'select';
    this.selectedId = null;
    this.drag = null;
    this.enabled = false;
    this.history = new History();

    canvas.addEventListener('pointerdown', (event) => this.down(event));
    canvas.addEventListener('pointermove', (event) => this.move(event));
    canvas.addEventListener('pointerup', (event) => this.up(event));
    canvas.addEventListener('pointercancel', (event) => this.cancelGesture(event));
    window.addEventListener('keydown', (event) => this.keydown(event));
  }

  setRoom(room, {external = true} = {}) {
    if (!room) return;
    this.room = cloneRoom(room);
    if (external) {
      this.history.clear?.();
      this.updateHistoryButtons?.();
    }
    if (this.selectedId && !findObject(this.room, this.selectedId)) this.select(null);
    this.renderer.invalidate();
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) {
      this.cancelGesture();
      this.select(null);
    }
  }

  setTool(tool) {
    this.tool = tool;
    this.cancelGesture();
  }

  select(id) {
    this.selectedId = id || null;
    this.renderer.setSelection(this.selectedId);
    this.onSelection?.(this.selectedId ? findObject(this.room, this.selectedId) : null);
  }

  hitTest(point) {
    if (!this.room) return null;
    for (let index = this.room.objects.length - 1; index >= 0; index--) {
      const object = this.room.objects[index];
      const hit = RECT_TOOLS.has(object.kind)
        ? pointInRect(point.x, point.y, object)
        : pointInCircle(point.x, point.y, object);
      if (hit) return object;
    }
    return null;
  }

  pushHistory() {
    this.history.push(this.room);
    this.updateHistoryButtons?.();
  }

  emit() {
    this.room = normalizeRoom(this.room);
    this.onChange?.(cloneRoom(this.room));
    this.renderer.setSelection(this.selectedId);
    this.updateHistoryButtons?.();
  }

  down(event) {
    if (!this.enabled || event.button !== 0 || !this.room || this.tool === 'pan') return;
    if (this.renderer.shouldHandlePointer(event)) return;

    const point = this.renderer.worldPoint(event.clientX, event.clientY);
    try { this.canvas.setPointerCapture(event.pointerId); } catch {}

    if (this.tool === 'select') {
      const hit = this.hitTest(point);
      this.select(hit?.id || null);
      if (hit) {
        this.drag = {
          mode: 'move', pointerId: event.pointerId, start: point, current: point,
          original: structuredClone(hit), id: hit.id, historyPushed: false,
        };
      }
      return;
    }

    if (RECT_TOOLS.has(this.tool)) {
      this.drag = {mode: 'create', pointerId: event.pointerId, start: point, current: point, kind: this.tool};
      this.renderer.preview = {kind: this.tool, x: point.x - 5, y: point.y - 3, w: 10, h: 6};
      this.renderer.invalidate();
      return;
    }

    this.pushHistory();
    const radius = this.tool === 'light' ? 12 : this.tool === 'threat' ? 3.2 : 3.8;
    const object = normalizeObject({id: makeId(this.tool), kind: this.tool, x: point.x, y: point.y, r: radius}, this.room.width, this.room.height);
    this.room.objects.push(object);
    this.select(object.id);
    this.drag = {
      mode: 'move-new', pointerId: event.pointerId, start: point, current: point,
      original: structuredClone(object), id: object.id, historyPushed: true,
    };
    this.emit();
  }

  move(event) {
    if (!this.enabled || !this.drag || !this.room || event.pointerId !== this.drag.pointerId) return;
    if (this.renderer.shouldHandlePointer(event)) {
      this.cancelGesture();
      return;
    }

    const point = this.renderer.worldPoint(event.clientX, event.clientY);
    this.drag.current = point;

    if (this.drag.mode === 'create') {
      this.renderer.preview = {kind: this.drag.kind, ...rectFromDrag(this.drag.start, point, 2)};
      this.renderer.invalidate();
      return;
    }

    const object = findObject(this.room, this.drag.id);
    if (!object) return;
    const dx = point.x - this.drag.start.x;
    const dy = point.y - this.drag.start.y;
    if (!this.drag.historyPushed && Math.hypot(dx, dy) > .03) {
      this.pushHistory();
      this.drag.historyPushed = true;
    }

    if (RECT_TOOLS.has(object.kind)) {
      object.x = clamp(this.drag.original.x + dx, 0, this.room.width - object.w);
      object.y = clamp(this.drag.original.y + dy, 0, this.room.height - object.h);
    } else {
      object.x = clamp(this.drag.original.x + dx, object.r, this.room.width - object.r);
      object.y = clamp(this.drag.original.y + dy, object.r, this.room.height - object.r);
    }
    this.emit();
  }

  up(event) {
    if (!this.enabled || !this.drag || !this.room || event.pointerId !== this.drag.pointerId) return;
    const point = this.renderer.worldPoint(event.clientX, event.clientY);

    if (this.drag.mode === 'create') {
      this.pushHistory();
      const distance = Math.hypot(point.x - this.drag.start.x, point.y - this.drag.start.y);
      let geometry;
      if (distance < 1.2) {
        const w = this.drag.kind === 'shelter' ? 15 : 13;
        const h = this.drag.kind === 'shelter' ? 9 : 4.5;
        geometry = {x: this.drag.start.x - w / 2, y: this.drag.start.y - h / 2, w, h};
      } else geometry = rectFromDrag(this.drag.start, point, 2);
      const object = normalizeObject({id: makeId(this.drag.kind), kind: this.drag.kind, ...geometry}, this.room.width, this.room.height);
      this.room.objects.push(object);
      this.select(object.id);
      this.emit();
    }

    this.cancelGesture(event);
  }

  cancelGesture(event = null) {
    if (event && this.drag?.pointerId !== event.pointerId) return;
    if (this.drag?.pointerId != null) {
      try { this.canvas.releasePointerCapture(this.drag.pointerId); } catch {}
    }
    this.renderer.preview = null;
    this.drag = null;
    this.renderer.invalidate();
  }

  keydown(event) {
    if (!this.enabled || INPUT_TAGS.has(document.activeElement?.tagName)) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedId) {
      event.preventDefault();
      this.deleteSelected();
      return;
    }
    if (this.tool === 'pan' || !this.selectedId || !event.key.startsWith('Arrow')) return;
    const object = findObject(this.room, this.selectedId);
    if (!object) return;
    const amount = event.shiftKey ? 2 : .5;
    const patch = {};
    if (event.key === 'ArrowLeft') patch.x = object.x - amount;
    else if (event.key === 'ArrowRight') patch.x = object.x + amount;
    else if (event.key === 'ArrowUp') patch.y = object.y - amount;
    else if (event.key === 'ArrowDown') patch.y = object.y + amount;
    else return;
    event.preventDefault();
    this.updateSelected(patch);
  }

  updateSelected(patch) {
    if (!this.selectedId || !this.room) return;
    const object = findObject(this.room, this.selectedId);
    if (!object) return;
    this.pushHistory();
    const normalized = normalizeObject({...object, ...patch}, this.room.width, this.room.height);
    const index = this.room.objects.findIndex((candidate) => candidate.id === object.id);
    this.room.objects[index] = normalized;
    this.emit();
    this.select(normalized.id);
  }

  deleteSelected() {
    if (!this.selectedId || !this.room) return;
    this.pushHistory();
    removeObject(this.room, this.selectedId);
    this.select(null);
    this.emit();
  }

  undo() {
    const value = this.history.undo(this.room);
    if (!value) return;
    this.room = value;
    this.select(null);
    this.emit();
  }

  redo() {
    const value = this.history.redo(this.room);
    if (!value) return;
    this.room = value;
    this.select(null);
    this.emit();
  }
}
