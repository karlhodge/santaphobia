// Generates the gallery layout from the Spatial scene export.
//
// The Spatial JSON describes 66 image frames placed in a built-in room
// template ("environment": 11). That template is gone with Spatial, so we
// rebuild a comparable room and hang every image at its recorded transform.
//
// Coordinate conversion: Spatial/Unity is left-handed (Y-up, Z-forward),
// three.js / A-Frame is right-handed (Y-up, Z-toward-viewer). The standard
// conversion negates Z on positions and (x,y) on the rotation quaternion.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const scene = JSON.parse(fs.readFileSync(path.join(root, 'scene-data.json'), 'utf8'));

// Drive file ID -> original filename, harvested from the user's Google Drive
// (the same folder Spatial pulled the gallery images from).
const driveTitles = {
  '1YDvxP9fJ6SDYQmWwG_NsAWRUjUoFVm5-': 'IMG_1362.jpg',
  '1lt61eHXt0OAdflemgJqk2MeMplJ4SzY5': 'Image 2.jpg',
  '1_jPrXIf656p-g9IzoHjLd2zfoxHYCLQa': 'IMG_1322.JPG',
  '1cysKhkAb59lDt-8U2dTe831_wwhBKQw0': 'Enlight28.JPG',
  '1A703eatZL7m9lI2eXlVWLbyK_4QBly08': 'IMG_1348.JPG',
  '1K4l1jKVyfjBRT1vLVZC05LVDN-jnnCIo': 'IMG_1407.jpg',
  '1ZB9KPTiROI3A2hC9kV8bt3u13pgndpM7': 'IMG_1359.jpg',
  '1PEg2aox8x9pqtXVXG0_TGa7k2-V9XDnl': 'IMG_1492.JPG',
  '10m9Mb9OTBP9u0gIdw2A-Wus1uWo1e4Fu': 'IMG_1485.JPG',
  '1Bz5ZiXT_H0lCiPTW1zcKmBM5zogRcrNp': 'IMG_1384.jpg',
  '1C4cV5hUSf79EAjf9A_udR5Dog8ZsgYoD': 'IMG_1440.jpg',
  '1345HIKA4gCm10AhtrewAntqYo6tY04lF': 'IMG_1363.jpg',
  '1qxbgZZQNIw3R1dExVbGi1gxGNkFREplt': 'IMG_1486.jpg',
  '13_N20Q0lCPC8kFHjExk1VB1oPDfUBZSo': 'IMG_1385.JPG',
  '1DRVH8OvVumdq9zHPPtXpGUOamJpi1oDt': 'IMG_1414.JPG',
  '1CYTjB5FPd1AXb6AVed6VEex-uUJxMrOo': 'IMG_1431.JPG',
  '17UJlHr-eKYQ_XCZIZ5qQOJ5UA1M6aQ5J': 'Enlight38.jpg',
  '1QRjLRuoP2vVjuy-izOBD-vUAVfBxYq9Z': 'IMG_1432.jpg',
  '1qbU_JhjDDcQ5mXFpToOMH_uLotKN4b2e': 'IMG_1641.JPG',
  '1Y2JgNCNVseSYK9Edym2WxMWCkf9LoYQm': 'IMG_1593.JPG',
  '11ASgyB6URqHV_HO5pfrOjz9WU2985VOE': 'IMG_1471.jpg',
  '1ujjq-O2ca0FpEbKskEWYnDn-07ms2RKy': 'IMG_1496.jpg',
  '1a79hdHeG3qGUFDUIQshpliBJ7MjS9T3j': 'IMG_2204.JPG',
  '1iIFJWrbg9rIRhyL0pvdy5s44Bbe66EXj': 'IMG_2210.jpg',
  '1RUhvAi1otYGX23MFQ_I8RZJQ9yR3t0fC': 'IMG_1465.jpg',
  '1MjFL8PpGAJIj5tPbSUSjVVxk1g0xGu8X': 'Image 4.jpg',
  '1yxxk7KOuahiYe5Uq-xYpekzXT6WDPUEn': 'Enlight10.jpg',
  '1IwYmTjaL8GsNXE0-yUam_eDhKJl9BzVp': 'IMG_0365.jpg',
  '1Jr7LWdbE1Wn-BW40pUI18vLyie6COBF3': 'IMG_0397.jpg',
  '1Da0pKMJ1TChrfVcCOQ1TPsr9EDtcBpaf': 'IMG_0385.JPG',
  '1L1WxunVa7VAKYVImJP1Wx-4mCRjVj7Cu': 'IMG_0353.jpg',
  '1upf1rN_deA3gQlFT3VVAfYdJBnw9jAMY': 'IMG_0364.JPG',
  '1UvteYKQ_g5UY6pKxdHXGRbekuhgx89Id': 'IMG_0373.jpg',
  '1D4Dl1qKjNz4TEKTOeCnOFubea2PkmlUQ': 'IMG_0368.JPG',
  '1MZZi21Gdf6jNdXi68awluILXIMTlz3P4': 'IMG_0392.jpg',
  '1KcBPSKB1J1VJTlnLcqpzNqWSc04wWHq6': 'IMG_0394.jpg',
  '1NQe20-7qOzMEOIlBzHuv85bWeNRcwqEF': 'IMG_0363.jpg',
  '1mFhdVHNH7-E0VHU7TGcTjoJ2IwlgHPmV': 'IMG_0358.JPG',
  '1CyWiiEZmYJZT3jOLhFtqqmfkyGxZK5e1': 'IMG_0419.jpg',
  '1lMut0_eWa_dlpFE6lIQ1XGGYXfRX6Km7': 'IMG_0408.jpg',
  '1Dr6wkLYxbJX3mZTAn_JAirwWnKdrtBKz': 'IMG_0443.JPG',
  '1-gDbhKMuPtuV9YZiigFJ6UW0Luemzn58': 'IMG_0387.JPG',
  '1y6ZVZVasAbP2F1RVVcIXdE4nD1EwICKD': 'IMG_0409.JPG',
  '1BrGG3VWFUJ084a2Es8ewoe_T-crQm4iQ': 'IMG_0434.jpg',
  '1OxoxInOpzb2za0M53n-S0lPVyRECKAqb': 'IMG_0388.jpg',
  '11DQqqQq7go-HtK3DvUHvLOwJRK8ZfMFP': 'Enlight1.JPG',
  '1EQpANqcJWLp8Wxkb8f7qok1AV29Ss2_o': 'IMG_0464.jpg',
  '15TQ6i2-jIqMYCn83T47DlLxE9d0uLsgB': 'Enlight7.JPG',
  '1khU5ItMT2IYQFJQ33GC-As1gv5cOBrVx': 'IMG_0446.jpg',
  '1e7Ld1VcmAJa5uGxCuQ56S18mTuxSSfGJ': 'IMG_0483.jpg',
  '1bWK8lusJZCy2PlpQmerFMK4Pb-QKgu1i': 'IMG_0457.jpg',
  '1jV08SeY_Z9bfbeuoB0LeQULzxYuBnDYe': 'IMG_0491.jpg',
  '1CwM7vYDoRbuKMQl_3sQpxLww-yA4mwWF': 'IMG_0526.jpg',
  '1vt1xCDWdVdB_fxd-WGy2hAlsxz1jFUir': 'IMG_0487.JPG',
  '1v3ZTQzkqyWlX5irmF3N5_lpwoOecbX9_': 'IMG_0508.JPG',
  '1Ew4wfqGJuIAkwQtPcA1v3iMkBZ1pQKq7': 'IMG_0498.JPG',
  '1ip034yj6GHYbWH52QGRg0tm4nJuO5E-x': 'IMG_0504.jpg',
  '13TNz7ZixDFPR-3Jkh4QS0HwDpctqiCXp': 'IMG_0607.jpg',
  '1fmrA0f1mWU8Z9PI-RZcqJlBRz9IMzXb4': 'IMG_0500.jpg',
  '1x8GAy_xUOW9FlBxfDqzdD9SOCVSblgBi': 'IMG_0757.JPG',
  '1rbLo7AbJb3z0E7O-ZP58G1s_ywmy05TA': 'Image.jpg',
  '1a9jpSTJ6jyl7pRDtYwDZ8gqhUXZmTvuF': 'IMG_0776.JPG',
  '1MCsaas8NN9nWnFtkGpNXgN7hVZ0Huct_': 'IMG_0668.jpg',
  '1RS1hoQfYRyFPEYQ_R48Jeh4FbPcDAqRN': 'IMG_0696.jpg',
  '1rNda75Hckg9ktJHrar3gn3CAmbtGDP7a': 'IMG_0618.JPG',
  '1T-ejhvdq-mZ3hyZrggJ68AtbXhSHcTf7': 'IMG_0625.jpg',
  '1Vwd7VjSatkAGb6zspnlh1XFP5lmqIs1y': 'IMG_0617.JPG',
  '1_d8wbsEzVXNkhu94tzmdlChdPb-vQOOk': 'IMG_0930.JPG',
  '1bzmP-nkD-qaPtKqjXbZ1jnDXxwEKRUng': 'otherAppsImage-1.jpg',
  '1F-V-nL5xbhe71olRv-73mJ6mlyQ4waKt': 'IMG_0866.JPG',
  '1LgmaBh2I75XG1mAjaQUOs49zAoBixIch': 'IMG_0730.jpg',
  '1AImD5PXfV4Vh-CESXrm3xjiaVeNCJJmW': 'IMG_0772.JPG',
  '1nhMNgmwasq1sjQnr_kQqWCRNDy5Ijw0L': 'IMG_0952.JPG',
  '1RGOqnd8rHvJtQ5iFn_Tapfg0ddzqOZbo': 'Enlight27.jpg',
  '1EXpRNoOejjF7RU6i4l1pPcausYpj2ooF': 'IMG_0959.jpg',
  '1Wxm8gUCqOIxKUzJs8akb_BRVBXw0pgSe': 'IMG_1463.JPG',
};

const s = scene.data.scene;

function driveIdFromUrl(url) {
  // "spatialcontent://google:1cysKhkAb59lDt-8U2dTe831_wwhBKQw0"
  const m = /google:([^/]+)$/.exec(url || '');
  return m ? m[1] : null;
}

const frames = [];
const missing = [];

for (const key of Object.keys(s.images)) {
  const img = s.images[key];
  const t = s.transforms[key];
  if (!t) continue;
  const id = driveIdFromUrl(img.url);
  const file = driveTitles[id];
  if (!file) missing.push({ key, id });
  const p = t.localPosition.value;
  const r = t.localRotation.value; // [x, y, z, w]
  frames.push({
    id: key,
    file: file || null,
    driveId: id,
    // Unity (LH) -> three.js (RH): negate Z on position, negate x,y on quat.
    position: { x: p[0], y: p[1], z: -p[2] },
    quaternion: { x: -r[0], y: -r[1], z: r[2], w: r[3] },
  });
}

frames.sort((a, b) => Number(a.id) - Number(b.id));

// Spawn point (where the visitor starts).
const spawnT = s.transforms[String(s.spawnPoints ? Object.keys(s.spawnPoints)[0] : '')] ||
  s.transforms['10012'];
const sp = spawnT ? spawnT.localPosition.value : [0, 0, 0];
const spawn = { x: sp[0], y: sp[1], z: -sp[2] };

// Room bounds from frame positions (for floor / walls / ceiling sizing).
const xs = frames.map((f) => f.position.x);
const zs = frames.map((f) => f.position.z);
const bounds = {
  minX: Math.min(...xs, spawn.x),
  maxX: Math.max(...xs, spawn.x),
  minZ: Math.min(...zs, spawn.z),
  maxZ: Math.max(...zs, spawn.z),
};

const out = { frames, spawn, bounds, count: frames.length };

fs.writeFileSync(path.join(root, 'gallery-data.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(root, 'gallery-data.js'),
  '// Auto-generated by build/generate.mjs — do not edit by hand.\n' +
    'window.GALLERY_DATA = ' + JSON.stringify(out) + ';\n'
);

// Manifest of expected image filenames, so missing files are easy to spot.
const manifest = frames.map((f) => `frame ${String(f.id).padStart(2, ' ')}  ->  ${f.file || '??? (' + f.driveId + ')'}`);
fs.writeFileSync(path.join(root, 'images', 'MANIFEST.txt'),
  'Expected image files (drop these into this folder):\n\n' + manifest.join('\n') + '\n');

console.log(`frames: ${frames.length}`);
console.log(`spawn:  x=${spawn.x.toFixed(2)} y=${spawn.y.toFixed(2)} z=${spawn.z.toFixed(2)}`);
console.log(`bounds: x[${bounds.minX.toFixed(1)}, ${bounds.maxX.toFixed(1)}]  z[${bounds.minZ.toFixed(1)}, ${bounds.maxZ.toFixed(1)}]`);
if (missing.length) {
  console.log(`\nWARNING: ${missing.length} frame(s) have no matching Drive filename:`);
  for (const m of missing) console.log(`  frame ${m.key}: driveId=${m.id}`);
} else {
  console.log('\nAll frames mapped to a filename. ✓');
}
