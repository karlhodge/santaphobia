/* Shared A-Frame components for World Viewer navigation */

// Q/E key rotation pivoting around the camera (not the body axis)
AFRAME.registerComponent('key-turn', {
  init() {
    this.keys = {};
    this.onKey = (e, down) => { this.keys[e.code] = down; };
    document.addEventListener('keydown', e => this.onKey(e, true));
    document.addEventListener('keyup',  e => this.onKey(e, false));
  },
  tick(t, dt) {
    const speed = 60; // deg/s
    if (this.keys['KeyQ']) this.el.object3D.rotation.y += THREE.MathUtils.degToRad(speed * dt / 1000);
    if (this.keys['KeyE']) this.el.object3D.rotation.y -= THREE.MathUtils.degToRad(speed * dt / 1000);
  },
});

// Wall collision — raycasts ahead of camera, blocks or slides movement
AFRAME.registerComponent('wall-collider', {
  schema: { distance: { default: 0.5 }, enabled: { default: true } },

  init() {
    this.raycaster = new THREE.Raycaster();
    this.meshes = [];
    this.lastPos = new THREE.Vector3();
    this.tmpVec = new THREE.Vector3();
    this.dirs = [
      new THREE.Vector3( 1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3( 0, 0, 1),
      new THREE.Vector3( 0, 0,-1),
    ];

    this.el.sceneEl.addEventListener('model-loaded', () => this.buildMeshList());
    this.el.sceneEl.addEventListener('loaded', () => this.buildMeshList());
  },

  buildMeshList() {
    this.meshes = [];
    this.el.sceneEl.object3D.traverse(obj => {
      if (obj.isMesh) this.meshes.push(obj);
    });
  },

  tick() {
    if (!this.data.enabled || this.meshes.length === 0) return;
    const camWorldPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(camWorldPos);
    const rig = this.el.parentEl;
    if (!rig) return;
    const rigPos = rig.object3D.position;

    for (const dir of this.dirs) {
      this.raycaster.set(camWorldPos, dir);
      const hits = this.raycaster.intersectObjects(this.meshes, true);
      if (hits.length > 0 && hits[0].distance < this.data.distance) {
        const push = dir.clone().multiplyScalar(-(this.data.distance - hits[0].distance));
        rigPos.add(push);
      }
    }
  },
});

// Keep Web Audio listener on camera
AFRAME.registerComponent('audio-listener-anchor', {
  tick() {
    const listener = this.el.sceneEl.audioListener;
    if (!listener) return;
    this.el.object3D.getWorldPosition(listener.position);
  },
});

// Prevent texture blur (anisotropic filtering)
AFRAME.registerComponent('sharp-texture', {
  init() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) { this.el.addEventListener('object3d-set', () => this.apply()); return; }
    this.apply();
  },
  apply() {
    const renderer = this.el.sceneEl.renderer;
    this.el.object3D.traverse(obj => {
      if (!obj.material) return;
      [obj.material.map, obj.material.normalMap, obj.material.emissiveMap].forEach(tex => {
        if (!tex) return;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.needsUpdate = true;
      });
    });
  },
});
