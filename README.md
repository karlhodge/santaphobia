# Santaphobia — 3D Gallery

A walkable, browser-based recreation of the **Santaphobia** gallery, rebuilt
from its original [Spatial](https://spatial.io) scene export after Spatial was
sunset. It uses [A-Frame](https://aframe.io) (WebGL/WebXR), so it runs in any
browser, on mobile, and in VR headsets — and embeds anywhere with an `<iframe>`.

The scene export (`scene-data.json`) contained no 3D geometry — only the
positions of 66 image frames inside Spatial's **Obsidian Gallery** room
template. The room itself is included here as `models/obsidian-gallery.glb`
(converted from the original Unity/FBX template), and every image is hung at its
**exact recorded position, rotation and scale** inside it.

If `models/obsidian-gallery.glb` is present the gallery loads the real room; if
it's removed, the page falls back to a plain stand-in room sized to the frame
layout, so it stays walkable either way.

### How the room model was made

The Obsidian Gallery shipped as a Unity project. The conversion (done without
Unity) was:

1. `Assets/Obsidian/Models/Gallery2nd.fbx` → glTF via
   [`fbx2gltf`](https://github.com/facebookincubator/FBX2glTF).
2. The FBX carries mesh + UVs but not texture bindings (Unity keeps those in
   `.mat` files), so the 13 textures were re-attached by reading the Unity
   materials and matching them by name, producing a self-contained textured GLB.

The model's coordinate space matches the frame coordinates as-is (verified
against the frame bounds), so it loads at an identity transform.

## Add the images

The 66 photos are **not** committed here. Drop them into the [`images/`](images/)
folder, keeping their original filenames. The exact list the gallery expects is
in [`images/MANIFEST.txt`](images/MANIFEST.txt) (e.g. `IMG_0959.jpg`,
`Enlight28.JPG`, …). Filenames are case-sensitive.

> These are the same files Spatial pulled from the Google Drive folder used to
> build the original gallery.

## View it locally

Browsers block WebGL textures loaded over `file://`, so serve the folder over
HTTP:

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

Controls: **drag** to look, **W A S D** / arrow keys to walk, and the headset
button (bottom-right) for VR.

## Publish it online

**GitHub Pages (automatic):** this repo ships a workflow
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)) that deploys the
site on every push to `main` or the working branch. One-time setup:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Commit the photos into `images/` and push.
3. The workflow runs and publishes to `https://<user>.github.io/santaphobia/`.
   (It deploys even before images are added, logging a warning if the folder is
   empty.) You can also trigger it manually from the **Actions** tab.

**Netlify / Vercel / any static host:** drag-and-drop the folder, or point it at
this repo. No build step is required — it's plain static files.

### Embed it

```html
<iframe src="https://<your-host>/santaphobia/"
        width="960" height="600"
        allow="xr-spatial-tracking; fullscreen"
        style="border:0"></iframe>
```

## Regenerating the layout

If you ever re-export the scene, drop the new file in as `scene-data.json` and
rerun the generator (Node 18+):

```bash
node build/generate.mjs
```

It rewrites `gallery-data.js`, `gallery-data.json` and `images/MANIFEST.txt`,
and warns about any frame whose image filename it can't resolve.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The A-Frame gallery (room, lighting, frames, controls). |
| `gallery-data.js` | Generated layout the page reads (`window.GALLERY_DATA`). |
| `gallery-data.json` | Same data, for tooling/inspection. |
| `scene-data.json` | The original Spatial export. |
| `build/generate.mjs` | Parses the export → layout + manifest. |
| `images/` | Drop your 66 photos here. |
