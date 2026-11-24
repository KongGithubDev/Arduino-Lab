import { Stage, Wire, THREE } from './scene.js';
import { CATALOG } from './catalog.js';
import { BEHAVIORS } from './behaviors.js';
import { MCU, runSketch, TranspileError } from './runtime.js';
import { Oled } from './oled.js';
import { BOARD_EXAMPLES } from './board-examples.js';

const $ = (s) => document.querySelector(s);
const MODELS = 'models/';
const ASSETS = '../';
const POWER_PINS = ['+', '+5V', 'V+', 'VCC', 'VDD'];
const GROUND_PINS = ['-', 'G', 'GND'];
const PORT_TO_PIN = { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, D0: 0, D1: 1, D3: 3, SV1: 10, SV2: 11, SV3: 12 };
const PIN_TO_PORT = Object.fromEntries(Object.entries(PORT_TO_PIN).map(([k, v]) => [v, k]));
const ROW_TH = { S: 'ช่องขาว (S)', '5V': 'ช่องแดง (5V)', GND: 'ช่องดำ (GND)' };
const SIGNAL_COLORS = ['#f2c200', '#1f6fe0', '#20a040', '#e87a10', '#9b3fd4', '#e8e8e8'];

// ------------------------------------------------------------------ state
const stage = new Stage($('#viewport'));
const mcu = new MCU(null);
const oled = new Oled();
const state = {
  board: null,
  ports: [],        // {obj, port, row}
  modules: [],      // {id, key, info, behavior, root, pins:{name:obj}, env:{}, parts}
  wires: [],
  pending: null,    // first end while wiring
  selected: null,
  running: null,
  d2Pressed: false,
  knob: 0.5,
  warned: new Set(),
  irQueue: [],
  servo: {},
};
let nextId = 1;

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
  g.gain.setTargetAtTime(0.05, audio.currentTime, 0.005);
  o.connect(g).connect(audio.destination);
  o.start();
  voices[id] = { o, g };
}
function click() {
  if (!audio) return;
  const o = audio.createOscillator(); const g = audio.createGain();
  o.frequency.value = 180; g.gain.value = 0.08; g.gain.setTargetAtTime(0, audio.currentTime, 0.01);
  o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.04);
}

// ------------------------------------------------------------------ board
async function loadBoard() {
  const root = await stage.load(MODELS + 'lotus-nano-bot.glb');
  stage.scene.add(root);
  state.board = root;
  const hitGeo = new THREE.SphereGeometry(0.0013, 10, 8);
  const hitMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0, depthTest: false });
  root.traverse((o) => {
    const ud = o.userData || {};
    if (ud.port && ud.row && ud.row !== 'JST') {
      const hit = new THREE.Mesh(hitGeo, hitMat.clone());
      hit.userData.anchor = { kind: 'port', obj: o, port: ud.port, row: ud.row };
      hit.renderOrder = 10;
      o.add(hit);
      state.ports.push({ obj: o, port: ud.port, row: ud.row, hit });
    }
  });
  // onboard parts
  const find = (n) => { let r = null; root.traverse((o) => { if (!r && o.name && o.name.startsWith(n)) r = o; }); return r; };
  state.parts = {
    screen: find('oled_screen'),
    nanoL: find('nano_led_3'),
    pwrLed: find('pwr_led'),
    button: find('btn_cap'),
    knob: find('knob_shaft'),
  };
  if (state.parts.screen) {
    state.parts.screen.material = new THREE.MeshBasicMaterial({ map: oled.texture, toneMapped: false });
    // the plane UV is mirrored by the exporter on some versions; keep as-is
  }
  root.traverse((o) => {
    // clear acrylic parts: thin, slightly tinted, no transmission glare
    if (o.isMesh && /^oled_case/.test(o.name)) {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.07, envMapIntensity: 0.25, depthWrite: false });
      o.castShadow = false;
    }
    if (o.isMesh && /^oled_glass/.test(o.name)) {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.5 });
    }
  });
  for (const k of ['nanoL', 'pwrLed']) {
    const p = state.parts[k];
    if (p) p.material = p.material.clone();
  }
  if (state.parts.pwrLed) { state.parts.pwrLed.material.emissive = new THREE.Color(0x22ff44); state.parts.pwrLed.material.emissiveIntensity = 2.2; }
  oled.reset();
}

// ------------------------------------------------------------------ modules
async function addModule(key, pos, { auto = true } = {}) {
  const info = CATALOG.find((c) => c.key === key);
  const behavior = BEHAVIORS[key] || { env: [] };
  const root = await stage.load(MODELS + key + '.glb');
  const id = nextId++;
  root.userData.moduleId = id;
  const pins = {};
  const hitGeo = new THREE.SphereGeometry(0.0013, 10, 8);
  const leds = [], dLeds = [], pwrLeds = [];
  root.traverse((o) => {
    if (o.userData?.pin) {
      pins[o.userData.pin] = o;
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0, depthTest: false }));
      hit.userData.anchor = { kind: 'pin', obj: o, pin: o.userData.pin, moduleId: id };
      hit.renderOrder = 10;
      o.add(hit);
    }
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
  const spot = pos || freeSpot();
  root.position.set(spot.x, 0, spot.z);
  stage.scene.add(root);
  const m = { id, key, info, behavior, root, pins, env, leds, dLeds, pwrLeds, light, laser, smoke: 0, portMap: {} };
  state.modules.push(m);
  if (auto) {
    autoWire(m, { quiet: true });
    if (loadExample(m)) {
      const moved = Object.entries(m.portMap).filter(([a, b]) => a !== b);
      toast(`วาง ${info.code} แล้ว: ต่อสายและโหลดโค้ดตัวอย่างให้อัตโนมัติ` + (moved.length ? ` (ใช้ ${moved.map(([, b]) => b).join(', ')} แทน ${moved.map(([a]) => a).join(', ')} เพราะพอร์ตเดิมไม่ว่าง)` : '') + ' → กด ▶ รัน');
    }
  }
  select(m);
  renderModuleList();
  save();
  return m;
}

function freeSpot() {
  const n = state.modules.length;
  const col = n % 3, row = Math.floor(n / 3);
  return { x: 0.085 + col * 0.05, z: -0.045 + row * 0.045 };
}

function removeModule(m) {
  for (const w of [...state.wires]) if (w.a.moduleId === m.id || w.b.moduleId === m.id) removeWire(w);
  stage.scene.remove(m.root);
  sound('mod' + m.id, 0);
  state.modules = state.modules.filter((x) => x !== m);
  if (state.selected === m) select(null);
  renderModuleList();
  save();
}

// ------------------------------------------------------------------ wiring
function wireColor(a, b) {
  const port = a.kind === 'port' ? a : b;
  if (port.row === 'GND') return '#1c1c1c';
  if (port.row === '5V') return '#d62020';
  const used = state.wires.filter((w) => (w.a.row || w.b.row) === 'S').length;
  return SIGNAL_COLORS[used % SIGNAL_COLORS.length];
}

function addWire(a, b, color, { quiet = false } = {}) {
  if (a.kind === b.kind) { toast('สายต้องต่อจาก "ขาโมดูล" ไป "หัวต่อบนบอร์ด" (ปลายหนึ่งที่โมดูล อีกปลายที่บอร์ด)'); return null; }
  const pin = a.kind === 'pin' ? a : b, port = a.kind === 'port' ? a : b;
  const dup = state.wires.find((w) => w.a.moduleId === pin.moduleId && w.a.pin === pin.pin && w.b.port === port.port && w.b.row === port.row);
  if (dup) { if (!quiet) toast('มีสายเส้นนี้อยู่แล้ว'); return null; }
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

/** Several wires on one pin/slot are drawn piggy-backed (stacked further out). */
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
  if (POWER_PINS.includes(name)) return '5V';
  if (name === 'G' && m && m.pins.R) return 'S'; // green channel of a colour LED
  if (GROUND_PINS.includes(name)) return 'GND';
  return 'S';
}

function powered(m) {
  const ws = moduleWires(m);
  const hasV = ws.some((w) => pinRole(w.pin, m) === '5V' && w.row === '5V');
  const hasG = ws.some((w) => pinRole(w.pin, m) === 'GND' && w.row === 'GND');
  const needsV = !m.behavior.noVcc && Object.keys(m.pins).some((p) => pinRole(p, m) === '5V');
  return hasG && (hasV || !needsV);
}

function checkWiring() {
  const issues = [];
  for (const m of state.modules) {
    const label = `${m.info.code} ${m.info.name}`;
    const ws = moduleWires(m);
    let reverse = false;
    for (const w of ws) {
      const role = pinRole(w.pin, m);
      if (role === '5V' && w.row === 'GND') { issues.push(['err', `${label}: ขา ${w.pin} (ไฟ) เสียบช่องดำ GND: ต่อกลับขั้ว!`]); reverse = true; }
      if (role === 'GND' && w.row === '5V') { issues.push(['err', `${label}: ขา ${w.pin} (กราวด์) เสียบช่องแดง 5V: ต่อกลับขั้ว!`]); reverse = true; }
      if (role === 'S' && w.row !== 'S') issues.push(['warn', `${label}: ขาสัญญาณ ${w.pin} เสียบ${ROW_TH[w.row]}: ควรเสียบช่องขาว (S)`]);
      if (role !== 'S' && w.row === 'S') issues.push(['warn', `${label}: ขา ${w.pin} เป็นขาไฟเลี้ยง แต่เสียบช่องขาว (S)`]);
      if (w.row === 'S') {
        if (w.port === 'D3') issues.push(['info', `${label}: D3 ใช้ร่วมกับบัซเซอร์บนบอร์ด อาจมีเสียงรบกวน`]);
        if (w.port === 'A4' || w.port === 'A5') issues.push(['info', `${label}: ${w.port} ใช้ร่วมกับ I2C (จอ OLED) ถ้าใช้จอพร้อมกันจะทำงานผิดพลาด`]);
        if (w.port === 'D0' || w.port === 'D1') issues.push(['info', `${label}: ${w.port} ใช้ร่วมกับ Serial: Serial Monitor อาจรวน`]);
      }
    }
    m.reverse = reverse;
    const sigPins = Object.keys(m.pins).filter((p) => pinRole(p, m) === 'S');
    if (ws.length && !powered(m) && !reverse) issues.push(['warn', `${label}: ยังไม่ได้ต่อไฟเลี้ยงครบ (5V + GND)`]);
    if (ws.length && sigPins.length && !ws.some((w) => pinRole(w.pin, m) === 'S')) issues.push(['warn', `${label}: ยังไม่ได้ต่อขาสัญญาณ`]);
  }
  // several wires on the same signal slot = those pins are connected together
  const byPort = {};
  for (const w of state.wires) { if (w.b.row === 'S') (byPort[w.b.port] ||= []).push(w); }
  for (const [port, ws] of Object.entries(byPort)) {
    const mods = new Set(ws.map((w) => w.a.moduleId));
    if (ws.length > 1) issues.push([mods.size > 1 ? 'warn' : 'info', `พอร์ต ${port} ช่องขาวมีสาย ${ws.length} เส้น: สัญญาณของ ${[...mods].map((id) => state.modules.find((m) => m.id === id)?.info.code).join(', ')} จะต่อถึงกัน`]);
  }
  const list = $('#issues');
  list.innerHTML = issues.length ? issues.map(([k, t]) => `<li class="${k}">${t}</li>`).join('') : '<li class="ok">การต่อสายถูกต้อง</li>';
}

const SIGNAL_PORT_ORDER = ['A0', 'A1', 'A2', 'A3', 'A6', 'SV1', 'SV2', 'SV3', 'A4', 'A5', 'D3', 'D1', 'D0'];
const ANALOG_PINS = ['AO', 'A0', 'VRX', 'VRY'];
const ANALOG_ONLY_MODULES = ['photoresistor', 'analog-temperature-sensor', 'analog-hall-sensor', 'heartbeat-sensor'];

/** Choose free header ports for a module: README ports when free, otherwise the next free ones. */
function planPorts(m) {
  const busy = new Set(state.wires.filter((w) => w.a.moduleId !== m.id && w.b.row === 'S').map((w) => w.b.port));
  const map = {};
  const sigs = (m.info.wires || []).filter((w) => w.role === 'S' && !w.optional);
  for (const w of sigs) {
    if (map[w.port]) continue;
    const analog = ANALOG_PINS.includes(w.pin.toUpperCase()) || ANALOG_ONLY_MODULES.includes(m.key);
    const ok = (p) => !busy.has(p) && (p !== 'A6' || analog) && !(p.startsWith('SV') && analog);
    const port = ok(w.port) ? w.port : SIGNAL_PORT_ORDER.find(ok);
    if (!port) continue;
    map[w.port] = port;
    busy.add(port);
  }
  return map;
}

function autoWire(m, { quiet = false } = {}) {
  for (const w of [...state.wires]) if (w.a.moduleId === m.id) removeWire(w);
  const portMap = planPorts(m);
  const firstSig = (m.info.wires || []).filter((w) => w.role === 'S').sort((a, b) => a.optional - b.optional)[0];
  const powerCol = firstSig ? portMap[firstSig.port] || firstSig.port : 'A0';
  const wanted = (m.info.wires || []).filter((w) => !w.optional).map((w) => ({ ...w, port: w.role === 'S' ? portMap[w.port] || w.port : powerCol }));
  const used = new Set();
  const signalPool = Object.keys(m.pins).filter((p) => pinRole(p, m) === 'S');
  const sorted = [...wanted].sort((a, b) => (a.optional - b.optional) || ((a.role !== 'S') - (b.role !== 'S')));
  let n = 0;
  for (const w of sorted) {
    let pin = m.pins[w.pin] && !used.has(w.pin) ? w.pin : null;
    if (!pin && w.role === '5V') pin = POWER_PINS.find((p) => m.pins[p] && !used.has(p));
    if (!pin && w.role === 'GND') pin = GROUND_PINS.find((p) => m.pins[p] && !used.has(p) && pinRole(p, m) === 'GND');
    if (!pin && w.role === 'S') {
      const analog = ['AO', 'A0', 'VRX', 'VRY'].includes(w.pin.toUpperCase());
      pin = [...signalPool].sort((a, b) => ((a === 'AO') === analog ? 0 : 1) - ((b === 'AO') === analog ? 0 : 1)).find((p) => !used.has(p));
    }
    if (!pin) continue;
    const port = state.ports.find((p) => p.port === w.port && p.row === w.role);
    if (!port) continue;
    used.add(pin);
    const a = { kind: 'pin', obj: m.pins[pin], pin, moduleId: m.id };
    const b = { kind: 'port', obj: port.obj, port: port.port, row: port.row };
    if (addWire(a, b, null, { quiet: true })) n++;
  }
  m.portMap = portMap;
  const moved = Object.entries(portMap).filter(([a, b]) => a !== b);
  if (!quiet) toast(`ต่อสายอัตโนมัติ ${n} เส้น` + (moved.length ? ` (ย้าย ${moved.map(([a, b]) => a + '→' + b).join(', ')} เพราะพอร์ตเดิมมีโมดูลอื่นใช้อยู่)` : ' ตามตารางในเอกสาร'));
  return portMap;
}

// ---- example code with pins remapped to the ports actually used
const PORT_NUM = { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, SV1: 10, SV2: 11, SV3: 12, D3: 3, D1: 1, D0: 0 };
function remapCode(code, portMap = {}) {
  const pairs = Object.entries(portMap).filter(([a, b]) => a !== b);
  if (!pairs.length) return code;
  const label = (p) => p;
  const codeTokens = [], noteTokens = [];
  for (const [from, to] of pairs) {
    if (from.startsWith('A')) codeTokens.push([new RegExp(`\\b${from}\\b`, 'g'), to.startsWith('A') ? to : String(PORT_NUM[to])]);
    codeTokens.push([new RegExp(`\\b${PORT_NUM[from]}\\b`, 'g'), String(PORT_NUM[to])]);
    noteTokens.push([new RegExp(`\\b${from}\\b`, 'g'), label(to)]);
    noteTokens.push([new RegExp(`\\bD${PORT_NUM[from]}\\b`, 'g'), 'D' + PORT_NUM[to]]);
    noteTokens.push([new RegExp(`\\b${PORT_NUM[from]}\\b`, 'g'), String(PORT_NUM[to])]);
  }
  const swap = (text, tokens) => {
    const marks = [];
    for (const [re, to] of tokens) text = text.replace(re, () => { marks.push(to); return `\u0001${marks.length - 1}\u0001`; });
    return text.replace(/\u0001(\d+)\u0001/g, (_, i) => marks[+i]);
  };
  const isPinLine = (l) => /^\s*#\s*define\s+\w+\s/.test(l) || /\b(?:const\s+)?(?:int|byte|uint8_t)\s+\w*(?:pin|PIN|Pin)\w*\s*=/.test(l);
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

const hw = {
  readPin(pin) {
    if (pin === 2) return state.d2Pressed ? 0 : 5;           // onboard button, pull-up
    if (pin === 21) return state.knob * 5;                    // A7 knob
    const port = PIN_TO_PORT[pin];
    if (!port) return null;
    const t = performance.now();
    for (const w of state.wires) {
      if (w.b.port !== port || w.b.row !== 'S') continue;
      const m = state.modules.find((x) => x.id === w.a.moduleId);
      if (!m) continue;
      const outs = moduleOutputs(m, t);
      const v = outs[w.a.pin];
      if (v === undefined) continue;
      if (v === 'float') return mcu.mode[pin] === 'INPUT_PULLUP' ? 5 : (m.behavior.lib ? 5 : null);
      return v;
    }
    return null;
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
  warn(msg) { if (!state.warned.has(msg)) { state.warned.add(msg); serialWrite(`\n⚠ ${msg}\n`, 'warn'); } },
  error(e) { showError(e); stopSketch(); },
  oled,
  onServo(pin, a) { state.servo[pin] = a; },
  sensorAt(pin, lib) {
    const port = PIN_TO_PORT[pin];
    for (const w of state.wires) {
      if (w.b.port !== port || w.b.row !== 'S') continue;
      const m = state.modules.find((x) => x.id === w.a.moduleId);
      if (m && m.behavior.lib === lib && powered(m)) return { temperature: m.env.temp, humidity: m.env.hum };
    }
    return null;
  },
  irReceive(pin) {
    const port = PIN_TO_PORT[pin];
    const ok = state.wires.some((w) => w.b.port === port && w.b.row === 'S' && state.modules.find((x) => x.id === w.a.moduleId && x.behavior.lib === 'ir' && powered(x)));
    if (!ok || !state.irQueue.length) return null;
    return state.irQueue.shift();
  },
  irSend(pin, cmd) {
    serialWrite('', null);
    for (const m of state.modules) if (m.behavior.lib === 'ir' && powered(m)) state.irQueue.push({ command: cmd, raw: cmd });
  },
  adsRead() { return 0; },
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
  onReset() { oled.reset(); state.warned.clear(); state.servo = {}; },
};
mcu.hw = hw;

// per-frame visuals for module outputs (LEDs, buzzers, relay, laser)
function moduleIO(m) {
  const portOf = (pin) => moduleWires(m).find((w) => w.pin === pin && w.row === 'S');
  return {
    v(pin) { const w = portOf(pin); if (!w) return 0; const p = PORT_TO_PIN[w.port]; if (p == null) return 0; return mcu.running && mcu.mode[p] === 'OUTPUT' && mcu.out[p] ? 5 : 0; },
    pwm(pin) {
      const w = portOf(pin); if (!w) return 0; const p = PORT_TO_PIN[w.port]; if (p == null || !mcu.running || mcu.mode[p] !== 'OUTPUT') return 0;
      if (mcu.softPwm && mcu.softPwm[p] != null) return mcu.softPwm[p];
      return mcu.pwm[p] != null ? mcu.pwm[p] / 255 : mcu.out[p] ? 1 : 0;
    },
    freq(pin) { const w = portOf(pin); if (!w) return 0; const p = PORT_TO_PIN[w.port]; return mcu.running ? mcu.tones[p] || 0 : 0; },
  };
}

// software-PWM estimator: average the output level of every pin over ~40 ms
const pwmAcc = {};
setInterval(() => {
  if (!mcu.running) return;
  for (let p = 0; p < 22; p++) {
    const a = (pwmAcc[p] ||= { s: 0, n: 0 });
    a.s += mcu.out[p] ? 1 : 0; a.n++;
  }
}, 1);
setInterval(() => {
  mcu.softPwm = {};
  // fast loops of digitalWrite (software PWM): fraction of HIGH writes
  for (const [p, c] of Object.entries(mcu.wcount || {})) { if (c.n > 40 && c.h > 0 && c.h < c.n) mcu.softPwm[p] = c.h / c.n; c.h = c.n = 0; }
  // slow toggling (blink faster than the eye): fraction of time HIGH
  for (const [p, a] of Object.entries(pwmAcc)) { if (mcu.softPwm[p] == null && a.n > 5 && a.s > 0 && a.s < a.n && a.n / Math.max(1, a.s) < 50) mcu.softPwm[p] = null; a.s = a.n = 0; }
}, 60);

stage.onFrame.push((t) => {
  for (const m of state.modules) {
    const on = powered(m) && !m.reverse;
    for (const p of m.pwrLeds) { p.material.emissive = new THREE.Color(0xff2020); p.material.emissiveIntensity = on ? 3 : 0; }
    const dl = on && m.behavior.dLed ? m.behavior.dLed(m.env, t) : false;
    for (const p of m.dLeds) { p.material.emissive = new THREE.Color(0xff2020); p.material.emissiveIntensity = dl ? 3 : 0; }
    const io = moduleIO(m);
    const v = m.behavior.view ? m.behavior.view(io, t) : {};
    if (v.led) {
      const [r, g, b] = v.led;
      const k = Math.max(r, g, b);
      const col = new THREE.Color(r, g, b);
      for (const p of m.leds) { p.material.emissive = col; p.material.emissiveIntensity = k * 4; }
      m.light.color = col; m.light.intensity = k * 0.02;
    } else if (v.relay !== undefined) {
      for (const p of m.leds) { p.material.emissive = new THREE.Color(0xff2020); p.material.emissiveIntensity = v.relay ? 3 : 0; }
      if (v.relay !== m.lastRelay) { if (m.lastRelay !== undefined) click(); m.lastRelay = v.relay; }
    }
    m.laser.visible = !!v.laser && on;
    if (v.ir !== undefined) for (const p of m.leds) { p.material.emissive = new THREE.Color(0x7a3cff); p.material.emissiveIntensity = v.ir && on && $('#irCam').checked ? 2.5 : 0; }
    const f = on ? v.buzzer : 0;
    sound('mod' + m.id, f === -1 ? 0 : f || 0, 'square');
    if (m.reverse && on === false) m.smoke = Math.min(1, m.smoke + 0.01);
  }
  // knob + button animation
  if (state.parts?.knob) state.parts.knob.rotation.y = -(state.knob - 0.5) * Math.PI * 1.5;
  const btn = state.parts?.button;
  if (btn) {
    btn.userData.y0 ??= btn.position.y;
    btn.position.y = btn.userData.y0 - (state.d2Pressed ? 0.9 : 0); // board nodes are in millimetres
  }
  updateStatus();
});

// ------------------------------------------------------------------ interaction (pick, drag, wire)
const canvas = stage.renderer.domElement;
let drag = null;
let hoverAnchor = null;
const ghost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x6ee7ff }));
stage.scene.add(ghost);

function anchorsList() {
  const list = state.ports.map((p) => p.hit);
  for (const m of state.modules) m.root.traverse((o) => { if (o.userData.anchor) list.push(o); });
  return list;
}

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const p = stage.groundPoint(e);
    if (p) { drag.m.root.position.x = p.x - drag.off.x; drag.m.root.position.z = p.z - drag.off.z; for (const w of state.wires) if (w.a.moduleId === drag.m.id) w.update(); }
    return;
  }
  const hits = stage.pick(e, anchorsList());
  const a = hits[0]?.object;
  if (hoverAnchor && hoverAnchor !== a) hoverAnchor.material.opacity = 0;
  hoverAnchor = a || null;
  if (a) a.material.opacity = 0.85;
  canvas.style.cursor = a ? 'crosshair' : 'default';
  const tip = $('#tip');
  if (a) {
    const an = a.userData.anchor;
    tip.textContent = an.kind === 'port' ? `พอร์ต ${an.port} · ${ROW_TH[an.row]}` : `ขา ${an.pin} ของ ${state.modules.find((m) => m.id === an.moduleId)?.info.code}`;
    tip.style.left = e.clientX + 14 + 'px';
    tip.style.top = e.clientY + 10 + 'px';
    tip.hidden = false;
  } else tip.hidden = true;
  if (state.pending) {
    const p = stage.groundPoint(e);
    const start = new THREE.Vector3();
    state.pending.obj.getWorldPosition(start);
    if (p) {
      p.y = 0.02;
      const mid = start.clone().lerp(p, 0.5); mid.y = Math.max(start.y, p.y) + 0.02;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, p);
      ghost.geometry.dispose();
      ghost.geometry = new THREE.TubeGeometry(curve, 30, 0.0005, 6);
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  audio?.resume?.();
  // grab the Dupont housing of an existing wire -> unplug that end and move it
  if (!state.pending) {
    const hh = stage.pick(e, state.wires.flatMap((w) => [w.h1, w.h2]))[0];
    if (hh) {
      const { wire, end } = hh.object.userData.plug;
      const keep = end === 'a' ? wire.b : wire.a;
      state.pendingColor = wire.color;
      removeWire(wire);
      state.pending = keep;
      toast(end === 'a' ? 'ถอดปลายฝั่งโมดูลแล้ว: คลิกขาโมดูลที่จะเสียบใหม่ (Esc = ทิ้งสาย)' : 'ถอดปลายฝั่งบอร์ดแล้ว: คลิกช่องบนหัวต่อที่จะเสียบใหม่ (Esc = ทิ้งสาย)');
      stage.controls.enabled = false;
      setTimeout(() => (stage.controls.enabled = true), 0);
      return;
    }
  }
  const anchors = stage.pick(e, anchorsList());
  if (anchors.length) {
    const an = anchors[0].object.userData.anchor;
    if (!state.pending) { state.pending = an; toast(an.kind === 'port' ? `เลือก ${an.port} ${ROW_TH[an.row]} แล้ว: คลิกขาโมดูลปลายทาง` : `เลือกขา ${an.pin} แล้ว: คลิกหัวต่อบนบอร์ดปลายทาง (ช่องขาว/แดง/ดำ)`); }
    else {
      if (an !== state.pending) addWire(state.pending, an, state.pendingColor);
      state.pending = null;
      state.pendingColor = null;
      ghost.geometry.dispose(); ghost.geometry = new THREE.BufferGeometry();
    }
    stage.controls.enabled = false;
    setTimeout(() => (stage.controls.enabled = true), 0);
    return;
  }
  // onboard controls
  const boardHits = state.board ? stage.pick(e, [state.board]) : [];
  const bh = boardHits[0]?.object?.name || '';
  if (bh.startsWith('btn_cap') || bh.startsWith('btn_base')) { state.d2Pressed = true; stage.controls.enabled = false; return; }
  if (bh.startsWith('knob') || bh.startsWith('pot_')) { drag = null; state.knobDrag = { x: e.clientX, k: state.knob }; stage.controls.enabled = false; return; }
  // modules
  const mods = state.modules.map((m) => m.root);
  const mh = stage.pick(e, mods)[0];
  if (mh) {
    let o = mh.object; while (o && !o.userData.moduleId) o = o.parent;
    const m = state.modules.find((x) => x.id === o.userData.moduleId);
    select(m);
    const p = stage.groundPoint(e);
    if (p) { drag = { m, off: { x: p.x - m.root.position.x, z: p.z - m.root.position.z } }; stage.controls.enabled = false; }
    return;
  }
  const wh = stage.pick(e, state.wires.map((w) => w.mesh))[0];
  if (wh) { const w = wh.object.userData.wire; state.wires.forEach((x) => x.setHighlight(false)); w.setHighlight(true); state.selWire = w; toast('เลือกสายแล้ว: กด Delete หรือคลิกขวาเพื่อลบ'); }
  if (state.pending) { state.pending = null; ghost.geometry.dispose(); ghost.geometry = new THREE.BufferGeometry(); }
});

window.addEventListener('pointermove', (e) => {
  if (state.knobDrag) { state.knob = Math.min(1, Math.max(0, state.knobDrag.k + (e.clientX - state.knobDrag.x) / 300)); }
});
window.addEventListener('pointerup', () => {
  if (drag) save();
  drag = null; state.d2Pressed = false; state.knobDrag = null; stage.controls.enabled = true;
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const wh = stage.pick(e, state.wires.map((w) => w.mesh))[0];
  if (wh) removeWire(wh.object.userData.wire);
});
window.addEventListener('keydown', (e) => {
  if (e.target.closest('textarea, input, .CodeMirror')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selWire) { removeWire(state.selWire); state.selWire = null; }
  if (e.key === 'r' && state.selected) { state.selected.root.rotation.y += Math.PI / 2; state.wires.forEach((w) => w.update()); save(); }
  if (e.key === 'Escape') { state.pending = null; ghost.geometry.dispose(); ghost.geometry = new THREE.BufferGeometry(); }
});

// ------------------------------------------------------------------ UI: library, selection, env controls
function renderLibrary() {
  const q = $('#search').value.trim().toLowerCase();
  const cat = $('#libCat').value;
  $('#library').innerHTML = CATALOG.filter((c) => (cat === 'all' || c.category === cat) && (`${c.code} ${c.name} ${c.desc}`.toLowerCase().includes(q))).map((c) => `
    <button class="card" data-key="${c.key}" title="${c.desc.replace(/"/g, '&quot;')}">
      ${c.image ? `<img src="${ASSETS + c.image}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
      <span class="ky">${c.code}</span><span class="nm">${c.name}</span>
    </button>`).join('');
}

function renderModuleList() {
  $('#placed').innerHTML = state.modules.map((m) => `<li class="${state.selected === m ? 'sel' : ''}" data-id="${m.id}"><b>${m.info.code}</b> ${m.info.name}</li>`).join('') || '<li class="empty">ยังไม่มีโมดูล: เลือกจากคลังด้านซ้าย</li>';
}

function select(m) {
  state.selected = m;
  renderModuleList();
  const box = $('#modulePanel');
  if (!m) { box.innerHTML = '<p class="muted">คลิกโมดูลในฉากเพื่อดู/ปรับค่าสภาพแวดล้อม</p>'; return; }
  const ex = m.info.examples.map((e, i) => `<option value="${i}">${e.title}</option>`).join('');
  box.innerHTML = `
    <div class="modhead"><b>${m.info.code}</b> ${m.info.name}</div>
    <p class="muted small">${m.info.desc}</p>
    <div class="row">
      <button id="btnAuto" class="primary">ต่อสายอัตโนมัติ</button>
      <button id="btnRemove" class="ghost danger">ลบโมดูล</button>
    </div>
    <div class="row"><select id="exSel">${ex}</select><button id="btnLoadEx">โหลดโค้ด</button></div>
    <a class="small" href="${ASSETS + m.info.readme}" target="_blank" rel="noopener">เปิดเอกสาร README</a>
    <div id="envBox"></div>`;
  $('#btnAuto').onclick = () => autoWire(m);
  $('#btnRemove').onclick = () => removeModule(m);
  $('#btnLoadEx').onclick = () => { if (loadExample(m, +$('#exSel').value)) toast('โหลดโค้ดตัวอย่างแล้ว (ปรับเลขขาตามพอร์ตที่ต่อจริง): กด ▶ รัน'); };
  renderEnv(m);
}

function renderEnv(m) {
  const box = $('#envBox');
  const ctrls = m.behavior.env || [];
  if (!ctrls.length) { box.innerHTML = '<p class="muted small">โมดูลนี้เป็นเอาต์พุต: สั่งงานด้วยโค้ด</p>'; return; }
  box.innerHTML = '<h4>สภาพแวดล้อมจำลอง</h4>' + ctrls.map((c) => {
    if (c.type === 'range') return `<label class="ctl">${c.label} <output id="o_${c.id}">${m.env[c.id]}${c.unit || ''}</output><input type="range" data-id="${c.id}" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${m.env[c.id]}"></label>`;
    if (c.type === 'toggle') return `<label class="ctl tog"><input type="checkbox" data-id="${c.id}" ${m.env[c.id] ? 'checked' : ''}> ${c.label}</label>`;
    if (c.type === 'hold') return `<button class="hold" data-id="${c.id}">${c.label}</button>`;
    if (c.type === 'select') return `<label class="ctl">${c.label}<select data-id="${c.id}">${c.options.map(([v, t]) => `<option value="${v}" ${m.env[c.id] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    if (c.type === 'encoder') return `<div class="row"><button data-enc="-1">⟲ ทวนเข็ม</button><button data-enc="1">⟳ ตามเข็ม</button></div>`;
    if (c.type === 'remote') return `<div class="remote">${[['1', 0x45], ['2', 0x46], ['3', 0x47], ['4', 0x44], ['5', 0x40], ['6', 0x43], ['7', 0x07], ['8', 0x15], ['9', 0x09], ['*', 0x16], ['0', 0x19], ['#', 0x0d], ['▲', 0x18], ['◀', 0x08], ['OK', 0x1c], ['▶', 0x5a], ['▼', 0x52]].map(([t, c]) => `<button data-ir="${c}">${t}</button>`).join('')}</div>`;
    return '';
  }).join('');
  box.querySelectorAll('input[type=range]').forEach((el) => el.oninput = () => { const c = ctrls.find((x) => x.id === el.dataset.id); m.env[c.id] = +el.value; $('#o_' + c.id).textContent = el.value + (c.unit || ''); });
  box.querySelectorAll('input[type=checkbox]').forEach((el) => el.onchange = () => { m.env[el.dataset.id] = el.checked; });
  box.querySelectorAll('select').forEach((el) => el.onchange = () => { m.env[el.dataset.id] = el.value; });
  box.querySelectorAll('button.hold').forEach((el) => {
    el.onpointerdown = () => { m.env[el.dataset.id] = true; el.classList.add('on'); };
    el.onpointerup = el.onpointerleave = () => { m.env[el.dataset.id] = false; el.classList.remove('on'); };
  });
  box.querySelectorAll('[data-enc]').forEach((el) => el.onclick = async () => {
    for (let i = 0; i < 2; i++) { m.env.enc += +el.dataset.enc; await new Promise((r) => setTimeout(r, 25)); }
  });
  box.querySelectorAll('[data-ir]').forEach((el) => el.onclick = () => state.irQueue.push({ command: +el.dataset.ir, raw: +el.dataset.ir }));
}

$('#library').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) addModule(b.dataset.key); });
$('#placed').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) select(state.modules.find((m) => m.id === +li.dataset.id)); });
$('#search').oninput = renderLibrary;
$('#libCat').onchange = renderLibrary;
document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => stage.view(b.dataset.view));

// ------------------------------------------------------------------ code editor + run
let editor;
function setCode(code) { if (editor) editor.setValue(code); else $('#code').value = code; save(); }
function getCode() { return editor ? editor.getValue() : $('#code').value; }

function initEditor() {
  if (window.CodeMirror) {
    editor = window.CodeMirror.fromTextArea($('#code'), { mode: 'text/x-c++src', theme: 'material-darker', lineNumbers: true, indentUnit: 2, tabSize: 2, matchBrackets: true });
    editor.on('change', () => saveSoon());
  }
  $('#exBoard').innerHTML = BOARD_EXAMPLES.map((e, i) => `<option value="${i}">${e.title}</option>`).join('');
  $('#btnBoardEx').onclick = () => setCode(BOARD_EXAMPLES[+$('#exBoard').value].code);
}

async function runCode() {
  stopSketch();
  $('#errors').hidden = true;
  serialClear();
  audio?.resume?.();
  try {
    state.running = await runSketch(getCode(), hw, mcu);
    $('#btnRun').classList.add('running');
    $('#runState').textContent = 'กำลังทำงาน';
  } catch (e) { showError(e); }
}

function stopSketch() {
  if (state.running) state.running.stop();
  state.running = null;
  mcu.running = false;
  for (const k of Object.keys(voices)) sound(k, 0);
  oled.on = false; oled.flush(true);
  if (state.parts?.nanoL) state.parts.nanoL.material.emissiveIntensity = 0;
  $('#btnRun').classList.remove('running');
  $('#runState').textContent = 'หยุด';
}

function showError(e) {
  const box = $('#errors');
  box.hidden = false;
  const msg = e instanceof TranspileError ? `แปลงโค้ดไม่สำเร็จ: ${e.message}` : `เกิดข้อผิดพลาดขณะรัน: ${e.message}`;
  box.textContent = msg + '\n\nหมายเหตุ: ตัวจำลองรองรับภาษา Arduino ส่วนที่ใช้บ่อย (ตัวแปร ฟังก์ชัน อาร์เรย์ if/for/while/switch Serial Servo OLED DHT DS18B20 IRremote)';
  console.error(e);
}

$('#btnRun').onclick = runCode;
$('#btnStop').onclick = stopSketch;

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
$('#serialSend').onsubmit = (e) => { e.preventDefault(); mcu.serialIn += $('#serialIn').value + '\n'; $('#serialIn').value = ''; };
$('#btnClear').onclick = serialClear;
document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tabpane').forEach((p) => (p.hidden = p.id !== b.dataset.tab));
});
const plotCanvas = $('#plotter');
const PLOT_COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#f06292'];
setInterval(() => {
  if (plotCanvas.offsetParent === null) return;
  const g = plotCanvas.getContext('2d');
  const W = (plotCanvas.width = plotCanvas.clientWidth), H = (plotCanvas.height = plotCanvas.clientHeight);
  g.fillStyle = '#101317'; g.fillRect(0, 0, W, H);
  if (!plot.data.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const r of plot.data) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi === lo) { hi += 1; lo -= 1; }
  g.strokeStyle = '#2a3038'; g.fillStyle = '#7d8794'; g.font = '11px monospace';
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
  const ml = motorText(mcu, 'L'), mr = motorText(mcu, 'R');
  const sv = [10, 11, 12].map((p, i) => `SV${i + 1}: ${state.servo[p] != null ? state.servo[p] + '°' : '-'}`).join('  ');
  $('#hwStatus').textContent = `มอเตอร์ซ้าย ${ml} · มอเตอร์ขวา ${mr} · ${sv} · Knob A7 = ${Math.round(state.knob * 1023)}`;
}
function motorText(m, side) {
  if (!m.running) return '■';
  const [i1, i2, pw] = side === 'L' ? [9, 4, 5] : [7, 8, 6];
  const sp = m.pwm[pw] != null ? m.pwm[pw] : m.out[pw] ? 255 : 0;
  if (!sp || m.out[i1] === m.out[i2]) return '■ หยุด';
  return `${m.out[i1] ? '▲' : '▼'} ${sp}`;
}

// ------------------------------------------------------------------ persistence
let saveT;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
function save() {
  try {
    const data = {
      code: getCode(),
      modules: state.modules.map((m) => ({ id: m.id, key: m.key, x: m.root.position.x, z: m.root.position.z, ry: m.root.rotation.y })),
      wires: state.wires.map((w) => ({ m: w.a.moduleId, pin: w.a.pin, port: w.b.port, row: w.b.row, color: w.color })),
    };
    localStorage.setItem('lotus-sim', JSON.stringify(data));
  } catch {}
}
async function restore() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem('lotus-sim') || 'null'); } catch {}
  if (!data) { setCode(BOARD_EXAMPLES[0].code); return; }
  setCode(data.code || BOARD_EXAMPLES[0].code);
  const idMap = {};
  for (const s of data.modules || []) {
    const m = await addModule(s.key, { x: s.x, z: s.z }, { auto: false });
    m.root.rotation.y = s.ry || 0;
    idMap[s.id] = m;
  }
  for (const w of data.wires || []) {
    const m = idMap[w.m];
    const port = state.ports.find((p) => p.port === w.port && p.row === w.row);
    if (!m || !m.pins[w.pin] || !port) continue;
    addWire({ kind: 'pin', obj: m.pins[w.pin], pin: w.pin, moduleId: m.id }, { kind: 'port', obj: port.obj, port: port.port, row: port.row }, w.color);
  }
}
$('#btnReset').onclick = () => {
  for (const m of [...state.modules]) removeModule(m);
  stopSketch();
  setCode(BOARD_EXAMPLES[0].code);
};

// ------------------------------------------------------------------ misc
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

window.__sim = { state, stage, mcu, oled, addModule, autoWire, runCode: () => runCode(), setCode };

(async function main() {
  console.info('[sim] init');
  initEditor();
  renderLibrary();
  renderModuleList();
  select(null);
  try {
    await loadBoard();
    console.info('[sim] board loaded');
    await restore();
    console.info('[sim] restored');
    checkWiring();
    $('#loading').hidden = true;
  } catch (e) {
    $('#loading').textContent = 'โหลดโมเดล 3D ไม่สำเร็จ: ' + e.message + ' (ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ เช่น GitHub Pages หรือ python -m http.server)';
    console.error(e);
  }
})();
