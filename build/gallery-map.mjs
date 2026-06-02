// Generate a numbered top-down map of the gallery (gallery-map.svg) plus a
// legend (gallery-map.md). Each hung frame gets a stable number (1..N = its
// order in gallery-data) with a dot and a facing arrow, drawn over the room's
// wall footprint, so glitches can be reported per-number. The same numbering is
// used by index.html's ?labels mode.
import fs from 'node:fs';
import { PNG } from 'pngjs';

// ---------- GLB walls ----------
const glb = fs.readFileSync('models/obsidian-gallery.glb');
let off = 12, json = null, bin = null;
while (off < glb.length) { const cl = glb.readUInt32LE(off), ct = glb.readUInt32LE(off + 4); const d = glb.slice(off + 8, off + 8 + cl); if (ct === 0x4e4f534a) json = JSON.parse(d.toString('utf8')); else if (ct === 0x004e4942) bin = d; off += 8 + cl; }
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5122: Int16Array, 5121: Uint8Array, 5120: Int8Array }, NUM = { SCALAR: 1, VEC3: 3, VEC2: 2, VEC4: 4 };
function acc(i) { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const TA = CT[a.componentType]; const st = (bv.byteOffset || 0) + (a.byteOffset || 0); return new TA(bin.buffer, bin.byteOffset + st, a.count * NUM[a.type]); }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fromTRS(t, r, s) { const [x, y, z, w] = r; return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + w * z)) * s[0], (2 * (x * z - w * y)) * s[0], 0, (2 * (x * y - w * z)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + w * x)) * s[1], 0, (2 * (x * z + w * y)) * s[2], (2 * (y * z - w * x)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
function nm(n) { return n.matrix ? n.matrix.slice() : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]); }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
const mnode = {}; json.nodes.forEach((n) => { if (n.mesh != null) mnode[n.mesh] = n; });
const segs = [];
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
json.meshes.forEach((mesh, mi) => {
  const node = mnode[mi] || {}; const name = (node.name || '').toLowerCase();
  if (name.includes('slat') || name.includes('glass') || name.includes('mullion') || name.includes('water') || name.includes('floor') || name.includes('ceiling') || name.includes('illum')) return;
  const m = nm(node);
  for (const prim of mesh.primitives) {
    const pos = acc(prim.attributes.POSITION); const idx = prim.indices != null ? acc(prim.indices) : null;
    const tc = idx ? idx.length / 3 : pos.length / 9;
    for (let t = 0; t < tc; t++) {
      const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const a = xf(m, [pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]]);
      const b = xf(m, [pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]]);
      const c = xf(m, [pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]]);
      const n = norm(cross(sub(b, a), sub(c, a)));
      if (Math.abs(n[1]) > 0.45) continue;          // skip floor/ceiling
      const ay = (a[1] + b[1] + c[1]) / 3; if (ay < 1.2 || ay > 4.8) continue; // art-height band
      for (const [p, q] of [[a, b], [b, c], [c, a]]) segs.push([p[0], p[2], q[0], q[2]]);
      for (const v of [a, b, c]) { minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]); }
    }
  }
});

// ---------- frames ----------
const data = JSON.parse(fs.readFileSync('gallery-data.json', 'utf8'));
function fwd(q) { const m = fromTRS([0, 0, 0], [q.x, q.y, q.z, q.w], [1, 1, 1]); return [m[8], m[10]]; } // local +Z in XZ (front)
data.frames.forEach((f) => { minX = Math.min(minX, f.position.x); maxX = Math.max(maxX, f.position.x); minZ = Math.min(minZ, f.position.z); maxZ = Math.max(maxZ, f.position.z); });
const sp = data.spawn; minX = Math.min(minX, sp.x); maxX = Math.max(maxX, sp.x); minZ = Math.min(minZ, sp.z); maxZ = Math.max(maxZ, sp.z);

// ---------- layout ----------
const pad = 60, scale = 18; // px per metre
const W = Math.ceil((maxX - minX) * scale) + pad * 2;
const H = Math.ceil((maxZ - minZ) * scale) + pad * 2;
const px = (x) => (pad + (x - minX) * scale).toFixed(1);
const py = (z) => (pad + (z - minZ) * scale).toFixed(1);
const compass = (dx, dz) => { // map facing vector to a readable bearing (−Z = back wall side = "N")
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'E (+X)' : 'W (−X)';
  return dz >= 0 ? 'S (+Z)' : 'N (−Z)';
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,Arial,sans-serif">\n`;
svg += `<rect width="${W}" height="${H}" fill="#14181d"/>\n`;
svg += `<text x="${pad}" y="32" fill="#cdd6df" font-size="22" font-weight="700">Santaphobia — gallery map (${data.frames.length} works)</text>\n`;
svg += `<text x="${pad}" y="52" fill="#8f9aa6" font-size="13">Top-down. Dot = print, arrow = the way it faces. North (−Z, back wall) is up. See gallery-map.md for the number→file legend.</text>\n`;
// walls
svg += `<g stroke="#7c8794" stroke-width="1" opacity="0.85">\n`;
for (const s of segs) svg += `<line x1="${px(s[0])}" y1="${py(s[1])}" x2="${px(s[2])}" y2="${py(s[3])}"/>\n`;
svg += `</g>\n`;
// spawn
svg += `<g><circle cx="${px(sp.x)}" cy="${py(sp.z)}" r="7" fill="#27d3ff"/><text x="${px(sp.x)}" y="${(+py(sp.z) + 22)}" fill="#27d3ff" font-size="12" text-anchor="middle">entrance</text></g>\n`;
// frames
const legend = [];
data.frames.forEach((f, i) => {
  const n = i + 1;
  const x = +px(f.position.x), y = +py(f.position.z);
  const [dx, dz] = fwd(f.quaternion);
  const ax = x + dx * 1.4 * scale, ay = y + dz * 1.4 * scale;
  svg += `<g>`;
  const lx = x - dx * 16, ly = y - dz * 16; // offset toward the wall so paired frames separate
  svg += `<line x1="${x}" y1="${y}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#39d353" stroke-width="2.5"/>`;
  svg += `<circle cx="${x}" cy="${y}" r="5.5" fill="#ff5555" stroke="#1a1d22" stroke-width="1"/>`;
  svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#ffe27a" font-size="14" font-weight="700" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#14181d" stroke-width="3">${n}</text>`;
  svg += `</g>\n`;
  legend.push({ n, id: f.id, file: f.file, x: f.position.x.toFixed(1), z: f.position.z.toFixed(1), facing: compass(dx, dz) });
});
svg += `</svg>\n`;
fs.writeFileSync('gallery-map.svg', svg);

// ---------- legend ----------
let md = `# Santaphobia — gallery map legend\n\n`;
md += `Open **gallery-map.svg** in a browser (zoom to read the numbers). Each number below marks one print on the plan.\n`;
md += `Facing column = the direction the print faces (N = −Z / back-wall side is up on the map).\n`;
md += `Tell me the number(s) that look wrong and how, and I'll correct just those.\n\n`;
md += `| # | file | x | z | faces |\n|---:|------|---:|---:|:-----|\n`;
for (const r of legend) md += `| ${r.n} | ${r.file} | ${r.x} | ${r.z} | ${r.facing} |\n`;
fs.writeFileSync('gallery-map.md', md);

// ---------- PNG render (universally viewable) ----------
const pxn = (x) => pad + (x - minX) * scale, pyn = (z) => pad + (z - minZ) * scale;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) { png.data[i * 4] = 20; png.data[i * 4 + 1] = 24; png.data[i * 4 + 2] = 29; png.data[i * 4 + 3] = 255; }
function plot(x, y, r, g, b) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; }
function line(x0, y0, x1, y1, r, g, b, wdt = 1) { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy, x = x0, y = y0; for (let k = 0; k < 6000; k++) { for (let oy = 0; oy < wdt; oy++) for (let ox = 0; ox < wdt; ox++) plot(x + ox, y + oy, r, g, b); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } } }
function disc(cx, cy, rad, r, g, b) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) plot(cx + dx, cy + dy, r, g, b); }
const FONT = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'] };
function digit(ch, x, y, s, r, g, b) { const pat = FONT[ch]; if (!pat) return; for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) if (pat[row][col] === '1') for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) plot(x + col * s + xx, y + row * s + yy, r, g, b); }
function label(str, cx, cy, s) { const w = str.length * (3 * s + s) - s; const x = Math.round(cx - w / 2), y = Math.round(cy - 5 * s / 2); for (let by = -2; by < 5 * s + 2; by++) for (let bx = -2; bx < w + 2; bx++) plot(x + bx, y + by, 12, 14, 17); let px2 = x; for (const ch of str) { digit(ch, px2, y, s, 255, 226, 122); px2 += 3 * s + s; } }
// walls
for (const s of segs) line(pxn(s[0]), pyn(s[1]), pxn(s[2]), pyn(s[3]), 124, 135, 148);
// spawn
disc(pxn(sp.x) | 0, pyn(sp.z) | 0, 7, 39, 211, 255);
// frames
data.frames.forEach((f, i) => {
  const x = pxn(f.position.x) | 0, y = pyn(f.position.z) | 0; const [dx, dz] = fwd(f.quaternion);
  line(x, y, (x + dx * 1.4 * scale) | 0, (y + dz * 1.4 * scale) | 0, 57, 211, 83, 2);
  disc(x, y, 5, 255, 85, 85);
  label(String(i + 1), x - dx * 16, y - dz * 16, 3);
});
fs.writeFileSync('gallery-map.png', PNG.sync.write(png));

console.log(`wrote gallery-map.svg + gallery-map.png (${W}x${H}px, ${segs.length} wall segments) and gallery-map.md (${legend.length} frames)`);
