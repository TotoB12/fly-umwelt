export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const hypot2 = (x, y) => Math.hypot(x, y);
export function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function pointInRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
export function pointInCircle(px, py, c) { return Math.hypot(px - c.x, py - c.y) <= c.r; }

export function rayCircle(ox, oy, dx, dy, c, maxDist = Infinity) {
  const lx = c.x - ox, ly = c.y - oy;
  const tca = lx * dx + ly * dy;
  const d2 = lx * lx + ly * ly - tca * tca;
  const r2 = c.r * c.r;
  if (d2 > r2) return null;
  const thc = Math.sqrt(Math.max(0, r2 - d2));
  let t = tca - thc;
  if (t < 0) t = tca + thc;
  return t >= 0 && t <= maxDist ? t : null;
}

export function rayRect(ox, oy, dx, dy, r, maxDist = Infinity) {
  const invX = Math.abs(dx) < 1e-9 ? Infinity : 1 / dx;
  const invY = Math.abs(dy) < 1e-9 ? Infinity : 1 / dy;
  let t1 = (r.x - ox) * invX, t2 = (r.x + r.w - ox) * invX;
  let t3 = (r.y - oy) * invY, t4 = (r.y + r.h - oy) * invY;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
  if (tmax < 0 || tmin > tmax) return null;
  const t = tmin >= 0 ? tmin : tmax;
  return t >= 0 && t <= maxDist ? t : null;
}

export function circleRectOverlap(cx, cy, radius, r) {
  const qx = clamp(cx, r.x, r.x + r.w);
  const qy = clamp(cy, r.y, r.y + r.h);
  const dx = cx - qx, dy = cy - qy;
  return dx * dx + dy * dy < radius * radius;
}

export function resolveCircleRect(body, radius, r) {
  if (!circleRectOverlap(body.x, body.y, radius, r)) return null;
  const qx = clamp(body.x, r.x, r.x + r.w);
  const qy = clamp(body.y, r.y, r.y + r.h);
  let dx = body.x - qx, dy = body.y - qy;
  let d = Math.hypot(dx, dy);
  if (d < 1e-8) {
    const candidates = [
      {d: Math.abs(body.x - r.x), nx: -1, ny: 0},
      {d: Math.abs(r.x + r.w - body.x), nx: 1, ny: 0},
      {d: Math.abs(body.y - r.y), nx: 0, ny: -1},
      {d: Math.abs(r.y + r.h - body.y), nx: 0, ny: 1},
    ].sort((a,b) => a.d - b.d);
    dx = candidates[0].nx; dy = candidates[0].ny; d = 1;
  }
  const nx = dx / d, ny = dy / d;
  const penetration = radius - d;
  body.x += nx * penetration;
  body.y += ny * penetration;
  return {nx, ny, penetration};
}

export function rectFromDrag(a, b, min = 2) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return {x, y, w: Math.max(min, Math.abs(a.x - b.x)), h: Math.max(min, Math.abs(a.y - b.y))};
}
