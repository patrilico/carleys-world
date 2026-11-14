export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const clamp100 = (v: number): number => clamp(v, 0, 100);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. `rate` is 1/seconds. */
export const approach = (cur: number, target: number, rate: number, dt: number): number =>
  target + (cur - target) * Math.exp(-rate * dt);
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
export const sign = (v: number): number => (v < 0 ? -1 : 1);

/** Smooth bump centred at `centre` hours on a 24h circle. */
export function hourBump(hour: number, centre: number, halfWidth: number): number {
  let d = Math.abs(hour - centre);
  if (d > 12) d = 24 - d;
  return Math.exp(-(d * d) / (2 * halfWidth * halfWidth));
}

export function easeInOut(t: number): number {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}
export function easeOutBack(t: number): number {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
