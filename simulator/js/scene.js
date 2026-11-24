// three.js scene: realistic desk, Lotus Nano Bot board, modules, jumper wires.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const SLOT_ROWS = ['S', '5V', 'GND'];
const loader = new GLTFLoader();

export class Stage {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1d22);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.005, 20);
    this.camera.position.set(0.045, 0.17, 0.2);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0.03, 0, 0.0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.06;
    this.controls.maxDistance = 1.2;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    const key = new THREE.DirectionalLight(0xfff3e0, 2.4);
    key.position.set(0.25, 0.6, 0.3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -0.25;
    key.shadow.camera.right = key.shadow.camera.top = 0.25;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 2;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xb9d4ff, 0.7);
    rim.position.set(-0.4, 0.3, -0.4);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3027, 0.35));

    this.scene.add(this.makeDesk());

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.3, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this.onFrame = [];
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    const tick = (t) => {
      requestAnimationFrame(tick);
      this.controls.update();
      for (const f of this.onFrame) f(t);
      this.composer.render();
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  makeDesk() {
    // procedural light wood texture + cutting-mat grid
    const c = document.createElement('canvas');
    c.width = c.height = 2048;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 2048, 0);
    grad.addColorStop(0, '#2b3a2f');
    grad.addColorStop(1, '#25332a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2048, 2048);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
      g.fillRect(Math.random() * 2048, Math.random() * 2048, 2, 2);
    }
    g.strokeStyle = 'rgba(220,235,225,0.12)';
    g.lineWidth = 2;
    for (let i = 0; i <= 2048; i += 51.2) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 2048); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(2048, i); g.stroke();
    }
    g.strokeStyle = 'rgba(240,250,240,0.28)';
    g.lineWidth = 3;
    for (let i = 0; i <= 2048; i += 256) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 2048); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(2048, i); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat);
    desk.rotation.x = -Math.PI / 2;
    desk.position.set(0.05, -0.0019, 0);
    desk.receiveShadow = true;
    desk.name = 'desk';
    return desk;
  }

  async load(url) {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const m = o.material;
        if (m && m.transmission > 0) { m.transparent = true; m.opacity = Math.max(0.35, m.opacity); }
      }
    });
    return root;
  }

  pick(event, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  groundPoint(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  view(name) {
    const t = this.controls.target;
    const presets = {
      top: [t.x, 0.33, t.z + 0.0001],
      angle: [t.x + 0.02, 0.22, t.z + 0.26],
      front: [t.x, 0.08, t.z + 0.3],
      board: [0.0, 0.16, 0.12],
    };
    const p = presets[name];
    if (!p) return;
    if (name === 'board') this.controls.target.set(0, 0.01, 0);
    this.camera.position.set(...p);
  }
}

// ---------------------------------------------------------------- jumper wires
const WIRE_RADIUS = 0.00065;
export class Wire {
  constructor(stage, a, b, color) {
    this.stage = stage;
    this.a = a; // { obj: anchor Object3D, kind: 'pin'|'port', ... }
    this.b = b;
    this.color = color;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.4 });
    this.housingMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.5 });
    this.mesh = null;
    this.stackA = 0; // how many other wires already sit on the same pin / slot
    this.stackB = 0;
    this.h1 = this.housing('a');
    this.h2 = this.housing('b');
    this.group.add(this.h1, this.h2);
    stage.scene.add(this.group);
    this.update();
  }

  housing(end) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.014, 0.0026), this.housingMat);
    m.castShadow = true;
    m.userData.plug = { wire: this, end }; // click a housing to unplug and move that end
    return m;
  }

  endInfo(end) {
    const p = new THREE.Vector3();
    end.obj.getWorldPosition(p);
    // board header pins point up (+Y), module pins point along the module's -X axis
    const dir = new THREE.Vector3();
    if (end.kind === 'port') dir.set(0, 1, 0);
    else {
      const q = new THREE.Quaternion();
      end.obj.parent.getWorldQuaternion(q);
      dir.set(-1, 0, 0).applyQuaternion(q);
      dir.y = 0;
      dir.normalize();
    }
    return { p, dir };
  }

  update() {
    const A = this.endInfo(this.a), B = this.endInfo(this.b);
    const place = (h, info, stack) => {
      // housing sits over the pin, body extends away from the pin tip;
      // extra wires on the same pin are stacked (piggy-back Dupont) further out
      info.p.addScaledVector(info.dir, stack * 0.0145);
      const c = info.p.clone().addScaledVector(info.dir, 0.007 - 0.004);
      h.position.copy(c);
      h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), info.dir);
      return info.p.clone().addScaledVector(info.dir, 0.0105);
    };
    const a1 = place(this.h1, A, this.stackA);
    const b1 = place(this.h2, B, this.stackB);
    const dist = a1.distanceTo(b1);
    const sag = Math.min(0.05, 0.012 + dist * 0.25);
    const pts = [
      a1,
      a1.clone().addScaledVector(A.dir, 0.012).add(new THREE.Vector3(0, 0.006, 0)),
      a1.clone().lerp(b1, 0.5).add(new THREE.Vector3(0, sag, 0)),
      b1.clone().addScaledVector(B.dir, 0.012).add(new THREE.Vector3(0, 0.004, 0)),
      b1,
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, WIRE_RADIUS, 10, false), this.mat);
    this.mesh.castShadow = true;
    this.mesh.userData.wire = this;
    this.group.add(this.mesh);
  }

  setHighlight(on) { this.mat.emissive = new THREE.Color(on ? 0x335577 : 0x000000); }

  dispose() {
    this.stage.scene.remove(this.group);
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
  }
}

export { THREE };
