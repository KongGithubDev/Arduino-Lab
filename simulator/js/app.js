import { Stage, Wire, THREE } from './scene.js';
import { CATALOG as KIT } from './catalog.js';
import { BEHAVIORS as KIT_BEHAVIORS } from './behaviors.js';
import { MCU, runSketch, TranspileError } from './runtime.js';
import { Oled } from './oled.js';
import { BOARD_EXAMPLES } from './board-examples.js';
import { PROFILE, buildProps, updateProps } from './interactions.js';
import { EXTRA_BUILDERS, EXTRA_CATALOG, EXTRA_BEHAVIORS, buildUsbCable, buildBattery } from './extras.js';

const CATALOG = [...KIT, ...EXTRA_CATALOG];
const BEHAVIORS = { ...KIT_BEHAVIORS, ...EXTRA_BEHAVIORS };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODELS = 'models/';
const ASSETS = '../';
const POWER_PINS = ['+', '+5V', 'V+', 'VCC', 'VDD'];
const GROUND_PINS = ['-', 'G', 'GND'];
const PORT_TO_PIN = { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, D0: 0, D1: 1, D3: 3, SV1: 10, SV2: 11, SV3: 12 };
const PIN_TO_PORT = Object.fromEntries(Object.entries(PORT_TO_PIN).map(([k, v]) => [v, k]));
// female header sockets on the right side of the board (ADS1115, compass, Bluetooth)
// -> the signal they really carry
const SOCKET_ALIAS = {
  'ADS.A0': 'AA0', 'ADS.A1': 'AA1', 'ADS.A2': 'AA2', 'ADS.A3': 'AA3', 'ADS.SDA': 'A4', 'ADS.SCL': 'A5',
  'CMP.SDA': 'A4', 'CMP.SCL': 'A5', 'BT.TX': 'D1', 'BT.RX': 'D0',
};
const canon = (port) => SOCKET_ALIAS[port] || port;
const ROW_TH = { S: 'ช่องขาว (S)', '5V': 'ช่องแดง (5V)', GND: 'ช่องดำ (GND)', JST: 'ขั้วต่อมอเตอร์', T: 'ขั้วสกรูรีเลย์', NC: 'ขาที่ไม่ได้ต่อกับ Arduino' };
const RELAY_TERMS = { NC: 0.005, COM: 0, NO: -0.005 }; // z offset (m) of the 3 screw terminals on the KY-019 model
const TERM_TH = { COM: 'COM (ขาร่วม)', NO: 'NO (ปกติเปิด: ต่อเมื่อรีเลย์ทำงาน)', NC: 'NC (ปกติปิด: ต่อเมื่อรีเลย์ไม่ทำงาน)' };
const SIGNAL_COLORS = ['#f2c200', '#1f6fe0', '#20a040', '#e87a10', '#9b3fd4', '#e8e8e8'];
const MOTOR_PINS = { ML: [9, 4, 5], MR: [7, 8, 6] };

// ------------------------------------------------------------------ state
const stage = new Stage($('#viewport'));
const mcu = new MCU(null);
const oled = new Oled();
const state = {
  board: null,
  ports: [],
  modules: [],
  wires: [],
  pending: null,
  selected: null,
  running: null,
  uploaded: null,          // last uploaded sketch: restarts when power comes back
  d2Pressed: false,
  knob: 0.5,
  warned: new Set(),
  irQueue: [],
  servo: {},
  power: { usb: true, battery: false, sw: false },
};
let nextId = 1;
const boardOn = () => state.power.usb || (state.power.battery && state.power.sw);
const motorsOn = () => state.power.battery && state.power.sw;

// ------------------------------------------------------------------ audio
let audio = null;
const voices = {};
function sound(id, freq, type = 'square') {
  if (!audio) { try { audio = new AudioContext(); } catch { return; } }
  if (!freq) {
    if (voices[id]) { voices[id].g.gain.setTargetAtTime(0, audio.currentTime, 0.01); voices[id].o.stop(audio.currentTime + 0.05); delete voices[id]; }
    return;
  }
  if (voices[id]) { voices[id].o.frequency.setValueAtTime(freq, audio.currentTime); return; }
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = 0;
  g.gain.setTargetAtTime(type === 'sawtooth' ? 0.02 : 0.05, audio.currentTime, 0.005);
  o.connect(g).connect(audio.destination);
  o.start();
  voices[id] = { o, g };
}
function click(f = 180) {
  if (!audio) return;
  const o = audio.createOscillator(); const g = audio.createGain();
  o.frequency.value = f; g.gain.value = 0.08; g.gain.setTargetAtTime(0, audio.currentTime, 0.01);
  o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.04);
}

// ------------------------------------------------------------------ click targets
// Board/module nodes live under a root scaled 0.001 (mm -> m), so hit spheres must
// compensate for the inherited scale or they become microscopic.
const HIT_GEO = new THREE.SphereGeometry(1, 14, 10);
const ROW_COLOR = { S: 0xf4f2ec, '5V': 0xff3b3b, GND: 0x3a3a3a, JST: 0xffd24a };
function makeHit(obj, anchor, radius) {
  const ws = new THREE.Vector3();
  obj.updateWorldMatrix(true, false);
  obj.getWorldScale(ws);
  const color = anchor.kind === 'port' ? ROW_COLOR[anchor.row] ?? 0x00ffaa : 0x38bdf8;
  const hit = new THREE.Mesh(HIT_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false }));
  hit.scale.setScalar(radius / ws.x);
  hit.userData.anchor = anchor;
  hit.renderOrder = 10;
  obj.add(hit);
  return hit;
}
function textSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,16,.82)';
  g.beginPath(); g.roundRect(4, 8, 120, 48, 14); g.fill();
  g.fillStyle = color; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.009, 0.0045, 1);
  sp.renderOrder = 20;
  return sp;
}
const coarse = matchMedia('(pointer: coarse)').matches; // touch screens get larger targets
const HIT_R = coarse ? 0.0022 : 0.00155;

// ------------------------------------------------------------------ board
async function loadBoard() {
  const root = await stage.load(MODELS + 'lotus-nano-bot.glb');
  stage.scene.add(root);
  state.board = root;
  root.updateMatrixWorld(true);
  const found = [];
  root.traverse((o) => { const ud = o.userData || {}; if (ud.port && ud.row) found.push(o); });
  for (const o of found) {
    const ud = o.userData;
    const hit = makeHit(o, { kind: 'port', obj: o, port: ud.port, row: ud.row }, ud.row === 'JST' ? 0.003 : HIT_R);
    state.ports.push({ obj: o, port: ud.port, row: ud.row, hit });
  }
  // female header sockets (positions in mm from tools/blender/lotus_board.py, board layout frame)
  const TOPF = 14.6 + 8.5;
  const socket = (port, row, xmm, ymm, label) => {
    const o = new THREE.Object3D();
    o.position.set(xmm * 0.001, TOPF * 0.001, -ymm * 0.001);
    root.add(o);
    const hit = makeHit(o, { kind: 'port', obj: o, port, row, label }, HIT_R);
    state.ports.push({ obj: o, port, row, hit, label });
  };
  const ADS = [['VDD', '5V', 'ADS1115 VDD (ไฟ 5V)'], ['GND', 'GND', 'ADS1115 GND'], ['SCL', 'S', 'ADS1115 SCL (I2C = A5)'], ['SDA', 'S', 'ADS1115 SDA (I2C = A4)'],
    ['ADDR', 'NC', 'ADS1115 ADDR (เลือก Address)'], ['ALRT', 'NC', 'ADS1115 ALERT'], ['A0', 'S', 'ADS1115 A0 (Analog 16 บิต ช่อง 0)'], ['A1', 'S', 'ADS1115 A1 (ช่อง 1)'], ['A2', 'S', 'ADS1115 A2 (ช่อง 2)'], ['A3', 'S', 'ADS1115 A3 (ช่อง 3)']];
  ADS.forEach(([n, row, label], i) => socket(row === '5V' || row === 'GND' ? `ADS.${n}` : `ADS.${n}`, row, 31.8, 17.2 - i * 2.54, label));
  const CMP = [['DRDY', 'NC', 'Compass DRDY (Data Ready)'], ['SDA', 'S', 'Compass SDA (I2C = A4)'], ['SCL', 'S', 'Compass SCL (I2C = A5)'], ['GND', 'GND', 'Compass GND'], ['VCC', '5V', 'Compass VCC (5V)']];
  CMP.forEach(([n, row, label], i) => socket(`CMP.${n}`, row, 15.78 + (i - 2) * 2.54, -7.2, label));
  const BT = [['VCC', '5V', 'Bluetooth VCC (5V)'], ['GND', 'GND', 'Bluetooth GND'], ['TX', 'S', 'Bluetooth TX → ขา RX (D0) ของ Nano'], ['RX', 'S', 'Bluetooth RX → ขา TX (D1) ของ Nano']];
  BT.forEach(([n, row, label], i) => socket(`BT.${n}`, row, 32.5 + (i - 1.5) * 2.54, 22.1, label));
  const find = (n) => { let r = null; root.traverse((o) => { if (!r && o.name && o.name.startsWith(n)) r = o; }); return r; };
  state.parts = {
    screen: find('oled_screen'), nanoL: find('nano_led_3'), nanoPwr: find('nano_led_2'), pwrLed: find('pwr_led'),
    button: find('btn_cap'), knob: find('knob_shaft'), knobSlot: find('knob_slot'), lever: find('switch_lever'), usb: find('nano_usb'), tplug: find('tplug_housing'),
  };
  if (state.parts.screen) state.parts.screen.material = new THREE.MeshBasicMaterial({ map: oled.texture, toneMapped: false });
  root.traverse((o) => {
    if (o.isMesh && /^oled_case/.test(o.name)) {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.07, envMapIntensity: 0.25, depthWrite: false });
      o.castShadow = false;
    }
    if (o.isMesh && /^oled_glass/.test(o.name)) o.material = new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.5 });
  });
  for (const k of ['nanoL', 'nanoPwr', 'pwrLed']) { const p = state.parts[k]; if (p) p.material = p.material.clone(); }
  if (state.parts.lever) state.parts.lever.userData.x0 = state.parts.lever.position.x;

  // power accessories placed from the board geometry
  const usb = buildUsbCable();
  const pu = new THREE.Vector3();
  state.parts.usb?.getWorldPosition(pu);
  const bb = new THREE.Box3().setFromObject(state.parts.usb);
  usb.position.set(pu.x, (bb.min.y + bb.max.y) / 2, bb.max.z + 0.003);
  stage.scene.add(usb);
  state.usbCable = usb;
  const bat = buildBattery();
  const pt = new THREE.Box3().setFromObject(state.parts.tplug);
  bat.position.set(pt.max.x + 0.075, 0, pt.max.z + 0.032);
  stage.scene.add(bat);
  state.batteryPack = bat;
  oled.reset();
  applyPower(true);
}

// ------------------------------------------------------------------ power system
function setPower(patch) {
  const wasOn = boardOn();
  Object.assign(state.power, patch);
  state.rail.resets = 0;
  applyPower();
  const nowOn = boardOn();
  if (wasOn && !nowOn) {
    haltSketch();
    toast('บอร์ดไม่มีไฟเลี้ยง: ทุกอย่างหยุดทำงาน', 'warning');
  } else if (!wasOn && nowOn && state.uploaded) {
    toast('จ่ายไฟแล้ว: บอร์ดรีเซ็ตและเริ่มรันโปรแกรมที่อัปโหลดไว้', 'success');
    startSketch(state.uploaded);
  }
  checkWiring();
  save();
}

function applyPower(silent) {
  const p = state.power;
  const on = boardOn();
  if (state.usbCable) state.usbCable.visible = p.usb;
  if (state.batteryPack) state.batteryPack.visible = p.battery;
  const lever = state.parts?.lever;
  if (lever) lever.position.x = lever.userData.x0 - (p.sw ? 0 : 3.8);
  const glow = (mesh, color, k) => { if (!mesh) return; mesh.material.emissive = new THREE.Color(color); mesh.material.emissiveIntensity = k; };
  glow(state.parts?.pwrLed, 0x22ff44, on ? 2.4 : 0);
  glow(state.parts?.nanoPwr, 0xff2a2a, on ? 3 : 0);
  for (const [id, el] of [['usb', '#pwUsb'], ['battery', '#pwBat'], ['sw', '#pwSw']]) { const e = $(el); if (e && e.checked !== p[id]) e.checked = p[id]; }
  const badge = $('#pwBadge');
  if (badge) {
    badge.variant = on ? 'success' : 'neutral';
    badge.textContent = on ? (motorsOn() ? 'ไฟเข้า + มอเตอร์พร้อม' : p.usb ? 'ไฟจาก USB' : 'ไฟเข้า') : 'ไม่มีไฟ';
  }
  if (!silent) click(260);
}

// ------------------------------------------------------------------ modules
async function addModule(key, pos, { auto = true } = {}) {
  const info = CATALOG.find((c) => c.key === key);
  const behavior = BEHAVIORS[key] || { env: [] };
  let root;
  if (EXTRA_BUILDERS[key]) { root = new THREE.Group(); root.add(EXTRA_BUILDERS[key]()); }
  else root = await stage.load(MODELS + key + '.glb');
  const id = nextId++;
  root.userData.moduleId = id;
  const pins = {};
  const leds = [], dLeds = [], pwrLeds = [];
  let horn = null, wheel = null;
  root.updateMatrixWorld(true);
  const pinNodes = [];
  root.traverse((o) => { if (o.userData?.pin) pinNodes.push(o); });
  for (const o of pinNodes) {
    pins[o.userData.pin] = o;
    makeHit(o, { kind: 'pin', obj: o, pin: o.userData.pin, moduleId: id }, o.userData.pin === 'M' ? 0.003 : HIT_R);
  }
  root.traverse((o) => {
    if (o.name === 'servo_horn') horn = o;
    if (o.name === 'motor_wheel') wheel = o;
    if (o.isMesh) {
      o.userData.moduleId = id;
      const n = o.name || '';
      if (/^led_(body|dome|rim)/.test(n) || /^relay_led/.test(n)) { o.material = o.material.clone(); leds.push(o); }
      if (/^d_led/.test(n)) { o.material = o.material.clone(); dLeds.push(o); }
      if (/^pwr_led/.test(n)) { o.material = o.material.clone(); pwrLeds.push(o); }
    }
  });
  const env = {};
  for (const c of behavior.env || []) env[c.id] = c.value ?? (c.type === 'hold' || c.type === 'toggle' ? false : c.type === 'encoder' ? 0 : c.min ?? 0);
  const light = new THREE.PointLight(0xffffff, 0, 0.06, 2);
  light.position.set(0.004, 0.012, 0);
  root.add(light);
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.00035, 0.00035, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.85, toneMapped: false }));
  laser.rotation.z = Math.PI / 2;
  laser.position.set(0.0101 + 0.125, 0.0048, 0);
  laser.visible = false;
  root.add(laser);
  const spot = pos || freeSpot(key);
  root.position.set(spot.x, 0, spot.z);
  if (spot.ry != null) root.rotation.y = spot.ry;
  stage.scene.add(root);
  const m = { id, key, info, behavior, root, pins, env, leds, dLeds, pwrLeds, light, laser, horn, wheel, wheelAngle: 0, portMap: {} };
  if (key === 'relay-module') {
    // screw terminals NC / COM / NO become sockets the load can be wired to
    m.terms = {};
    for (const [name, z] of Object.entries(RELAY_TERMS)) {
      const o = new THREE.Object3D();
      o.position.set(0.013, 0.0123, z);
      root.add(o);
      makeHit(o, { kind: 'port', obj: o, port: `${name}`, row: 'T', ownerId: id, term: name }, HIT_R * 1.3);
      const label = textSprite(name, name === 'COM' ? '#fbbf24' : name === 'NO' ? '#4ade80' : '#f87171');
      label.position.set(0.0215, 0.0135, z);
      root.add(label);
      m.terms[name] = o;
    }
  }
  m.props = buildProps(m);
  if (behavior.lamp) {
    root.traverse((o) => {
      if (o.name === 'lamp_bulb') m.bulb = o;
      if (o.name === 'lamp_filament') m.filament = o;
      if (o.name === 'lamp_light') m.lampLight = o;
    });
  }
  state.modules.push(m);
  if (auto) {
    autoWire(m, { quiet: true });
    if (loadExample(m)) {
      const moved = Object.entries(m.portMap).filter(([a, b]) => a !== b);
      toast(`วาง ${info.code} แล้ว: ต่อสายและโหลดโค้ดตัวอย่างให้อัตโนมัติ` + (moved.length ? ` (ใช้ ${moved.map(([, b]) => b).join(', ')} แทน ${moved.map(([a]) => a).join(', ')} เพราะพอร์ตเดิมไม่ว่าง)` : '') + ' → กด รัน', 'primary');
    }
  }
  if (auto && key === 'relay-module') {
    const lamp = await addModule('lamp-load', { x: root.position.x + 0.085, z: root.position.z + 0.012 }, { auto: false });
    wireLampToRelay(lamp, m, 'NO');
    toast('วาง Relay พร้อมหลอดไฟ: ต่อ L1 → COM, L2 → NO แล้ว (หลอดติดเมื่อรีเลย์ทำงาน) → กด รัน', 'primary');
  }
  select(m);
  renderModuleList();
  save();
  return m;
}

function wireLampToRelay(lamp, relay, contact = 'NO') {
  const term = (name) => ({ kind: 'port', obj: relay.terms[name], port: name, row: 'T', ownerId: relay.id, term: name });
  addWire({ kind: 'pin', obj: lamp.pins.L1, pin: 'L1', moduleId: lamp.id }, term('COM'), '#c81e1e', { quiet: true });
  addWire({ kind: 'pin', obj: lamp.pins.L2, pin: 'L2', moduleId: lamp.id }, term(contact), '#151515', { quiet: true });
}

function freeSpot(key) {
  if (key === 'tt-motor') {
    const n = state.modules.filter((m) => m.key === 'tt-motor').length;
    // left motor on the left side, right motor on the right side, wheels facing outwards
    return n % 2 === 0 ? { x: -0.058, z: 0.004, ry: -Math.PI / 2 } : { x: 0.058, z: 0.004, ry: Math.PI / 2 };
  }
  if (key === 'servo-sg90') {
    const n = state.modules.filter((m) => m.key === 'servo-sg90').length;
    return { x: 0.055 + n * 0.04, z: -0.075 };
  }
  const n = state.modules.filter((m) => !EXTRA_BUILDERS[m.key]).length;
  const col = n % 3, row = Math.floor(n / 3);
  return { x: 0.085 + col * 0.05, z: -0.045 + row * 0.045 };
}

function removeModule(m) {
  for (const w of [...state.wires]) if (w.a.moduleId === m.id || w.b.ownerId === m.id) removeWire(w);
  stage.scene.remove(m.root);
  sound('mod' + m.id, 0);
  sound('motor' + m.id, 0);
  state.modules = state.modules.filter((x) => x !== m);
  if (state.selected === m) select(null);
  renderModuleList();
  save();
}

// ------------------------------------------------------------------ wiring
function wireColor(pin, port) {
  if (port.row === 'GND') return '#1c1c1c';
  if (port.row === '5V') return '#d62020';
  if (port.row === 'JST') return '#c81e1e';
  if (port.row === 'T') return pin.pin === 'L2' ? '#151515' : '#c81e1e';
  const used = state.wires.filter((w) => w.b.row === 'S').length;
  return SIGNAL_COLORS[used % SIGNAL_COLORS.length];
}

/** The wire (and which end) already plugged into a pin or slot, if any. */
function wireOn(an) {
  for (const w of state.wires) {
    if (an.kind === 'port' && w.b.port === an.port && w.b.row === an.row && w.b.ownerId === an.ownerId) return { wire: w, end: 'b' };
    if (an.kind === 'pin' && w.a.moduleId === an.moduleId && w.a.pin === an.pin) return { wire: w, end: 'a' };
  }
  return null;
}

function addWire(a, b, color, { quiet = false } = {}) {
  if (a.kind === b.kind) { toast('สายต้องต่อจาก "ขาโมดูล" ไป "หัวต่อบนบอร์ด" (ปลายหนึ่งที่โมดูล อีกปลายที่บอร์ด)', 'warning'); return null; }
  const pin = a.kind === 'pin' ? a : b, port = a.kind === 'port' ? a : b;
  // one Dupont per pin and per header slot, like the real hardware
  if (wireOn(port)) { if (!quiet) toast(`${port.port} ${ROW_TH[port.row]} มีสายเสียบอยู่แล้ว: ถอดสายเดิมออกก่อน (ลากหรือแตะหัวสายดำ)`, 'warning'); return null; }
  if (wireOn(pin)) { if (!quiet) toast(`ขา ${pin.pin} มีสายเสียบอยู่แล้ว: ถอดสายเดิมออกก่อน`, 'warning'); return null; }
  const w = new Wire(stage, pin, port, color || wireColor(pin, port));
  state.wires.push(w);
  restack();
  checkWiring();
  save();
  return w;
}

function removeWire(w) {
  w.dispose();
  state.wires = state.wires.filter((x) => x !== w);
  restack();
  checkWiring();
  save();
}

function restack() {
  const pinCount = {}, slotCount = {};
  for (const w of state.wires) {
    const pk = w.a.moduleId + ':' + w.a.pin, sk = w.b.port + ':' + w.b.row;
    const sa = (pinCount[pk] = (pinCount[pk] ?? -1) + 1);
    const sb = (slotCount[sk] = (slotCount[sk] ?? -1) + 1);
    if (w.stackA !== sa || w.stackB !== sb) { w.stackA = sa; w.stackB = sb; w.update(); }
  }
}

function moduleWires(m) {
  return state.wires.filter((w) => w.a.moduleId === m.id).map((w) => ({ pin: w.a.pin, port: w.b.port, row: w.b.row, wire: w }));
}

function pinRole(name, m) {
  if (name === 'M') return 'JST';
  if (name === 'L1' || name === 'L2') return 'T';
  if (POWER_PINS.includes(name)) return '5V';
  if (name === 'G' && m && m.pins.R) return 'S';
  if (GROUND_PINS.includes(name)) return 'GND';
  return 'S';
}

function powered(m) {
  if (!boardOn()) return false;
  const ws = moduleWires(m);
  if (m.behavior.motor) return ws.some((w) => w.row === 'JST');
  const hasV = ws.some((w) => pinRole(w.pin, m) === '5V' && w.row === '5V');
  const hasG = ws.some((w) => pinRole(w.pin, m) === 'GND' && w.row === 'GND');
  const needsV = !m.behavior.noVcc && Object.keys(m.pins).some((p) => pinRole(p, m) === '5V');
  return hasG && (hasV || !needsV);
}

function checkWiring() {
  const issues = [];
  if (!boardOn()) issues.push(['err', 'บอร์ดไม่มีไฟเลี้ยง: เสียบสาย USB หรือ ต่อแบตเตอรี่ + เปิดสวิตช์ ON']);
  for (const m of state.modules) {
    const label = `${m.info.code} ${m.info.name}`;
    const ws = moduleWires(m);
    let reverse = false;
    for (const w of ws) {
      const role = pinRole(w.pin, m);
      if (role === 'T' && w.row !== 'T') issues.push(['warn', `${label}: สายหลอดไฟต้องต่อกับขั้วสกรูรีเลย์ (COM / NO / NC) ไม่ใช่หัวต่อบนบอร์ด`]);
      if (role !== 'T' && w.row === 'T') issues.push(['err', `${label}: ขา ${w.pin} ต่อเข้าขั้วสกรูรีเลย์: ขั้วนี้ใช้กับวงจรโหลด (เช่น หลอดไฟ) เท่านั้น`]);
      if (role === 'JST' && w.row !== 'JST') issues.push(['warn', `${label}: สายมอเตอร์ต้องเสียบที่ขั้ว ML หรือ MR`]);
      if (role !== 'JST' && w.row === 'JST') issues.push(['err', `${label}: ขา ${w.pin} เสียบเข้าขั้วมอเตอร์ ${w.port}: ผิดช่อง!`]);
      if (role === '5V' && w.row === 'GND') { issues.push(['err', `${label}: ขา ${w.pin} (ไฟ) เสียบช่องดำ GND: ต่อกลับขั้ว!`]); reverse = true; }
      if (role === 'GND' && w.row === '5V') { issues.push(['err', `${label}: ขา ${w.pin} (กราวด์) เสียบช่องแดง 5V: ต่อกลับขั้ว!`]); reverse = true; }
      if (role === 'S' && (w.row === '5V' || w.row === 'GND')) issues.push(['warn', `${label}: ขาสัญญาณ ${w.pin} เสียบ${ROW_TH[w.row]}: ควรเสียบช่องขาว (S)`]);
      if ((role === '5V' || role === 'GND') && w.row === 'S') issues.push(['warn', `${label}: ขา ${w.pin} เป็นขาไฟเลี้ยง แต่เสียบช่องขาว (S)`]);
      if (w.row === 'NC') issues.push(['info', `${label}: ขา ${w.pin} เสียบที่ ${w.port} ซึ่งไม่ได้ต่อกับ Arduino (ไม่มีผล)`]);
      if (w.row === 'S' && w.port.startsWith('ADS.') && /A[0-3]$/.test(w.port)) issues.push(['info', `${label}: ${w.port} อ่านผ่าน ADS1115 (I2C) ใช้ไลบรารี Adafruit_ADS1X15: ads.readADC_SingleEnded(${w.port.slice(-1)})`]);
      if (w.row === 'S') {
        const cp = canon(w.port);
        if (cp === 'A4' || cp === 'A5') { if (w.port.includes('.')) issues.push(['info', `${label}: ${w.port} คือสาย I2C (${cp}) ใช้ร่วมกับจอ OLED`]); }
        if (w.port === 'D3') issues.push(['info', `${label}: D3 ใช้ร่วมกับบัซเซอร์บนบอร์ด อาจมีเสียงรบกวน`]);
        if (w.port === 'A4' || w.port === 'A5') issues.push(['info', `${label}: ${w.port} ใช้ร่วมกับ I2C (จอ OLED) ถ้าใช้จอพร้อมกันจะทำงานผิดพลาด`]);
        if (w.port === 'D0' || w.port === 'D1') issues.push(['info', `${label}: ${w.port} ใช้ร่วมกับ Serial: Serial Monitor อาจรวน`]);
        if (w.port.startsWith('AA') && !m.behavior.out) issues.push(['info', `${label}: ช่อง ${w.port} เป็นอินพุต Analog ของ ADS1115 อย่างเดียว`]);
      }
    }
    m.reverse = reverse;
    if (m.behavior.motor) {
      if (ws.length && !motorsOn()) issues.push(['warn', `${label}: มอเตอร์ต้องใช้ไฟจากแบตเตอรี่: ต่อแบต + เปิดสวิตช์ ON`]);
      continue;
    }
    if (m.behavior.lamp) {
      const t = ws.filter((w) => w.row === 'T').map((w) => w.wire.b.term);
      if (ws.length < 2) issues.push(['info', `${label}: ต่อสาย L1, L2 เข้าขั้วรีเลย์ COM กับ NO (หรือ NC)`]);
      else if (!t.includes('COM')) issues.push(['warn', `${label}: ต้องมีสายหนึ่งเส้นต่อที่ COM ของรีเลย์ ไม่งั้นวงจรไม่ครบ`]);
      else if (t[0] === t[1]) issues.push(['warn', `${label}: สายทั้งสองเส้นต่อขั้วเดียวกัน`]);
      continue;
    }
    const sigPins = Object.keys(m.pins).filter((p) => pinRole(p, m) === 'S');
    if (ws.length && boardOn() && !powered(m) && !reverse) issues.push(['warn', `${label}: ยังไม่ได้ต่อไฟเลี้ยงครบ (5V + GND)`]);
    if (ws.length && sigPins.length && !ws.some((w) => pinRole(w.pin, m) === 'S')) issues.push(['warn', `${label}: ยังไม่ได้ต่อขาสัญญาณ`]);
    if (!ws.length) issues.push(['info', `${label}: ยังไม่ได้ต่อสาย`]);
  }
  const nServo = state.modules.filter((m) => m.behavior.servo && moduleWires(m).length).length;
  if (nServo >= 2 && !(state.power.battery && state.power.sw)) issues.push(['warn', `ต่อเซอร์โว ${nServo} ตัว: ตอนหมุนพร้อมกันดึงกระแสรวมเกิน USB (~500mA) บอร์ดจะรีเซ็ต → ต่อแบตเตอรี่ + เปิดสวิตช์ ON (ไฟจากภายนอก)`]);
  else if (nServo >= 1 && !(state.power.battery && state.power.sw)) issues.push(['info', 'เซอร์โว 1 ตัวใช้ไฟ USB ได้ถ้าไม่มีภาระหนัก ถ้ามีแขนกล/หลายตัว ควรใช้แบตเตอรี่']);
  const byPort = {};
  for (const w of state.wires) { if (w.b.row === 'S' || w.b.row === 'JST') (byPort[w.b.port] ||= []).push(w); }
  for (const m of state.modules) if (m.key === 'relay-module' && powered(m) && !moduleWires(m).length) issues.push(['info', `${m.info.code}: ยังไม่ได้ต่อสาย`]);
  for (const [port, ws] of Object.entries(byPort)) {
    const mods = new Set(ws.map((w) => w.a.moduleId));
    if (ws.length > 1) issues.push([mods.size > 1 ? 'warn' : 'info', `พอร์ต ${port} มีสาย ${ws.length} เส้น: ${[...mods].map((id) => state.modules.find((m) => m.id === id)?.info.code).join(', ')} ต่อถึงกัน`]);
  }
  renderIssues(issues);
}

const SIGNAL_PORT_ORDER = ['A0', 'A1', 'A2', 'A3', 'A6', 'SV1', 'SV2', 'SV3', 'A4', 'A5', 'D3', 'D1', 'D0'];
const ANALOG_PINS = ['AO', 'A0', 'VRX', 'VRY'];
const ANALOG_ONLY_MODULES = ['photoresistor', 'analog-temperature-sensor', 'analog-hall-sensor', 'heartbeat-sensor'];

function planPorts(m) {
  const busy = new Set(state.wires.filter((w) => w.a.moduleId !== m.id && (w.b.row === 'S' || w.b.row === 'JST')).map((w) => w.b.port));
  const map = {};
  for (const w of (m.info.wires || []).filter((w) => (w.role === 'S' || w.role === 'M') && (!w.optional || m.pins[w.pin]))) {
    if (map[w.port]) continue;
    let port;
    if (w.role === 'M') port = ['ML', 'MR'].find((p) => !busy.has(p)) || 'ML';
    else if (m.behavior.servo) port = ['SV1', 'SV2', 'SV3'].find((p) => !busy.has(p)) || SIGNAL_PORT_ORDER.find((p) => !busy.has(p) && p !== 'A6');
    else {
      const analog = ANALOG_PINS.includes(w.pin.toUpperCase()) || ANALOG_ONLY_MODULES.includes(m.key);
      const ok = (p) => !busy.has(p) && (p !== 'A6' || analog) && !(p.startsWith('SV') && analog);
      port = ok(w.port) ? w.port : SIGNAL_PORT_ORDER.find(ok);
    }
    if (!port) continue;
    map[w.port] = port;
    busy.add(port);
  }
  return map;
}

function autoWire(m, { quiet = false } = {}) {
  for (const w of [...state.wires]) if (w.a.moduleId === m.id) removeWire(w);
  const portMap = planPorts(m);
  const firstSig = (m.info.wires || []).filter((w) => w.role === 'S' && !w.optional)[0];
  const powerCol = firstSig ? portMap[firstSig.port] || firstSig.port : 'A0';
  const wanted = (m.info.wires || []).filter((w) => !w.optional || m.pins[w.pin]).map((w) => ({ ...w, port: w.role === 'S' || w.role === 'M' ? portMap[w.port] || w.port : powerCol }));
  const used = new Set();
  const signalPool = Object.keys(m.pins).filter((p) => pinRole(p, m) === 'S');
  const sorted = [...wanted].sort((a, b) => (a.role !== 'S') - (b.role !== 'S'));
  let n = 0;
  for (const w of sorted) {
    let pin = m.pins[w.pin] && !used.has(w.pin) ? w.pin : null;
    if (!pin && w.role === '5V') pin = POWER_PINS.find((p) => m.pins[p] && !used.has(p));
    if (!pin && w.role === 'GND') pin = GROUND_PINS.find((p) => m.pins[p] && !used.has(p) && pinRole(p, m) === 'GND');
    if (!pin && w.role === 'S') {
      const analog = ANALOG_PINS.includes(w.pin.toUpperCase());
      pin = [...signalPool].sort((a, b) => ((a === 'AO') === analog ? 0 : 1) - ((b === 'AO') === analog ? 0 : 1)).find((p) => !used.has(p));
    }
    if (!pin) continue;
    const row = w.role === 'M' ? 'JST' : w.role;
    let port = state.ports.find((p) => p.port === w.port && p.row === row);
    if (port && wireOn({ kind: 'port', port: port.port, row }) && (row === '5V' || row === 'GND')) {
      // planned power slot already used: take 5V/GND from the nearest free header column
      port = SIGNAL_PORT_ORDER.map((c) => state.ports.find((p) => p.port === c && p.row === row)).find((p) => p && !wireOn({ kind: 'port', port: p.port, row }));
    }
    if (!port) continue;
    used.add(pin);
    if (addWire({ kind: 'pin', obj: m.pins[pin], pin, moduleId: m.id }, { kind: 'port', obj: port.obj, port: port.port, row: port.row }, null, { quiet: true })) n++;
  }
  m.portMap = portMap;
  const moved = Object.entries(portMap).filter(([a, b]) => a !== b);
  if (!quiet) toast(`ต่อสายอัตโนมัติ ${n} เส้น` + (moved.length ? ` (ย้าย ${moved.map(([a, b]) => a + '→' + b).join(', ')} เพราะพอร์ตเดิมมีโมดูลอื่นใช้อยู่)` : ' ตามตารางในเอกสาร'), 'success');
  return portMap;
}

// ---- example code with pins remapped to the ports actually used
const PORT_NUM = { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, SV1: 10, SV2: 11, SV3: 12, D3: 3, D1: 1, D0: 0 };
function remapCode(code, portMap = {}) {
  const pairs = Object.entries(portMap).filter(([a, b]) => a !== b && PORT_NUM[a] != null && PORT_NUM[b] != null);
  if (!pairs.length) return code;
  const codeTokens = [], noteTokens = [];
  for (const [from, to] of pairs) {
    if (from.startsWith('A')) codeTokens.push([new RegExp(`\\b${from}\\b`, 'g'), to.startsWith('A') ? to : String(PORT_NUM[to])]);
    codeTokens.push([new RegExp(`\\b${PORT_NUM[from]}\\b`, 'g'), String(PORT_NUM[to])]);
    noteTokens.push([new RegExp(`\\b${from}\\b`, 'g'), to]);
    noteTokens.push([new RegExp(`\\bD${PORT_NUM[from]}\\b`, 'g'), 'D' + PORT_NUM[to]]);
    noteTokens.push([new RegExp(`\\b${PORT_NUM[from]}\\b`, 'g'), String(PORT_NUM[to])]);
  }
  const swap = (text, tokens) => {
    const marks = [];
    for (const [re, to] of tokens) text = text.replace(re, () => { marks.push(to); return `\u0001${marks.length - 1}\u0001`; });
    return text.replace(/\u0001(\d+)\u0001/g, (_, i) => marks[+i]);
  };
  const isPinLine = (l) => /^\s*#\s*define\s+\w+\s/.test(l) || /\b(?:const\s+)?(?:int|byte|uint8_t)\s+\w*(?:pin|PIN|Pin)\w*\s*=/.test(l) || /\.attach\s*\(/.test(l);
  return code.split('\n').map((line) => {
    const i = line.indexOf('//');
    const codePart = i < 0 ? line : line.slice(0, i);
    const note = i < 0 ? '' : line.slice(i);
    const isComment = /^\s*$/.test(codePart) && note;
    if (!isPinLine(codePart) && !isComment) return line;
    return (isPinLine(codePart) ? swap(codePart, codeTokens) : codePart) + (note ? swap(note, noteTokens) : '');
  }).join('\n');
}

function loadExample(m, idx = 0) {
  const ex = m.info.examples[idx];
  if (!ex) return false;
  setCode(remapCode(ex.code, m.portMap));
  return true;
}

// ------------------------------------------------------------------ electrical model shared with the MCU
function moduleOutputs(m, t) {
  if (!powered(m) || m.reverse || !m.behavior.out) return {};
  return m.behavior.out(m.env, t, null) || {};
}

function signalAt(port, t) {
  for (const w of state.wires) {
    if (canon(w.b.port) !== port || w.b.row !== 'S') continue;
    const m = state.modules.find((x) => x.id === w.a.moduleId);
    if (!m) continue;
    const v = moduleOutputs(m, t)[w.a.pin];
    if (v === undefined) continue;
    return { v, m };
  }
  return null;
}

const hw = {
  readPin(pin) {
    if (pin === 2) return state.d2Pressed ? 0 : 5;
    if (pin === 21) return state.knob * 5;
    const port = PIN_TO_PORT[pin];
    if (!port) return null;
    const s = signalAt(port, performance.now());
    if (!s) return null;
    if (s.v === 'float') return mcu.mode[pin] === 'INPUT_PULLUP' ? 5 : (s.m.behavior.lib ? 5 : null);
    return s.v;
  },
  onOutput(pin) {
    if (pin === 13 && state.parts?.nanoL) {
      const on = mcu.mode[13] === 'OUTPUT' && mcu.out[13];
      state.parts.nanoL.material.emissive = new THREE.Color(0xff8a1c);
      state.parts.nanoL.material.emissiveIntensity = on ? 4 : 0;
    }
    if (pin === 3 && !mcu.tones[3]) {
      if (mcu.mode[3] === 'OUTPUT' && (mcu.pwm[3] ?? (mcu.out[3] ? 255 : 0)) > 0) { click(); sound('d3', mcu.pwm[3] != null ? 490 : 0); }
      else sound('d3', 0);
    }
  },
  tone(pin, f) { if (pin === 3) sound('d3', f); },
  noTone(pin) { if (pin === 3) sound('d3', 0); },
  serialBegin() {},
  serialOut(s) { serialWrite(s); },
  warn(msg) { if (!state.warned.has(msg)) { state.warned.add(msg); serialWrite(`\n⚠ ${msg}\n`); } },
  error(e) { showError(e); stopSketch(); },
  oled,
  onServo(pin, a) { state.servo[pin] = a; },
  sensorAt(pin, lib) {
    const port = PIN_TO_PORT[pin];
    for (const w of state.wires) {
      if (canon(w.b.port) !== port || w.b.row !== 'S') continue;
      const m = state.modules.find((x) => x.id === w.a.moduleId);
      if (m && m.behavior.lib === lib && powered(m)) return { temperature: m.env.temp, humidity: m.env.hum };
    }
    return null;
  },
  irReceive(pin) {
    const port = PIN_TO_PORT[pin];
    const ok = state.wires.some((w) => canon(w.b.port) === port && w.b.row === 'S' && state.modules.find((x) => x.id === w.a.moduleId && x.behavior.lib === 'ir' && powered(x)));
    if (!ok || !state.irQueue.length) return null;
    return state.irQueue.shift();
  },
  irSend(pin, cmd) { for (const m of state.modules) if (m.behavior.lib === 'ir' && powered(m)) state.irQueue.push({ command: cmd, raw: cmd }); },
  adsRead(ch) {
    // onboard ADS1115 (GAIN_TWOTHIRDS, +-6.144 V) on header AA0-AA3
    const s = signalAt('AA' + ch, performance.now());
    const v = !s || s.v === 'float' ? 0.02 * Math.random() : s.v;
    return Math.max(0, Math.min(32767, Math.round((v / 6.144) * 32768)));
  },
  async pollInterrupts() {
    for (const it of mcu.interrupts) {
      const v = mcu.voltage(it.pin) >= 2.5 ? 1 : 0;
      if (v !== it.last) {
        const fire = it.mode === 'CHANGE' || (it.mode === 'RISING' && v) || (it.mode === 'FALLING' && !v);
        it.last = v;
        if (fire) await it.fn();
      }
    }
  },
  onReset() { oled.reset(); state.warned.clear(); state.servo = {}; for (const m of state.modules) if (m.behavior.servo && m.horn) m.horn.rotation.y = m.horn.rotation.y; },
};
mcu.hw = hw;

function moduleIO(m) {
  const portOf = (pin) => moduleWires(m).find((w) => w.pin === pin && w.row === 'S');
  return {
    v(pin) { const w = portOf(pin); if (!w) return 0; const p = PORT_TO_PIN[canon(w.port)]; if (p == null) return 0; return mcu.running && mcu.mode[p] === 'OUTPUT' && mcu.out[p] ? 5 : 0; },
    pwm(pin) {
      const w = portOf(pin); if (!w) return 0; const p = PORT_TO_PIN[canon(w.port)]; if (p == null || !mcu.running || mcu.mode[p] !== 'OUTPUT') return 0;
      if (mcu.softPwm && mcu.softPwm[p] != null) return mcu.softPwm[p];
      return mcu.pwm[p] != null ? mcu.pwm[p] / 255 : mcu.out[p] ? 1 : 0;
    },
    freq(pin) { const w = portOf(pin); if (!w) return 0; const p = PORT_TO_PIN[canon(w.port)]; return mcu.running ? mcu.tones[p] || 0 : 0; },
    servo(pin) { const w = portOf(pin); if (!w) return null; return state.servo[PORT_TO_PIN[canon(w.port)]]; },
  };
}

// ------------------------------------------------------------------ 5 V rail current budget
// Typical currents (mA). USB through the Nano's polyfuse/diode ~500 mA; the shield's 5 V
// regulator from the 7.4 V LiPo ~1.5 A. Motors run from the battery (TB6612 VM), not the 5 V rail.
const LIMIT = { usb: 500, battery: 1500 };
function moduleCurrent(m, t) {
  if (!powered(m) || m.reverse) return 0;
  if (m.behavior.servo) return m.servoMoving ? (t - (m.surgeT || 0) < 120 ? 360 : 220) : 8; // SG90: idle / running / start surge
  if (m.behavior.motor || m.behavior.lamp) return 0;
  let mA = m.dLeds.length || m.pwrLeds.length ? 8 : 3;          // module + its indicator LEDs
  mA += m.ledLoad || 0;
  if (m.relayOn) mA += 75;                                       // relay coil
  if (m.laser.visible) mA += 30;
  if (m.buzzOn) mA += 30;
  if (m.key === 'joystick-module' || m.key === 'rotary-encoder') mA += 1;
  return mA;
}
state.rail = { mA: 0, V: 5, limit: 500, over: 0, resets: 0 };
function powerBudget(t) {
  const r = state.rail;
  if (!boardOn()) { Object.assign(r, { mA: 0, V: 0, limit: 0, over: 0 }); return; }
  let mA = 22 + 5 + (oled.on ? 18 : 4) + (state.parts?.nanoL?.material.emissiveIntensity ? 3 : 0) + (mcu.tones[3] ? 25 : 0);
  for (const m of state.modules) mA += moduleCurrent(m, t);
  const limit = Math.max(state.power.usb ? LIMIT.usb : 0, state.power.battery && state.power.sw ? LIMIT.battery : 0);
  r.mA = Math.round(mA);
  r.limit = limit;
  // the rail sags as the load approaches the source limit, collapses past it
  const k = mA / limit;
  r.V = +(k < 0.7 ? 5 - k * 0.15 : k < 1 ? 4.9 - (k - 0.7) * 1.5 : 4.45 - (k - 1) * 3).toFixed(2);
  if (k > 1 && mcu.running) {
    r.over += 1;
    if (r.over > 3) brownout(mA, limit);   // sustained for a few frames -> brown-out reset
  } else r.over = 0;
}
let lastBrownToast = 0;
function brownout(mA, limit) {
  const r = state.rail;
  r.over = 0;
  r.resets++;
  const src = state.power.battery && state.power.sw ? 'แบตเตอรี่ (~1.5A)' : 'USB (~500mA)';
  const servos = state.modules.filter((m) => m.behavior.servo && m.servoMoving).length;
  serialWrite(`\n⚡ ไฟตก! ใช้กระแส ${Math.round(mA)} mA เกินที่ ${src} จ่ายได้ (${limit} mA) แรงดัน 5V ตก → Nano รีเซ็ต\n`);
  if (performance.now() - lastBrownToast > 4000) {
    lastBrownToast = performance.now();
    toast(`ไฟไม่พอ! บอร์ดรีเซ็ต (${Math.round(mA)} mA > ${limit} mA)` + (servos ? ` · เซอร์โว ${servos} ตัวหมุนพร้อมกันดึงกระแสสูง` : '') + (state.power.battery && state.power.sw ? '' : ' → ต่อแบตเตอรี่ + เปิดสวิตช์ ON'), 'danger');
  }
  // the real board resets: the program starts again from setup()
  for (const m of state.modules) if (m.behavior.servo) m.servoMoving = false;
  if (state.uploaded) startSketch(state.uploaded);
}

function motorSpeed(port) {
  if (!mcu.running || !motorsOn()) return 0;
  const [i1, i2, pw] = MOTOR_PINS[port];
  const sp = mcu.pwm[pw] != null ? mcu.pwm[pw] : mcu.out[pw] ? 255 : 0;
  if (!sp || mcu.out[i1] === mcu.out[i2]) return 0;
  return (mcu.out[i2] ? 1 : -1) * (sp / 255);
}

setInterval(() => {
  mcu.softPwm = {};
  for (const [p, c] of Object.entries(mcu.wcount || {})) { if (c.n > 40 && c.h > 0 && c.h < c.n) mcu.softPwm[p] = c.h / c.n; c.h = c.n = 0; }
}, 60);

let lastT = 0;
stage.onFrame.push((t) => {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  for (const m of state.modules) {
    const on = powered(m) && !m.reverse;
    for (const p of m.pwrLeds) { p.material.emissive = new THREE.Color(0xff2020); p.material.emissiveIntensity = on ? 3 : 0; }
    const dl = on && m.behavior.dLed ? m.behavior.dLed(m.env, t) : false;
    for (const p of m.dLeds) { p.material.emissive = new THREE.Color(0xff2020); p.material.emissiveIntensity = dl ? 3 : 0; }
    const io = moduleIO(m);
    m.ledLoad = 0; m.buzzOn = false;
    if (m.behavior.servo && m.horn) {
      const a = on ? io.servo('S') : null;
      const wasMoving = m.servoMoving;
      m.servoMoving = false;
      if (a != null) {
        const target = THREE.MathUtils.degToRad(a - 90);
        const cur = m.horn.rotation.y;
        const step = Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 10.5); // ~0.1 s / 60 deg
        if (Math.abs(step) > 1e-4) { m.horn.rotation.y = cur + step; m.servoMoving = true; sound('servo' + m.id, 1800 + Math.random() * 200, 'sawtooth'); }
        else sound('servo' + m.id, 0);
      } else sound('servo' + m.id, 0);
      if (m.servoMoving && !wasMoving) m.surgeT = t; // inrush current when the motor starts
      continue;
    }
    if (m.behavior.motor && m.wheel) {
      const w = moduleWires(m).find((x) => x.row === 'JST');
      const sp = w && on ? motorSpeed(w.port) : 0;
      m.wheelAngle += sp * dt * 2 * Math.PI * 3.3; // ~200 rpm at full speed
      m.wheel.rotation.z = -m.wheelAngle;
      sound('motor' + m.id, Math.abs(sp) > 0.05 ? 90 + Math.abs(sp) * 160 : 0, 'sawtooth');
      continue;
    }
    const v = m.behavior.view ? m.behavior.view(io, t) : {};
    if (v.led) {
      const [r, g, b] = v.led;
      const k = Math.max(r, g, b);
      const col = new THREE.Color(r, g, b);
      for (const p of m.leds) { p.material.emissive = col; p.material.emissiveIntensity = on ? k * 4 : 0; }
      m.ledLoad = on ? (r + g + b) * 15 : 0; // ~15 mA per lit LED channel
      m.light.color = col; m.light.intensity = on ? k * 0.02 : 0;
    } else if (v.relay !== undefined) {
      const r = v.relay && on;
      m.relayOn = r;
      for (const p of m.leds) { p.material.emissive = new THREE.Color(0xff2020); p.material.emissiveIntensity = r ? 3 : 0; }
      if (r !== m.lastRelay) { if (m.lastRelay !== undefined) click(); m.lastRelay = r; }
    }
    m.laser.visible = !!v.laser && on;
    if (v.ir !== undefined) for (const p of m.leds) { p.material.emissive = new THREE.Color(0x7a3cff); p.material.emissiveIntensity = v.ir && on && $('#irCam')?.checked ? 2.5 : 0; }
    const f = on ? v.buzzer : 0;
    m.buzzOn = !!f && f !== -1;
    sound('mod' + m.id, f === -1 ? 0 : f || 0, 'square');
  }
  for (const m of state.modules) updateProps(m, t, dt, { powered: powered(m), wiresUpdate: () => { for (const w of state.wires) if (w.a.moduleId === m.id || w.b.ownerId === m.id) w.update(); } });
  powerBudget(t);
  // lamp loads: lit when their two leads are bridged by a closed relay contact
  for (const m of state.modules) {
    if (!m.behavior.lamp) continue;
    const ws = moduleWires(m).filter((w) => w.row === 'T').map((w) => w.wire.b);
    let lit = false;
    if (ws.length === 2 && ws[0].ownerId === ws[1].ownerId) {
      const relay = state.modules.find((x) => x.id === ws[0].ownerId);
      const terms = ws.map((b) => b.term);
      const closed = relay?.relayOn ? 'NO' : 'NC';
      lit = terms.includes('COM') && terms.includes(closed);
    }
    if (m.bulb) { m.bulb.material.emissiveIntensity = lit ? 6 : 0; m.bulb.material.opacity = lit ? 0.9 : 0.55; }
    if (m.filament) m.filament.material.emissiveIntensity = lit ? 8 : 0;
    if (m.lampLight) m.lampLight.intensity = lit ? 0.6 : 0;
    m.lit = lit;
  }
  // the knurled shaft and the slot mark on top are separate meshes: turn both (270 degree pot)
  const knobAngle = -(state.knob - 0.5) * Math.PI * 1.5;
  if (state.parts?.knob) state.parts.knob.rotation.y = knobAngle;
  if (state.parts?.knobSlot) state.parts.knobSlot.rotation.y = knobAngle;
  const btn = state.parts?.button;
  if (btn) { btn.userData.y0 ??= btn.position.y; btn.position.y = btn.userData.y0 - (state.d2Pressed ? 0.9 : 0); }
  updateStatus();
});

// ------------------------------------------------------------------ interaction (pick, drag, wire)
const canvas = stage.renderer.domElement;
let drag = null;
let hoverAnchor = null;
const ghost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x6ee7ff }));
stage.scene.add(ghost);
function clearGhost() { ghost.geometry.dispose(); ghost.geometry = new THREE.BufferGeometry(); }

function anchorsList() {
  const list = state.ports.map((p) => p.hit);
  for (const m of state.modules) m.root.traverse((o) => { if (o.userData.anchor) list.push(o); });
  return list;
}

function showTargets(on) {
  // while a wire is being placed, light up every place it can go
  const want = state.pending ? (state.pending.kind === 'pin' ? 'port' : 'pin') : null;
  for (const h of anchorsList()) {
    const an = h.userData.anchor;
    h.material.opacity = on && an.kind === want && !wireOn(an) ? 0.55 : 0; // occupied places stay dark
  }
}

function setPending(an, color = null, lifted = null) {
  state.pending = an;
  state.lifted = lifted; // the end that was unplugged (when moving an existing wire)
  state.pendingColor = color;
  showTargets(!!an);
  const bar = $('#wireHint');
  if (an && lifted) {
    bar.querySelector('.txt').textContent = `กำลังย้ายสาย: แตะรูใหม่ที่จะเสียบ (ช่องบนบอร์ด หรือขาโมดูล ที่ว่างอยู่)`;
    bar.hidden = false;
    for (const h of anchorsList()) { const a2 = h.userData.anchor; h.material.opacity = a2 !== an && !wireOn(a2) ? 0.55 : 0; }
  } else if (an) {
    bar.querySelector('.txt').textContent = an.kind === 'pin'
      ? `ถือสายจากขา ${an.pin} อยู่: แตะ/คลิกช่องบนหัวต่อที่จะเสียบ (ขาว = S, แดง = 5V, ดำ = GND)`
      : `ถือสายจาก ${an.port} ${ROW_TH[an.row]} อยู่: แตะ/คลิกขาของโมดูลที่จะเสียบ`;
    bar.hidden = false;
  } else {
    bar.hidden = true;
    clearGhost();
  }
}

/** Cancel the wire in hand; a lifted (moved) wire goes back where it was. */
function cancelPending() {
  if (state.pending && state.lifted) {
    addWire(state.lifted, state.pending, state.pendingColor, { quiet: true });
    toast('ยกเลิกแล้ว: สายกลับไปเสียบที่เดิม');
  }
  setPending(null);
}

function finishWire(an) {
  if (!state.pending) return;
  if (an && an !== state.pending) {
    if (an.kind === state.pending.kind) {
      // same kind: switch the start point instead of failing
      if (state.lifted && !wireOn(an)) {
        // moving an existing wire: the user tapped a new hole of the same kind as the end that stayed,
        // so move that end instead -> reconnect the lifted end to the new hole
        if (addWire(state.lifted, an, state.pendingColor)) toast(`ย้ายสายไป ${an.kind === 'port' ? an.port + ' ' + ROW_TH[an.row] : 'ขา ' + an.pin} แล้ว`, 'success');
        setPending(null);
        return;
      }
      if (!wireOn(an)) setPending(an, state.pendingColor);
      return;
    }
    if (wireOn(an)) {
      toast(an.kind === 'port' ? `${an.port} ${ROW_TH[an.row]} มีสายเสียบอยู่แล้ว: เลือกช่องที่ว่าง` : `ขา ${an.pin} มีสายอยู่แล้ว: เลือกขาที่ว่าง`, 'warning');
      return; // keep holding the wire
    }
    if (addWire(state.pending, an, state.pendingColor)) toast('ต่อสายแล้ว', 'success');
  }
  setPending(null);
}

// Header pins are only 2.54 mm apart, so neighbouring hit spheres overlap.
// Pick the anchor whose centre is closest to the pointer ray, not the first sphere hit.
function nearestHit(e) {
  // screen-space: the anchor whose projected centre is nearest the pointer (fingers are not precise)
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const maxD = e.pointerType === 'touch' || coarse ? 26 : 14;
  const v = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  stage.camera.getWorldDirection(camDir);
  let best = null, bd = maxD * maxD;
  for (const h of anchorsList()) {
    h.getWorldPosition(v);
    if (v.clone().sub(stage.camera.position).dot(camDir) <= 0) continue; // behind camera
    v.project(stage.camera);
    const sx = ((v.x + 1) / 2) * rect.width, sy = ((1 - v.y) / 2) * rect.height;
    const d = (sx - px) ** 2 + (sy - py) ** 2;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
function anchorAt(e) {
  const o = nearestHit(e);
  return o ? o.userData.anchor : null;
}

let press = null; // { x, y, kind, ... } for tap vs drag detection
const DRAG_PX = coarse ? 12 : 6;

canvas.addEventListener('pointermove', (e) => {
  if (press?.kind === 'module') {
    const m = press.m, dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (press.mode === 'stick') {
      m.env.x = Math.round(Math.max(-100, Math.min(100, dx / 0.9)));
      m.env.y = Math.round(Math.max(-100, Math.min(100, -dy / 0.9)));
      press.dragging = Math.hypot(dx, dy) > DRAG_PX;
      syncEnv(m);
      return;
    }
    if (press.mode === 'rotary') {
      m.env.enc = press.env0.enc + Math.round(dx / 6);
      press.dragging = Math.abs(dx) > DRAG_PX;
      syncEnv(m);
      return;
    }
    if (!press.dragging && Math.hypot(dx, dy) > DRAG_PX * 1.5) {
      // it is a move, not a press: release the hold and drag the module
      press.dragging = true;
      if (press.holding) { m.env[press.prof.hold] = false; press.holding = false; syncEnv(m); }
      if (press.ground) drag = { m, off: { x: press.ground.x - m.root.position.x, z: press.ground.z - m.root.position.z } };
    }
  }
  if (press && press.kind !== 'module' && !press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) {
    press.dragging = true;
    if (press.kind === 'housing') {
      // pulling a Dupont housing off its pin: unplug that end and carry it
      const { wire, end } = press.plug;
      const keep = end === 'a' ? wire.b : wire.a;
      const lifted = end === 'a' ? wire.a : wire.b;
      const color = wire.color;
      removeWire(wire);
      setPending(keep, color, lifted);
      stage.controls.enabled = false;
    }
  }
  if (drag) {
    const p = stage.groundPoint(e);
    if (p) { drag.m.root.position.x = p.x - drag.off.x; drag.m.root.position.z = p.z - drag.off.z; for (const w of state.wires) if (w.a.moduleId === drag.m.id) w.update(); }
    return;
  }
  const a = nearestHit(e);
  if (hoverAnchor && hoverAnchor !== a) { hoverAnchor.material.opacity = state.pending ? (hoverAnchor.userData.anchor.kind !== state.pending.kind ? 0.55 : 0) : 0; hoverAnchor.scale.multiplyScalar(1 / 1.35); }
  if (a && hoverAnchor !== a) { a.material.opacity = 0.95; a.scale.multiplyScalar(1.35); }
  hoverAnchor = a || null;
  const tip = $('#tip');
  let text = '';
  if (a) {
    const an = a.userData.anchor;
    text = an.label ? `หัวต่อ ${an.label}` : an.row === 'T' ? `ขั้วรีเลย์ ${TERM_TH[an.term]}` : an.kind === 'port' ? (an.row === 'JST' ? `ขั้วมอเตอร์ ${an.port} (${an.port === 'ML' ? 'ซ้าย D9/D4/D5' : 'ขวา D7/D8/D6'})` : `พอร์ต ${an.port} · ${ROW_TH[an.row]}`) : `ขา ${an.pin} ของ ${state.modules.find((m) => m.id === an.moduleId)?.info.code}`;
  } else if (!coarse) {
    const bh = state.board ? stage.pick(e, [state.board, state.usbCable, state.batteryPack].filter(Boolean))[0]?.object : null;
    const n = bh?.name || '';
    if (/^switch/.test(n)) text = `สวิตช์ไฟ: ${state.power.sw ? 'ON' : 'OFF'} (คลิกเพื่อสลับ)`;
    else if (/^nano_usb/.test(n) || bh?.userData.powerPart === 'usb') text = state.power.usb ? 'สาย USB (คลิกเพื่อถอด)' : 'พอร์ต USB (คลิกเพื่อเสียบสาย)';
    else if (/^tplug/.test(n) || bh?.userData.powerPart === 'battery') text = state.power.battery ? 'แบตเตอรี่ LiPo 7.4V (คลิกเพื่อถอด)' : 'ขั้ว T-Plug (คลิกเพื่อต่อแบตเตอรี่)';
    else if (/^btn_/.test(n)) text = 'ปุ่ม D2 (กดค้าง)';
    else if (/^(knob|pot_)/.test(n)) text = 'Knob A7 (ลากซ้าย-ขวา)';
  }
  canvas.style.cursor = a ? 'crosshair' : text ? 'pointer' : 'default';
  if (text && e.pointerType !== 'touch') { tip.textContent = text; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 10 + 'px'; tip.hidden = false; } else tip.hidden = true;
  if (state.pending) {
    const p = stage.groundPoint(e);
    const start = new THREE.Vector3();
    state.pending.obj.getWorldPosition(start);
    if (p) {
      if (a) a.getWorldPosition(p); else p.y = 0.02;
      const mid = start.clone().lerp(p, 0.5); mid.y = Math.max(start.y, p.y) + 0.02;
      ghost.geometry.dispose();
      ghost.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, mid, p), 30, 0.0006, 6);
      ghost.material.color.set(state.pendingColor || '#6ee7ff');
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  audio?.resume?.();
  const lockOrbit = () => { stage.controls.enabled = false; };
  press = { x: e.clientX, y: e.clientY, kind: null, dragging: false };
  // 1) a pin / slot (highest priority: always lets you start or finish a wire)
  const an = anchorAt(e);
  if (an) {
    const plugged = wireOn(an);
    if (!state.pending && plugged) {
      // an occupied pin/slot behaves like its Dupont housing: tap = unplug & move, drag = move
      press.kind = 'housing';
      press.plug = plugged;
      lockOrbit();
      return;
    }
    press.kind = 'anchor';
    press.anchor = an;
    if (state.pending) finishWire(an);
    else setPending(an);
    lockOrbit();
    return;
  }
  // 2) the black Dupont housing of an existing wire: drag it to move that end
  const hh = stage.pick(e, state.wires.flatMap((w) => [w.h1, w.h2]))[0];
  if (hh) {
    press.kind = 'housing';
    press.plug = hh.object.userData.plug;
    lockOrbit();
    return;
  }
  // 3) board controls and power accessories
  const ph = stage.pick(e, [state.board, state.usbCable, state.batteryPack].filter((o) => o && o.visible !== false))[0]?.object;
  const n = ph?.name || '';
  if (ph) {
    if (/^switch/.test(n)) { setPower({ sw: !state.power.sw }); lockOrbit(); return; }
    if (/^nano_usb/.test(n) || ph.userData.powerPart === 'usb') { setPower({ usb: !state.power.usb }); lockOrbit(); return; }
    if (/^tplug/.test(n) || ph.userData.powerPart === 'battery') { setPower({ battery: !state.power.battery }); lockOrbit(); return; }
    if (/^btn_/.test(n)) { state.d2Pressed = true; lockOrbit(); return; }
    if (/^(knob|pot_)/.test(n)) { state.knobDrag = { x: e.clientX, k: state.knob }; lockOrbit(); return; }
  }
  // 4) modules: select + drag
  const mh = stage.pick(e, state.modules.map((m) => m.root))[0];
  if (mh) {
    let o = mh.object; while (o && !o.userData.moduleId) o = o.parent;
    const m = state.modules.find((x) => x.id === o.userData.moduleId);
    if (state.selected !== m) select(m);
    const prof = PROFILE[m.key] || {};
    const local = m.root.worldToLocal(mh.point.clone());
    Object.assign(press, { kind: 'module', m, prof, t0: performance.now(), ground: stage.groundPoint(e), env0: { ...m.env } });
    press.mode = prof.stick && local.y > 0.011 ? 'stick' : prof.rotary && local.y > 0.007 ? 'rotary' : 'body';
    if (press.mode === 'body' && prof.hold) { m.env[prof.hold] = true; press.holding = true; syncEnv(m); }
    lockOrbit();
    return;
  }
  // 5) a wire: select it (delete with the button / Delete key / right-click)
  const wh = stage.pick(e, state.wires.map((w) => w.mesh))[0];
  if (wh) { selectWire(wh.object.userData.wire); return; }
  selectWire(null);
});

canvas.addEventListener('pointerup', (e) => {
  const p = press;
  press = null;
  if (!p) return;
  if (p.kind === 'module') {
    const m = p.m;
    if (p.holding) m.env[p.prof.hold] = false;
    if (p.mode === 'stick') {
      if (!p.dragging) { m.env.press = true; setTimeout(() => { m.env.press = false; syncEnv(m); }, 300); }
      m.env.x = 0; m.env.y = 0; // the stick springs back to centre
    } else if (p.mode === 'rotary') {
      if (!p.dragging) { m.env.press = true; setTimeout(() => { m.env.press = false; syncEnv(m); }, 300); }
    } else if (!p.dragging && performance.now() - p.t0 < 450 && p.prof.tap) {
      p.prof.tap(m.env);
    }
    syncEnv(m, true);
    return;
  }
  if (p.kind === 'anchor' && p.dragging && state.pending) {
    // drag-to-connect: released over a target
    const an = anchorAt(e);
    if (an && an !== state.pending) finishWire(an);
  } else if (p.kind === 'housing') {
    if (p.dragging && state.pending) {
      const an = anchorAt(e);
      if (an && an !== state.pending) finishWire(an);
    } else if (!p.dragging) {
      // tap on a plugged housing: unplug that end and carry it to a new place
      const { wire, end } = p.plug;
      const keep = end === 'a' ? wire.b : wire.a;
      const lifted = end === 'a' ? wire.a : wire.b;
      const color = wire.color;
      removeWire(wire);
      setPending(keep, color, lifted);
      toast('ยกสายขึ้นแล้ว: แตะรูใหม่ที่จะย้ายไปเสียบ (บนบอร์ดหรือขาโมดูลก็ได้) · ยกเลิก = คืนที่เดิม');
    }
  }
});

function rotateModule(m, dir = 1) {
  m.root.rotation.y += (dir * Math.PI) / 2;
  state.wires.forEach((w) => w.update());
  save();
}

canvas.addEventListener('wheel', (e) => {
  const mh = stage.pick(e, state.modules.map((m) => m.root))[0];
  if (!mh) return;
  let o = mh.object; while (o && !o.userData.moduleId) o = o.parent;
  const m = state.modules.find((x) => x.id === o.userData.moduleId);
  const prof = PROFILE[m?.key];
  if (!prof || (!prof.wheel && !prof.rotary)) return;
  e.preventDefault();
  e.stopImmediatePropagation(); // do not zoom the camera
  const dir = e.deltaY < 0 ? 1 : -1;
  if (prof.rotary) m.env.enc += dir * 2;
  else {
    const c = (m.behavior.env || []).find((x) => x.id === prof.wheel.id);
    m.env[c.id] = Math.max(c.min, Math.min(c.max, +(m.env[c.id] + dir * prof.wheel.step).toFixed(2)));
  }
  if (state.selected !== m) select(m);
  syncEnv(m);
}, { passive: false, capture: true });

/** Reflect env changes made in 3D back into the side panel controls. */
function syncEnv(m, full = false) {
  if (state.selected !== m) return;
  const box = $('#envBox');
  if (!box) return;
  for (const c of m.behavior.env || []) {
    const v = m.env[c.id];
    const el = box.querySelector(`[data-id="${c.id}"]`);
    if (!el) continue;
    if (c.type === 'range') { if (+el.value !== v) el.value = v; const out = box.querySelector('#o_' + c.id); if (out) out.textContent = v + (c.unit || ''); }
    else if (c.type === 'toggle') el.checked = !!v;
    else if (c.type === 'select') el.value = v;
    else if (c.type === 'hold') el.variant = v ? 'success' : 'neutral';
  }
  if (full && m.behavior.lamp) renderEnv(m);
}

function selectWire(w) {
  state.wires.forEach((x) => x.setHighlight(false));
  state.selWire = w;
  if (w) w.setHighlight(true);
  const bar = $('#wireSel');
  bar.hidden = !w;
  if (w) bar.querySelector('.txt').textContent = `สาย: ${state.modules.find((m) => m.id === w.a.moduleId)?.info.code} ขา ${w.a.pin} → ${w.b.port} ${ROW_TH[w.b.row]}`;
}

window.addEventListener('pointermove', (e) => { if (state.knobDrag) state.knob = Math.min(1, Math.max(0, state.knobDrag.k + (e.clientX - state.knobDrag.x) / 300)); });
window.addEventListener('pointerup', () => { if (drag) save(); drag = null; state.d2Pressed = false; state.knobDrag = null; stage.controls.enabled = true; });
$('#btnDelWire').addEventListener('click', () => { if (state.selWire) { removeWire(state.selWire); selectWire(null); toast('ลบสายแล้ว'); } });
$('#btnCancelWire').addEventListener('click', cancelPending);
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const wh = stage.pick(e, state.wires.map((w) => w.mesh))[0];
  if (wh) { removeWire(wh.object.userData.wire); selectWire(null); }
});
window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selWire) { removeWire(state.selWire); selectWire(null); }
  // e.code is the physical key, so R works with a Thai (or any) keyboard layout
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && state.selected) rotateModule(state.selected);
  if (e.key === 'Escape') cancelPending();
});

// ------------------------------------------------------------------ keyboard camera: WASD move, Q/E down/up, arrows orbit, Shift = fast
const keys = new Set();
const typing = (e) => !!e.target?.closest?.('textarea, input, .CodeMirror, sl-input, sl-textarea, sl-select');
window.addEventListener('keydown', (e) => { if (!typing(e)) keys.add(e.code); });
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
let camT = 0;
stage.onFrame.push((t) => {
  const dt = Math.min(0.05, (t - camT) / 1000 || 0);
  camT = t;
  if (!keys.size) return;
  const cam = stage.camera, tgt = stage.controls.target;
  const fwd = new THREE.Vector3().subVectors(tgt, cam.position).setY(0);
  if (fwd.lengthSq() < 1e-9) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const dist = cam.position.distanceTo(tgt);
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1) * Math.max(0.05, dist) * 1.2 * dt;
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.add(fwd);
  if (keys.has('KeyS')) move.sub(fwd);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  if (keys.has('KeyE')) move.y += 1;
  if (keys.has('KeyQ')) move.y -= 1;
  if (move.lengthSq()) {
    move.normalize().multiplyScalar(speed);
    cam.position.add(move);
    tgt.add(move);
    if (tgt.y < 0) { cam.position.y -= tgt.y; tgt.y = 0; }
  }
  const rot = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
  if (rot) {
    const off = cam.position.clone().sub(tgt).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.6);
    cam.position.copy(tgt).add(off);
  }
  const tilt = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  if (tilt) {
    const off = cam.position.clone().sub(tgt);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.phi = Math.min(Math.PI * 0.48, Math.max(0.05, sph.phi - tilt * dt * 1.2));
    cam.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(sph));
  }
});

// ------------------------------------------------------------------ UI
const CAT_TH = { sensor: 'เซนเซอร์', module: 'โมดูล', actuator: 'มอเตอร์' };
function renderLibrary() {
  const q = ($('#search').value || '').trim().toLowerCase();
  const cat = $('#libCat').value || 'all';
  $('#library').innerHTML = CATALOG.filter((c) => (cat === 'all' || c.category === cat) && `${c.code} ${c.name} ${c.desc}`.toLowerCase().includes(q)).map((c) => `
    <button class="card" data-key="${c.key}" title="${esc(c.desc)}">
      ${c.image ? `<img src="${ASSETS + c.image}" alt="" loading="lazy">` : `<span class="noimg"><sl-icon name="${c.icon || 'cpu'}"></sl-icon></span>`}
      <span class="ky">${esc(c.code)}</span><span class="nm">${esc(c.name)}</span>
    </button>`).join('') || '<p class="muted small">ไม่พบโมดูล</p>';
}

function renderModuleList() {
  $('#placed').innerHTML = state.modules.map((m) => `<sl-tag size="small" pill removable data-id="${m.id}" variant="${state.selected === m ? 'primary' : 'neutral'}">${esc(m.info.code)} ${esc(m.info.name)}</sl-tag>`).join('') || '<span class="muted small">ยังไม่มีโมดูลบนโต๊ะ</span>';
}

function select(m) {
  state.selected = m;
  renderModuleList();
  const box = $('#modulePanel');
  if (!m) {
    box.innerHTML = `<div class="empty-state"><sl-icon name="hand-index-thumb"></sl-icon><p>เลือกโมดูลจากคลังด้านซ้าย หรือคลิกโมดูลบนโต๊ะ<br>เพื่อดูรายละเอียดและปรับสภาพแวดล้อม</p></div>`;
    return;
  }
  const ex = m.info.examples.map((e, i) => `<sl-option value="${i}">${esc(e.title)}</sl-option>`).join('');
  box.innerHTML = `
    <div class="modhead"><sl-badge variant="primary" pill>${esc(m.info.code)}</sl-badge> <b>${esc(m.info.name)}</b></div>
    <p class="muted small">${esc(m.info.desc)}</p>
    <div class="btnrow">
      <sl-button size="small" variant="success" id="btnAuto"><sl-icon slot="prefix" name="plug"></sl-icon>ต่อสายอัตโนมัติ</sl-button>
      <sl-button size="small" id="btnUnwire"><sl-icon slot="prefix" name="scissors"></sl-icon>ถอดสายทั้งหมด</sl-button>
      <sl-button size="small" id="btnRotate"><sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>หมุน</sl-button>
      <sl-button size="small" variant="danger" outline id="btnRemove"><sl-icon slot="prefix" name="trash"></sl-icon>ลบ</sl-button>
    </div>
    <div class="btnrow">
      <sl-select size="small" id="exSel" value="0" hoist>${ex}</sl-select>
      <sl-button size="small" id="btnLoadEx"><sl-icon slot="prefix" name="code-slash"></sl-icon>โหลดโค้ด</sl-button>
    </div>
    <a class="small link" href="${ASSETS + m.info.readme}" target="_blank" rel="noopener"><sl-icon name="book"></sl-icon> เปิดเอกสาร</a>
    <sl-divider></sl-divider>
    <div id="envBox"></div>`;
  $('#btnAuto').addEventListener('click', () => autoWire(m));
  $('#btnUnwire').addEventListener('click', () => { for (const w of [...state.wires]) if (w.a.moduleId === m.id) removeWire(w); toast('ถอดสายของโมดูลนี้แล้ว'); });
  $('#btnRemove').addEventListener('click', () => removeModule(m));
  $('#btnRotate').addEventListener('click', () => rotateModule(m));
  $('#btnLoadEx').addEventListener('click', () => { if (loadExample(m, +$('#exSel').value)) { toast('โหลดโค้ดตัวอย่างแล้ว (เลขขาตรงกับพอร์ตที่ต่อจริง)', 'success'); showTab('code'); } });
  renderEnv(m);
  showTab('module');
}

const IR_KEYS = [['1', 0x45], ['2', 0x46], ['3', 0x47], ['4', 0x44], ['5', 0x40], ['6', 0x43], ['7', 0x07], ['8', 0x15], ['9', 0x09], ['*', 0x16], ['0', 0x19], ['#', 0x0d], ['▲', 0x18], ['◀', 0x08], ['OK', 0x1c], ['▶', 0x5a], ['▼', 0x52]];
function renderEnv(m) {
  const box = $('#envBox');
  const ctrls = m.behavior.env || [];
  if (!ctrls.length) {
    if (m.behavior.lamp) {
      box.innerHTML = `<p class="muted small"><sl-icon name="lightbulb"></sl-icon> หลอดไฟ: <b>${m.lit ? 'ติด' : 'ดับ'}</b> · ต่อ L1/L2 เข้า <b>COM + NO</b> = ติดเมื่อรีเลย์ทำงาน, <b>COM + NC</b> = ติดเมื่อรีเลย์ไม่ทำงาน</p>
        <div class="btnrow"><sl-button size="small" id="lampNO">ต่อกับ COM + NO</sl-button><sl-button size="small" id="lampNC">ต่อกับ COM + NC</sl-button></div>`;
      const relay = () => state.modules.find((x) => x.key === 'relay-module');
      const rewire = (c) => { const r = relay(); if (!r) { toast('ยังไม่มีโมดูล Relay บนโต๊ะ', 'warning'); return; } for (const w of [...state.wires]) if (w.a.moduleId === m.id) removeWire(w); wireLampToRelay(m, r, c); toast(`ต่อหลอดไฟกับ COM + ${c} แล้ว`, 'success'); };
      $('#lampNO').addEventListener('click', () => rewire('NO'));
      $('#lampNC').addEventListener('click', () => rewire('NC'));
      return;
    }
    const hint = m.behavior.servo ? 'เซอร์โวหมุนตามคำสั่ง Servo.write() ในโค้ด' : m.behavior.motor ? 'มอเตอร์หมุนตามขา TB6612 (ต้องต่อแบตเตอรี่ + เปิดสวิตช์ ON)' : 'โมดูลนี้เป็นเอาต์พุต: สั่งงานด้วยโค้ด';
    box.innerHTML = `<p class="muted small"><sl-icon name="info-circle"></sl-icon> ${hint}</p>`;
    return;
  }
  const how = PROFILE[m.key]?.label;
  box.innerHTML = (how ? `<sl-alert variant="primary" open class="how"><sl-icon slot="icon" name="hand-index"></sl-icon><b>ทดสอบบนโมเดล 3D:</b> ${esc(how)}</sl-alert>` : '') + '<h4>สภาพแวดล้อมจำลอง</h4>' + ctrls.map((c) => {
    if (c.type === 'range') return `<div class="ctl"><div class="ctl-head"><span>${esc(c.label)}</span><output id="o_${c.id}">${m.env[c.id]}${c.unit || ''}</output></div><sl-range data-id="${c.id}" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${m.env[c.id]}"></sl-range></div>`;
    if (c.type === 'toggle') return `<sl-switch data-id="${c.id}" ${m.env[c.id] ? 'checked' : ''}>${esc(c.label)}</sl-switch>`;
    if (c.type === 'hold') return `<sl-button class="hold" data-id="${c.id}" variant="neutral" outline>${esc(c.label)}</sl-button>`;
    if (c.type === 'select') return `<sl-radio-group data-id="${c.id}" label="${esc(c.label)}" value="${m.env[c.id]}" size="small">${c.options.map(([v, t]) => `<sl-radio-button value="${v}">${esc(t)}</sl-radio-button>`).join('')}</sl-radio-group>`;
    if (c.type === 'encoder') return `<div class="btnrow"><sl-button size="small" data-enc="-1"><sl-icon slot="prefix" name="arrow-counterclockwise"></sl-icon>ทวนเข็ม</sl-button><sl-button size="small" data-enc="1"><sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>ตามเข็ม</sl-button></div>`;
    if (c.type === 'remote') return `<div class="remote">${IR_KEYS.map(([t, k]) => `<sl-button size="small" pill data-ir="${k}">${t}</sl-button>`).join('')}</div>`;
    return '';
  }).join('');
  box.querySelectorAll('sl-range').forEach((el) => el.addEventListener('sl-input', () => { const c = ctrls.find((x) => x.id === el.dataset.id); m.env[c.id] = +el.value; $('#o_' + c.id).textContent = el.value + (c.unit || ''); }));
  box.querySelectorAll('sl-switch').forEach((el) => el.addEventListener('sl-change', () => { m.env[el.dataset.id] = el.checked; }));
  box.querySelectorAll('sl-radio-group').forEach((el) => el.addEventListener('sl-change', () => { m.env[el.dataset.id] = el.value; }));
  box.querySelectorAll('sl-button.hold').forEach((el) => {
    el.addEventListener('pointerdown', () => { m.env[el.dataset.id] = true; el.variant = 'success'; });
    const up = () => { m.env[el.dataset.id] = false; el.variant = 'neutral'; };
    el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
  });
  box.querySelectorAll('[data-enc]').forEach((el) => el.addEventListener('click', async () => { for (let i = 0; i < 2; i++) { m.env.enc += +el.dataset.enc; await new Promise((r) => setTimeout(r, 25)); } }));
  box.querySelectorAll('[data-ir]').forEach((el) => el.addEventListener('click', () => state.irQueue.push({ command: +el.dataset.ir, raw: +el.dataset.ir })));
}

function renderIssues(issues) {
  const icon = { err: 'x-octagon', warn: 'exclamation-triangle', info: 'info-circle', ok: 'check2-circle' };
  const list = issues.length ? issues : [['ok', 'การต่อสายถูกต้อง']];
  $('#issues').innerHTML = list.map(([k, t]) => `<li class="${k}"><sl-icon name="${icon[k]}"></sl-icon>${esc(t)}</li>`).join('');
  const n = issues.filter(([k]) => k === 'err' || k === 'warn').length;
  const b = $('#issueCount');
  if (b) { b.textContent = n; b.hidden = !n; }
}

function showTab(name) { $('#rightTabs')?.show?.(name); }
// CodeMirror cannot measure itself while its tab is hidden: redraw whenever the code tab is shown
$('#rightTabs').addEventListener('sl-tab-show', (e) => { if (e.detail?.name === 'code') setTimeout(() => editor?.refresh(), 0); });
window.addEventListener('resize', () => editor?.refresh());

$('#library').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) addModule(b.dataset.key); });
$('#placed').addEventListener('click', (e) => { const t = e.target.closest('sl-tag'); if (t) select(state.modules.find((m) => m.id === +t.dataset.id)); });
$('#placed').addEventListener('sl-remove', (e) => { const m = state.modules.find((x) => x.id === +e.target.dataset.id); if (m) removeModule(m); });
$('#search').addEventListener('sl-input', renderLibrary);
$('#libCat').addEventListener('sl-change', renderLibrary);
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => stage.view(b.dataset.view)));
$('#pwUsb').addEventListener('sl-change', (e) => setPower({ usb: e.target.checked }));
$('#pwBat').addEventListener('sl-change', (e) => setPower({ battery: e.target.checked }));
$('#pwSw').addEventListener('sl-change', (e) => setPower({ sw: e.target.checked }));

// ------------------------------------------------------------------ code editor + run
let editor;
function setCode(code) { if (editor) { editor.setValue(code); setTimeout(() => editor.refresh(), 0); } else $('#code').value = code; save(); }
function getCode() { return editor ? editor.getValue() : $('#code').value; }

function initEditor() {
  if (window.CodeMirror) {
    editor = window.CodeMirror.fromTextArea($('#code'), { mode: 'text/x-c++src', theme: 'material-darker', lineNumbers: true, indentUnit: 2, tabSize: 2, matchBrackets: true });
    editor.on('change', () => saveSoon());
  }
  $('#exBoard').innerHTML = BOARD_EXAMPLES.map((e, i) => `<sl-option value="${i}">${esc(e.title)}</sl-option>`).join('');
  $('#btnBoardEx').addEventListener('click', () => setCode(BOARD_EXAMPLES[+$('#exBoard').value || 0].code));
}

async function startSketch(code) {
  if (state.running) state.running.stop();
  mcu.running = false;
  for (const k of Object.keys(voices)) sound(k, 0);
  $('#errors').hidden = true;
  try {
    state.running = await runSketch(code, hw, mcu);
    setRunUi(true);
  } catch (e) { showError(e); setRunUi(false); }
}

async function runCode() {
  audio?.resume?.();
  if (!boardOn()) { toast('บอร์ดยังไม่มีไฟ: เปิด USB หรือ ต่อแบตเตอรี่ + สวิตช์ ON ที่แถบด้านบน', 'warning'); return; }
  serialClear();
  state.uploaded = getCode();
  editor?.refresh();
  await startSketch(state.uploaded);
}

function haltSketch() {
  if (state.running) state.running.stop();
  state.running = null;
  mcu.running = false;
  for (const k of Object.keys(voices)) sound(k, 0);
  oled.on = false; oled.flush(true);
  if (state.parts?.nanoL) state.parts.nanoL.material.emissiveIntensity = 0;
  setRunUi(false);
}

function stopSketch() { state.uploaded = null; haltSketch(); }

function setRunUi(running) {
  const b = $('#btnRun');
  b.variant = running ? 'danger' : 'success';
  b.innerHTML = running ? '<sl-icon slot="prefix" name="stop-fill"></sl-icon>หยุด' : '<sl-icon slot="prefix" name="play-fill"></sl-icon>รัน';
  b.classList.toggle('running', running);
}

function showError(e) {
  const box = $('#errors');
  box.hidden = false;
  const msg = e instanceof TranspileError ? `แปลงโค้ดไม่สำเร็จ: ${e.message}` : `เกิดข้อผิดพลาดขณะรัน: ${e.message}`;
  box.querySelector('.msg').textContent = msg;
  showTab('code');
  console.error(e);
}

$('#btnRun').addEventListener('click', () => (mcu.running ? stopSketch() : runCode()));

// ------------------------------------------------------------------ serial monitor + plotter
const serialEl = $('#serial');
let serialBuf = '';
const plot = { data: [], max: 400 };
function serialClear() { serialEl.textContent = ''; serialBuf = ''; plot.data = []; }
function serialWrite(s) {
  if (!s) return;
  serialEl.textContent += s;
  if (serialEl.textContent.length > 20000) serialEl.textContent = serialEl.textContent.slice(-15000);
  if ($('#autoscroll').checked) serialEl.scrollTop = serialEl.scrollHeight;
  serialBuf += s;
  let i;
  while ((i = serialBuf.indexOf('\n')) >= 0) {
    const line = serialBuf.slice(0, i); serialBuf = serialBuf.slice(i + 1);
    const nums = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length) { plot.data.push(nums.slice(0, 4)); if (plot.data.length > plot.max) plot.data.shift(); }
  }
}
$('#serialSend').addEventListener('submit', (e) => { e.preventDefault(); mcu.serialIn += $('#serialIn').value + '\n'; $('#serialIn').value = ''; });
$('#btnClear').addEventListener('click', serialClear);
const plotCanvas = $('#plotter');
const PLOT_COLORS = ['#38bdf8', '#fbbf24', '#4ade80', '#f472b6'];
setInterval(() => {
  if (!plotCanvas.offsetParent) return;
  const g = plotCanvas.getContext('2d');
  const W = (plotCanvas.width = plotCanvas.clientWidth), H = (plotCanvas.height = plotCanvas.clientHeight);
  g.fillStyle = '#0b0e13'; g.fillRect(0, 0, W, H);
  if (!plot.data.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const r of plot.data) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi === lo) { hi += 1; lo -= 1; }
  g.strokeStyle = '#1f2630'; g.fillStyle = '#7d8794'; g.font = '11px "JetBrains Mono", monospace';
  for (let k = 0; k <= 4; k++) { const y = 8 + ((H - 16) * k) / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText((hi - ((hi - lo) * k) / 4).toFixed(1), 4, y - 2); }
  const n = plot.data[0].length;
  for (let s = 0; s < n; s++) {
    g.strokeStyle = PLOT_COLORS[s]; g.lineWidth = 1.6; g.beginPath();
    plot.data.forEach((r, i) => { const x = (i / (plot.max - 1)) * W, y = 8 + (H - 16) * (1 - (r[s] - lo) / (hi - lo)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
}, 100);

// ------------------------------------------------------------------ status
function updateStatus() {
  const mt = (p) => { const s = motorSpeed(p); return !mcu.running ? '—' : !motorsOn() ? 'ไม่มีไฟแบต' : s === 0 ? 'หยุด' : `${s > 0 ? '▲' : '▼'} ${Math.round(Math.abs(s) * 255)}`; };
  const sv = [10, 11, 12].map((p, i) => `SV${i + 1} ${state.servo[p] != null ? state.servo[p] + '°' : '—'}`).join(' · ');
  const r = state.rail;
  const pct = r.limit ? Math.round((r.mA / r.limit) * 100) : 0;
  const cls = !boardOn() ? '' : pct > 100 ? 'bad' : pct > 75 ? 'warnv' : 'okv';
  $('#hwStatus').innerHTML = `<span class="rail ${cls}" title="กระแสที่ใช้บนราง 5V เทียบกับที่แหล่งจ่ายให้ได้"><sl-icon name="lightning-charge"></sl-icon>${boardOn() ? `${state.power.battery && state.power.sw ? 'แบต' : 'USB'} ${r.V.toFixed(2)}V · ${r.mA}/${r.limit} mA` : 'ไม่มีไฟ'}${r.resets ? ` · รีเซ็ต ${r.resets} ครั้ง` : ''}</span><span>ML ${mt('ML')}</span><span>MR ${mt('MR')}</span><span>${sv}</span><span>A7 ${Math.round(state.knob * 1023)}</span><span>D2 ${state.d2Pressed ? 'กด' : 'ปล่อย'}</span>`;
}

// ------------------------------------------------------------------ persistence
let saveT;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
function save() {
  try {
    localStorage.setItem('lotus-sim', JSON.stringify({
      code: getCode(),
      power: state.power,
      modules: state.modules.map((m) => ({ id: m.id, key: m.key, x: m.root.position.x, z: m.root.position.z, ry: m.root.rotation.y, portMap: m.portMap })),
      wires: state.wires.map((w) => ({ m: w.a.moduleId, pin: w.a.pin, port: w.b.port, row: w.b.row, color: w.color, owner: w.b.ownerId })),
    }));
  } catch {}
}
async function restore() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem('lotus-sim') || 'null'); } catch {}
  if (!data) { setCode(BOARD_EXAMPLES[0].code); return; }
  if (data.power) { Object.assign(state.power, data.power); applyPower(true); }
  setCode(data.code || BOARD_EXAMPLES[0].code);
  const idMap = {};
  for (const s of data.modules || []) {
    if (!CATALOG.find((c) => c.key === s.key)) continue;
    const m = await addModule(s.key, { x: s.x, z: s.z }, { auto: false });
    m.root.rotation.y = s.ry || 0;
    m.portMap = s.portMap || {};
    idMap[s.id] = m;
  }
  for (const w of data.wires || []) {
    const m = idMap[w.m];
    if (w.row === 'T') {
      const relay = idMap[w.owner];
      if (m && relay?.terms?.[w.port] && m.pins[w.pin]) addWire({ kind: 'pin', obj: m.pins[w.pin], pin: w.pin, moduleId: m.id }, { kind: 'port', obj: relay.terms[w.port], port: w.port, row: 'T', ownerId: relay.id, term: w.port }, w.color, { quiet: true });
      continue;
    }
    const port = state.ports.find((p) => p.port === w.port && p.row === w.row);
    if (!m || !m.pins[w.pin] || !port) continue;
    addWire({ kind: 'pin', obj: m.pins[w.pin], pin: w.pin, moduleId: m.id }, { kind: 'port', obj: port.obj, port: port.port, row: port.row }, w.color, { quiet: true });
  }
  select(null);
}
$('#btnReset').addEventListener('click', () => {
  for (const m of [...state.modules]) removeModule(m);
  stopSketch();
  setCode(BOARD_EXAMPLES[0].code);
});

// ------------------------------------------------------------------ toasts (Shoelace alerts)
function toast(msg, variant = 'neutral') {
  const icon = { primary: 'info-circle', success: 'check2-circle', warning: 'exclamation-triangle', danger: 'x-octagon', neutral: 'chat-left-text' }[variant];
  document.querySelectorAll('.sl-toast-stack sl-alert').forEach((old) => old.hide?.());
  const el = Object.assign(document.createElement('sl-alert'), { variant, closable: true, duration: 3200, innerHTML: `<sl-icon slot="icon" name="${icon}"></sl-icon>${esc(msg)}` });
  document.body.append(el);
  if (el.toast) el.toast(); else setTimeout(() => el.remove(), 3200);
}

// ------------------------------------------------------------------ phone / tablet: bottom navigation opens slide-up panels
function setPane(name) {
  document.body.classList.remove('pane-left', 'pane-right', 'pane-dock');
  if (name && name !== 'none') document.body.classList.add('pane-' + name);
  document.querySelectorAll('.mobile-nav button').forEach((b) => b.classList.toggle('on', b.dataset.pane === (name || 'none')));
  editor?.refresh();
}
document.querySelectorAll('.mobile-nav button').forEach((b) => b.addEventListener('click', () => {
  const open = document.body.classList.contains('pane-' + b.dataset.pane);
  setPane(open ? 'none' : b.dataset.pane);
}));
const isCompact = () => getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none';
// placing a module from the library on a phone closes the library so the 3D view is visible
$('#library').addEventListener('click', (e) => { if (isCompact() && e.target.closest('.card')) setPane('none'); });
const syncAppbar = () => document.documentElement.style.setProperty('--appbar-h', $('.appbar').offsetHeight + 'px');
new ResizeObserver(syncAppbar).observe($('.appbar'));
syncAppbar();

window.__sim = { state, stage, mcu, oled, voices, addModule, autoWire, addWire, removeWire, runCode: () => runCode(), stop: () => stopSketch(), setCode, setPower };

(async function main() {
  await Promise.race([customElements.whenDefined('sl-button'), new Promise((r) => setTimeout(r, 3000))]);
  initEditor();
  renderLibrary();
  renderModuleList();
  select(null);
  setRunUi(false);
  try {
    await loadBoard();
    if (isCompact() && innerWidth < innerHeight) { stage.camera.position.set(0.06, 0.32, 0.42); stage.controls.target.set(0.03, 0, 0.0); }
    await restore();
    checkWiring();
    $('#loading').hidden = true;
  } catch (e) {
    $('#loading').textContent = 'โหลดโมเดล 3D ไม่สำเร็จ: ' + e.message + ' (ต้องเปิดผ่านเว็บเซิร์ฟเวอร์: python tools/serve.py)';
    console.error(e);
  }
})();
