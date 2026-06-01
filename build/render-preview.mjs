// Offline software renderer: produces a PNG preview of the gallery (room GLB +
// hung frames) without a GPU/browser. It's a correctness/alignment check, not a
// substitute for the live A-Frame render — lighting here is a simple Lambert
// approximation, but geometry, camera, textures and frame placement are exact.
//
// Usage (deps are not committed):
//   npm install --no-save pngjs jpeg-js
//   node build/render-preview.mjs eye=0,3,-31 look=0,3,-25 fov=68 out=preview.png
//
// It draws whichever images exist in images/ onto their frames (others are
// skipped), so it works even before all 66 photos are present.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const W = 1280, H = 720;
const GLB = 'models/obsidian-gallery.glb';

// ---------- GLB parse ----------
const glb = fs.readFileSync(GLB);
let off = 12, json = null, bin = null;
while (off < glb.length) {
  const clen = glb.readUInt32LE(off), ctype = glb.readUInt32LE(off + 4);
  const data = glb.slice(off + 8, off + 8 + clen);
  if (ctype === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (ctype === 0x004e4942) bin = data;
  off += 8 + clen;
}

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const TA = CT[a.componentType];
  const comp = NUM[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return { array: new TA(bin.buffer, bin.byteOffset + start, a.count * comp), comp, count: a.count };
}

// decode an embedded image (bufferView jpeg) to {w,h,data RGBA}
const imgCache = {};
function decodeImage(imageIndex) {
  if (imgCache[imageIndex]) return imgCache[imageIndex];
  const im = json.images[imageIndex];
  if (im.bufferView == null) return null;
  const bv = json.bufferViews[im.bufferView];
  const slice = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  let dec = null;
  try { dec = jpeg.decode(slice, { useTArray: true }); } catch (e) { dec = null; }
  imgCache[imageIndex] = dec;
  return dec;
}
function decodeJpegFile(path) {
  const buf = fs.readFileSync(path);
  return jpeg.decode(buf, { useTArray: true });
}

// material -> {texImage or color}
function materialInfo(mi) {
  const m = json.materials[mi] || {};
  const pbr = m.pbrMetallicRoughness || {};
  let tex = null;
  if (pbr.baseColorTexture) {
    const t = json.textures[pbr.baseColorTexture.index];
    tex = decodeImage(t.source);
  }
  const color = pbr.baseColorFactor || [0.8, 0.8, 0.8, 1];
  return { tex, color, alpha: color[3] != null ? color[3] : 1, name: m.name };
}

// ---------- math ----------
function quatMat(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ];
}
function nodeApply(n, p) {
  const s = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1];
  const m = quatMat(q);
  const v = [p[0] * s[0], p[1] * s[1], p[2] * s[2]];
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2] + t[0],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2] + t[1],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2] + t[2],
  ];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// ---------- camera ----------
// Read spawn + frames from gallery data.
global.window = {};
const gd = JSON.parse(fs.readFileSync('gallery-data.json', 'utf8'));

const args = Object.fromEntries(process.argv.slice(2).map((s) => s.split('=')));
const eye = (args.eye || '0,2.2,2').split(',').map(Number);
const look = (args.look || '0,2.6,-25').split(',').map(Number);
const fov = (args.fov ? +args.fov : 70) * Math.PI / 180;
const outName = args.out || 'preview.png';

const fwd = norm(sub(look, eye));
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const fpx = (W / 2) / Math.tan(fov / 2);

function project(p) {
  const d = sub(p, eye);
  const cx = dot(d, right), cy = dot(d, up), cz = dot(d, fwd);
  if (cz <= 0.01) return null;
  return { x: W / 2 + (cx * fpx) / cz, y: H / 2 - (cy * fpx) / cz, z: cz };
}

// ---------- framebuffer ----------
const col = new Uint8ClampedArray(W * H * 3);
const zbuf = new Float32Array(W * H).fill(Infinity);
// sky/background gradient
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = 200 + 16*(1-t), g = 206 + 14*(1-t), b = 214 + 12*(1-t);
  for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; col[i] = r; col[i + 1] = g; col[i + 2] = b; }
}

const LIGHT = norm([0.4, 1, 0.5]);

function sampleTex(tex, u, v) {
  if (!tex) return null;
  u = u - Math.floor(u); v = v - Math.floor(v);
  const x = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
  const y = Math.min(tex.height - 1, Math.max(0, Math.floor((1 - v) * tex.height)));
  const i = (y * tex.width + x) * 4;
  return [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
}

function rasterTri(P, uv, n, mat, flat) {
  // backface/feature cull skipped; simple shading
  const minX = Math.max(0, Math.floor(Math.min(P[0].x, P[1].x, P[2].x)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(P[0].x, P[1].x, P[2].x)));
  const minY = Math.max(0, Math.floor(Math.min(P[0].y, P[1].y, P[2].y)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(P[0].y, P[1].y, P[2].y)));
  const area = (P[1].x - P[0].x) * (P[2].y - P[0].y) - (P[2].x - P[0].x) * (P[1].y - P[0].y);
  if (Math.abs(area) < 1e-6) return;
  let shade = 1;
  if (n) shade = 0.82 + 0.45 * Math.abs(dot(norm(n), LIGHT));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((P[1].x - x) * (P[2].y - y) - (P[2].x - x) * (P[1].y - y)) / area;
      const w1 = ((P[2].x - x) * (P[0].y - y) - (P[0].x - x) * (P[2].y - y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[0].z + w1 * P[1].z + w2 * P[2].z;
      const idx = y * W + x;
      if (z >= zbuf[idx]) continue;
      let rgb;
      if (mat && mat.tex && uv) {
        const u = w0 * uv[0][0] + w1 * uv[1][0] + w2 * uv[2][0];
        const vv = w0 * uv[0][1] + w1 * uv[1][1] + w2 * uv[2][1];
        rgb = sampleTex(mat.tex, u, vv) || [200, 200, 200];
      } else if (mat) {
        rgb = [mat.color[0] * 255, mat.color[1] * 255, mat.color[2] * 255];
      } else rgb = [200, 200, 200];
      const s = flat ? 1 : shade;
      zbuf[idx] = z;
      const o = idx * 3;
      col[o] = rgb[0] * s; col[o + 1] = rgb[1] * s; col[o + 2] = rgb[2] * s;
    }
  }
}

// ---------- draw room ----------
const meshNode = {};
json.nodes.forEach((n) => { if (n.mesh != null) meshNode[n.mesh] = n; });
let drawn = 0;
json.meshes.forEach((mesh, mi) => {
  const node = meshNode[mi] || {};
  for (const prim of mesh.primitives) {
    const mat = materialInfo(prim.material);
    if (mat.alpha < 0.6) continue; // skip glass for clarity
    const pos = accessor(prim.attributes.POSITION);
    const uvA = prim.attributes.TEXCOORD_0 != null ? accessor(prim.attributes.TEXCOORD_0) : null;
    const idx = prim.indices != null ? accessor(prim.indices).array : null;
    const triCount = idx ? idx.length / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const wp = [ia, ib, ic].map((k) => nodeApply(node, [pos.array[k * 3], pos.array[k * 3 + 1], pos.array[k * 3 + 2]]));
      const Pr = wp.map(project);
      if (Pr.some((p) => !p)) continue;
      const nrm = cross(sub(wp[1], wp[0]), sub(wp[2], wp[0]));
      let uv = null;
      if (uvA && mat.tex) uv = [ia, ib, ic].map((k) => [uvA.array[k * 2], uvA.array[k * 2 + 1]]);
      rasterTri(Pr, uv, nrm, mat, false);
      drawn++;
    }
  }
});

// ---------- draw hung pictures (every photo present in images/) ----------
function quatRotate(q, v) {
  const m = quatMat(q);
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}
for (const f of gd.frames) {
  const path = 'images/' + f.file;
  if (!fs.existsSync(path)) continue;
  let tex; try { tex = decodeJpegFile(path); } catch (e) { continue; }
  const aspect = tex.width / tex.height;
  let h = 2.4, w = h * aspect; if (w > 3.6) { w = 3.6; h = w / aspect; }
  const q = [f.quaternion.x, f.quaternion.y, f.quaternion.z, f.quaternion.w];
  const c = [f.position.x, f.position.y, f.position.z];
  const rt = quatRotate(q, [1, 0, 0]); const upv = quatRotate(q, [0, 1, 0]); const fz = quatRotate(q, [0, 0, 1]);
  const corner = (sx, sy) => [
    c[0] + rt[0] * sx * w / 2 + upv[0] * sy * h / 2 + fz[0] * 0.05,
    c[1] + rt[1] * sx * w / 2 + upv[1] * sy * h / 2 + fz[1] * 0.05,
    c[2] + rt[2] * sx * w / 2 + upv[2] * sy * h / 2 + fz[2] * 0.05,
  ];
  const TL = corner(-1, 1), TR = corner(1, 1), BL = corner(-1, -1), BR = corner(1, -1);
  const texObj = { width: tex.width, height: tex.height, data: tex.data };
  const pj = [TL, TR, BL, BR].map(project);
  if (pj.every((p) => p)) {
    rasterTri([pj[0], pj[1], pj[2]], [[0, 1], [1, 1], [0, 0]], null, { tex: texObj, color: [1, 1, 1] }, true);
    rasterTri([pj[1], pj[3], pj[2]], [[1, 1], [1, 0], [0, 0]], null, { tex: texObj, color: [1, 1, 1] }, true);
  }
}

// ---------- write ----------
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = col[i * 3];
  png.data[i * 4 + 1] = col[i * 3 + 1];
  png.data[i * 4 + 2] = col[i * 3 + 2];
  png.data[i * 4 + 3] = 255;
}
fs.writeFileSync(outName, PNG.sync.write(png));
console.log(`rendered ${drawn} room tris -> ${outName}  eye=[${eye}] look=[${look}]`);
