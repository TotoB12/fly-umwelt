export class Xoshiro128 {
  constructor(seed = 0x5eedc0de) {
    let x = seed >>> 0;
    const splitmix = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = splitmix(); this.s1 = splitmix(); this.s2 = splitmix(); this.s3 = splitmix();
  }
  nextUint() {
    const result = Math.imul(((this.s1 * 5) >>> 0), 0x7fffffff) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0; this.s3 ^= this.s1; this.s1 ^= this.s2; this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;
    return result;
  }
  next() { return this.nextUint() / 0x100000000; }
  range(min, max) { return min + (max - min) * this.next(); }
  normal() {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  int(n) { return Math.floor(this.next() * n); }
  state() { return [this.s0, this.s1, this.s2, this.s3]; }
  restore(s) { [this.s0, this.s1, this.s2, this.s3] = s.map(x => x >>> 0); }
}

export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
