import express from 'express';
import multer, { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
    cb(null, 'model.glb');
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter(req, file, cb) {
    if (file.originalname.match(/\.(glb|gltf)$/i)) cb(null, true);
    else cb(new Error('Only GLB/GLTF files are accepted'));
  },
});

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

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

// Upload a new model
app.post('/api/upload', upload.single('model'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const config = { ...DEFAULT_CONFIG, name: req.body.name || 'Untitled World' };
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

// Serve the GLB model
app.get('/api/worlds/:slug/model.glb', (req, res) => {
  const path = join(UPLOADS_DIR, req.params.slug, 'model.glb');
  if (!existsSync(path)) return res.status(404).send('Not found');
  res.sendFile(path);
});

// Viewer route — serve viewer.html for any /world/:slug URL
app.get('/world/:slug', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'viewer.html'));
});

// Configure route
app.get('/configure/:slug', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'configure.html'));
});

app.listen(PORT, () => {
  console.log(`World Viewer running at http://localhost:${PORT}`);
});
