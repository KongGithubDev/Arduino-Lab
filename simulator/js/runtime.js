// Arduino sketch runtime for the browser.
// Translates a practical subset of Arduino C++ into async JavaScript and runs it
// against a virtual ATmega328P (pins, ADC, PWM, tone, Serial, millis...).
// Supported: types/declarations, functions, arrays, #define, for/while/if/switch,
// String, Serial, Servo, Wire, Adafruit_SSD1306 (text), DHT, DallasTemperature,
// IRremote (4.x IrReceiver/IrSender), attachInterrupt (polled).

export const PIN = { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, A7: 21 };
const TYPES = 'unsigned\\s+long|unsigned\\s+int|unsigned\\s+char|long\\s+long|signed\\s+char|int|long|short|float|double|bool|boolean|byte|char|word|String|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|auto';
const CLASS_NAMES = ['Servo', 'DHT', 'Adafruit_SSD1306', 'OneWire', 'DallasTemperature', 'IRrecv', 'decode_results', 'Adafruit_ADS1115', 'MechaQMC5883'];
const INT_TYPES = /^(unsigned\s+long|unsigned\s+int|unsigned\s+char|long\s+long|signed\s+char|int|long|short|byte|char|word|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t)$/;

export class TranspileError extends Error {}

/** Find the index of the bracket that closes the one at `open`. */
function matchBrace(src, open) {
  let depth = 0;
  let inStr = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

export function transpile(code) {
  let src = code.replace(/\r/g, '');
  // keep string literals safe from the regex passes
  const strings = [];
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  src = src.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => { strings.push(m); return `__S${strings.length - 1}__`; });
  src = src.replace(/\/\/.*$/gm, '');

  // preprocessor
  const defines = [];
  src = src.replace(/^\s*#\s*include.*$/gm, '');
  src = src.replace(/^\s*#\s*define\s+(\w+)\s+(.+)$/gm, (_, n, v) => { defines.push(n); return `const ${n} = ${v.trim()};`; });
  src = src.replace(/^\s*#\s*define\s+(\w+)\s*$/gm, (_, n) => `const ${n} = 1;`);
  src = src.replace(/^\s*#.*$/gm, '');

  // literals & casts
  src = src.replace(/\b(\d+)(UL|ul|L|l|U|u)\b/g, '$1');
  src = src.replace(/\b(0x[0-9a-fA-F]+)(UL|ul|L|U)\b/g, '$1');
  src = src.replace(/\(\s*(?:unsigned\s+)?(?:int|long|float|double|byte|char|bool|uint8_t|uint16_t|uint32_t|int16_t)\s*\)/g, '');
  src = src.replace(/\bF\s*\(/g, '(');
  src = src.replace(/\bPROGMEM\b|\bvolatile\b|\bconst\s+(?=(?:unsigned|int|long|float|double|char|byte|bool|String|uint))/g, '');
  src = src.replace(/sizeof\s*\(\s*(\w+)\s*\)\s*\/\s*sizeof\s*\(\s*\1\s*\[\s*0\s*\]\s*\)/g, '$1.length');
  src = src.replace(/sizeof\s*\(\s*(\w+)\s*\)/g, '$1.length');
  src = src.replace(/&\s*Wire\b/g, 'Wire');
  src = src.replace(/([(,]\s*)&\s*(?=[A-Za-z_])/g, '$1');
  src = src.replace(/(\w)\s*->\s*(\w)/g, '$1.$2');
  src = src.replace(/(\w)::(\w)/g, '$1.$2');

  // functions: collect names first so calls can be awaited
  const fnRe = new RegExp(`(^|\\n)[ \\t]*(?:static\\s+)?(?:inline\\s+)?(void|${TYPES})\\s*\\*?\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
  const fnNames = new Set();
  const fnTypes = {};
  let m;
  while ((m = fnRe.exec(src))) { fnNames.add(m[3]); fnTypes[m[3]] = m[2]; }

  // interrupt service routines are also called by the runtime -> they are async too
  src = src.replace(fnRe, (all, pre, type, name, params) => {
    const ps = params.trim() === '' || params.trim() === 'void' ? '' : params.split(',').map((p) => {
      const parts = p.trim().replace(/[&*]/g, ' ').replace(/\[\s*\]/g, '').split(/\s+/);
      const nm = parts[parts.length - 1];
      return nm.includes('=') ? nm : nm;
    }).join(', ');
    return `${pre}async function ${name}(${ps}) {`;
  });

  // object declarations:  Servo sv1;  DHT dht(PIN, DHT11);  Adafruit_SSD1306 OLED(-1);
  // also lists:  Servo a, b;   DHT dht(PIN, DHT11), dht2(PIN2, DHT22);
  const clsRe = new RegExp(`\\b(${CLASS_NAMES.join('|')})\\s+(\\w+\\s*(?:\\([^;]*?\\))?(?:\\s*,\\s*\\w+\\s*(?:\\([^;]*?\\))?)*)\\s*;`, 'g');
  src = src.replace(clsRe, (_, cls, list) => {
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return 'let ' + parts.map((p) => {
      const m = p.trim().match(/^(\w+)\s*(?:\((.*)\))?$/s);
      return `${m[1]} = new ${cls}(${m[2] || ''})`;
    }).join(', ') + ';';
  });

  // static locals -> hoisted globals
  const hoisted = [];
  src = src.replace(new RegExp(`\\bstatic\\s+(?:${TYPES})\\s+(\\w+)\\s*(=\\s*[^;]+)?;`, 'g'), (_, n, init) => {
    hoisted.push(`let ${n} ${init || '= 0'};`);
    return '';
  });

  // array declarations
  src = src.replace(new RegExp(`\\b(?:${TYPES})\\s*\\*?\\s+(\\w+)\\s*\\[\\s*([^\\]]*)\\]\\s*(?:\\[\\s*([^\\]]*)\\])?\\s*=\\s*\\{`, 'g'), (_, n) => `let ${n} = [`);
  // close array initialisers:  = [ ... };  ->  = [ ... ];
  src = src.replace(/= \[([^;]*?)\}\s*;/g, (all, body) => `= [${body.replace(/\{/g, '[').replace(/\}/g, ']')}];`);
  src = src.replace(new RegExp(`\\b(?:${TYPES})\\s*\\*?\\s+(\\w+)\\s*\\[\\s*([^\\]]+)\\]\\s*;`, 'g'), (_, n, size) => `let ${n} = __arr(${size});`);

  // integer variables (for truncating division on assignment)
  const intVars = new Set();
  const declRe = new RegExp(`\\b(${TYPES})\\s*\\*?\\s+(\\w+)\\s*(=|;|,|\\))`, 'g');
  while ((m = declRe.exec(src))) { if (INT_TYPES.test(m[1].replace(/\s+/g, ' '))) intVars.add(m[2]); }

  // scalar declarations (also in for-loops):  int a = 1, b;
  src = src.replace(new RegExp(`(^|[;{}(\\n]\\s*)(?:${TYPES})\\s*\\*?\\s+(?=\\w+\\s*(=|;|,|\\)))`, 'g'), '$1let ');

  // integer assignment truncation:  x = expr;  ->  x = __int(expr);
  for (const v of intVars) {
    const re = new RegExp(`(^|[^\\w.])(${v})\\s*(=|\\+=|-=|\\*=|/=)(?!=)\\s*([^;{}\\n]+);`, 'g');
    src = src.replace(re, (all, pre, name, op, expr) => {
      if (op === '=') return `${pre}${name} = __int(${expr});`;
      return `${pre}${name} = __int(${name} ${op[0]} (${expr}));`;
    });
  }
  // int functions return truncated values
  for (const [name, type] of Object.entries(fnTypes)) {
    if (!INT_TYPES.test(type)) continue;
    const start = src.indexOf(`async function ${name}(`);
    if (start < 0) continue;
    const open = src.indexOf('{', start);
    const close = matchBrace(src, open);
    const body = src.slice(open, close).replace(/\breturn\s+([^;]+);/g, 'return __int($1);');
    src = src.slice(0, open) + body + src.slice(close);
  }

  // await user functions, delay and blocking library calls
  for (const n of fnNames) {
    src = src.replace(new RegExp(`(^|[^\\w.])(?<!function )${n}\\s*\\(`, 'g'), (all, pre) => `${pre}(await ${n}(`).replace(/\(await (\w+)\($/, '(await $1(');
  }
  // the replacement above opened an extra "(" -> close it after the call's matching ")"
  src = closeAwaitParens(src);
  src = src.replace(/(^|[^\w.])(delay|delayMicroseconds|pulseIn)\s*\(/g, '$1await $2(');
  // keep the page responsive inside busy loops: yield at the top of every loop body
  src = src.replace(/\b(for|while)\s*\(/g, '__LOOP_$1(');
  src = insertLoopYields(src);
  src = src.replace(/\.(requestTemperatures|getTempCByIndex|getTempFByIndex)\s*\(/g, '.$1(');

  // char literal comparisons work as strings; Serial.print(x, HEX) handled by runtime
  src = src.replace(/__S(\d+)__/g, (_, i) => strings[+i]);

  const body = `${hoisted.join('\n')}\n${src}\n;return { setup: typeof setup === 'function' ? setup : null, loop: typeof loop === 'function' ? loop : null };`;
  return body;
}

function insertLoopYields(src) {
  let out = '';
  let i = 0;
  const re = /__LOOP_(for|while)\(/g;
  let m;
  while ((m = re.exec(src))) {
    out += src.slice(i, m.index) + m[1] + ' (';
    let p = m.index + m[0].length;
    let depth = 1;
    for (; p < src.length && depth; p++) { if (src[p] === '(') depth++; else if (src[p] === ')') depth--; }
    out += src.slice(m.index + m[0].length, p);
    let q = p;
    while (q < src.length && /\s/.test(src[q])) q++;
    if (src[q] === '{') { out += src.slice(p, q + 1) + ' await __yield();'; i = q + 1; }
    else if (src[q] === ';') { out += ' { await __yield(); }'; i = q + 1; }
    else {
      const end = src.indexOf(';', q);
      out += ' { await __yield(); ' + src.slice(q, end + 1) + ' }';
      i = end + 1;
    }
    re.lastIndex = i;
  }
  return out + src.slice(i);
}

function closeAwaitParens(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const k = src.indexOf('(await ', i);
    if (k < 0) { out += src.slice(i); break; }
    out += src.slice(i, k + 7);
    // find the call's "(" after the name
    let j = k + 7;
    while (j < src.length && /\w/.test(src[j])) j++;
    // src[j] should be "("
    let depth = 0;
    let p = j;
    let inStr = null;
    for (; p < src.length; p++) {
      const c = src[p];
      if (inStr) { if (c === '\\') { p++; continue; } if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
    }
    out += src.slice(k + 7, p + 1) + ')';
    i = p + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------- MCU

export class MCU {
  constructor(hw) {
    this.hw = hw; // { readPin(pin, mcu) -> volts|null, onOutput(pin, state), serialOut(text), tone(pin,f), noTone(pin) }
    this.reset();
  }

  reset() {
    this.mode = new Array(22).fill('INPUT');
    this.out = new Array(22).fill(0);
    this.pwm = new Array(22).fill(null);
    this.tones = {};
    this.t0 = performance.now();
    this.running = false;
    this.serialIn = '';
    this.interrupts = [];
    this.servos = {};
    this.speed = 1;
    this.wcount = {};
  }

  millis() { return Math.floor((performance.now() - this.t0) * this.speed); }

  voltage(pin) {
    if (this.mode[pin] === 'OUTPUT') return this.out[pin] ? 5 : 0;
    const v = this.hw.readPin(pin, this);
    if (v == null) {
      if (this.mode[pin] === 'INPUT_PULLUP') return 5;
      return Math.random() < 0.5 ? 0.2 + Math.random() * 0.8 : 3.8 + Math.random();
    }
    if (this.mode[pin] === 'INPUT_PULLUP' && v === 'float') return 5;
    return v;
  }
}

export function makeApi(mcu, hw) {
  const gen = (mcu.gen = (mcu.gen || 0) + 1); // each run gets its own generation; older runs stop themselves
  const alive = () => mcu.running && mcu.gen === gen;
  const HIGH = 1, LOW = 0;
  const pinNum = (p) => (typeof p === 'string' && p in PIN ? PIN[p] : +p);
  const api = {
    __gen: gen,
    HIGH, LOW, INPUT: 'INPUT', OUTPUT: 'OUTPUT', INPUT_PULLUP: 'INPUT_PULLUP',
    CHANGE: 'CHANGE', RISING: 'RISING', FALLING: 'FALLING',
    LED_BUILTIN: 13, true: true, false: false, HEX: 16, DEC: 10, BIN: 2, OCT: 8,
    A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, A7: 21,
    PI: Math.PI, DHT11: 11, DHT22: 22, WHITE: 1, BLACK: 0, INVERSE: 2,
    SSD1306_SWITCHCAPVCC: 2, SSD1306_WHITE: 1, SSD1306_BLACK: 0,
    DEVICE_DISABLED_TEMP: -127, DEVICE_DISCONNECTED_C: -127, DEVICE_DISCONNECTED_F: -196.6, ENABLE_LED_FEEDBACK: true, DISABLE_LED_FEEDBACK: false,
    __int: (v) => (typeof v === 'number' && isFinite(v) ? Math.trunc(v) : v),
    __arr: (n) => new Array(Math.max(0, n | 0)).fill(0),
    async __yield() {
      if (!alive()) throw new StopSignal();
      const now = performance.now();
      if (now - (mcu.lastYield || 0) > 12) { mcu.lastYield = now; await new Promise((r) => setTimeout(r, 0)); await hw.pollInterrupts(); }
    },
    pinMode(p, m) {
      p = pinNum(p);
      if ((p === 20 || p === 21) && m !== 'INPUT') hw.warn(`A${p - 14} ใช้ได้แค่ analogRead() (ไม่มีวงจร Digital)`);
      mcu.mode[p] = m;
      hw.onOutput(p, mcu);
    },
    digitalWrite(p, v) {
      p = pinNum(p);
      if (p === 20 || p === 21) { hw.warn('ขา A6/A7 เป็น Analog อย่างเดียว ใช้ digitalWrite ไม่ได้'); return; }
      mcu.out[p] = v ? 1 : 0;
      mcu.pwm[p] = null;
      const wc = (mcu.wcount[p] ||= { h: 0, n: 0 });
      wc.n++;
      if (v) wc.h++;
      if (mcu.mode[p] !== 'OUTPUT') mcu.mode[p] = v ? 'INPUT_PULLUP' : 'INPUT';
      hw.onOutput(p, mcu);
    },
    digitalRead(p) {
      p = pinNum(p);
      if (p === 20 || p === 21) { hw.warn('digitalRead(A6/A7) ใช้ไม่ได้บน Nano: ใช้ analogRead แทน'); return 0; }
      return mcu.voltage(p) >= 2.5 ? 1 : 0;
    },
    analogRead(p) {
      p = pinNum(p);
      if (p >= 0 && p <= 7 && typeof p === 'number' && !(p >= 14)) p += 14; // analogRead(0) == A0
      const v = mcu.voltage(p);
      return Math.max(0, Math.min(1023, Math.round((v / 5) * 1023 + (Math.random() - 0.5) * 2)));
    },
    analogWrite(p, v) {
      p = pinNum(p);
      v = Math.max(0, Math.min(255, v | 0));
      const pwmPins = [3, 5, 6, 9, 10, 11];
      if (!pwmPins.includes(p)) {
        hw.warn(`ขา ${p} ไม่รองรับ PWM: analogWrite ให้ผลแค่เปิด/ปิด`);
        mcu.out[p] = v >= 128 ? 1 : 0;
        mcu.pwm[p] = null;
      } else {
        mcu.pwm[p] = v;
        mcu.out[p] = v > 0 ? 1 : 0;
      }
      mcu.mode[p] = 'OUTPUT';
      hw.onOutput(p, mcu);
    },
    tone(p, f, d) {
      p = pinNum(p);
      mcu.tones[p] = f;
      hw.tone(p, f);
      if (d) setTimeout(() => { if (mcu.tones[p] === f) { delete mcu.tones[p]; hw.noTone(p); } }, d / mcu.speed);
    },
    noTone(p) { p = pinNum(p); delete mcu.tones[p]; hw.noTone(p); },
    millis: () => mcu.millis(),
    micros: () => Math.floor((performance.now() - mcu.t0) * 1000 * mcu.speed),
    async delay(ms) {
      if (!alive()) throw new StopSignal();
      const end = performance.now() + ms / mcu.speed;
      while (performance.now() < end) {
        await new Promise((r) => setTimeout(r, Math.min(25, end - performance.now())));
        if (!alive()) throw new StopSignal();
        await hw.pollInterrupts();
      }
    },
    async delayMicroseconds(us) { await api.delay(us / 1000); },
    async pulseIn(p, level, timeout = 1000000) { await api.delay(5); return 0; },
    map: (x, a, b, c, d) => Math.trunc(((x - a) * (d - c)) / (b - a) + c),
    constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, sq: (x) => x * x,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    isnan: isNaN, isNaN,
    random(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.floor(Math.random() * (b - a)); },
    randomSeed() {},
    bitRead: (v, b) => (v >> b) & 1,
    lowByte: (v) => v & 0xff, highByte: (v) => (v >> 8) & 0xff,
    noInterrupts() {}, interrupts() {},
    digitalPinToInterrupt: (p) => (pinNum(p) === 2 ? 0 : pinNum(p) === 3 ? 1 : -1),
    attachInterrupt(n, fn, mode) {
      const pin = n === 0 ? 2 : n === 1 ? 3 : null;
      if (pin == null) { hw.warn('attachInterrupt ใช้ได้เฉพาะขา D2/D3 บน Nano'); return; }
      mcu.interrupts.push({ pin, fn, mode, last: api.digitalRead(pin) });
    },
    detachInterrupt(n) { mcu.interrupts = mcu.interrupts.filter((i) => i.pin !== (n === 0 ? 2 : 3)); },
    String: (v, base) => (typeof v === 'number' && base ? v.toString(base).toUpperCase() : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v)),
    Serial: {
      begin(b) { hw.serialBegin(b); },
      print(v, fmt) { hw.serialOut(fmtValue(v, fmt)); },
      println(v = '', fmt) { hw.serialOut(fmtValue(v, fmt) + '\n'); },
      write(v) { hw.serialOut(typeof v === 'number' ? String.fromCharCode(v) : String(v)); },
      available: () => mcu.serialIn.length,
      read() { if (!mcu.serialIn.length) return -1; const c = mcu.serialIn.charCodeAt(0); mcu.serialIn = mcu.serialIn.slice(1); return c; },
      readString() { const s = mcu.serialIn; mcu.serialIn = ''; return s; },
      readStringUntil(ch) { const i = mcu.serialIn.indexOf(ch); const s = i < 0 ? mcu.serialIn : mcu.serialIn.slice(0, i); mcu.serialIn = i < 0 ? '' : mcu.serialIn.slice(i + 1); return s; },
      parseInt() { const m = mcu.serialIn.match(/-?\d+/); if (!m) return 0; mcu.serialIn = mcu.serialIn.slice(m.index + m[0].length); return +m[0]; },
      flush() {},
    },
    Wire: { begin() {}, beginTransmission() {}, write() {}, endTransmission: () => 0, requestFrom: () => 0, available: () => 0, read: () => 0, onReceive() {}, onRequest() {}, setClock() {} },
    SPI: { begin() {} },
  };

  // --- libraries ---
  api.Servo = class {
    attach(p) { this.pin = pinNum(p); mcu.servos[this.pin] = 90; hw.onServo(this.pin, 90); }
    write(a) { a = Math.max(0, Math.min(180, a)); mcu.servos[this.pin] = a; hw.onServo(this.pin, a); }
    read() { return mcu.servos[this.pin] ?? 90; }
    writeMicroseconds(us) { this.write(Math.round(((us - 544) / (2400 - 544)) * 180)); }
    detach() {}
    attached() { return this.pin != null; }
  };
  api.Adafruit_SSD1306 = class {
    constructor(w = 128, h = 64) { if (w < 16) { w = 128; h = 64; } this.w = w; this.h = h; this.oled = hw.oled; }
    begin() { this.oled.begin(); return true; }
    clearDisplay() { this.oled.clear(); }
    display() { this.oled.flush(); }
    setTextSize(s) { this.oled.size = s; }
    setTextColor(c, bg) { this.oled.color = c; this.oled.bg = bg; }
    setCursor(x, y) { this.oled.x = x; this.oled.y = y; }
    print(v, d) { this.oled.print(typeof v === 'number' && d != null && !Number.isInteger(v) ? v.toFixed(d) : fmtValue(v, d)); }
    println(v = '', d) { this.print(v, d); this.oled.newline(); }
    drawPixel(x, y, c) { this.oled.pixel(x, y, c); }
    drawLine(a, b, c, d, col) { this.oled.line(a, b, c, d, col); }
    drawRect(x, y, w, h, c) { this.oled.rect(x, y, w, h, c, false); }
    fillRect(x, y, w, h, c) { this.oled.rect(x, y, w, h, c, true); }
    drawCircle(x, y, r, c) { this.oled.circle(x, y, r, c, false); }
    fillCircle(x, y, r, c) { this.oled.circle(x, y, r, c, true); }
    invertDisplay() {}
    width() { return 128; }
    height() { return 64; }
  };
  api.DHT = class {
    constructor(pin, type) { this.pin = pinNum(pin); this.type = type; }
    begin() {}
    readTemperature(f) { const e = hw.sensorAt(this.pin, 'dht'); if (!e) return NaN; return f ? e.temperature * 1.8 + 32 : e.temperature; }
    readHumidity() { const e = hw.sensorAt(this.pin, 'dht'); return e ? e.humidity : NaN; }
    computeHeatIndex(t) { return t; }
  };
  api.OneWire = class { constructor(pin) { this.pin = pinNum(pin); } };
  api.DallasTemperature = class {
    constructor(ow) { this.pin = ow.pin; }
    begin() {}
    requestTemperatures() {}
    getDeviceCount() { return hw.sensorAt(this.pin, 'ds18b20') ? 1 : 0; }
    getTempCByIndex() { const e = hw.sensorAt(this.pin, 'ds18b20'); return e ? Math.round(e.temperature * 16) / 16 : -127; }
    getTempFByIndex(i) { const c = this.getTempCByIndex(i); return c === -127 ? -196.6 : c * 1.8 + 32; }
    toFahrenheit(c) { return c * 1.8 + 32; }
    static toFahrenheit(c) { return c * 1.8 + 32; }
    setResolution() {}
  };
  api.IrReceiver = {
    pin: null,
    decodedIRData: { command: 0, address: 0, protocol: 8, flags: 0 },
    begin(pin) { this.pin = pinNum(pin); },
    decode() {
      const ev = hw.irReceive(this.pin);
      if (!ev) return false;
      this.decodedIRData = { command: ev.command, address: 0, protocol: 8, flags: ev.repeat ? 1 : 0, decodedRawData: ev.raw };
      return true;
    },
    resume() {},
    printIRResultShort(s) { s.println(`Protocol=NEC Address=0x0 Command=0x${this.decodedIRData.command.toString(16).toUpperCase()}`); },
  };
  api.IrSender = { begin(pin) { this.pin = pinNum(pin); }, sendNEC(addr, cmd) { hw.irSend(this.pin, cmd); } };
  api.IRDATA_FLAGS_IS_REPEAT = 1;
  api.getProtocolString = () => 'NEC';
  api.UNKNOWN = 0;
  api.printIRResultShort = (ser) => api.IrReceiver.printIRResultShort(ser);
  api.NEC = 8;
  api.Adafruit_ADS1115 = class { begin() { return true; } setGain() {} readADC_SingleEnded(ch) { return hw.adsRead(ch); } computeVolts(v) { return (v * 6.144) / 32768; } };
  api.GAIN_TWOTHIRDS = 0;
  return api;
}

export class StopSignal extends Error {}

function fmtValue(v, fmt) {
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') {
    if (fmt === 16 || fmt === 2 || fmt === 8) return Math.trunc(v).toString(fmt).toUpperCase();
    if (typeof fmt === 'number' && fmt >= 0 && fmt < 8 && !Number.isInteger(v)) return v.toFixed(fmt);
    if (!Number.isInteger(v)) return Number.isNaN(v) ? 'nan' : v.toFixed(2);
    return String(v);
  }
  return String(v);
}

/** Compile + run a sketch. Returns a controller with stop(). */
export async function runSketch(code, hw, mcu) {
  const js = transpile(code);
  const api = makeApi(mcu, hw);
  let factory;
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    factory = new AsyncFunction('__api', `with (__api) {\n${js}\n}`);
  } catch (e) {
    const err = new TranspileError(e.message);
    err.js = js;
    throw err;
  }
  mcu.reset();
  mcu.running = true;
  hw.onReset?.();
  const main = (async () => {
    const prog = await factory(api);
    if (prog.setup) await prog.setup();
    let last = performance.now();
    while (mcu.running && mcu.gen === api.__gen) {
      if (prog.loop) await prog.loop();
      else await api.delay(50);
      await hw.pollInterrupts();
      if (performance.now() - last > 12) {
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
  })();
  main.catch((e) => {
    if (e instanceof StopSignal || mcu.gen !== api.__gen) return;
    mcu.running = false;
    hw.error(e);
  });
  return { stop() { if (mcu.gen === api.__gen) mcu.running = false; }, js };
}
