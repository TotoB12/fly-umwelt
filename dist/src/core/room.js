import {OBJECT_KINDS} from './constants.js';
import {clamp} from './geometry.js';

let nextId = 1;
export function makeId(kind = 'object') { return `${kind}-${Date.now().toString(36)}-${(nextId++).toString(36)}`; }

export function normalizeObject(raw, width, height) {
  const kind = OBJECT_KINDS[raw.kind] ? raw.kind : 'wall';
  const obj = {id: String(raw.id || makeId(kind)), kind};
  if (OBJECT_KINDS[kind].shape === 'rect') {
    obj.w = clamp(Number(raw.w) || 8, 2, width);
    obj.h = clamp(Number(raw.h) || 5, 2, height);
    obj.x = clamp(Number(raw.x) || 0, 0, width - obj.w);
    obj.y = clamp(Number(raw.y) || 0, 0, height - obj.h);
  } else {
    obj.r = clamp(Number(raw.r) || 3, 1, 20);
    obj.x = clamp(Number(raw.x) || width / 2, obj.r, width - obj.r);
    obj.y = clamp(Number(raw.y) || height / 2, obj.r, height - obj.r);
  }
  if (kind === 'food' || kind === 'water') {
    obj.amount = clamp(Number(raw.amount ?? 1), 0, 1);
    obj.odor = clamp(Number(raw.odor ?? 0.8), 0, 2);
  }
  if (kind === 'light') obj.strength = clamp(Number(raw.strength ?? 0.8), 0, 2);
  if (kind === 'threat') {
    obj.speed = clamp(Number(raw.speed ?? 3), 0, 15);
    obj.heading = Number.isFinite(Number(raw.heading)) ? Number(raw.heading) : 0;
    obj.odor = clamp(Number(raw.odor ?? 0.8), 0, 2);
  }
  return obj;
}

export function normalizeRoom(raw = {}) {
  const width = clamp(Number(raw.width) || 120, 40, 300);
  const height = clamp(Number(raw.height) || 80, 30, 220);
  const room = {
    version: 1,
    name: String(raw.name || 'Untitled chamber').slice(0, 80),
    width, height,
    ambientLight: clamp(Number(raw.ambientLight ?? 0.45), 0, 1),
    temperature: clamp(Number(raw.temperature ?? 0.5), 0, 1),
    spawn: {
      x: clamp(Number(raw.spawn?.x) || width / 2, 2, width - 2),
      y: clamp(Number(raw.spawn?.y) || height / 2, 2, height - 2),
      heading: Number(raw.spawn?.heading) || 0,
    },
    objects: Array.isArray(raw.objects) ? raw.objects.slice(0, 256).map(o => normalizeObject(o, width, height)) : [],
  };
  return room;
}

export function cloneRoom(room) { return normalizeRoom(structuredClone(room)); }
export function exportRoom(room) { return JSON.stringify(normalizeRoom(room), null, 2); }
export function findObject(room, id) { return room.objects.find(o => o.id === id) || null; }
export function removeObject(room, id) { room.objects = room.objects.filter(o => o.id !== id); }
