// Snap each hung print onto the nearest real wall surface in the room model,
// flush and facing into the room. This decouples print placement from the
// Spatial frame-export's coordinate offset (the export and the GLB don't share
// the same Z extent), which left a row of prints floating behind the back wall.
//
// Strategy per frame:
//   1. Find the nearest vertical wall triangle (at art height) to the frame.
//   2. Re-seat the frame at the closest point on that wall, pushed 6 cm proud.
//   3. Orient the print's front (+Z) along the wall normal:
//        - perimeter walls  -> face toward the room interior (fixes back row)
//        - interior partitions -> keep the curated facing side
//   4. Bake new position + quaternion into gallery-data.json / .js.
//
// Usage: node build/snap-frames.mjs            (writes the data files)
//        node build/snap-frames.mjs --dry      (report only, no write)
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const GLB = 'models/obsidian-gallery.glb';

// ---------- GLB parse ----------
const glb = fs.readFileSync(GLB);
let off = 12, json = null, bin = null;
while (off < glb.length) {
  const clen = glb.readUInt32LE(off), ctype = glb.readUInt32LE(off + 4);
  const d = glb.slice(off + 8, off + 8 + clen);
  if (ctype === 0x4e4f534a) json = JSON.parse(d.toString('utf8'));
  else if (ctype === 0x004e4942) bin = d;
  off += 8 + clen;
}
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function acc(i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const TA = CT[a.componentType];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return { array: new TA(bin.buffer, bin.byteOffset + start, a.count * NUM[a.type]), count: a.count };
}

// ---------- math ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sca = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fromTRS(t, r, s) {
  const [x, y, z, w] = r;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + w * z)) * s[0], (2 * (x * z - w * y)) * s[0], 0,
    (2 * (x * y - w * z)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + w * x)) * s[1], 0,
    (2 * (x * z + w * y)) * s[2], (2 * (y * z - w * x)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1];
}
function mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function nodeMat(n) { return n.matrix ? n.matrix.slice() : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]); }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }

// closest point on triangle to p (Ericson, Real-Time Collision Detection)
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, sca(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, sca(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) return add(b, sca(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(add(a, sca(ab, vb * denom)), sca(ac, vc * denom));
}

// ---------- collect vertical wall triangles at art height ----------
const meshNode = {};
json.nodes.forEach((n) => { if (n.mesh != null) meshNode[n.mesh] = n; });
const tris = []; // {a,b,c,n}
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
json.meshes.forEach((mesh, mi) => {
  const node = meshNode[mi] || {};
  const m = mul(I4, nodeMat(node));
  for (const prim of mesh.primitives) {
    const pos = acc(prim.attributes.POSITION);
    const idx = prim.indices != null ? acc(prim.indices).array : null;
    const tc = idx ? idx.length / 3 : pos.count / 3;
    for (let t = 0; t < tc; t++) {
      const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const a = xf(m, [pos.array[ia * 3], pos.array[ia * 3 + 1], pos.array[ia * 3 + 2]]);
      const b = xf(m, [pos.array[ib * 3], pos.array[ib * 3 + 1], pos.array[ib * 3 + 2]]);
      const c = xf(m, [pos.array[ic * 3], pos.array[ic * 3 + 1], pos.array[ic * 3 + 2]]);
      const n = norm(cross(sub(b, a), sub(c, a)));
      if (Math.abs(n[1]) > 0.45) continue;                 // skip floor/ceiling
      const ay = (a[1] + b[1] + c[1]) / 3;
      if (ay < 1.2 || ay > 4.8) continue;                  // keep art-height band
      tris.push({ a, b, c, n });
      for (const v of [a, b, c]) { if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0]; if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2]; }
    }
  }
});

// ---------- load data, interior centroid ----------
const data = JSON.parse(fs.readFileSync('gallery-data.json', 'utf8'));
let cenX = 0, cenZ = 0;
for (const f of data.frames) { cenX += f.position.x; cenZ += f.position.z; }
cenX /= data.frames.length; cenZ /= data.frames.length;
const EDGE = 3.0;     // within this of the AABB edge => perimeter wall
const PROUD = 0.06;   // metres the print stands off the wall

function quatFromBasis(right, up, fwd) {
  // columns: right(x), up(y), fwd(z) ; build quaternion from rotation matrix
  const m00 = right[0], m10 = right[1], m20 = right[2];
  const m01 = up[0], m11 = up[1], m21 = up[2];
  const m02 = fwd[0], m12 = fwd[1], m22 = fwd[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  const l = Math.hypot(...q) || 1; return q.map((v) => v / l);
}

let moved = 0, flipped = 0, maxD = 0;
for (const f of data.frames) {
  const c = [f.position.x, f.position.y, f.position.z];
  // original facing (+Z) for disambiguating interior partitions
  const q0 = [f.quaternion.x, f.quaternion.y, f.quaternion.z, f.quaternion.w];
  const m0 = fromTRS([0, 0, 0], q0, [1, 1, 1]);
  const f0 = [m0[8], m0[9], m0[10]]; // local +Z in world

  // nearest wall triangle
  let best = null, bestD = 1e9;
  for (const tr of tris) {
    const cp = closestOnTri(c, tr.a, tr.b, tr.c);
    const d = len(sub(c, cp));
    if (d < bestD) { bestD = d; best = { cp, n: tr.n }; }
  }
  if (!best || bestD > 10) continue; // nothing sensible nearby; leave as-is

  const hit = best.cp;
  let n = best.n;
  // pick facing side
  const perimeter = (hit[0] - minX < EDGE) || (maxX - hit[0] < EDGE) || (hit[2] - minZ < EDGE) || (maxZ - hit[2] < EDGE);
  let ndir;
  if (perimeter) {
    // face toward interior centroid
    const toCen = norm([cenX - hit[0], 0, cenZ - hit[2]]);
    ndir = (dot(n, toCen) >= 0) ? n : sca(n, -1);
  } else {
    // partition: keep the curated facing side
    ndir = (dot(n, f0) >= 0) ? n : sca(n, -1);
  }
  ndir = norm([ndir[0], ndir[1] === undefined ? 0 : ndir[1], ndir[2]]);
  if (dot(ndir, f0) < 0) flipped++;

  // build orientation: front=ndir, up=worldY (kept upright)
  let right = cross([0, 1, 0], ndir);
  if (len(right) < 1e-4) right = [1, 0, 0];
  right = norm(right);
  const up = norm(cross(ndir, right));
  const quat = quatFromBasis(right, up, ndir);

  const np = add(hit, sca(ndir, PROUD));
  // keep original height (art is hung at a consistent y); use wall hit x/z
  f.position = { x: np[0], y: c[1], z: np[2] };
  f.quaternion = { x: quat[0], y: quat[1], z: quat[2], w: quat[3] };
  moved++; if (bestD > maxD) maxD = bestD;
}

// refresh bounds
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
for (const f of data.frames) { bx0 = Math.min(bx0, f.position.x); bx1 = Math.max(bx1, f.position.x); bz0 = Math.min(bz0, f.position.z); bz1 = Math.max(bz1, f.position.z); }
data.bounds = { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 };

console.log(`walls: ${tris.length} tris | model XZ: [${minX.toFixed(1)}..${maxX.toFixed(1)}] x [${minZ.toFixed(1)}..${maxZ.toFixed(1)}]`);
console.log(`snapped ${moved}/${data.frames.length} prints | facing flipped on ${flipped} | max snap dist ${maxD.toFixed(2)}m`);

if (!DRY) {
  const jsonStr = JSON.stringify(data);
  fs.writeFileSync('gallery-data.json', jsonStr);
  fs.writeFileSync('gallery-data.js', '// Auto-generated by build/generate.mjs — do not edit by hand.\nwindow.GALLERY_DATA = ' + jsonStr + ';\n');
  console.log('wrote gallery-data.json and gallery-data.js');
} else {
  console.log('(dry run — no files written)');
}
