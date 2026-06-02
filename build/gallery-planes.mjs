// Companion to gallery-map: letter every wall *plane* (each art-bearing wall
// face) so frames can be reassigned by name, e.g. "move 22 to plane G".
// Planes are derived from the frames themselves: frames sharing a facing axis,
// facing direction and wall offset (split where they're far apart along the
// wall) belong to the same plane. Outputs gallery-planes.png/.svg/.md.
import fs from 'node:fs';
import { PNG } from 'pngjs';

// ---------- GLB walls (footprint only, for context) ----------
const glb = fs.readFileSync('models/obsidian-gallery.glb');
let off = 12, json = null, bin = null;
while (off < glb.length) { const cl = glb.readUInt32LE(off), ct = glb.readUInt32LE(off + 4); const d = glb.slice(off + 8, off + 8 + cl); if (ct === 0x4e4f534a) json = JSON.parse(d.toString('utf8')); else if (ct === 0x004e4942) bin = d; off += 8 + cl; }
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5122: Int16Array, 5121: Uint8Array, 5120: Int8Array }, NUM = { SCALAR: 1, VEC3: 3, VEC2: 2, VEC4: 4 };
function acc(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const TA = CT[a.componentType]; const st = (bv.byteOffset || 0) + (a.byteOffset || 0); return new TA(bin.buffer, bin.byteOffset + st, a.count * NUM[a.type]); }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fromTRS(t, r, s) { const [x, y, z, w] = r; return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + w * z)) * s[0], (2 * (x * z - w * y)) * s[0], 0, (2 * (x * y - w * z)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + w * x)) * s[1], 0, (2 * (x * z + w * y)) * s[2], (2 * (y * z - w * x)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
function nmx(n) { return n.matrix ? n.matrix.slice() : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]); }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
const mnode = {}; json.nodes.forEach((n) => { if (n.mesh != null) mnode[n.mesh] = n; });
const segs = []; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
json.meshes.forEach((mesh, mi) => {
  const node = mnode[mi] || {}; const name = (node.name || '').toLowerCase();
  if (name.includes('slat') || name.includes('glass') || name.includes('mullion') || name.includes('water') || name.includes('floor') || name.includes('ceiling') || name.includes('illum')) return;
  const m = nmx(node);
  for (const prim of mesh.primitives) {
    const pos = acc(prim.attributes.POSITION); const idx = prim.indices != null ? acc(prim.indices) : null; const tc = idx ? idx.length / 3 : pos.length / 9;
    for (let t = 0; t < tc; t++) {
      const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const a = xf(m, [pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]]), b = xf(m, [pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]]), c = xf(m, [pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]]);
      const n = norm(cross(sub(b, a), sub(c, a))); if (Math.abs(n[1]) > 0.45) continue;
      const ay = (a[1] + b[1] + c[1]) / 3; if (ay < 1.2 || ay > 4.8) continue;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) segs.push([p[0], p[2], q[0], q[2]]);
      for (const v of [a, b, c]) { minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]); }
    }
  }
});

// ---------- frames + plane clustering ----------
const data = JSON.parse(fs.readFileSync('gallery-data.json', 'utf8'));
function fwd(q) { const m = fromTRS([0, 0, 0], [q.x, q.y, q.z, q.w], [1, 1, 1]); return [m[8], m[10]]; }
const frames = data.frames.map((f, i) => {
  const [dx, dz] = fwd(f.quaternion); const axis = Math.abs(dx) >= Math.abs(dz) ? 'X' : 'Z';
  const sign = axis === 'X' ? Math.sign(dx) || 1 : Math.sign(dz) || 1;
  const perp = axis === 'X' ? f.position.x : f.position.z;   // wall offset
  const along = axis === 'X' ? f.position.z : f.position.x;   // lateral along wall
  return { n: i + 1, file: f.file, x: f.position.x, z: f.position.z, dx, dz, axis, sign, perp, along };
});
// group by (axis, facing sign); within each, cluster by wall offset (perp) with
// tolerance, then split a shared-offset cluster only when frames are far apart
// laterally (i.e. genuinely different walls, e.g. the two bays).
const bySide = {};
for (const fr of frames) (bySide[`${fr.axis}|${fr.sign}`] ||= []).push(fr);
let planes = [];
for (const key of Object.keys(bySide)) {
  const list = bySide[key].slice().sort((a, b) => a.perp - b.perp);
  const perpClusters = []; let cur = [list[0]];
  for (let i = 1; i < list.length; i++) { if (list[i].perp - cur[cur.length - 1].perp > 1.2) { perpClusters.push(cur); cur = []; } cur.push(list[i]); }
  perpClusters.push(cur);
  for (const pc of perpClusters) {
    pc.sort((a, b) => a.along - b.along); let seg = [pc[0]];
    for (let i = 1; i < pc.length; i++) { if (pc[i].along - seg[seg.length - 1].along > 12) { planes.push(seg); seg = []; } seg.push(pc[i]); }
    planes.push(seg);
  }
}
// order planes top-to-bottom (z), then left-to-right (x) for readable lettering
planes.forEach((p) => { p.cz = p.reduce((s, f) => s + f.z, 0) / p.length; p.cx = p.reduce((s, f) => s + f.x, 0) / p.length; });
planes.sort((a, b) => a.cz - b.cz || a.cx - b.cx);
const letterOf = (i) => i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
planes.forEach((p, i) => { p.letter = letterOf(i); });
const planeOfFrame = {}; planes.forEach((p) => p.forEach((f) => { planeOfFrame[f.n] = p.letter; }));
const cardinal = (axis, sign) => axis === 'X' ? (sign > 0 ? 'faces East (+X)' : 'faces West (−X)') : (sign > 0 ? 'faces South (+Z)' : 'faces North (−Z)');

// ---------- layout ----------
const palette = [[255, 99, 99], [120, 200, 255], [120, 230, 140], [240, 200, 90], [220, 140, 240], [250, 160, 90], [150, 220, 220], [200, 200, 120], [240, 130, 170], [160, 180, 255]];
data.frames.forEach((f) => { minX = Math.min(minX, f.position.x); maxX = Math.max(maxX, f.position.x); minZ = Math.min(minZ, f.position.z); maxZ = Math.max(maxZ, f.position.z); });
const sp = data.spawn; minX = Math.min(minX, sp.x); maxX = Math.max(maxX, sp.x); minZ = Math.min(minZ, sp.z); maxZ = Math.max(maxZ, sp.z);
const pad = 64, scale = 18;
const W = Math.ceil((maxX - minX) * scale) + pad * 2, H = Math.ceil((maxZ - minZ) * scale) + pad * 2;
const pxn = (x) => pad + (x - minX) * scale, pyn = (z) => pad + (z - minZ) * scale;

// ---------- PNG ----------
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) { png.data[i * 4] = 20; png.data[i * 4 + 1] = 24; png.data[i * 4 + 2] = 29; png.data[i * 4 + 3] = 255; }
function plot(x, y, r, g, b) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; }
function lineC(x0, y0, x1, y1, r, g, b, wd = 1) { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy, x = x0, y = y0; for (let k = 0; k < 6000; k++) { for (let oy = 0; oy < wd; oy++)for (let ox = 0; ox < wd; ox++) plot(x + ox, y + oy, r, g, b); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } } }
function disc(cx, cy, rad, r, g, b) { for (let dy = -rad; dy <= rad; dy++)for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) plot(cx + dx, cy + dy, r, g, b); }
const FONT = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'], 'A': ['111', '101', '111', '101', '101'], 'B': ['110', '101', '110', '101', '110'], 'C': ['111', '100', '100', '100', '111'], 'D': ['110', '101', '101', '101', '110'], 'E': ['111', '100', '110', '100', '111'], 'F': ['111', '100', '110', '100', '100'], 'G': ['111', '100', '101', '101', '111'], 'H': ['101', '101', '111', '101', '101'], 'I': ['111', '010', '010', '010', '111'], 'J': ['001', '001', '001', '101', '111'], 'K': ['101', '110', '100', '110', '101'], 'L': ['100', '100', '100', '100', '111'], 'M': ['101', '111', '111', '101', '101'], 'N': ['101', '111', '111', '111', '101'], 'O': ['111', '101', '101', '101', '111'], 'P': ['111', '101', '111', '100', '100'], 'Q': ['111', '101', '101', '111', '011'], 'R': ['111', '101', '110', '101', '101'], 'S': ['111', '100', '111', '001', '111'], 'T': ['111', '010', '010', '010', '010'], 'U': ['101', '101', '101', '101', '111'], 'V': ['101', '101', '101', '101', '010'], 'W': ['101', '101', '111', '111', '101'], 'X': ['101', '101', '010', '101', '101'], 'Y': ['101', '101', '010', '010', '010'], 'Z': ['111', '001', '010', '100', '111'] };
function glyph(ch, x, y, s, r, g, b) { const pat = FONT[ch]; if (!pat) return; for (let row = 0; row < 5; row++)for (let col = 0; col < 3; col++) if (pat[row][col] === '1') for (let yy = 0; yy < s; yy++)for (let xx = 0; xx < s; xx++) plot(x + col * s + xx, y + row * s + yy, r, g, b); }
function label(str, cx, cy, s, r, g, b, halo = true) { const w = str.length * (3 * s + s) - s; const x = Math.round(cx - w / 2), y = Math.round(cy - 5 * s / 2); if (halo) for (let by = -2; by < 5 * s + 2; by++)for (let bx = -2; bx < w + 2; bx++) plot(x + bx, y + by, 12, 14, 17); let px2 = x; for (const ch of str) { glyph(ch, px2, y, s, r, g, b); px2 += 3 * s + s; } }
// walls
for (const s of segs) lineC(pxn(s[0]), pyn(s[1]), pxn(s[2]), pyn(s[3]), 110, 120, 132);
// spawn
disc(pxn(sp.x) | 0, pyn(sp.z) | 0, 7, 39, 211, 255);
// frames coloured by plane
data.frames.forEach((f, i) => {
  const fr = frames[i]; const pi = planes.findIndex((p) => p.letter === planeOfFrame[fr.n]); const col = palette[pi % palette.length];
  const x = pxn(f.position.x) | 0, y = pyn(f.position.z) | 0;
  lineC(x, y, (x + fr.dx * 1.2 * scale) | 0, (y + fr.dz * 1.2 * scale) | 0, col[0], col[1], col[2], 2);
  disc(x, y, 5, col[0], col[1], col[2]);
  label(String(fr.n), x - fr.dx * 14, y - fr.dz * 14, 2, 235, 235, 235);
});
// plane letters (big), placed in the room just in front of each plane
planes.forEach((p, pi) => {
  const col = palette[pi % palette.length];
  const along = p.reduce((s, f) => s + f.along, 0) / p.length, perp = p[0].perp, sign = p[0].sign, axis = p[0].axis;
  const wx = axis === 'X' ? perp + sign * 1.7 : along, wz = axis === 'X' ? along : perp + sign * 1.7;
  label(p.letter, pxn(wx), pyn(wz), 6, col[0], col[1], col[2]);
});
label('GALLERY PLANE MAP   LETTERS ARE WALLS   NUMBERS ARE PRINTS', W / 2, 26, 3, 205, 214, 223, false);
fs.writeFileSync('gallery-planes.png', PNG.sync.write(png));

// ---------- SVG ----------
const spx = (x) => (pxn(x)).toFixed(1), spy = (z) => (pyn(z)).toFixed(1);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,Arial,sans-serif">\n<rect width="${W}" height="${H}" fill="#14181d"/>\n`;
svg += `<text x="${pad}" y="34" fill="#cdd6df" font-size="20" font-weight="700">Santaphobia — plane map (letters = wall planes, numbers = prints)</text>\n`;
svg += `<g stroke="#6e7884" stroke-width="1" opacity="0.85">\n`; for (const s of segs) svg += `<line x1="${spx(s[0])}" y1="${spy(s[1])}" x2="${spx(s[2])}" y2="${spy(s[3])}"/>\n`; svg += `</g>\n`;
svg += `<circle cx="${spx(sp.x)}" cy="${spy(sp.z)}" r="7" fill="#27d3ff"/><text x="${spx(sp.x)}" y="${(+spy(sp.z) + 22)}" fill="#27d3ff" font-size="12" text-anchor="middle">entrance</text>\n`;
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
data.frames.forEach((f, i) => { const fr = frames[i]; const pi = planes.findIndex((p) => p.letter === planeOfFrame[fr.n]); const col = palette[pi % palette.length]; const x = +spx(f.position.x), y = +spy(f.position.z); svg += `<line x1="${x}" y1="${y}" x2="${(x + fr.dx * 1.2 * scale).toFixed(1)}" y2="${(y + fr.dz * 1.2 * scale).toFixed(1)}" stroke="${rgb(col)}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="5" fill="${rgb(col)}"/><text x="${(x - fr.dx * 14).toFixed(1)}" y="${(y - fr.dz * 14).toFixed(1)}" fill="#eee" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#14181d" stroke-width="2.5">${fr.n}</text>\n`; });
planes.forEach((p, pi) => { const col = palette[pi % palette.length]; const along = p.reduce((s, f) => s + f.along, 0) / p.length, perp = p[0].perp, sign = p[0].sign, axis = p[0].axis; const wx = axis === 'X' ? perp + sign * 1.7 : along, wz = axis === 'X' ? along : perp + sign * 1.7; svg += `<text x="${spx(wx)}" y="${spy(wz)}" fill="${rgb(col)}" font-size="30" font-weight="800" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#14181d" stroke-width="4">${p.letter}</text>\n`; });
svg += `</svg>\n`;
fs.writeFileSync('gallery-planes.svg', svg);

// ---------- legend ----------
let md = `# Santaphobia — plane map legend\n\nEach wall **plane** has a letter; each print has a number. To fix a misplaced print, say e.g. **"move 22 to plane G"** (and, if it matters, "to the left of 9" / "at the far end"). I infer the correct wall, facing and flush mounting from the plane.\n\n`;
md += `| plane | orientation | wall offset | prints on it |\n|:---:|:--|--:|:--|\n`;
planes.forEach((p) => { const ax = p[0].axis, sg = p[0].sign; const perp = (p.reduce((s, f) => s + f.perp, 0) / p.length).toFixed(1); md += `| **${p.letter}** | ${cardinal(ax, sg)} | ${ax}=${perp} | ${p.map((f) => f.n).sort((a, b) => a - b).join(', ')} |\n`; });
md += `\n## Every print → its current plane\n\n| # | file | plane |\n|--:|:--|:--:|\n`;
frames.forEach((fr) => { md += `| ${fr.n} | ${fr.file} | ${planeOfFrame[fr.n]} |\n`; });
fs.writeFileSync('gallery-planes.md', md);

console.log(`wrote gallery-planes.png/.svg (${W}x${H}) and gallery-planes.md — ${planes.length} planes, ${frames.length} prints`);
