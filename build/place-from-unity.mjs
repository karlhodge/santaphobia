// Authoritative frame placement, sourced from the original Obsidian Unity
// template (Assets/Obsidian/Scenes/Obsidian.unity), which contains 66
// "EmptyFrame" placeholders — one per artwork — positioned by the gallery's
// designer on the real walls.
//
// Pipeline:
//   1. Unity EmptyFrame world transforms are pre-extracted to
//      build/frames-unity.json (parsed from the Unity scene's 66 EmptyFrame
//      transforms; the Unity project itself is not vendored in this repo).
//   2. Calibrated Unity->GLB map (solved against the served GLB geometry):
//        x_glb = -x_unity ,  z_glb = -z_unity + 3.5 ,  y unchanged.
//      (The previous export omitted the +3.5 Z shift, floating the back row.)
//   3. Each existing image (keeping its file/driveId/id/size) is matched to its
//      original EmptyFrame, then seated flush on the nearest real wall facing
//      into the room (local +Z = inward normal, per index.html).
//
// Usage: node build/place-from-unity.mjs [--dry]
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const UNITY = JSON.parse(fs.readFileSync(new URL('./frames-unity.json', import.meta.url), 'utf8'));
const CAL = { sx: -1, sz: -1, tx: 0, tz: 3.5 };
const toGlb = (p) => [CAL.sx * p[0] + CAL.tx, p[1], CAL.sz * p[2] + CAL.tz];

// ---------- GLB walls ----------
const glb = fs.readFileSync('models/obsidian-gallery.glb');
let off = 12, json = null, bin = null;
while (off < glb.length) { const cl = glb.readUInt32LE(off), ct = glb.readUInt32LE(off + 4); const d = glb.slice(off + 8, off + 8 + cl); if (ct === 0x4e4f534a) json = JSON.parse(d.toString('utf8')); else if (ct === 0x004e4942) bin = d; off += 8 + cl; }
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function acc(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const TA = CT[a.componentType]; const st = (bv.byteOffset || 0) + (a.byteOffset || 0); return { array: new TA(bin.buffer, bin.byteOffset + st, a.count * NUM[a.type]), count: a.count }; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sca = (a, s) => [a[0] * s, a[1] * s, a[2] * s], norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fromTRS(t, r, s) { const [x, y, z, w] = r; return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + w * z)) * s[0], (2 * (x * z - w * y)) * s[0], 0, (2 * (x * y - w * z)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + w * x)) * s[1], 0, (2 * (x * z + w * y)) * s[2], (2 * (y * z - w * x)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
function nm(n) { return n.matrix ? n.matrix.slice() : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]); }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
function cot(p, a, b, c) { const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a); const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a; const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b; const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, sca(ab, d1 / (d1 - d3))); const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c; const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, sca(ac, d2 / (d2 - d6))); const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) return add(b, sca(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))); const dn = 1 / (va + vb + vc); return add(add(a, sca(ab, vb * dn)), sca(ac, vc * dn)); }
const mn = {}; json.nodes.forEach((n) => { if (n.mesh != null) mn[n.mesh] = n; });
const tris = [];
json.meshes.forEach((mesh, mi) => { const node = mn[mi] || {}; const name = (node.name || '').toLowerCase(); if (name.includes('slat') || name.includes('glass') || name.includes('mullion') || name.includes('water') || name.includes('floor') || name.includes('ceiling') || name.includes('illum')) return; const m = nm(node); for (const prim of mesh.primitives) { const pos = acc(prim.attributes.POSITION); const idx = prim.indices != null ? acc(prim.indices).array : null; const tc = idx ? idx.length / 3 : pos.count / 3; for (let t = 0; t < tc; t++) { const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2; const a = xf(m, [pos.array[ia * 3], pos.array[ia * 3 + 1], pos.array[ia * 3 + 2]]); const b = xf(m, [pos.array[ib * 3], pos.array[ib * 3 + 1], pos.array[ib * 3 + 2]]); const c = xf(m, [pos.array[ic * 3], pos.array[ic * 3 + 1], pos.array[ic * 3 + 2]]); const n = norm(cross(sub(b, a), sub(c, a))); if (Math.abs(n[1]) > 0.5) continue; const ay = (a[1] + b[1] + c[1]) / 3; if (ay < 1.0 || ay > 5) continue; tris.push({ a, b, c, n }); } } });

function nearestWall(p) { let best = null, bd = 1e9; for (const tr of tris) { const cp = cot(p, tr.a, tr.b, tr.c); const d = len(sub(p, cp)); if (d < bd) { bd = d; best = { cp, n: tr.n, d }; } } return best; }
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

// ---------- recover image -> EmptyFrame assignment ----------
// The previous export mapped Unity->data as (-x, y, -z) with no Z shift; match
// each existing frame to its nearest Unity placeholder under that same map.
const data = JSON.parse(fs.readFileSync('gallery-data.json', 'utf8'));
const uOld = UNITY.frames.map((f) => [-f.pos.x, f.pos.y, -f.pos.z]); // old-export space
const pairs = [];
data.frames.forEach((f, fi) => { uOld.forEach((u, ui) => { pairs.push({ fi, ui, d: len(sub([f.position.x, f.position.y, f.position.z], u)) }); }); });
pairs.sort((a, b) => a.d - b.d);
const fUsed = new Array(data.frames.length).fill(false), uUsed = new Array(UNITY.frames.length).fill(false);
const assign = new Array(data.frames.length).fill(-1);
let matchErr = 0;
for (const p of pairs) { if (fUsed[p.fi] || uUsed[p.ui]) continue; fUsed[p.fi] = true; uUsed[p.ui] = true; assign[p.fi] = p.ui; matchErr += p.d; }
console.log('assignment mean match error (old space):', (matchErr / data.frames.length).toFixed(3), 'm');

// ---------- place ----------
const PROUD = 0.06;
let reproj = 0, kept = 0, maxOff = 0;
data.frames.forEach((f, fi) => {
  const uf = UNITY.frames[assign[fi]];
  const center = toGlb([uf.pos.x, uf.pos.y, uf.pos.z]);
  // transformed Unity facing (local +Z): apply the rotation part (negate x,z)
  const fwdU = uf.fwdZ; const fwdT = norm([CAL.sx * fwdU[0], fwdU[1], CAL.sz * fwdU[2]]);
  const w = nearestWall(center);
  let pos, front;
  if (w && w.d < 1.6) {
    // inward normal = wall normal on the side the curated facing points
    let ndir = (dot(w.n, fwdT) >= 0) ? w.n : sca(w.n, -1);
    ndir = norm([ndir[0], 0, ndir[2]]); // keep upright
    front = ndir;
    pos = add(w.cp, sca(ndir, PROUD)); // flush on wall, slightly proud
    reproj++; if (w.d > maxOff) maxOff = w.d;
  } else {
    front = norm([fwdT[0], 0, fwdT[2]]);
    pos = center; kept++;
  }
  const quat = quatFromFront(front);
  f.position = { x: +pos[0].toFixed(4), y: +center[1].toFixed(4), z: +pos[2].toFixed(4) };
  f.quaternion = { x: +quat[0].toFixed(6), y: +quat[1].toFixed(6), z: +quat[2].toFixed(6), w: +quat[3].toFixed(6) };
});
console.log(`placed ${data.frames.length} frames | reprojected onto wall: ${reproj} | kept-as-calibrated: ${kept} | max wall offset corrected: ${maxOff.toFixed(2)}m`);

// bounds
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
for (const f of data.frames) { bx0 = Math.min(bx0, f.position.x); bx1 = Math.max(bx1, f.position.x); bz0 = Math.min(bz0, f.position.z); bz1 = Math.max(bz1, f.position.z); }
data.bounds = { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 };

if (!DRY) {
  const s = JSON.stringify(data);
  fs.writeFileSync('gallery-data.json', s);
  fs.writeFileSync('gallery-data.js', '// Auto-generated by build/generate.mjs — do not edit by hand.\nwindow.GALLERY_DATA = ' + s + ';\n');
  console.log('wrote gallery-data.json and gallery-data.js');
} else console.log('(dry run)');
