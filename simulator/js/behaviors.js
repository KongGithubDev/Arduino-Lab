// Electrical behaviour of every module, keyed by folder name.
// Pin names are the silkscreen names used by the 3D models (PIN_<name> nodes).
//
//   env:     controls shown in the panel  {id, label, type: range|toggle|hold|select, ...}
//   out(e, t, io)    -> { pinName: volts | 'float' }   (sensor outputs, only when powered)
//   view(io, t)      -> { led: [r,g,b] 0..1, buzzer: Hz|0, laser: bool, relay: bool, irFlash: bool }
//     io.v(pin)  = voltage the MCU drives on that module pin (0..5), io.pwm(pin) = duty 0..1
//
// Active levels follow the example code in each README.

const V = 5;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const noise = (k = 0.01) => (Math.random() - 0.5) * k * V;
const lvl = (on) => (on ? V : 0);

/** LM393 comparator boards: AO analog, DO digital (+ on-board D-LED). activeLow: DO LOW when triggered. */
function comparator(aoFromEnv, { activeLow = true, below = false } = {}) {
  return {
    env: [{ id: 'trim', label: 'ปรับ Trimpot (จุดตัด DO)', type: 'range', min: 0, max: 100, value: 50, unit: '%' }],
    out(e, t) {
      const ao = clamp(aoFromEnv(e, t), 0, V);
      const thr = (e.trim / 100) * V;
      const trig = below ? ao < thr : ao > thr;
      return { AO: ao + noise(), DO: lvl(activeLow ? !trig : trig) };
    },
    dLed(e, t) { const ao = clamp(aoFromEnv(e, t), 0, V), thr = (e.trim / 100) * V; return below ? ao < thr : ao > thr; },
  };
}

function ntcVolts(tempC) {
  const R = 10000 * Math.exp(3950 * (1 / (tempC + 273.15) - 1 / 298.15));
  return V / (R / 10000 + 1); // matches R = 10000 * (1023/raw - 1) in the README
}

const SHOCK = { id: 'shake', label: 'เขย่า / เคาะ (กดค้าง)', type: 'hold' };
const MAGNET = { id: 'magnet', label: 'นำแม่เหล็กเข้าใกล้', type: 'toggle', value: false };
const TEMP = { id: 'temp', label: 'อุณหภูมิ', type: 'range', min: -10, max: 80, value: 28, step: 0.5, unit: '°C' };

export const BEHAVIORS = {
  // ------------------------------------------------------------------ sensors
  'ds18b20-temperature-sensor': { env: [TEMP], lib: 'ds18b20', out: () => ({ S: 'float' }) },
  'temperature-humidity-sensor': {
    env: [TEMP, { id: 'hum', label: 'ความชื้น', type: 'range', min: 5, max: 95, value: 60, unit: '%' }],
    lib: 'dht', out: () => ({ S: 'float' }),
  },
  'vibration-sensor': { env: [SHOCK], out: (e, t) => ({ S: lvl(e.shake && Math.sin(t * 0.09) > -0.2) }) },
  'tap-module': { env: [SHOCK], out: (e, t) => ({ S: lvl(e.shake && Math.sin(t * 0.07) > 0) }) },
  'hall-magnetic-sensor': { env: [MAGNET], out: (e) => ({ S: lvl(!e.magnet) }) },
  'magnetic-spring-sensor': { env: [MAGNET], out: (e) => ({ S: lvl(!e.magnet) }) },
  'analog-hall-sensor': {
    env: [{ id: 'field', label: 'สนามแม่เหล็ก (ขั้ว S ← → ขั้ว N)', type: 'range', min: -100, max: 100, value: 0, unit: '' }],
    out: (e) => ({ S: 2.5 + e.field * 0.022 + noise(0.004) }),
  },
  'linear-hall-sensor': {
    ...comparator((e) => 2.5 + e.field * 0.022, { activeLow: false }),
    env: [{ id: 'field', label: 'สนามแม่เหล็ก (S ← → N)', type: 'range', min: -100, max: 100, value: 0 }, { id: 'trim', label: 'Trimpot', type: 'range', min: 0, max: 100, value: 60, unit: '%' }],
  },
  'reed-switch': {
    env: [MAGNET],
    out: (e) => ({ AO: lvl(!e.magnet), DO: lvl(!e.magnet) }),
    dLed: (e) => e.magnet,
  },
  'light-blocking-sensor': {
    env: [{ id: 'blocked', label: 'มีวัตถุบังช่อง', type: 'toggle', value: false }, { id: 'wheel', label: 'หมุนล้อจานเข้ารหัส (รอบ/วินาที)', type: 'range', min: 0, max: 5, value: 0, step: 0.5 }],
    out: (e, t) => {
      const blocked = e.wheel > 0 ? Math.sin(t * 0.001 * e.wheel * 2 * Math.PI * 10) > 0 : e.blocked;
      return { S: lvl(blocked) };
    },
  },
  'analog-temperature-sensor': { env: [TEMP], out: (e) => ({ S: ntcVolts(e.temp) + noise(0.003) }) },
  'digital-temperature-sensor': {
    ...comparator((e) => ntcVolts(e.temp)),
    env: [TEMP, { id: 'trim', label: 'Trimpot (อุณหภูมิเตือน)', type: 'range', min: 0, max: 100, value: 60, unit: '%' }],
  },
  photoresistor: {
    env: [{ id: 'light', label: 'ความสว่าง', type: 'range', min: 0, max: 100, value: 60, unit: '%' }],
    out: (e) => ({ S: clamp(V * (0.95 - e.light / 100 * 0.9), 0, V) + noise(0.004) }), // bright -> low value
  },
  'mercury-switch': { env: [{ id: 'tilt', label: 'เอียงโมดูล', type: 'toggle', value: false }], out: (e) => ({ S: lvl(!e.tilt) }) },
  'tilt-switch': { env: [{ id: 'tilt', label: 'เอียงโมดูล', type: 'toggle', value: false }], out: (e) => ({ S: lvl(!e.tilt) }) },
  'light-cup-module': {
    env: [{ id: 'tilt', label: 'เอียงถ้วย', type: 'toggle', value: false }],
    out: (e) => ({ S: lvl(!e.tilt) }),
    view: (io) => ({ led: [io.pwm('L'), 0, 0] }),
  },
  'ir-receiver': {
    env: [{ id: 'remote', label: 'รีโมท', type: 'remote' }],
    lib: 'ir', out: () => ({ S: V }),
  },
  'flame-sensor': {
    ...comparator((e) => V * (1 - e.flame / 100 * 0.92), { activeLow: true, below: true }),
    env: [{ id: 'flame', label: 'ความแรงเปลวไฟ / IR', type: 'range', min: 0, max: 100, value: 0, unit: '%' }, { id: 'trim', label: 'Trimpot', type: 'range', min: 0, max: 100, value: 50, unit: '%' }],
  },
  'avoidance-sensor': {
    env: [{ id: 'dist', label: 'ระยะสิ่งกีดขวาง', type: 'range', min: 1, max: 40, value: 30, unit: 'cm' }, { id: 'range', label: 'ระยะตรวจจับ (Trimpot)', type: 'range', min: 2, max: 30, value: 15, unit: 'cm' }],
    out: (e) => ({ OUT: lvl(!(e.dist <= e.range)) }),
    dLed: (e) => e.dist <= e.range,
    view: () => ({ ir: true }),
  },
  'tracking-sensor': {
    env: [{ id: 'surface', label: 'พื้นใต้เซนเซอร์', type: 'select', options: [['white', 'พื้นขาว'], ['black', 'เส้นดำ']], value: 'white' }],
    out: (e) => ({ S: lvl(e.surface === 'black') }), // HIGH on the black line
    dLed: (e) => e.surface === 'white',
  },
  'touch-sensor': {
    ...comparator((e) => (e.touch ? 4.2 : 0.6) + noise(0.02), { activeLow: false }),
    env: [{ id: 'touch', label: 'แตะด้วยนิ้ว (กดค้าง)', type: 'hold' }, { id: 'trim', label: 'Trimpot', type: 'range', min: 0, max: 100, value: 50, unit: '%' }],
  },
  'big-sound-sensor': {
    ...comparator((e, t) => 2.2 + (e.sound / 100) * 2.6 * Math.abs(Math.sin(t * 0.6)), { activeLow: true }),
    env: [{ id: 'sound', label: 'ระดับเสียง', type: 'range', min: 0, max: 100, value: 5, unit: '%' }, { id: 'trim', label: 'Trimpot', type: 'range', min: 0, max: 100, value: 70, unit: '%' }],
  },
  'small-sound-sensor': {
    ...comparator((e, t) => 2.2 + (e.sound / 100) * 2.6 * Math.abs(Math.sin(t * 0.6)), { activeLow: false }),
    env: [{ id: 'sound', label: 'ระดับเสียง / ปรบมือ', type: 'range', min: 0, max: 100, value: 5, unit: '%' }, { id: 'trim', label: 'Trimpot', type: 'range', min: 0, max: 100, value: 70, unit: '%' }],
  },
  'heartbeat-sensor': {
    env: [{ id: 'finger', label: 'วางนิ้ว', type: 'toggle', value: false }, { id: 'bpm', label: 'ชีพจร', type: 'range', min: 50, max: 140, value: 75, unit: 'BPM' }],
    out: (e, t) => {
      if (!e.finger) return { S: 1.2 + noise(0.01) };
      const ph = ((t / 1000) * e.bpm / 60) % 1;
      const pulse = Math.exp(-Math.pow((ph - 0.15) / 0.05, 2)) + 0.35 * Math.exp(-Math.pow((ph - 0.35) / 0.07, 2));
      return { S: 2.4 + pulse * 1.6 + noise(0.01) };
    },
  },
  'rotary-encoder': {
    env: [{ id: 'enc', label: 'หมุน Encoder', type: 'encoder' }, { id: 'press', label: 'กดแกน (SW)', type: 'hold' }],
    out: (e) => {
      const s = ((e.enc % 4) + 4) % 4; // quadrature state machine
      const CLK = [1, 0, 0, 1][s], DT = [1, 1, 0, 0][s];
      return { CLK: lvl(CLK), DT: lvl(DT), SW: lvl(!e.press) };
    },
  },
  'passive-buzzer': { noVcc: true, env: [], view: (io) => ({ buzzer: io.freq('S') || (io.v('S') > 2.5 ? -1 : 0), passive: true }) },

  // ------------------------------------------------------------------ modules
  'button-module': { env: [{ id: 'press', label: 'กดปุ่ม (กดค้าง)', type: 'hold' }], out: (e) => ({ S: lvl(e.press) }) },
  'joystick-module': {
    env: [
      { id: 'x', label: 'แกน X', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'y', label: 'แกน Y', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'press', label: 'กดคันโยก (SW)', type: 'hold' },
    ],
    out: (e) => ({ VRX: 2.5 + e.x * 0.025 + noise(0.003), VRY: 2.5 + e.y * 0.025 + noise(0.003), SW: e.press ? 0 : 'float' }),
  },
  'ir-emission-module': { env: [], view: (io) => ({ ir: io.v('S') > 2.5 || io.freq('S') > 0 }) },
  'laser-module': { env: [], view: (io) => ({ laser: io.v('S') > 2.5 }) },
  'smd-rgb-led': { env: [], view: (io) => ({ led: [io.pwm('R'), io.pwm('G'), io.pwm('B')] }) },
  'rgb-led': { env: [], view: (io) => ({ led: [io.pwm('R'), io.pwm('G'), io.pwm('B')] }) },
  'two-color-led': { env: [], view: (io) => ({ led: [io.pwm('R'), io.pwm('G'), 0] }) },
  'mini-two-color-led': { env: [], view: (io) => ({ led: [io.pwm('R'), io.pwm('G'), 0] }) },
  'active-buzzer': { env: [], view: (io) => ({ buzzer: io.v('S') > 2.5 ? 2300 : 0 }) },
  'relay-module': { env: [], view: (io) => ({ relay: io.v('S') > 2.5 }) },
  '7-color-flash-led': {
    env: [],
    view: (io, t) => {
      if (io.v('S') < 2.5) return { led: [0, 0, 0] };
      const k = Math.floor(t / 600) % 7;
      const C = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]][k];
      return { led: C };
    },
  },
};
