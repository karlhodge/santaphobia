# 3D Scene Viewer — Starter Prompt

Use this prompt (or paste it into Claude) when starting a new project from a GLTF/GLB file.

---

## Prompt

> I have a GLTF (or GLB) 3D model I want to turn into a first-person walkable
> scene hosted as a static site (GitHub Pages or similar). Use the template in
> `gltf-scene-template/` as the starting point.
>
> **My model:** `[FILENAME.gltf or FILENAME.glb]`
>
> **Scene name / title:** `[YOUR TITLE]`
>
> **Subtitle (optional):** `[YOUR SUBTITLE]`
>
> Please:
> 1. Copy the template into a new project folder
> 2. Update `CONFIG` in `index.html` with my scene name and model filename
> 3. Calibrate the spawn point — either:
>    - Use the coordinate HUD (top-right debug overlay) to walk to the right
>      spot, note the X/Y/Z and yaw, then set those in CONFIG
>    - Or embed a named empty called "SpawnPoint" in the model before export
> 4. Adjust lighting if needed for the scene mood
> 5. Set up `server.js` for local preview, then deploy as static files

---

## What the template gives you

- Zero-dependency GLTF/GLB loader (no npm, no build step — just Three.js from CDN)
- First-person WASD + mouse-look controls with pointer lock
- Collision detection (3-height raycasting against all scene meshes)
- PBR material support (base colour, metalness, roughness, textures)
- Entry overlay with title, subtitle, and controls legend
- Debug coordinate HUD for calibrating spawn points
- Local dev server (`server.js`) with correct MIME types
- Auto-scales model to fit 20-unit room, centres at origin

## Spawn point calibration

The most important per-scene customization. Two approaches:

### Approach A — Use the debug HUD
1. Open the scene, walk to where the user should start
2. Note the X, Z, and Yaw values from the green HUD (top-right)
3. Set `SPAWN_X`, `SPAWN_Z`, and `SPAWN_YAW_DEG` in the CONFIG block

### Approach B — Embed a marker in the model
1. In Blender (or other), add an Empty at the desired spawn location, name it `SpawnPoint`
2. Export with the empty included
3. Set `USE_SPAWN_MARKER: true` in CONFIG — the loader will find it automatically

## File structure

```
your-project/
├── index.html          # Viewer (copy from template, edit CONFIG)
├── server.js           # Local dev server (copy as-is)
├── scene.gltf          # Your model (or scene.glb)
├── scene.bin           # Binary geometry data (if .gltf)
└── textures/           # Texture images referenced by the model
    ├── diffuse.jpg
    └── ...
```

## Export checklist (Blender)

- [ ] Apply all transforms (Ctrl+A → All Transforms) before export
- [ ] Set coordinate system to Y-up (glTF default)
- [ ] Include textures (embed or keep relative paths)
- [ ] If using spawn marker: add Empty named "SpawnPoint" at desired location
- [ ] Ground plane should sit at or near Y=0
