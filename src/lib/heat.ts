/** Map 0–100 onto the CECH heat scale (red → amber → green). */
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [255, 128, 128]],
  [35, [255, 178, 122]],
  [55, [255, 214, 122]],
  [75, [201, 233, 138]],
  [100, [126, 222, 130]],
];

export function heatColor(value: number, alpha = 1): string {
  const v = Math.max(0, Math.min(100, value));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (v <= p1) {
      const t = (v - p0) / (p1 - p0);
      const c = c0.map((x, k) => Math.round(x + (c1[k] - x) * t));
      return `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;
    }
  }
  return `rgb(126 222 130 / ${alpha})`;
}
