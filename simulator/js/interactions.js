// Direct 3D interaction with the sensor modules + visual props that show the environment.
//
//   PROFILE[key] describes what pressing / tapping / scrolling / dragging the module does:
//     hold:   env id set true while the pointer is held on the module (button, touch, shake...)
//     tap:    function(env) called on a quick tap (toggle magnet, tilt, flame...)
//     wheel:  { id, step } env range changed with the mouse wheel over the module
//     stick:  joystick: drag on the stick moves x/y, springs back on release
//     rotary: encoder: drag on the shaft turns it, tap on it = press SW
//   Props (magnet, finger, candle, obstacle, tape, card...) are created per module and
//   updated every frame from the module's env.
import * as THREE from 'three';

const mm = 0.001;
const toggle = (id) => (e) => { e[id] = !e[id]; };

export const PROFILE = {
  'button-module': { hold: 'press', label: 'กดค้างที่ปุ่มบนโมดูล' },
  'touch-sensor': { hold: 'touch', wheel: { id: 'trim', step: 2 }, label: 'แตะค้างที่โมดูล = เอานิ้วแตะ' },
  'vibration-sensor': { hold: 'shake', label: 'กดค้างที่โมดูล = เขย่า' },
  'tap-module': { hold: 'shake', label: 'กดค้างที่โมดูล = เคาะ' },
  'hall-magnetic-sensor': { tap: toggle('magnet'), label: 'แตะโมดูล = เอาแม่เหล็กเข้า/ออก' },
  'magnetic-spring-sensor': { tap: toggle('magnet'), label: 'แตะโมดูล = เอาแม่เหล็กเข้า/ออก' },
  'reed-switch': { tap: toggle('magnet'), label: 'แตะโมดูล = เอาแม่เหล็กเข้า/ออก' },
  'mercury-switch': { tap: toggle('tilt'), label: 'แตะโมดูล = เอียง/ตั้งตรง' },
  'tilt-switch': { tap: toggle('tilt'), label: 'แตะโมดูล = เอียง/ตั้งตรง' },
  'light-cup-module': { tap: toggle('tilt'), label: 'แตะโมดูล = เอียง/ตั้งตรง' },
  'heartbeat-sensor': { tap: toggle('finger'), wheel: { id: 'bpm', step: 5 }, label: 'แตะ = วาง/ยกนิ้ว · ล้อเมาส์ = ชีพจร' },
  'light-blocking-sensor': { tap: toggle('blocked'), wheel: { id: 'wheel', step: 0.5 }, label: 'แตะ = สอด/ดึงแผ่นกั้น · ล้อเมาส์ = หมุนจานเข้ารหัส' },
  'tracking-sensor': { tap: (e) => { e.surface = e.surface === 'black' ? 'white' : 'black'; }, label: 'แตะ = สลับพื้นขาว/เส้นดำ' },
  photoresistor: { tap: (e) => { if (e.light > 15) { e._light = e.light; e.light = 5; } else e.light = e._light ?? 80; }, wheel: { id: 'light', step: 5 }, label: 'แตะ = เอามือบัง/เปิด · ล้อเมาส์ = ความสว่าง' },
  'flame-sensor': { tap: (e) => { e.flame = e.flame > 10 ? 0 : 85; }, wheel: { id: 'flame', step: 5 }, label: 'แตะ = จุด/ดับเทียน · ล้อเมาส์ = ความแรงไฟ' },
  'avoidance-sensor': { tap: (e) => { e.dist = e.dist > e.range ? Math.max(3, e.range - 5) : 30; }, wheel: { id: 'dist', step: 1 }, label: 'แตะ = วาง/เอาสิ่งกีดขวางออก · ล้อเมาส์ = ระยะ' },
  'analog-hall-sensor': { tap: (e) => { e.field = e.field > 0 ? -80 : e.field < 0 ? 0 : 80; }, wheel: { id: 'field', step: 10 }, label: 'แตะ = แม่เหล็ก N / S / ไม่มี · ล้อเมาส์ = ระยะแม่เหล็ก' },
  'linear-hall-sensor': { tap: (e) => { e.field = e.field > 0 ? -80 : e.field < 0 ? 0 : 80; }, wheel: { id: 'field', step: 10 }, label: 'แตะ = แม่เหล็ก N / S / ไม่มี · ล้อเมาส์ = ระยะแม่เหล็ก' },
  'analog-temperature-sensor': { hold: '_warm', wheel: { id: 'temp', step: 1 }, label: 'กดค้าง = กำด้วยมือ (อุ่นขึ้น) · ล้อเมาส์ = อุณหภูมิ' },
  'digital-temperature-sensor': { hold: '_warm', wheel: { id: 'temp', step: 1 }, label: 'กดค้าง = กำด้วยมือ (อุ่นขึ้น) · ล้อเมาส์ = อุณหภูมิ' },
  'ds18b20-temperature-sensor': { hold: '_warm', wheel: { id: 'temp', step: 1 }, label: 'กดค้าง = กำด้วยมือ (อุ่นขึ้น) · ล้อเมาส์ = อุณหภูมิ' },
  'temperature-humidity-sensor': { hold: '_breath', wheel: { id: 'temp', step: 1 }, label: 'กดค้าง = เป่าลมหายใจ (ชื้น+อุ่น) · ล้อเมาส์ = อุณหภูมิ' },
  'big-sound-sensor': { hold: '_clap', wheel: { id: 'sound', step: 5 }, label: 'กดค้าง = ส่งเสียงดัง/ปรบมือ · ล้อเมาส์ = ระดับเสียง' },
  'small-sound-sensor': { hold: '_clap', wheel: { id: 'sound', step: 5 }, label: 'กดค้าง = ส่งเสียงดัง/ปรบมือ · ล้อเมาส์ = ระดับเสียง' },
  'joystick-module': { stick: true, label: 'ลากที่คันโยก = โยก · แตะคันโยก = กด SW' },
  'rotary-encoder': { rotary: true, label: 'ลากแกนซ้าย-ขวา หรือ ล้อเมาส์ = หมุน · แตะแกน = กด SW' },
  'ir-receiver': { label: 'ใช้รีโมทในแผงโมดูลด้านขวา' },
};

// ------------------------------------------------------------------ props
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w * mm, h * mm, d * mm), mat); m.castShadow = true; return m; }

function magnetProp() {
  const g = new THREE.Group();
  const n = box(10, 6, 6, std(0xd62020, { roughness: 0.35 }));
  n.position.x = -5 * mm;
  const s = box(10, 6, 6, std(0x1f5fd0, { roughness: 0.35 }));
  s.position.x = 5 * mm;
  g.add(n, s);
  g.userData.n = n; g.userData.s = s;
  return g;
}
function fingerProp() {
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xe0ac8a, roughness: 0.55, sheen: 0.4 });
  const f = new THREE.Mesh(new THREE.CapsuleGeometry(6.5 * mm, 26 * mm, 8, 16), skin);
  f.rotation.z = Math.PI / 2;
  f.castShadow = true;
  const nail = new THREE.Mesh(new THREE.SphereGeometry(4.5 * mm, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf3d3c4, { roughness: 0.25 }));
  nail.scale.set(1.2, 0.4, 1);
  nail.position.set(16 * mm, 5 * mm, 0);
  const g = new THREE.Group();
  g.add(f, nail);
  return g;
}
function candleProp() {
  const g = new THREE.Group();
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(6 * mm, 6 * mm, 30 * mm, 24), std(0xf4efe4, { roughness: 0.7 }));
  wax.position.y = 15 * mm;
  wax.castShadow = true;
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * mm, 0.4 * mm, 3 * mm, 6), std(0x222222));
  wick.position.y = 31.5 * mm;
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa630, transparent: true, opacity: 0.9, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(2.6 * mm, 10 * mm, 16), flameMat);
  flame.position.y = 38 * mm;
  const core = new THREE.Mesh(new THREE.ConeGeometry(1.2 * mm, 5 * mm, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0, toneMapped: false }));
  core.position.y = 36 * mm;
  const light = new THREE.PointLight(0xff9a3a, 0, 0.3, 2);
  light.position.y = 40 * mm;
  g.add(wax, wick, flame, core, light);
  g.userData = { flame, core, light };
  return g;
}
function obstacleProp() {
  const g = new THREE.Group();
  const b = box(4, 40, 40, std(0xf2f2f2, { roughness: 0.6 }));
  b.position.y = 20 * mm;
  g.add(b);
  return g;
}
function tapeProp() {
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(60 * mm, 40 * mm), std(0xf7f7f5, { roughness: 0.9 }));
  paper.rotation.x = -Math.PI / 2;
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(18 * mm, 40 * mm), std(0x0c0c0c, { roughness: 0.6 }));
  tape.rotation.x = -Math.PI / 2;
  tape.position.y = 0.2 * mm;
  const g = new THREE.Group();
  g.add(paper, tape);
  g.userData.tape = tape;
  return g;
}
function cardProp() { return box(1, 14, 10, std(0x3a7bd5, { roughness: 0.5 })); }
function discProp() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(16 * mm, 16 * mm, 1 * mm, 40), std(0x222222, { roughness: 0.5 }));
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  for (let i = 0; i < 20; i++) {
    const slot = box(1.5, 4, 1.2, std(0xdddddd));
    const a = (i / 20) * Math.PI * 2;
    slot.position.set(Math.cos(a) * 13 * mm, Math.sin(a) * 13 * mm, 0);
    slot.rotation.z = a;
    g.add(slot);
  }
  return g;
}
function ringsProp() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(10 * mm, 0.5 * mm, 6, 40), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.6, toneMapped: false }));
    r.rotation.y = Math.PI / 2;
    g.add(r);
  }
  return g;
}
function torchLight() {
  const l = new THREE.PointLight(0xfff4d6, 0, 0.12, 2);
  return l;
}
function labelSprite() {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.018, 0.006, 1);
  sp.renderOrder = 21;
  sp.userData.draw = (text) => {
    if (sp.userData.text === text) return;
    sp.userData.text = text;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 192, 64);
    g.fillStyle = 'rgba(10,12,16,.85)';
    g.beginPath(); g.roundRect(4, 6, 184, 52, 16); g.fill();
    g.fillStyle = '#e6eaf0'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 96, 33);
    tex.needsUpdate = true;
  };
  return sp;
}

/** Create props for a module (children of the module root, metres, module local frame). */
export function buildProps(m) {
  const p = {};
  const add = (k, o, x, y, z) => { o.position.set(x, y, z); o.visible = false; m.root.add(o); p[k] = o; };
  const key = m.key;
  if (['hall-magnetic-sensor', 'magnetic-spring-sensor', 'analog-hall-sensor'].includes(key)) add('magnet', magnetProp(), 0.02, 0.006, 0);
  if (['reed-switch', 'linear-hall-sensor'].includes(key)) add('magnet', magnetProp(), 0.032, 0.006, 0);
  if (key === 'heartbeat-sensor') add('finger', fingerProp(), 0.003, 0.017, 0);
  if (key === 'touch-sensor') add('finger', fingerProp(), 0.024, 0.014, 0);
  if (key === 'button-module') add('finger', fingerProp(), 0.019, 0.016, 0);
  if (key === 'flame-sensor') add('candle', candleProp(), 0.06, 0, 0);
  if (key === 'avoidance-sensor') add('obstacle', obstacleProp(), 0.05, 0, 0);
  if (key === 'tracking-sensor') { add('tape', tapeProp(), 0.013, -0.0012, 0); p.tape.visible = true; }
  if (key === 'light-blocking-sensor') { add('card', cardProp(), 0.0035, 0.009, 0); add('disc', discProp(), 0.0035, 0.018, 0); }
  if (['big-sound-sensor', 'small-sound-sensor'].includes(key)) add('rings', ringsProp(), 0.03, 0.006, 0);
  if (key === 'photoresistor') add('torch', torchLight(), 0.004, 0.03, 0);
  if (/temperature|humidity|ds18b20|sound|photoresistor|flame|hall|heartbeat|joystick|rotary|avoidance/.test(key)) { add('label', labelSprite(), 0, 0.03, 0); p.label.visible = true; }
  // parts that move: button cap, joystick stick, encoder shaft (meshes above a height)
  const movers = (minY) => { const out = []; m.root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(m.root.matrixWorld).invert(); m.root.traverse((o) => { if (!o.isMesh || o.userData.prop) return; const b = new THREE.Box3().setFromObject(o).applyMatrix4(inv); if (b.min.y > minY) out.push({ o, pos: o.position.clone(), quat: o.quaternion.clone() }); }); return out; };
  if (key === 'button-module') p.cap = movers(0.0045);
  if (key === 'joystick-module') p.stick = movers(0.0125);
  if (key === 'rotary-encoder') p.shaft = movers(0.0085);
  for (const o of Object.values(p)) if (o && o.traverse) o.traverse((x) => { x.userData.prop = true; });
  return p;
}

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
/** Rotate a set of meshes about a pivot (module local metres -> converted to each mesh's parent space). */
function rotateParts(parts, pivotLocal, axis, angle, root) {
  if (!parts) return;
  const q = tmpQ.setFromAxisAngle(axis, angle);
  for (const pr of parts) {
    const parent = pr.o.parent;
    // pivot expressed in the parent space of this mesh
    const pivot = root.localToWorld(pivotLocal.clone());
    parent.worldToLocal(pivot);
    const off = pr.pos.clone().sub(pivot).applyQuaternion(q);
    pr.o.position.copy(pivot).add(off);
    pr.o.quaternion.copy(q).multiply(pr.quat);
  }
}

/** Per-frame update of props + env dynamics (warming, clapping...). */
export function updateProps(m, t, dt, { powered, wiresUpdate }) {
  const p = m.props || {};
  const e = m.env;
  // dynamics driven by hold actions
  if ('_warm' in e || PROFILE[m.key]?.hold === '_warm') {
    e._base ??= e.temp;
    if (e._warm) e.temp = Math.min(36.5, e.temp + dt * 2.5);
  }
  if (PROFILE[m.key]?.hold === '_breath') {
    if (e._breath) { e.hum = Math.min(95, e.hum + dt * 25); e.temp = Math.min(34, e.temp + dt * 1.5); }
    else e.hum = Math.max(e._hum0 ?? (e._hum0 = e.hum), e.hum - dt * 6);
  }
  if (PROFILE[m.key]?.hold === '_clap') {
    if (e._clap) { e._snd0 ??= e.sound; e.sound = 100; } else if (e._snd0 != null) { e.sound = e._snd0; e._snd0 = null; }
  }
  if (p.magnet) {
    const field = 'field' in e ? e.field : e.magnet ? 80 : 0;
    p.magnet.visible = !!field;
    const dist = 0.012 + (1 - Math.min(100, Math.abs(field)) / 100) * 0.03;
    p.magnet.position.x = (['reed-switch', 'linear-hall-sensor'].includes(m.key) ? 0.024 : 0.012) + dist;
    p.magnet.rotation.y = field < 0 ? Math.PI : 0; // flip pole
  }
  if (p.finger) p.finger.visible = !!(e.finger || e.touch || e.press);
  if (p.cap) { const d = e.press ? -0.0009 : 0; for (const pr of p.cap) { pr.o.position.copy(pr.pos); pr.o.position.y += d / (pr.o.parent.getWorldScale(tmpV).y || 1); } }
  if (p.candle) {
    const f = (e.flame || 0) / 100;
    p.candle.visible = f > 0.02;
    const u = p.candle.userData;
    const flick = 1 + Math.sin(t * 0.03) * 0.08 + Math.sin(t * 0.071) * 0.05;
    u.flame.scale.set(0.6 + f * 0.6, (0.5 + f) * flick, 0.6 + f * 0.6);
    u.core.scale.setScalar(0.6 + f * 0.5);
    u.light.intensity = f * 0.5 * flick;
  }
  if (p.obstacle) { p.obstacle.visible = e.dist < 40; p.obstacle.position.x = 0.022 + e.dist * 0.01; }
  if (p.tape) p.tape.userData.tape.visible = e.surface === 'black';
  if (p.card) p.card.visible = !!e.blocked && !(e.wheel > 0);
  if (p.disc) { p.disc.visible = e.wheel > 0; p.disc.rotation.z -= (e.wheel || 0) * dt * Math.PI * 2; }
  if (p.rings) {
    const lvl = (e.sound || 0) / 100;
    p.rings.visible = lvl > 0.3;
    p.rings.children.forEach((r, i) => { const k = ((t / 600 + i / 3) % 1); r.scale.setScalar(0.5 + k * 2.5 * lvl); r.material.opacity = (1 - k) * 0.7 * lvl; r.position.x = k * 0.02; });
  }
  if (p.torch) p.torch.intensity = (e.light || 0) / 100 * 0.25;
  if (p.stick) {
    const ax = new THREE.Vector3((e.y || 0) / 100, 0, -(e.x || 0) / 100);
    const ang = ax.length() * 0.45;
    rotateParts(p.stick, new THREE.Vector3(0.004, 0.0126, 0), ang ? ax.normalize() : new THREE.Vector3(1, 0, 0), ang, m.root);
  }
  if (p.shaft) rotateParts(p.shaft, new THREE.Vector3(0.004, 0.009, 0), new THREE.Vector3(0, 1, 0), -(e.enc || 0) * (Math.PI / 20), m.root);
  // tilt switches: lean the whole module
  if ('tilt' in e) {
    const target = e.tilt ? -0.55 : 0;
    const cur = m.root.rotation.z;
    if (Math.abs(target - cur) > 0.002) { m.root.rotation.z = cur + (target - cur) * Math.min(1, dt * 10); m.root.position.y = Math.max(0, -Math.sin(m.root.rotation.z) * 0.009); wiresUpdate(); }
  }
  // shaking: jitter while held
  if (e.shake) { m.root.position.x = m.baseX + (Math.random() - 0.5) * 0.0012; m.root.position.z = m.baseZ + (Math.random() - 0.5) * 0.0012; wiresUpdate(); m.jittered = true; }
  else if (m.jittered) { m.root.position.x = m.baseX; m.root.position.z = m.baseZ; m.jittered = false; wiresUpdate(); }
  else { m.baseX = m.root.position.x; m.baseZ = m.root.position.z; }
  // floating value label
  if (p.label) {
    let text = '';
    if ('temp' in e) text = `${e.temp.toFixed(1)} °C` + ('hum' in e ? ` · ${Math.round(e.hum)}%` : '');
    else if ('light' in e) text = `แสง ${Math.round(e.light)}%`;
    else if ('flame' in e) text = `ไฟ ${Math.round(e.flame)}%`;
    else if ('sound' in e) text = `เสียง ${Math.round(e.sound)}%`;
    else if ('field' in e) text = e.field ? `${e.field > 0 ? 'N' : 'S'} ${Math.abs(e.field)}%` : 'ไม่มีแม่เหล็ก';
    else if ('magnet' in e) text = e.magnet ? 'มีแม่เหล็ก' : 'ไม่มีแม่เหล็ก';
    else if ('bpm' in e) text = e.finger ? `${e.bpm} BPM` : 'ไม่มีนิ้ว';
    else if ('x' in e) text = `X ${e.x} · Y ${e.y}`;
    else if ('enc' in e) text = `ตำแหน่ง ${Math.round(e.enc / 2)}`;
    else if ('dist' in e) text = `${e.dist} cm`;
    p.label.userData.draw(text);
    p.label.visible = powered && !!text;
  }
}
