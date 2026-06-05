import express from 'express';
import multer, { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, extname, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = join(__dirname, 'uploads');

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = diskStorage({
  destination(req, file, cb) {
    const slug = randomUUID();
    req.slug = slug;
    const dir = join(UPLOADS_DIR, slug);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Preserve original name — we rename/restructure after upload if needed
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter(req, file, cb) {
    if (file.originalname.match(/\.(glb|gltf|zip)$/i)) cb(null, true);
    else cb(new Error('Only GLB, GLTF, or ZIP files are accepted'));
  },
});

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Serve world asset files (textures, bins, etc.) from the slug directory.
// Path-traversal safe: resolves the full path and checks it starts with UPLOADS_DIR.
app.get('/api/worlds/:slug/files/*', (req, res) => {
  const slug = req.params.slug;
  const relativePath = req.params[0];

  // Guard against path traversal
  const resolved = join(UPLOADS_DIR, slug, relativePath);
  if (!resolved.startsWith(join(UPLOADS_DIR, slug) + sep) &&
      resolved !== join(UPLOADS_DIR, slug)) {
    return res.status(400).send('Bad path');
  }

  if (!existsSync(resolved)) return res.status(404).send('Not found');
  res.sendFile(resolved);
});

const DEFAULT_CONFIG = {
  spawn: { x: 0, y: 0, z: 5 },
  skybox: { type: 'gradient', topColor: '#1a1a2e', bottomColor: '#16213e' },
  fog: { enabled: true, color: '#1a1a2e', density: 0.015 },
  lighting: {
    ambient: { color: '#ffffff', intensity: 0.6 },
    hemisphere: { skyColor: '#b1e1ff', groundColor: '#444466', intensity: 0.8 },
    directional: { color: '#fff4e0', intensity: 1.2, position: { x: -10, y: 20, z: 10 }, castShadow: true },
  },
  navigation: { eyeHeight: 1.7, speed: 20, invertY: false },
  model: { scale: 1.0, yOffset: 0.0, yRotation: 0 },
  renderer: { exposure: 1.15, vrEnabled: true },
  welcome: { enabled: false, title: '', body: '' },
  hotspots: [],
};

function readConfig(slug) {
  const path = join(UPLOADS_DIR, slug, 'config.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeConfig(slug, config) {
  writeFileSync(join(UPLOADS_DIR, slug, 'config.json'), JSON.stringify(config, null, 2));
}

// Find the root model file (shallowest .glb preferred, then .gltf) within a directory tree.
function findRootModel(dir) {
  function walk(d, depth) {
    const entries = readdirSync(d, { withFileTypes: true });
    const files = [];
    const subdirs = [];
    for (const e of entries) {
      if (e.isDirectory()) subdirs.push(join(d, e.name));
      else if (e.isFile()) files.push({ path: join(d, e.name), name: e.name, depth });
    }
    // Prefer GLB at this level, then GLTF, then recurse
    const glb  = files.find(f => f.name.match(/\.glb$/i));
    if (glb)  return glb.path;
    const gltf = files.find(f => f.name.match(/\.gltf$/i));
    if (gltf) return gltf.path;
    for (const sub of subdirs) {
      const found = walk(sub, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return walk(dir, 0);
}

// Upload a new model (GLB, GLTF, or ZIP)
app.post('/api/upload', upload.single('model'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const slugDir  = join(UPLOADS_DIR, req.slug);
  const uploaded = join(slugDir, req.file.originalname);
  let modelFile; // path relative to slugDir, using forward slashes

  try {
    if (req.file.originalname.match(/\.zip$/i)) {
      // Extract ZIP, then locate the root model
      const zip = new AdmZip(uploaded);
      zip.extractAllTo(slugDir, /* overwrite */ true);
      // Remove the ZIP itself to keep things tidy
      import('fs').then(({ unlinkSync }) => { try { unlinkSync(uploaded); } catch {} });

      const absModel = findRootModel(slugDir);
      if (!absModel) {
        return res.status(422).json({ error: 'No GLB or GLTF file found inside the ZIP' });
      }
      modelFile = relative(slugDir, absModel).split(sep).join('/');
    } else {
      // Plain GLB/GLTF — already saved with original name
      modelFile = req.file.originalname;
    }
  } catch (err) {
    return res.status(500).json({ error: `Processing failed: ${err.message}` });
  }

  const config = { ...DEFAULT_CONFIG, name: req.body.name || 'Untitled World', modelFile };
  writeConfig(req.slug, config);
  res.json({ slug: req.slug });
});

// Get config
app.get('/api/worlds/:slug/config', (req, res) => {
  const config = readConfig(req.params.slug);
  if (!config) return res.status(404).json({ error: 'Not found' });
  res.json(config);
});

// Update config
app.put('/api/worlds/:slug/config', (req, res) => {
  const existing = readConfig(req.params.slug);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updated = { ...existing, ...req.body };
  writeConfig(req.params.slug, updated);
  res.json(updated);
});

// Legacy route — redirect to the actual model file via the files route
app.get('/api/worlds/:slug/model.glb', (req, res) => {
  const config = readConfig(req.params.slug);
  const file = config?.modelFile || 'model.glb';
  res.redirect(`/api/worlds/${req.params.slug}/files/${file}`);
});

// Viewer + Configure routes
app.get('/world/:slug',     (req, res) => res.sendFile(join(__dirname, 'public', 'viewer.html')));
app.get('/configure/:slug', (req, res) => res.sendFile(join(__dirname, 'public', 'configure.html')));

app.listen(PORT, () => {
  console.log(`World Viewer running at http://localhost:${PORT}`);
});
