// Generate a seamless, soft cloud texture (white clouds, transparent gaps) for
// a slowly drifting overhead cloud layer. Tileable in both axes.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const W = 1024, H = 1024;
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const wrap = (n, p) => ((n % p) + p) % p;
  const a = hash(wrap(xi, period), wrap(yi, period));
  const b = hash(wrap(xi + 1, period), wrap(yi, period));
  const c = hash(wrap(xi, period), wrap(yi + 1, period));
  const d = hash(wrap(xi + 1, period), wrap(yi + 1, period));
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(px, py) {
  let f = 5, amp = 0.5, sum = 0, norm = 0;
  for (let o = 0; o < 5; o++) { sum += amp * vnoise(px * f, py * f, f); norm += amp; f *= 2; amp *= 0.5; }
  return sum / norm;
}
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const png = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const n = fbm(x / W, y / H);
    // clouds where noise is high; soft edges; keep coverage airy
    const a = smooth(0.52, 0.78, n);
    const i = (y * W + x) * 4;
    const shade = 235 + Math.round(20 * (n - 0.5)); // subtle bright/grey variation
    png.data[i] = Math.min(255, shade);
    png.data[i + 1] = Math.min(255, shade);
    png.data[i + 2] = Math.min(255, shade + 4);
    png.data[i + 3] = Math.round(a * 255);
  }
}
fs.writeFileSync('textures/clouds.png', PNG.sync.write(png));
console.log('wrote textures/clouds.png', W + 'x' + H);
