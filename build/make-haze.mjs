// Vertical haze gradient for the horizon band: fog-colour, opaque at the bottom
// (horizon) fading to fully transparent toward the top. Mapped onto a cylinder
// so distant mountains blend into the scene at the horizon.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const W = 8, H = 256;
const col = [143, 153, 166]; // #8f99a6, matches scene fog
const png = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) {
  // row 0 = image top → cylinder top (transparent); row H-1 = bottom → horizon (opaque)
  const t = y / (H - 1);                 // 0 top .. 1 bottom
  const a = Math.pow(t, 1.5) * 0.72;     // smooth fade, max ~0.72 at horizon
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2];
    png.data[i + 3] = Math.round(a * 255);
  }
}
fs.writeFileSync('textures/haze-gradient.png', PNG.sync.write(png));
console.log('wrote textures/haze-gradient.png', W + 'x' + H);
