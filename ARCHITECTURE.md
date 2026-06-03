# Architecture

A walkable 3D web gallery — *Electric Paintings, 2017 to 2020* — that hangs 66
artworks in a recreation of the Obsidian gallery and lets visitors explore it in
the browser (and in VR). This document explains what the moving parts are and how
they fit together.

---

## 1. The big picture

It is a **static website** — no backend, no runtime build. Everything runs in the
visitor's browser. The stack, bottom to top:

```
WebGL            the browser's GPU drawing API
  └─ three.js    JavaScript 3D engine (bundled inside A-Frame)
       └─ A-Frame   lets you declare a 3D scene as HTML custom elements
            └─ index.html   the scene + custom components
                 └─ gallery-data.js   the data that places the 66 artworks
```

You write 3D as HTML tags; A-Frame turns each tag into three.js objects; three.js
draws them with WebGL ~60 times a second. Custom JavaScript components add the
behaviour (movement, collision, animation, the loading screen).

---

## 2. Files that run on the live site

Only these are needed to serve the experience:

| Path | Role |
|---|---|
| `index.html` | The entire app: scene markup (HTML/A-Frame), styling (CSS), and the custom components (JS) |
| `gallery-data.js` | The data — `window.GALLERY_DATA`: 66 frames (position, orientation, filename) + a spawn point |
| `models/obsidian-gallery.glb` | The 3D room: geometry + baked textures, exported from Unity (~8.6 MB) |
| `images/` | The 66 artwork JPEGs |
| `textures/` | `mountains.jpg` (sky panorama), `water-normal.png`, and the generated `clouds.png` / `mist.png` |

External dependency: **A-Frame 1.5.0**, loaded from its CDN in `index.html`.
Everything else is served from your own space with relative paths, so it works
from any folder and over http or https (VR requires https).

> Not needed at runtime (safe to leave in the repo): `build/`, `gallery-data.json`,
> the `gallery-map.*` / `gallery-planes.*` reference images, `README.md`.

---

## 3. Inside `index.html`

The whole app lives in one file, in three layers.

### 3a. HTML + CSS — the 2D page chrome
Regular DOM, layered over the 3D canvas with `z-index`:
- `#loader` — the intro/loading overlay (title, spinner, **Start** button)
- `#intro` — the controls hint that fades in after Start
- `#count` — the "66 works" caption

CSS `transition` and `@keyframes` handle the fades and the spinner.

### 3b. The A-Frame scene — declarative 3D
Everything inside `<a-scene>` is the 3D world, written as custom HTML elements:

| Element | What it is |
|---|---|
| `<a-assets>` | Pre-loads the big textures before first render (30 s timeout for the 12 MB sky) |
| `<a-entity light=…>` ×4 | Hemisphere + ambient + two directional lights |
| `<a-sky>` | The mountain panorama mapped onto a huge sphere |
| `<a-plane id="water">` | The reflecting pool |
| `<a-plane id="mist">` | A low fog layer, outside the gallery only |
| `<a-entity id="clouds">` | A slowly rotating cloud dome |
| `<a-entity id="rig"><a-camera>` | The visitor (rig = body, camera = head/eyes) |

Each attribute (`material`, `geometry`, `position`, `light`, `look-controls`,
`wasd-controls`…) is an **A-Frame component** — a small bundle of three.js logic.
`look-controls` (mouse) and `wasd-controls` (movement) are built in.

A `TWEAKABLES` comment block at the top of the scene lists the values worth
adjusting and exactly where each one lives.

### 3c. Custom JavaScript components
Registered with `AFRAME.registerComponent(name, { init, tick })`. `tick()` runs
every frame; `init()` runs once.

| Component | On | Job |
|---|---|---|
| `gallery` | `<a-scene>` | The core: loads the `.glb` room, then loops over `GALLERY_DATA.frames` and **builds each artwork in code** (a backing box + an image plane), placing/rotating it from the data and sizing it to the photo's aspect ratio. Emits `room-ready` when the room is loaded. |
| `wall-collider` | camera | Raycasts against the room mesh each frame; blocks/slides the camera so you can't walk through walls. |
| `key-turn` | rig | Q/E turn the view, rotating about the camera (not the rig pivot). |
| `water-flow` | water | Scrolls the normal-map offset each frame to ripple the pool. |
| `drift-map` | mist | Scrolls the base-map offset to drift the mist. |
| `sharp-texture` | sky/water/clouds | Sets max anisotropic filtering so textures stay crisp at the horizon. |

A final small `<script>` is the **loading-screen controller**: it enables the
**Start** button only once `<a-assets>` has loaded *and* the `gallery` component
has emitted `room-ready` (with a 30 s safety fallback), then fades the overlay on
click.

---

## 4. The data layer

`gallery-data.js` is simply:

```js
window.GALLERY_DATA = {
  frames: [ { id, file, position: {x,y,z}, quaternion: {x,y,z,w}, … }, … ],
  spawn:  { x, y, z },
  count:  66,
  bounds: { minX, maxX, minZ, maxZ }
};
```

Keeping data separate from code is why the `gallery` component can build all 66
works generically — and why correcting a misplaced frame was editing numbers, not
logic. (`gallery-data.json` is the same data in plain JSON, used by the offline
tools.)

---

## 5. The build tools (offline only)

The `build/*.mjs` Node scripts did the heavy lifting **once, off-line**, and are
never run by the website. They are kept for reproducibility:

| Script | Produced |
|---|---|
| `place-frames.mjs` (+ `frames-spatial.json`) | Computed each artwork's wall placement → `gallery-data.*` |
| `make-clouds.mjs`, `make-mist.mjs` | Generated `textures/clouds.png`, `textures/mist.png` |
| `gallery-map.mjs`, `gallery-planes.mjs` | The numbered/lettered reference maps (`gallery-map.*`, `gallery-planes.*`) |
| `render-preview.mjs`, `plan.mjs`, `walls.mjs`, `diag-plan.mjs`, `generate.mjs` | Diagnostics used while building the layout |

Run with `node build/<script>.mjs`. They need Node and the dev dependencies
(`pngjs`, `jpeg-js`); the live site needs none of that.

---

## 6. Running and deploying

**Locally** (browsers block WebGL textures over `file://`, so serve over HTTP):

```bash
python3 -m http.server 8000
# open http://localhost:8000   (add /?labels to float each frame's number)
```

**Deploying:** upload the runtime files in §2, preserving the folder structure, to
any static host. Use **https** for VR. Filenames are case-sensitive on most
servers — the image names in `gallery-data` must match the files exactly (they do).

---

## 7. One-line summary

> The browser's WebGL draws a three.js scene that A-Frame lets you declare as HTML;
> custom JS components add movement, collision and animation; and a small data file
> drives where all 66 artworks hang.
