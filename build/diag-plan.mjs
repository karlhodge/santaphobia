// Diagnostic top-down plan: separate wall meshes by material, overlay frames.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const glb = fs.readFileSync('models/obsidian-gallery.glb');
let off = 12, json = null, bin = null;
while (off < glb.length) { const cl = glb.readUInt32LE(off), ct = glb.readUInt32LE(off + 4); const d = glb.slice(off + 8, off + 8 + cl); if (ct === 0x4e4f534a) json = JSON.parse(d.toString('utf8')); else if (ct === 0x004e4942) bin = d; off += 8 + cl; }
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function acc(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const TA = CT[a.componentType]; const start = (bv.byteOffset || 0) + (a.byteOffset || 0); return { array: new TA(bin.buffer, bin.byteOffset + start, a.count * NUM[a.type]), count: a.count }; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fromTRS(t, r, s) { const [x, y, z, w] = r; return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + w * z)) * s[0], (2 * (x * z - w * y)) * s[0], 0, (2 * (x * y - w * z)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + w * x)) * s[1], 0, (2 * (x * z + w * y)) * s[2], (2 * (y * z - w * x)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
function nodeMat(n) { return n.matrix ? n.matrix.slice() : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]); }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
const meshNode = {}; json.nodes.forEach((n) => { if (n.mesh != null) meshNode[n.mesh] = n; });

// collect vertical tris per category, art-height band 1.2..4.8
const cats = { wall: [], slat: [], other: [] };
json.meshes.forEach((mesh, mi) => {
  const node = meshNode[mi] || {}; const nm = (node.name || '').toLowerCase();
  const m = nodeMat(node);
  let cat = 'other';
  if (nm.includes('white walls') || nm.includes('mixed walls')) cat = 'wall';
  else if (nm.includes('slat')) cat = 'slat';
  else if (nm.includes('water') || nm.includes('floor') || nm.includes('ceiling') || nm.includes('illum')) return; // skip horizontals
  for (const prim of mesh.primitives) {
    const pos = acc(prim.attributes.POSITION); const idx = prim.indices != null ? acc(prim.indices).array : null;
    const tc = idx ? idx.length / 3 : pos.count / 3;
    for (let t = 0; t < tc; t++) {
      const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const a = xf(m, [pos.array[ia * 3], pos.array[ia * 3 + 1], pos.array[ia * 3 + 2]]);
      const b = xf(m, [pos.array[ib * 3], pos.array[ib * 3 + 1], pos.array[ib * 3 + 2]]);
      const c = xf(m, [pos.array[ic * 3], pos.array[ic * 3 + 1], pos.array[ic * 3 + 2]]);
      const n = norm(cross(sub(b, a), sub(c, a)));
      if (Math.abs(n[1]) > 0.45) continue;
      const ay = (a[1] + b[1] + c[1]) / 3; if (ay < 1.2 || ay > 4.8) continue;
      cats[cat].push([a, b, c]);
    }
  }
});
console.log('art-height vertical tris -> walls:', cats.wall.length, '| slats:', cats.slat.length, '| other:', cats.other.length);

// bounds from walls
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const tri of cats.wall) for (const v of tri) { minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]); }
const data = JSON.parse(fs.readFileSync('gallery-data.json', 'utf8'));
for (const f of data.frames) { minX = Math.min(minX, f.position.x); maxX = Math.max(maxX, f.position.x); minZ = Math.min(minZ, f.position.z); maxZ = Math.max(maxZ, f.position.z); }

const W = 1100, H = 1000, pad = 40;
const sx = (W - 2 * pad) / (maxX - minX), sz = (H - 2 * pad) / (maxZ - minZ), s = Math.min(sx, sz);
const px = (x) => pad + (x - minX) * s, py = (z) => pad + (z - minZ) * s;
const png = new PNG({ width: W, height: H });
png.data.fill(0); for (let i = 0; i < png.data.length; i += 4) { png.data[i + 3] = 255; png.data[i] = png.data[i + 1] = png.data[i + 2] = 14; }
function plot(x, y, r, g, b) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; }
function dot(x, y, rad, r, g, b) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) plot(x + dx, y + dy, r, g, b); }
function line(x0, y0, x1, y1, r, g, b) { const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sX = x0 < x1 ? 1 : -1, sY = y0 < y1 ? 1 : -1; let err = dx - dy, x = x0, y = y0; for (let k = 0; k < 4000; k++) { plot(x, y, r, g, b); if (Math.abs(x - x1) < 1 && Math.abs(y - y1) < 1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sX; } if (e2 < dx) { err += dx; y += sY; } } }

// draw walls (gray), slats (orange), other (dim blue)
for (const tri of cats.other) for (let e = 0; e < 3; e++) { const a = tri[e], b = tri[(e + 1) % 3]; line(px(a[0]), py(a[2]), px(b[0]), py(b[2]), 30, 40, 70); }
for (const tri of cats.slat) for (let e = 0; e < 3; e++) { const a = tri[e], b = tri[(e + 1) % 3]; line(px(a[0]), py(a[2]), px(b[0]), py(b[2]), 150, 90, 30); }
for (const tri of cats.wall) for (let e = 0; e < 3; e++) { const a = tri[e], b = tri[(e + 1) % 3]; line(px(a[0]), py(a[2]), px(b[0]), py(b[2]), 150, 150, 160); }

// frames
for (const f of data.frames) {
  const q = f.quaternion, x = f.position.x, z = f.position.z;
  const m = fromTRS([0, 0, 0], [q.x, q.y, q.z, q.w], [1, 1, 1]); const fwd = [m[8], m[10]];
  dot(px(x), py(z), 4, 230, 40, 40);
  line(px(x), py(z), px(x + fwd[0] * 1.4), py(z + fwd[1] * 1.4), 40, 220, 40);
}
fs.writeFileSync('/tmp/diag.png', PNG.sync.write(png));
console.log('wrote /tmp/diag.png  gray=REAL walls, orange=slats, blue=other, red=frame, green=facing');
console.log('wall bounds XZ:', minX.toFixed(1), maxX.toFixed(1), '|', minZ.toFixed(1), maxZ.toFixed(1));
