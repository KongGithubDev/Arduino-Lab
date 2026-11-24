// Parts that plug into the board's non-sensor sockets:
//   SG90 micro servo  -> SV1 / SV2 / SV3 (or any 3-row header column)
//   TT gear motor     -> ML / MR JST motor connectors
//   2S LiPo battery + USB cable are handled in app.js (power system)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mm = 0.001;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });

function box(w, h, d, mat, r = 0) {
  const g = r ? new RoundedBoxGeometry(w * mm, h * mm, d * mm, 3, r * mm) : new THREE.BoxGeometry(w * mm, h * mm, d * mm);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(r1, r2, h, mat, seg = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * mm, r2 * mm, h * mm, seg), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function pinAnchor(name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x * mm, y * mm, z * mm);
  o.userData.pin = name;
  return o;
}

/** 3-pin male header block at the end of a short pigtail (pins point -X like the KY modules). */
function pigtailHeader(group, names, x, y, z) {
  const housing = box(2.5, 2.5, names.length * 2.54, std(0x111111), 0.2);
  housing.position.set(x * mm, y * mm, z * mm);
  group.add(housing);
  names.forEach((n, i) => {
    const zz = z + ((names.length - 1) / 2 - i) * 2.54;
    const p = box(8, 0.64, 0.64, std(0xd9b44a, { metalness: 1, roughness: 0.25 }));
    p.position.set((x - 4.5) * mm, y * mm, zz * mm);
    group.add(p);
    group.add(pinAnchor(n, x - 8.3, y, zz));
  });
}

// ------------------------------------------------------------------ SG90 servo
export function buildServo() {
  const g = new THREE.Group();
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x1f63c9, roughness: 0.35, clearcoat: 0.3, transmission: 0.15, thickness: 2 });
  const body = box(23, 22.5, 12.2, blue, 0.6);
  body.position.set(0, 11.25 * mm, 0);
  g.add(body);
  const tabs = box(32.5, 2.5, 12.2, blue, 0.4);
  tabs.position.set(0, 16 * mm, 0);
  g.add(tabs);
  const top = cyl(5.8, 5.8, 4, blue);
  top.position.set(-5.5 * mm, 24.5 * mm, 0);
  g.add(top);
  const shaft = cyl(2.3, 2.3, 3.2, std(0xf2f2f2));
  shaft.position.set(-5.5 * mm, 28 * mm, 0);
  g.add(shaft);
  // horn (rotates)
  const horn = new THREE.Group();
  const hornMat = std(0xf6f6f2, { roughness: 0.4 });
  const hub = cyl(3.5, 3.5, 1.8, hornMat);
  const arm = box(20, 1.5, 5, hornMat, 0.7);
  arm.position.x = 7 * mm;
  horn.add(hub, arm);
  for (let i = 0; i < 5; i++) {
    const hole = cyl(0.55, 0.55, 1.6, std(0x222222));
    hole.position.set((4 + i * 3) * mm, 0.1 * mm, 0);
    horn.add(hole);
  }
  horn.position.set(-5.5 * mm, 30.2 * mm, 0);
  horn.name = 'servo_horn';
  g.add(horn);
  const label = box(14, 0.2, 9, std(0xe9e9e9));
  label.position.set(4 * mm, 22.6 * mm, 0);
  g.add(label);
  // cable: brown (GND), red (5V), orange (S) to a header
  const colors = [0xd98a1c, 0xc81e1e, 0x5a3a1e];
  colors.forEach((c, i) => {
    const z = (i - 1) * 1.1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-11.5 * mm, 5 * mm, z * mm),
      new THREE.Vector3(-20 * mm, 2 * mm, (z + 2) * mm),
      new THREE.Vector3(-34 * mm, 1.3 * mm, (z * 2.3) * mm),
    ]);
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.55 * mm, 8), std(c, { roughness: 0.45 }));
    t.castShadow = true;
    g.add(t);
  });
  pigtailHeader(g, ['S', '+', '-'], -36, 1.3, 0);
  return g;
}

// ------------------------------------------------------------------ TT gear motor + wheel
export function buildMotor() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshPhysicalMaterial({ color: 0xf2c200, roughness: 0.32, clearcoat: 0.4, transmission: 0.1 });
  const gearbox = box(37, 22.5, 18.8, yellow, 1.2);
  gearbox.position.set(0, 11.25 * mm, 0);
  g.add(gearbox);
  const can = cyl(10, 10, 25, std(0xc9ccd1, { metalness: 0.9, roughness: 0.35 }));
  can.rotation.z = Math.PI / 2;
  can.position.set(-28 * mm, 11 * mm, 0);
  g.add(can);
  const capEnd = cyl(10.2, 10.2, 2, std(0x222222));
  capEnd.rotation.z = Math.PI / 2;
  capEnd.position.set(-41 * mm, 11 * mm, 0);
  g.add(capEnd);
  // wheel on the output shaft (+Z side)
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(28 * mm, 5.5 * mm, 20, 64), std(0x111111, { roughness: 0.92 }));
  const rim = cyl(23, 23, 8, std(0xf2c200, { roughness: 0.4 }), 48);
  rim.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const spoke = box(40, 3, 3, std(0xe0b000));
    spoke.rotation.z = (i * Math.PI) / 6;
    wheel.add(spoke);
  }
  const hub = cyl(5, 5, 10, std(0xe0b000));
  hub.rotation.x = Math.PI / 2;
  wheel.add(tire, rim, hub);
  // tread marks so rotation is visible
  for (let i = 0; i < 24; i++) {
    const tread = box(2, 10, 3, std(0x2a2a2a));
    const a = (i / 24) * Math.PI * 2;
    tread.position.set(Math.cos(a) * 33 * mm, Math.sin(a) * 33 * mm, 0);
    tread.rotation.z = a;
    wheel.add(tread);
  }
  wheel.position.set(6 * mm, 33.5 * mm, 16 * mm);
  wheel.name = 'motor_wheel';
  g.add(wheel);
  g.position.y = 0;
  // motor leads to a 2-pin JST plug
  [0xc81e1e, 0x1a1a1a].forEach((c, i) => {
    const z = (i - 0.5) * 1.6;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-42 * mm, 14 * mm, z * mm),
      new THREE.Vector3(-50 * mm, 6 * mm, z * mm),
      new THREE.Vector3(-58 * mm, 2.2 * mm, z * mm),
    ]);
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.6 * mm, 8), std(c));
    g.add(t);
  });
  const plug = box(5, 4.5, 6, std(0xf1e7cc), 0.4);
  plug.position.set(-60 * mm, 2.2 * mm, 0);
  g.add(plug);
  g.add(pinAnchor('M', -62.5, 2.2, 0));
  return g;
}

export const EXTRA_BUILDERS = { 'servo-sg90': buildServo, 'tt-motor': buildMotor };

export const EXTRA_CATALOG = [
  {
    key: 'servo-sg90', code: 'SG90', name: 'Micro Servo SG90', category: 'actuator',
    desc: 'เซอร์โวมอเตอร์ขนาดเล็ก หมุน 0-180° ต่อที่หัวต่อ SV1-SV3 (D10-D12) ช่องเหลือง = สัญญาณ แดง = 5V ดำ = GND สั่งงานด้วยไลบรารี Servo',
    image: null, icon: 'gear', readme: 'lessons/unit-07-robotics.md',
    wires: [{ pin: 'S', port: 'SV1', role: 'S', optional: false }, { pin: '+', port: 'SV1', role: '5V', optional: false }, { pin: '-', port: 'SV1', role: 'GND', optional: false }],
    examples: [{ title: 'หมุนตาม Knob A7', code: `#include <Servo.h>

Servo sv1;

void setup() {
  sv1.attach(10);          // SV1 = D10
  Serial.begin(9600);
}

void loop() {
  int angle = map(analogRead(A7), 0, 1023, 0, 180);
  sv1.write(angle);
  Serial.println(angle);
  delay(20);
}
` }, { title: 'กวาด 0-180 องศา', code: `#include <Servo.h>

Servo sv1;

void setup() {
  sv1.attach(10);
}

void loop() {
  for (int a = 0; a <= 180; a += 2) { sv1.write(a); delay(15); }
  for (int a = 180; a >= 0; a -= 2) { sv1.write(a); delay(15); }
}
` }],
  },
  {
    key: 'tt-motor', code: 'TT', name: 'TT Gear Motor + ล้อ', category: 'actuator',
    desc: 'มอเตอร์เกียร์ TT พร้อมล้อ ต่อที่ช่อง ML (มอเตอร์ซ้าย: D9, D4, PWM D5) หรือ MR (มอเตอร์ขวา: D7, D8, PWM D6) ขับผ่าน TB6612FNG ต้องใช้แบตเตอรี่ + เปิดสวิตช์ ON',
    image: null, icon: 'arrow-repeat', readme: 'lessons/unit-07-robotics.md',
    wires: [{ pin: 'M', port: 'ML', role: 'M', optional: false }],
    examples: [{ title: 'กดปุ่ม D2 แล้ววิ่ง', code: `#define DL1 9
#define DL2 4
#define PWML 5
#define DR1 7
#define DR2 8
#define PWMR 6

void run(int spl, int spr) {
  digitalWrite(DL1, spl >= 0 ? LOW : HIGH);
  digitalWrite(DL2, spl >= 0 ? HIGH : LOW);
  analogWrite(PWML, abs(spl));
  digitalWrite(DR1, spr >= 0 ? LOW : HIGH);
  digitalWrite(DR2, spr >= 0 ? HIGH : LOW);
  analogWrite(PWMR, abs(spr));
}

void setup() {
  pinMode(DL1, OUTPUT); pinMode(DL2, OUTPUT); pinMode(PWML, OUTPUT);
  pinMode(DR1, OUTPUT); pinMode(DR2, OUTPUT); pinMode(PWMR, OUTPUT);
  pinMode(2, INPUT);
}

void loop() {
  if (digitalRead(2) == LOW) {
    run(200, 200);  delay(1500);
    run(-200, 200); delay(800);
    run(-200, -200); delay(1500);
    run(0, 0);
  }
}
` }, { title: 'ความเร็วตาม Knob A7', code: `#define DL1 9
#define DL2 4
#define PWML 5
#define DR1 7
#define DR2 8
#define PWMR 6

void setup() {
  pinMode(DL1, OUTPUT); pinMode(DL2, OUTPUT); pinMode(PWML, OUTPUT);
  pinMode(DR1, OUTPUT); pinMode(DR2, OUTPUT); pinMode(PWMR, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int sp = map(analogRead(A7), 0, 1023, -255, 255);
  digitalWrite(DL1, sp >= 0 ? LOW : HIGH);
  digitalWrite(DL2, sp >= 0 ? HIGH : LOW);
  analogWrite(PWML, abs(sp));
  digitalWrite(DR1, sp >= 0 ? LOW : HIGH);
  digitalWrite(DR2, sp >= 0 ? HIGH : LOW);
  analogWrite(PWMR, abs(sp));
  Serial.println(sp);
  delay(50);
}
` }],
  },
];

export const EXTRA_BEHAVIORS = {
  'servo-sg90': { env: [], servo: true },
  'tt-motor': { env: [], motor: true, noVcc: true },
};

// ------------------------------------------------------------------ power accessories
export function buildUsbCable() {
  const g = new THREE.Group();
  const metal = std(0xc9ccd1, { metalness: 1, roughness: 0.3 });
  const plug = box(7.2, 3.4, 6, metal, 0.3);
  plug.position.set(0, 0, -3 * mm);
  const boot = box(11, 7, 16, std(0x161616, { roughness: 0.6 }), 1.5);
  boot.position.set(0, 0, 8 * mm);
  g.add(plug, boot);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 16 * mm), new THREE.Vector3(0, -6 * mm, 40 * mm),
    new THREE.Vector3(-15 * mm, -20 * mm, 80 * mm), new THREE.Vector3(-40 * mm, -22 * mm, 160 * mm),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 1.6 * mm, 10), std(0x151515, { roughness: 0.55 }));
  cable.castShadow = true;
  g.add(cable);
  g.traverse((o) => { if (o.isMesh) o.userData.powerPart = 'usb'; });
  return g;
}

export function buildBattery() {
  const g = new THREE.Group();
  const wrap = new THREE.MeshPhysicalMaterial({ color: 0x1b4fd1, roughness: 0.25, clearcoat: 0.7 });
  const pack = box(70, 14, 34, wrap, 2);
  pack.position.set(0, 7 * mm, 0);
  g.add(pack);
  const label = box(44, 0.3, 22, std(0xf2f2f2));
  label.position.set(4 * mm, 14.1 * mm, 0);
  g.add(label);
  const stripe = box(44, 0.35, 5, std(0xf2c200));
  stripe.position.set(4 * mm, 14.2 * mm, -6 * mm);
  g.add(stripe);
  [0xc81e1e, 0x151515].forEach((c, i) => {
    const z = (i - 0.5) * 3;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-35 * mm, 8 * mm, z * mm), new THREE.Vector3(-50 * mm, 14 * mm, z * mm),
      new THREE.Vector3(-62 * mm, 22 * mm, (z - 10) * mm), new THREE.Vector3(-68 * mm, 24 * mm, (z - 22) * mm),
    ]);
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 1.3 * mm, 8), std(c));
    t.castShadow = true;
    g.add(t);
  });
  const deans = box(10, 7, 8, std(0xc8161b), 0.8);
  deans.position.set(-70 * mm, 24 * mm, -24 * mm);
  g.add(deans);
  g.traverse((o) => { if (o.isMesh) o.userData.powerPart = 'battery'; });
  return g;
}
