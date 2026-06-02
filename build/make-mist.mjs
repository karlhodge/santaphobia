// Soft, seamless, low-contrast fog/mist texture (tileable) for a drifting mist
// layer over the water outside the gallery. Uniform coverage (no vertical taper).
import fs from 'node:fs';
import { PNG } from 'pngjs';

const W = 1024, H = 1024;
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const wrap = (n, p) => ((n % p) + p) % p;
  const a = hash(wrap(xi, period), wrap(yi, period)), b = hash(wrap(xi + 1, period), wrap(yi, period));
  const c = hash(wrap(xi, period), wrap(yi + 1, period)), d = hash(wrap(xi + 1, period), wrap(yi + 1, period));
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(px, py) { let f = 4, amp = 0.5, s = 0, n = 0; for (let o = 0; o < 5; o++) { s += amp * vnoise(px * f, py * f, f); n += amp; f *= 2; amp *= 0.5; } return s / n; }
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const col = [206, 214, 221]; // soft pale grey
const png = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const n = fbm(x / W, y / H);
  const a = smooth(0.38, 0.78, n) * 0.7;   // broad, soft, ~60% coverage
  const i = (y * W + x) * 4;
  png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2]; png.data[i + 3] = Math.round(a * 255);
}
fs.writeFileSync('textures/mist.png', PNG.sync.write(png));
console.log('wrote textures/mist.png', W + 'x' + H);
