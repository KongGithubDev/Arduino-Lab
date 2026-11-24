// 128x64 SSD1306 emulation rendered to a canvas (used as an emissive texture).
import * as THREE from 'three';

// 5x7 font (ASCII 32..126), column-major bytes, classic Adafruit glcdfont subset generated at runtime
const FONT_W = 6, FONT_H = 8;

export class Oled {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 64;
    this.g = this.canvas.getContext('2d');
    this.buf = new Uint8Array(128 * 64);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false; // matches the UV layout of the exported oled_screen plane
    this.glyphs = this.makeGlyphs();
    this.on = false;
    this.reset();
  }

  makeGlyphs() {
    // rasterise a monospace font once into 5x7 bitmaps
    const c = document.createElement('canvas');
    c.width = 8; c.height = 10;
    const g = c.getContext('2d', { willReadFrequently: true });
    const glyphs = {};
    for (let code = 32; code < 127; code++) {
      g.clearRect(0, 0, 8, 10);
      g.fillStyle = '#fff';
      g.font = 'bold 9px "Courier New", monospace';
      g.textBaseline = 'top';
      g.fillText(String.fromCharCode(code), 0, -1);
      const d = g.getImageData(0, 0, 6, 8).data;
      const bits = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) bits.push(d[(y * 6 + x) * 4 + 3] > 110 ? 1 : 0);
      glyphs[code] = bits;
    }
    return glyphs;
  }

  reset() {
    this.buf.fill(0);
    this.x = 0; this.y = 0; this.size = 1; this.color = 1; this.bg = null;
    this.on = false;
    this.flush(true);
  }

  begin() { this.on = true; this.clear(); this.flush(); }
  clear() { this.buf.fill(0); }

  pixel(x, y, c = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= 128 || y >= 64) return;
    this.buf[y * 128 + x] = c === 2 ? 1 - this.buf[y * 128 + x] : c ? 1 : 0;
  }

  print(s) {
    for (const ch of String(s)) {
      if (ch === '\n') { this.newline(); continue; }
      const bits = this.glyphs[ch.charCodeAt(0)] || this.glyphs[63];
      if (this.x + FONT_W * this.size > 128) this.newline();
      for (let yy = 0; yy < FONT_H; yy++) for (let xx = 0; xx < FONT_W; xx++) {
        const on = bits[yy * FONT_W + xx];
        if (!on && this.bg == null) continue;
        const c = on ? this.color : this.bg;
        for (let a = 0; a < this.size; a++) for (let b = 0; b < this.size; b++) this.pixel(this.x + xx * this.size + a, this.y + yy * this.size + b, c);
      }
      this.x += FONT_W * this.size;
    }
  }

  newline() { this.x = 0; this.y += FONT_H * this.size; }

  line(x0, y0, x1, y1, c = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.pixel(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  }

  rect(x, y, w, h, c, fill) {
    if (fill) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.pixel(x + i, y + j, c); return; }
    this.line(x, y, x + w - 1, y, c); this.line(x, y + h - 1, x + w - 1, y + h - 1, c);
    this.line(x, y, x, y + h - 1, c); this.line(x + w - 1, y, x + w - 1, y + h - 1, c);
  }

  circle(cx, cy, r, c, fill) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (fill ? d <= r * r : Math.abs(Math.sqrt(d) - r) < 0.6) this.pixel(cx + x, cy + y, c);
    }
  }

  flush(blank = false) {
    const img = this.g.createImageData(128, 64);
    for (let i = 0; i < 128 * 64; i++) {
      const on = !blank && this.on && this.buf[i];
      // yellow top band (first 16 rows) + cyan body like common two-colour 0.96" modules
      const top = i < 128 * 16;
      img.data[i * 4] = on ? (top ? 255 : 120) : 2;
      img.data[i * 4 + 1] = on ? (top ? 214 : 214) : 3;
      img.data[i * 4 + 2] = on ? (top ? 64 : 255) : 6;
      img.data[i * 4 + 3] = 255;
    }
    this.g.putImageData(img, 0, 0);
    this.texture.needsUpdate = true;
  }
}
