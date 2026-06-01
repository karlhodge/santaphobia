// Faithful frame placement: keep the original Spatial layout exactly as the
// artist arranged it, and only correct each print's DEPTH so it sits flush on
// the corresponding wall of the served GLB room (the GLB is a slightly resized
// export, so a global transform can't line everything up).
//
// For each frame (source: build/frames-spatial.json, the pristine Spatial
// export):
//   * facing axis is taken from the original orientation (reliable; only the
//     SIDE was ambiguous in the export),
//   * the wall is found by raycasting along that axis from the frame,
//   * the frame is re-seated flush on the room side of that wall, KEEPING its
//     lateral and vertical position (so the visible arrangement is unchanged),
//   * orientation is rebuilt so the print's front (+Z, per index.html) faces
//     into the room.
//
// Usage: node build/place-frames.mjs [--dry]
import fs from 'node:fs';
const DRY = process.argv.includes('--dry');
const PROUD = 0.06;          // metres a print stands off its wall
const MAX_RANGE = 4.5;       // furthest a frame's own wall can sensibly be

const SRC = JSON.parse(fs.readFileSync(new URL('./frames-spatial.json', import.meta.url), 'utf8'));

// ---------- GLB wall triangles ----------
const glb = fs.readFileSync('models/obsidian-gallery.glb');
let off = 12, json = null, bin = null;
while (off < glb.length) { const cl = glb.readUInt32LE(off), ct = glb.readUInt32LE(off + 4); const d = glb.slice(off + 8, off + 8 + cl); if (ct === 0x4e4f534a) json = JSON.parse(d.toString('utf8')); else if (ct === 0x004e4942) bin = d; off += 8 + cl; }
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5122: Int16Array, 5121: Uint8Array, 5120: Int8Array }, NUM = { SCALAR: 1, VEC3: 3, VEC2: 2, VEC4: 4 };
function acc(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const TA = CT[a.componentType]; const st = (bv.byteOffset || 0) + (a.byteOffset || 0); return new TA(bin.buffer, bin.byteOffset + st, a.count * NUM[a.type]); }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fromTRS(t, r, s) { const [x, y, z, w] = r; return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + w * z)) * s[0], (2 * (x * z - w * y)) * s[0], 0, (2 * (x * y - w * z)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + w * x)) * s[1], 0, (2 * (x * z + w * y)) * s[2], (2 * (y * z - w * x)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
function nm(n) { return n.matrix ? n.matrix.slice() : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]); }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
const mn = {}; json.nodes.forEach((n) => { if (n.mesh != null) mn[n.mesh] = n; });
const tris = []; let aabb = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 };
json.meshes.forEach((mesh, mi) => { const node = mn[mi] || {}; const name = (node.name || '').toLowerCase(); if (name.includes('slat') || name.includes('glass') || name.includes('mullion') || name.includes('water') || name.includes('floor') || name.includes('ceiling') || name.includes('illum')) return; const m = nm(node); for (const prim of mesh.primitives) { const pos = acc(prim.attributes.POSITION); const idx = prim.indices != null ? acc(prim.indices) : null; const tc = idx ? idx.length / 3 : pos.length / 9; for (let t = 0; t < tc; t++) { const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2; const a = xf(m, [pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]]); const b = xf(m, [pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]]); const c = xf(m, [pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]]); const n = norm(cross(sub(b, a), sub(c, a))); if (Math.abs(n[1]) > 0.5) continue; const ay = (a[1] + b[1] + c[1]) / 3; if (ay < 1.0 || ay > 5) continue; tris.push({ a, b, c, n }); for (const v of [a, b, c]) { aabb.minX = Math.min(aabb.minX, v[0]); aabb.maxX = Math.max(aabb.maxX, v[0]); aabb.minZ = Math.min(aabb.minZ, v[2]); aabb.maxZ = Math.max(aabb.maxZ, v[2]); } } } });

function rayTri(orig, dir, T) { const e1 = sub(T.b, T.a), e2 = sub(T.c, T.a), p = cross(dir, e2); const det = dot(e1, p); if (Math.abs(det) < 1e-7) return null; const inv = 1 / det; const tv = sub(orig, T.a); const u = dot(tv, p) * inv; if (u < -1e-4 || u > 1.0001) return null; const q = cross(tv, e1); const v = dot(dir, q) * inv; if (v < -1e-4 || u + v > 1.0001) return null; const t = dot(e2, q) * inv; return t > 1e-4 ? t : null; }
// nearest wall (perpendicular to `axisIdx`) along ±axis from p; returns the wall coordinate
function wallAlongAxis(p, axisIdx) {
  const dirs = [[0, 0, 0], [0, 0, 0]]; dirs[0][axisIdx] = 1; dirs[1][axisIdx] = -1;
  let bestT = MAX_RANGE + 1, bestSign = 0;
  for (const d of dirs) { for (const T of tris) { if (Math.abs(T.n[axisIdx]) < 0.5) continue; const t = rayTri(p, d, T); if (t != null && t < bestT) { bestT = t; bestSign = d[axisIdx]; } } }
  if (bestT > MAX_RANGE) return null;
  return p[axisIdx] + bestSign * bestT; // wall coordinate on this axis
}

function quatFromFront(fwd) {
  let right = cross([0, 1, 0], fwd); if (len(right) < 1e-4) right = [1, 0, 0]; right = norm(right);
  const up = norm(cross(fwd, right));
  const m00 = right[0], m10 = right[1], m20 = right[2], m01 = up[0], m11 = up[1], m21 = up[2], m02 = fwd[0], m12 = fwd[1], m22 = fwd[2];
  const tr = m00 + m11 + m22; let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  const l = Math.hypot(...q) || 1; return q.map((v) => v / l);
}

// interior centroid (kept for reference / diagnostics)
let cenX = 0, cenZ = 0; for (const f of SRC.frames) { cenX += f.position.x; cenZ += f.position.z; } cenX /= SRC.frames.length; cenZ /= SRC.frames.length;
function front0(q) { const m = fromTRS([0, 0, 0], [q.x, q.y, q.z, q.z !== undefined ? q.w : 1], [1, 1, 1]); return [m[8], m[9], m[10]]; }

// In the Spatial export the print's face is local -Z (verified against the room
// geometry). index.html renders the print on local +Z, so we bake a 180° turn
// about up into each quaternion: new local +Z = old front = into the room.
function flipY(q) { return { x: -q.z, y: q.w, z: q.x, w: -q.y }; }

const data = JSON.parse(JSON.stringify(SRC));
let seated = 0, fellback = 0, moved = 0, maxMove = 0;
data.frames.forEach((f) => {
  const p = [f.position.x, f.position.y, f.position.z];
  const f0 = front0(f.quaternion);                       // local +Z (points to the wall)
  const axisIdx = Math.abs(f0[0]) >= Math.abs(f0[2]) ? 0 : 2; // 0=x, 2=z
  const roomSign = -Math.sign(f0[axisIdx]) || 1;         // toward the room (front = -localZ)
  const wallCoord = wallAlongAxis(p, axisIdx);
  let newAxisVal;
  if (wallCoord == null) { newAxisVal = p[axisIdx]; fellback++; }          // glass-facade side: leave as placed
  else { newAxisVal = wallCoord + roomSign * PROUD; seated++; const dm = Math.abs(newAxisVal - p[axisIdx]); if (dm > 0.01) moved++; if (dm > maxMove) maxMove = dm; }
  const pos = [...p]; pos[axisIdx] = newAxisVal;
  const q = flipY(f.quaternion);
  f.position = { x: +pos[0].toFixed(4), y: +pos[1].toFixed(4), z: +pos[2].toFixed(4) };
  f.quaternion = { x: +q.x.toFixed(6), y: +q.y.toFixed(6), z: +q.z.toFixed(6), w: +q.w.toFixed(6) };
});
console.log(`placed ${data.frames.length} | depth-seated ${seated} | left-as-placed ${fellback} | adjusted ${moved} | max depth move ${maxMove.toFixed(2)}m`);

let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
for (const f of data.frames) { bx0 = Math.min(bx0, f.position.x); bx1 = Math.max(bx1, f.position.x); bz0 = Math.min(bz0, f.position.z); bz1 = Math.max(bz1, f.position.z); }
data.bounds = { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 };

if (!DRY) {
  const s = JSON.stringify(data);
  fs.writeFileSync('gallery-data.json', s);
  fs.writeFileSync('gallery-data.js', '// Auto-generated by build/generate.mjs — do not edit by hand.\nwindow.GALLERY_DATA = ' + s + ';\n');
  console.log('wrote gallery-data.json and gallery-data.js');
} else console.log('(dry run)');
