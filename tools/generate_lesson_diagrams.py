"""Generate the concept illustrations used by lessons/*.md.

Output: assets/diagrams/lessons/*.png

    python tools/generate_lesson_diagrams.py
"""
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "diagrams" / "lessons"
FONT_DIR = Path("C:/Windows/Fonts")
REG = FONT_DIR / "LeelawUI.ttf"
BOLD = FONT_DIR / "LeelaUIb.ttf"
MONO = FONT_DIR / "consolab.ttf"
S = 2

BG = (248, 250, 252)
INK = (15, 23, 42)
MUTED = (100, 116, 139)
LINE = (203, 213, 225)
CARD = (255, 255, 255)
BLUE = (37, 99, 235)
GREEN = (22, 163, 74)
RED = (220, 38, 38)
AMBER = (217, 119, 6)
PURPLE = (147, 51, 234)
CYAN = (8, 145, 178)
GRAY = (148, 163, 184)
DARK = (30, 41, 59)
PCB = (22, 101, 52)


def F(size, bold=False, mono=False):
    p = MONO if mono else (BOLD if bold else REG)
    return ImageFont.truetype(str(p), int(size * S))


class Canvas:
    def __init__(self, w, h, title, subtitle=None):
        self.w, self.h = w, h
        self.img = Image.new("RGB", (w * S, h * S), BG)
        self.d = ImageDraw.Draw(self.img)
        self.text(36, 26, title, F(28, True))
        if subtitle:
            self.text(36, 66, subtitle, F(17), MUTED)

    def text(self, x, y, s, f=None, fill=INK, anchor="la"):
        f = f or F(17)
        if "→" in s:  # Leelawadee has no arrow glyph; Tahoma has Thai + arrows
            bold = "b" in Path(f.path).stem.lower()[-1:] or "UIb" in f.path
            f = ImageFont.truetype(str(FONT_DIR / ("tahomabd.ttf" if bold else "tahoma.ttf")), f.size)
        self.d.text((x * S, y * S), s, font=f, fill=fill, anchor=anchor)

    def box(self, x0, y0, x1, y1, fill=CARD, outline=LINE, r=12, w=2, label=None, lf=None, lfill=INK):
        self.d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill, outline=outline, width=int(w * S))
        if label:
            lines = label.split("\n")
            lf = lf or F(18, True)
            lh = 26
            cy = (y0 + y1) / 2 - (len(lines) - 1) * lh / 2
            for i, ln in enumerate(lines):
                self.text((x0 + x1) / 2, cy + i * lh, ln, lf, lfill, "mm")

    def line(self, pts, fill=INK, w=3):
        self.d.line([(x * S, y * S) for x, y in pts], fill=fill, width=int(w * S), joint="curve")

    def arrow(self, p0, p1, fill=INK, w=3, head=12):
        self.line([p0, p1], fill, w)
        ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        a1 = (p1[0] - head * math.cos(ang - 0.45), p1[1] - head * math.sin(ang - 0.45))
        a2 = (p1[0] - head * math.cos(ang + 0.45), p1[1] - head * math.sin(ang + 0.45))
        self.d.polygon([(p1[0] * S, p1[1] * S), (a1[0] * S, a1[1] * S), (a2[0] * S, a2[1] * S)], fill=fill)

    def circle(self, cx, cy, r, fill=None, outline=None, w=2):
        self.d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=fill, outline=outline, width=int(w * S))

    def dashed(self, p0, p1, fill=MUTED, w=2, dash=8):
        x0, y0 = p0
        x1, y1 = p1
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / dash))
        for i in range(0, n, 2):
            a = (x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)
            b = (x0 + (x1 - x0) * min(i + 1, n) / n, y0 + (y1 - y0) * min(i + 1, n) / n)
            self.line([a, b], fill, w)

    def wave(self, x0, y_hi, y_lo, segs, fill=BLUE, w=3):
        """segs: list of (duration_px, level 0/1)."""
        pts = []
        x = x0
        prev = None
        for dur, lvl in segs:
            y = y_hi if lvl else y_lo
            if prev is not None and prev != y:
                pts.append((x, prev))
            pts.append((x, y))
            x += dur
            pts.append((x, y))
            prev = y
        self.line(pts, fill, w)
        return x

    def save(self, name):
        OUT.mkdir(parents=True, exist_ok=True)
        self.img.resize((self.w, self.h), Image.LANCZOS).save(OUT / name, optimize=True)
        print("OK", name)


# ---------------------------------------------------------------- figures

def board_port_map():
    c = Canvas(1200, 760, "แผนผังพอร์ต Lotus Nano Bot", "สีเขียว = ต่ออุปกรณ์ภายนอกได้ · สีส้ม = ใช้ได้แต่ต้องระวัง · สีเทา = อุปกรณ์บนบอร์ดใช้อยู่")
    digital = [
        ("D0", "RX · Serial / Bluetooth", AMBER), ("D1", "TX · Serial / Bluetooth", AMBER),
        ("D2", "ปุ่ม OK บนบอร์ด", GRAY), ("D3", "ภายนอก + Buzzer บนบอร์ด (PWM)", AMBER),
        ("D4", "มอเตอร์ซ้าย IN2", GRAY), ("D5", "มอเตอร์ซ้าย PWM", GRAY),
        ("D6", "มอเตอร์ขวา PWM", GRAY), ("D7", "มอเตอร์ขวา IN1", GRAY),
        ("D8", "มอเตอร์ขวา IN2", GRAY), ("D9", "มอเตอร์ซ้าย IN1", GRAY),
        ("D10", "Servo SV1", GRAY), ("D11", "Servo SV2", GRAY),
        ("D12", "Servo SV3", GRAY), ("D13", "LED บนบอร์ด Nano", GREEN),
    ]
    analog = [
        ("A0", "ภายนอก · Analog / Digital 14", GREEN), ("A1", "ภายนอก · Analog / Digital 15", GREEN),
        ("A2", "ภายนอก · Analog / Digital 16", GREEN), ("A3", "ภายนอก · Analog / Digital 17", GREEN),
        ("A4", "I2C SDA · OLED, Compass, ADS1115", GRAY), ("A5", "I2C SCL · OLED, Compass, ADS1115", GRAY),
        ("A6", "ภายนอก · Analog อย่างเดียว", GREEN), ("A7", "Knob บนบอร์ด", GRAY),
    ]

    def col(x, title, rows):
        c.text(x, 108, title, F(20, True))
        for i, (pin, desc, color) in enumerate(rows):
            y = 140 + i * 42
            light = tuple(int(v + (255 - v) * 0.85) for v in color)
            c.box(x, y, x + 480, y + 36, fill=light, outline=color, r=8, w=2)
            c.box(x, y, x + 70, y + 36, fill=color, outline=color, r=8, w=2)
            c.text(x + 35, y + 18, pin, F(18, mono=True), (255, 255, 255), "mm")
            c.text(x + 86, y + 18, desc, F(16), INK, "lm")

    col(40, "Digital", digital)
    col(660, "Analog", analog)
    c.box(660, 500, 1140, 640, fill=(240, 253, 244), outline=GREEN, label=None)
    c.text(680, 518, "พอร์ตแนะนำสำหรับเซนเซอร์ภายนอก", F(18, True), GREEN)
    c.text(680, 552, "Digital: A0-A3 (14-17), D3", F(17))
    c.text(680, 580, "Analog: A0-A3, A6", F(17))
    c.text(680, 608, "ไฟเลี้ยง: 5V และ GND ที่ขั้วต่อเซนเซอร์", F(17))
    c.save("board-port-map.png")


def setup_loop():
    c = Canvas(1000, 560, "โครงสร้างโปรแกรม Arduino", "setup() ทำครั้งเดียว แล้ว loop() ทำซ้ำตลอดไป")
    c.box(390, 110, 610, 160, fill=DARK, outline=DARK, r=25, label="เปิดเครื่อง / Reset", lfill=(255, 255, 255))
    c.arrow((500, 160), (500, 200))
    c.box(340, 200, 660, 290, fill=(239, 246, 255), outline=BLUE, label="setup()\npinMode, Serial.begin, ...", lf=F(18, True))
    c.arrow((500, 290), (500, 330))
    c.box(340, 330, 660, 440, fill=(240, 253, 244), outline=GREEN, label="loop()\nอ่านเซนเซอร์ → ตัดสินใจ → สั่งงาน", lf=F(18, True))
    c.line([(660, 385), (760, 385), (760, 300), (720, 300)], GREEN, 4)
    c.arrow((720, 300), (662, 340), GREEN, 4)
    c.text(775, 340, "วนซ้ำ", F(18, True), GREEN)
    c.text(775, 368, "ไม่มีวันจบ", F(16), MUTED)
    c.text(60, 230, "ทำครั้งเดียว", F(18, True), BLUE)
    c.text(60, 258, "ตั้งค่าเริ่มต้น", F(16), MUTED)
    c.text(60, 370, "ทำซ้ำหลายพันครั้ง/วินาที", F(18, True), GREEN)
    c.text(60, 398, "(ถ้าไม่มี delay)", F(16), MUTED)
    c.save("setup-loop.png")


def draw_resistor(c, x, y0, y1):
    c.line([(x, y0), (x, y0 + 20)])
    pts = [(x, y0 + 20)]
    n = 6
    h = (y1 - y0 - 40) / n
    for i in range(n):
        pts.append((x + (12 if i % 2 == 0 else -12), y0 + 20 + h * (i + 0.5)))
    pts.append((x, y1 - 20))
    c.line(pts, INK, 3)
    c.line([(x, y1 - 20), (x, y1)])


def pullup_active_low():
    c = Canvas(1200, 600, "Pull-up และ Active LOW", "INPUT_PULLUP ต่อตัวต้านทานภายในไปที่ 5V ไว้ให้ ทำให้ขาไม่ลอย")
    for k, (px, pressed) in enumerate(((60, False), (640, True))):
        c.box(px, 100, px + 500, 560, fill=CARD)
        c.text(px + 250, 130, "ไม่กดสวิตช์" if not pressed else "กดสวิตช์", F(22, True), INK, "mm")
        x = px + 150
        c.text(x, 175, "5V", F(18, True), RED, "mm")
        c.line([(x - 30, 190), (x + 30, 190)], RED, 4)
        draw_resistor(c, x, 190, 320)
        c.text(x + 22, 255, "Pull-up\n(ภายในชิป)", F(14), MUTED)
        c.circle(x, 320, 6, fill=INK)
        c.line([(x, 320), (x + 160, 320)])
        c.box(x + 160, 300, x + 320, 340, fill=(239, 246, 255), outline=BLUE, r=8, label="ขา D14", lf=F(16, True))
        c.line([(x, 320), (x, 380)])
        # switch
        if pressed:
            c.line([(x, 380), (x, 440)], GREEN, 4)
        else:
            c.line([(x, 380), (x + 30, 430)], INK, 4)
        c.circle(x, 380, 5, fill=INK)
        c.circle(x, 440, 5, fill=INK)
        c.line([(x, 440), (x, 480)])
        c.line([(x - 30, 480), (x + 30, 480)], INK, 4)
        c.line([(x - 18, 490), (x + 18, 490)], INK, 3)
        c.line([(x - 6, 500), (x + 6, 500)], INK, 2)
        c.text(x - 50, 410, "สวิตช์", F(15), MUTED, "rm")
        c.text(x + 45, 482, "GND", F(16, True), MUTED, "lm")
        res = "อ่านได้ HIGH (1)" if not pressed else "อ่านได้ LOW (0)"
        col = BLUE if not pressed else GREEN
        c.text(x + 240, 400, res, F(20, True), col, "mm")
        c.text(x + 240, 432, "กระแสไม่ไหล" if not pressed else "กระแสไหลลง GND", F(15), MUTED, "mm")
        if pressed:
            c.line([(x + 4, 200), (x + 4, 470)], (134, 239, 172), 2)
    c.save("pullup-active-low.png")


def debounce():
    c = Canvas(1200, 520, "สวิตช์เด้ง (Bounce) และ Debounce", "หน้าสัมผัสโลหะกระเด้งหลายครั้งก่อนนิ่ง ต้องรอให้สัญญาณนิ่งก่อนอ่านค่า")
    c.text(40, 150, "สัญญาณที่ต้องการ", F(17, True), GREEN)
    c.wave(260, 130, 180, [(200, 1), (700, 0)], GREEN, 4)
    c.text(40, 290, "สัญญาณจริง", F(17, True), RED)
    segs = [(200, 1), (12, 0), (10, 1), (18, 0), (8, 1), (25, 0), (6, 1), (600, 0)]
    c.wave(260, 270, 320, segs, RED, 4)
    c.d.rectangle([460 * S, 250 * S, 560 * S, 340 * S], outline=AMBER, width=2 * S)
    c.text(510, 360, "เด้ง ~1-10 ms", F(15), AMBER, "mm")
    c.text(40, 430, "Debounce", F(17, True), BLUE)
    c.d.rectangle([460 * S, 405 * S, 610 * S, 455 * S], fill=(254, 243, 199))
    c.text(535, 430, "รอ 50 ms", F(15, True), AMBER, "mm")
    c.wave(260, 410, 450, [(350, 1), (550, 0)], BLUE, 4)
    c.text(620, 470, "อ่านค่าหลังสัญญาณนิ่ง → นับ 1 ครั้ง", F(16), BLUE)
    c.save("debounce.png")


def pwm_duty_cycle():
    c = Canvas(1200, 640, "PWM (Pulse Width Modulation)", "เปิด-ปิดเร็วมาก (~490 Hz) แล้วปรับสัดส่วนเวลาที่เปิด = ปรับแรงดันเฉลี่ย/ความสว่าง")
    rows = [(0, 0), (25, 64), (50, 127), (75, 191), (100, 255)]
    for i, (duty, val) in enumerate(rows):
        y = 120 + i * 100
        c.text(40, y + 30, f"{duty}%", F(22, True), INK)
        c.text(40, y + 58, f"analogWrite = {val}", F(14, mono=True), MUTED)
        period = 160
        segs = []
        for _ in range(4):
            on = period * duty / 100
            if on > 0:
                segs.append((on, 1))
            if period - on > 0:
                segs.append((period - on, 0))
        c.wave(260, y + 15, y + 70, segs, BLUE, 3)
        avg = 5 * duty / 100
        c.dashed((260, y + 70 - 55 * duty / 100), (900, y + 70 - 55 * duty / 100), AMBER, 2)
        c.text(940, y + 42, f"≈ {avg:.2f} V", F(18, True), AMBER, "lm")
        b = int(255 * duty / 100)
        glow = (255, 255 - int(b * 0.3), 255 - b)
        c.circle(1110, y + 42, 26, fill=glow if duty else (226, 232, 240), outline=(234, 179, 8) if duty else GRAY, w=3)
    c.save("pwm-duty-cycle.png")


def rgb_color_mixing():
    w, h = 1200, 600
    c = Canvas(w, h, "การผสมสีแสง RGB", "เปิด/ปิดแต่ละสี (Digital) ได้ 8 แบบ: 7 สี + ดับ")
    layer = Image.new("RGB", (480 * S, 440 * S), (0, 0, 0))
    for col, (cx, cy) in zip([(255, 0, 0), (0, 255, 0), (0, 0, 255)], [(170, 160), (310, 160), (240, 280)]):
        l2 = Image.new("RGB", layer.size, (0, 0, 0))
        ImageDraw.Draw(l2).ellipse([(cx - 120) * S, (cy - 120) * S, (cx + 120) * S, (cy + 120) * S], fill=col)
        layer = ImageChops.add(layer, l2)
    mask = Image.new("L", layer.size, 0)
    md = ImageDraw.Draw(mask)
    for cx, cy in [(170, 160), (310, 160), (240, 280)]:
        md.ellipse([(cx - 120) * S, (cy - 120) * S, (cx + 120) * S, (cy + 120) * S], fill=255)
    c.img.paste(layer, (30 * S, 110 * S), mask)
    combos = [("1 0 0", "แดง", (255, 0, 0)), ("0 1 0", "เขียว", (0, 200, 0)), ("0 0 1", "น้ำเงิน", (0, 0, 255)),
              ("1 1 0", "เหลือง", (255, 220, 0)), ("0 1 1", "ฟ้า (Cyan)", (0, 220, 220)), ("1 0 1", "ม่วง (Magenta)", (230, 0, 230)),
              ("1 1 1", "ขาว", (255, 255, 255)), ("0 0 0", "ดับ", (40, 40, 40))]
    c.text(600, 110, "R G B", F(18, True, ), INK)
    c.text(760, 110, "สีที่ได้", F(18, True), INK)
    for i, (code, name, col) in enumerate(combos):
        y = 145 + i * 52
        c.text(600, y + 20, code, F(20, mono=True), INK, "lm")
        c.box(700, y, 740, y + 40, fill=col, outline=LINE, r=6)
        c.text(760, y + 20, name, F(18), INK, "lm")
    c.save("rgb-color-mixing.png")


def relay_principle():
    c = Canvas(1200, 560, "หลักการทำงานของรีเลย์", "ไฟเล็กจาก Arduino ควบคุมขดลวด → ดึงหน้าสัมผัสให้ต่อวงจรของโหลดอีกฝั่ง (แยกวงจรกัน)")
    c.box(40, 150, 360, 470, fill=(239, 246, 255), outline=BLUE)
    c.text(200, 180, "ฝั่งควบคุม (5V)", F(20, True), BLUE, "mm")
    c.box(80, 230, 200, 290, fill=PCB, outline=PCB, label="Arduino\nA0", lfill=(255, 255, 255), lf=F(15, True))
    c.arrow((200, 260), (250, 260), BLUE, 3)
    for i in range(5):
        c.d.arc([(250 + i * 16) * S, 240 * S, (270 + i * 16) * S, 280 * S], 180, 360, fill=AMBER, width=4 * S)
    c.text(290, 310, "ขดลวด (Coil)", F(16), AMBER, "mm")
    c.text(200, 380, "HIGH → มีกระแสในขดลวด", F(16), INK, "mm")
    c.text(200, 408, "เกิดสนามแม่เหล็ก", F(16), INK, "mm")
    c.arrow((370, 260), (520, 260), AMBER, 3)
    c.text(445, 240, "ดูด", F(16, True), AMBER, "mm")
    c.box(530, 150, 1160, 470, fill=(254, 242, 242), outline=RED)
    c.text(845, 180, "ฝั่งโหลด (แยกจาก Arduino)", F(20, True), RED, "mm")
    c.circle(600, 300, 8, fill=INK)
    c.text(600, 330, "COM", F(16, True), INK, "mm")
    c.circle(720, 250, 8, fill=INK)
    c.text(720, 225, "NO", F(16, True), GREEN, "mm")
    c.circle(720, 350, 8, fill=INK)
    c.text(720, 380, "NC", F(16, True), MUTED, "mm")
    c.line([(600, 300), (712, 254)], GREEN, 5)
    c.line([(728, 250), (880, 250)], INK, 3)
    c.circle(920, 250, 34, fill=(254, 249, 195), outline=AMBER, w=3)
    c.text(920, 250, "โหลด", F(15, True), INK, "mm")
    c.line([(954, 250), (1060, 250), (1060, 420), (560, 420), (560, 300), (592, 300)], INK, 3)
    c.box(1010, 300, 1110, 360, fill=CARD, outline=INK, label="แหล่งจ่าย\n≤ 12V DC", lf=F(14, True))
    c.text(845, 450, "NO = ปกติเปิด (ต่อเมื่อรีเลย์ทำงาน) · NC = ปกติปิด", F(15), MUTED, "mm")
    c.text(600, 520, "ห้องเรียน: ใช้กับไฟต่ำ (≤ 12V DC) เท่านั้น ห้ามต่อไฟบ้าน 220V", F(18, True), RED, "mm")
    c.save("relay-principle.png")


def adc_ao_do():
    c = Canvas(1200, 600, "Analog → Digital: ADC และเอาต์พุต AO / DO", "โมดูลส่วนใหญ่มีทั้ง AO (ค่าต่อเนื่อง) และ DO (ผ่านวงจรเปรียบเทียบ LM393 + Trimpot)")
    c.box(40, 220, 220, 340, fill=(254, 249, 195), outline=AMBER, label="เซนเซอร์\n(LDR, NTC, ...)", lf=F(17, True))
    c.line([(220, 280), (300, 280)], INK, 3)
    c.circle(300, 280, 6, fill=INK)
    c.arrow((300, 280), (300, 170), BLUE, 3)
    c.arrow((300, 170), (520, 170), BLUE, 3)
    c.text(410, 150, "AO", F(18, True), BLUE, "mm")
    c.arrow((300, 280), (300, 400), GREEN, 3)
    c.arrow((300, 400), (360, 400), GREEN, 3)
    c.d.polygon([(360 * S, 350 * S), (360 * S, 450 * S), (450 * S, 400 * S)], fill=(240, 253, 244), outline=GREEN, width=3 * S)
    c.text(392, 400, "LM393", F(13, True), GREEN, "mm")
    c.box(330, 470, 410, 520, fill=CARD, outline=MUTED, label="Trimpot", lf=F(14, True))
    c.arrow((370, 470), (380, 440), MUTED, 2)
    c.arrow((450, 400), (520, 400), GREEN, 3)
    c.text(485, 380, "DO", F(18, True), GREEN, "mm")
    c.box(520, 120, 760, 220, fill=(239, 246, 255), outline=BLUE, label="analogRead()\n0 - 1023", lf=F(18, True))
    c.box(520, 350, 760, 450, fill=(240, 253, 244), outline=GREEN, label="digitalRead()\nHIGH / LOW", lf=F(18, True))
    # staircase
    x0, y0 = 820, 330
    c.text(980, 110, "ADC 10 บิต: 0-5V → 1024 ระดับ", F(17, True), INK, "mm")
    c.line([(x0, y0), (x0 + 320, y0)], MUTED, 2)
    c.line([(x0, y0), (x0, y0 - 190)], MUTED, 2)
    c.line([(x0, y0), (x0 + 300, y0 - 180)], AMBER, 3)
    pts = []
    steps = 10
    for i in range(steps):
        x = x0 + i * 30
        y = y0 - i * 18
        pts += [(x, y), (x + 30, y)]
    c.line(pts, BLUE, 3)
    c.text(x0 + 160, y0 + 24, "แรงดันจริง (เส้นส้ม) vs ค่าที่อ่านได้ (ขั้นบันได)", F(14), MUTED, "mm")
    c.box(820, 400, 1160, 540, fill=CARD)
    c.text(840, 420, "V = analogRead × 5.0 / 1023", F(16, mono=True), INK)
    c.text(840, 455, "1 ระดับ ≈ 4.9 mV", F(16), INK)
    c.text(840, 490, "Trimpot ปรับเฉพาะจุดที่ DO สลับ", F(16), INK)
    c.text(840, 515, "ไม่มีผลต่อค่า AO", F(16), INK)
    c.save("adc-ao-do.png")


def hysteresis():
    c = Canvas(1200, 600, "Threshold แบบ Hysteresis", "ใช้ 2 ระดับ (เปิด 40% / ปิด 50%) ป้องกันไฟกระพริบรัวเมื่อค่าอยู่ใกล้ Threshold")
    x0, x1 = 120, 1140
    top, bot = 120, 400
    c.line([(x0, bot), (x1, bot)], MUTED, 2)
    c.line([(x0, bot), (x0, top)], MUTED, 2)
    c.text(x0 - 10, top, "แสง %", F(15), MUTED, "rm")

    def ymap(v):
        return bot - (bot - top) * v / 100

    pts = []
    import random
    random.seed(4)
    vals = []
    for i in range(205):
        t = i / 204
        base = 82 - 62 * math.sin(math.pi * t) ** 1.2
        v = max(5, min(95, base + random.uniform(-4, 4)))
        vals.append(v)
        pts.append((x0 + (x1 - x0) * t, ymap(v)))
    for lvl, col, name in ((50, RED, "OFF_LEVEL 50%"), (40, GREEN, "ON_LEVEL 40%")):
        c.dashed((x0, ymap(lvl)), (x1, ymap(lvl)), col, 2)
        c.text(x1 + 6, ymap(lvl), name, F(13, True), col, "lm") if False else c.text(x0 + 8, ymap(lvl) - 12, name, F(13, True), col)
    c.line(pts, BLUE, 3)
    # lamp state
    state = False
    segs = []
    for v in vals:
        if not state and v < 40:
            state = True
        elif state and v > 50:
            state = False
        segs.append((5, 1 if state else 0))
    c.text(40, 470, "ไฟ", F(17, True), AMBER)
    c.wave(x0, 450, 500, segs, AMBER, 4)
    c.text(x0, 530, "ON = สูง, OFF = ต่ำ · ค่าแกว่งเล็กน้อยรอบเส้นไม่ทำให้ไฟสลับ", F(15), MUTED)
    c.save("hysteresis.png")


def one_wire_protocol():
    c = Canvas(1200, 560, "ส่งข้อมูลเป็นชุดบิตบนสายเส้นเดียว (1-Wire / DHT)", "เซนเซอร์ส่งค่าเป็นตัวเลขฐานสองตามจังหวะเวลา ไลบรารีถอดรหัสให้")
    c.box(40, 120, 220, 220, fill=PCB, outline=PCB, label="Arduino\nA0", lfill=(255, 255, 255))
    c.line([(220, 170), (1100, 170)], BLUE, 5)
    c.text(660, 150, "DATA (สายเดียว)", F(16, True), BLUE, "mm")
    for i, (x, name) in enumerate(((420, "DS18B20 #1\nID: 28-0A..."), (680, "DS18B20 #2\nID: 28-3F..."), (940, "DS18B20 #3\nID: 28-7C..."))):
        c.line([(x, 170), (x, 230)], BLUE, 4)
        c.box(x - 100, 230, x + 100, 300, fill=(254, 249, 195), outline=AMBER, label=name, lf=F(14, True))
    c.text(40, 360, "ตัวอย่างสัญญาณ (บิต 1 = LOW สั้น, บิต 0 = LOW ยาว)", F(16, True), INK)
    bits = [1, 0, 1, 1, 0, 0, 1, 0]
    segs = [(40, 1)]
    for b in bits:
        segs += [(12 if b else 60, 0), (68 if b else 20, 1)]
    end = c.wave(80, 400, 460, segs, BLUE, 3)
    for i, b in enumerate(bits):
        c.text(80 + 40 + i * 80 + 40, 490, str(b), F(20, True, ), GREEN, "mm")
    c.text(820, 430, "= 1011 0010", F(22, True), GREEN, "lm")
    c.save("one-wire-protocol.png")


def ir_modulation():
    c = Canvas(1200, 560, "สัญญาณอินฟราเรด (IR) แบบมอดูเลต 38 kHz", "รีโมทกระพริบ IR ที่ 38 kHz เป็นช่วงๆ ตัวรับกรองเฉพาะ 38 kHz แล้วส่งเป็นพัลส์ออกมา")
    c.text(40, 150, "ข้อมูล", F(17, True), INK)
    data = [(80, 1), (60, 0), (40, 1), (100, 0), (40, 1), (60, 0), (120, 1), (200, 0)]
    c.wave(200, 130, 180, data, GREEN, 3)
    c.text(40, 280, "แสง IR ที่ส่ง", F(17, True), INK)
    x = 200
    for dur, lvl in data:
        if lvl:
            k = 0
            while k < dur:
                c.line([(x + k, 300), (x + k, 250), (x + k + 3, 250), (x + k + 3, 300)], RED, 2)
                k += 7
        x += dur
    c.line([(200, 300), (x, 300)], RED, 2)
    c.box(260, 340, 520, 420, fill=CARD, outline=RED, label="ขยาย: 1 ช่วง = คลื่น 38,000\nครั้ง/วินาที (~26 µs)", lf=F(14, True))
    c.text(40, 480, "ขา OUT ของ KY-022", F(17, True), INK)
    inv = [(d, 0 if l else 1) for d, l in data]
    c.wave(200, 460, 510, inv, BLUE, 3)
    c.text(920, 485, "Active LOW: มี IR = LOW", F(15), BLUE, "lm")
    c.save("ir-modulation.png")


def encoder_quadrature():
    c = Canvas(1200, 520, "สัญญาณ Quadrature ของ Rotary Encoder", "CLK และ DT เหลื่อมเฟสกัน 90° ดูว่าเส้นใดเปลี่ยนก่อน → รู้ทิศทางการหมุน")
    p = 120
    clk = [(60, 1)] + [(p / 2, 0), (p / 2, 1)] * 6
    dt = [(60 + p / 4, 1)] + [(p / 2, 0), (p / 2, 1)] * 6
    c.text(40, 165, "CLK (A)", F(18, True), BLUE)
    c.wave(200, 140, 200, clk, BLUE, 4)
    c.text(40, 285, "DT (B)", F(18, True), GREEN)
    c.wave(200, 260, 320, dt[:-1] + [(p / 4, 1)], GREEN, 4)
    for i in range(6):
        x = 260 + i * p
        c.dashed((x, 120), (x, 340), AMBER, 2)
    c.arrow((260, 380), (900, 380), INK, 3)
    c.text(580, 410, "หมุนตามเข็ม (CW): CLK ขอบขาลง ขณะ DT = HIGH → DT ≠ CLK → counter++", F(16), INK, "mm")
    c.text(580, 445, "หมุนทวนเข็ม (CCW): DT เปลี่ยนก่อน → DT = CLK → counter--", F(16), INK, "mm")
    c.text(580, 480, "1 คลิก = 1 รอบสัญญาณ (20 คลิก/รอบ)", F(15), MUTED, "mm")
    c.save("encoder-quadrature.png")


def note_frequencies():
    c = Canvas(1200, 520, "ความถี่ของโน้ตดนตรี (ออกเทฟ 4)", "tone(3, ความถี่) · ขึ้น 1 ออกเทฟ = ความถี่ ×2")
    notes = [("C4", 262), ("D4", 294), ("E4", 330), ("F4", 349), ("G4", 392), ("A4", 440), ("B4", 494), ("C5", 523)]
    kw = 120
    x0 = 120
    for i, (n, f) in enumerate(notes):
        x = x0 + i * kw
        c.box(x, 110, x + kw - 4, 400, fill=CARD, outline=DARK, r=6, w=2)
        c.text(x + kw / 2, 340, n, F(22, True), INK, "mm")
        c.text(x + kw / 2, 372, f"{f} Hz", F(15, True), BLUE, "mm")
    for i in (0, 1, 3, 4, 5):
        x = x0 + (i + 1) * kw - 38
        c.box(x, 110, x + 72, 280, fill=DARK, outline=DARK, r=4)
    c.text(600, 450, "A4 = 440 Hz (โน้ตมาตรฐานสำหรับตั้งเสียง) · A5 = 880 Hz · A3 = 220 Hz", F(17), INK, "mm")
    c.save("note-frequencies.png")


def h_bridge():
    c = Canvas(1200, 600, "วงจร H-Bridge ขับมอเตอร์ DC", "สลับสวิตช์คู่ทแยงเพื่อกลับทิศกระแส → กลับทิศการหมุน · PWM ควบคุมความเร็ว")
    for k, (ox, fwd) in enumerate(((60, True), (640, False))):
        c.box(ox, 110, ox + 500, 540, fill=CARD)
        c.text(ox + 250, 140, "เดินหน้า: IN1=HIGH, IN2=LOW" if fwd else "ถอยหลัง: IN1=LOW, IN2=HIGH", F(18, True), GREEN if fwd else BLUE, "mm")
        L, R, T, B = ox + 110, ox + 390, 190, 480
        c.line([(L, T), (R, T)], RED, 4)
        c.text(ox + 250, T - 14, "+V (แบตเตอรี่)", F(14, True), RED, "mm")
        c.line([(L, B), (R, B)], INK, 4)
        c.text(ox + 250, B + 18, "GND", F(14, True), INK, "mm")
        mid = (T + B) / 2
        sw = {"S1": (L, T, L, mid - 40), "S2": (R, T, R, mid - 40), "S3": (L, mid + 40, L, B), "S4": (R, mid + 40, R, B)}
        on = {"S1", "S4"} if fwd else {"S2", "S3"}
        col = GREEN if fwd else BLUE
        for name, (x1, y1, x2, y2) in sw.items():
            is_on = name in on
            c.line([(x1, y1), (x1, y1 + 30)], INK, 3)
            c.line([(x2, y2 - 30), (x2, y2)], INK, 3)
            if is_on:
                c.line([(x1, y1 + 30), (x2, y2 - 30)], col, 5)
            else:
                c.line([(x1, y1 + 30), (x1 + 28, y2 - 40)], GRAY, 3)
            c.text(x1 + (-30 if x1 == L else 30), (y1 + y2) / 2, name, F(15, True), col if is_on else GRAY, "mm")
        c.line([(L, mid - 40), (L, mid), (ox + 200, mid)], INK, 3)
        c.line([(R, mid - 40), (R, mid), (ox + 300, mid)], INK, 3)
        c.line([(L, mid + 40), (L, mid)], INK, 3)
        c.line([(R, mid + 40), (R, mid)], INK, 3)
        c.circle(ox + 250, mid, 50, fill=(254, 249, 195), outline=AMBER, w=3)
        c.text(ox + 250, mid, "M", F(30, True), INK, "mm")
        if fwd:
            c.arrow((ox + 210, mid - 70), (ox + 290, mid - 70), col, 4)
        else:
            c.arrow((ox + 290, mid - 70), (ox + 210, mid - 70), col, 4)
    c.text(600, 570, "Lotus Nano Bot: มอเตอร์ซ้าย IN1=D9, IN2=D4, PWM=D5 · มอเตอร์ขวา IN1=D7, IN2=D8, PWM=D6", F(16), MUTED, "mm")
    c.save("h-bridge.png")


def line_follower():
    c = Canvas(1200, 560, "หุ่นยนต์เดินตามเส้นด้วยเซนเซอร์ 2 ตัว", "เซนเซอร์คร่อมเส้นดำ: ทั้งคู่เห็นขาว = ตรง · ตัวไหนเจอดำ = เลี้ยวไปทางนั้น")
    cases = [(0, "ตรงไป", "ขาว / ขาว", GREEN), (-60, "เลี้ยวซ้าย", "ดำ / ขาว", BLUE), (60, "เลี้ยวขวา", "ขาว / ดำ", PURPLE), (None, "หยุด", "ดำ / ดำ", RED)]
    for i, (off, act, sens, col) in enumerate(cases):
        ox = 40 + i * 285
        c.box(ox, 110, ox + 265, 520, fill=CARD)
        cx = ox + 132
        if off is None:
            c.d.rectangle([(ox + 10) * S, 160 * S, (ox + 255) * S, 200 * S], fill=INK)
            c.d.rectangle([(cx - 18) * S, 200 * S, (cx + 18) * S, 500 * S], fill=INK)
        else:
            c.d.polygon([((cx - 18 + off) * S, 130 * S), ((cx + 18 + off) * S, 130 * S), ((cx + 18) * S, 500 * S), ((cx - 18) * S, 500 * S)], fill=INK)
        c.box(cx - 70, 230, cx + 70, 360, fill=(220, 252, 231), outline=GREEN, r=14)
        c.box(cx - 90, 260, cx - 70, 330, fill=DARK, outline=DARK, r=4)
        c.box(cx + 70, 260, cx + 90, 330, fill=DARK, outline=DARK, r=4)
        for sx in (cx - 40, cx + 40):
            c.circle(sx, 222, 11, fill=(254, 202, 202), outline=RED, w=2)
        c.box(cx - 95, 380, cx + 95, 500, fill=CARD, outline=LINE, r=10)
        c.text(cx, 400, sens, F(16, True), INK, "mm")
        c.text(cx, 425, "(ซ้าย / ขวา)", F(13), MUTED, "mm")
        c.text(cx, 470, act, F(20, True), col, "mm")
        if off is not None and off != 0:
            c.arrow((cx, 300), (cx + (-50 if off < 0 else 50), 270), col, 4)
        elif off == 0:
            c.arrow((cx, 330), (cx, 250), col, 4)
    c.save("line-follower.png")


def rc_car_architecture():
    c = Canvas(1200, 460, "สถาปัตยกรรมโปรเจกต์รถบังคับ", "มือถือ → WiFi → ESP32 (Web Server, I2C Master) → Nano (I2C Slave #8) → มอเตอร์")
    blocks = [(40, "มือถือ\nเบราว์เซอร์", (241, 245, 249), DARK), (300, "ESP32\nWeb Server", (239, 246, 255), BLUE),
              (580, "Lotus Nano Bot\nI2C Slave #8", (240, 253, 244), GREEN), (880, "มอเตอร์ซ้าย/ขวา\nH-Bridge", (254, 249, 195), AMBER)]
    for x, label, fill, col in blocks:
        c.box(x, 150, x + 220, 270, fill=fill, outline=col, label=label, lf=F(18, True))
    c.arrow((260, 210), (300, 210), INK, 3)
    c.text(280, 300, "WiFi / HTTP", F(15, True), MUTED, "mm")
    c.text(280, 325, "GET /cmd?c=F", F(14, mono=True), MUTED, "mm")
    c.arrow((520, 210), (580, 210), INK, 3)
    c.text(550, 300, "I2C", F(15, True), MUTED, "mm")
    c.text(550, 325, "SDA 21 → A4", F(14, mono=True), MUTED, "mm")
    c.text(550, 345, "SCL 22 → A5", F(14, mono=True), MUTED, "mm")
    c.text(550, 365, "GND ร่วมกัน", F(14, True), RED, "mm")
    c.arrow((800, 210), (880, 210), INK, 3)
    c.text(840, 300, "D4-D9", F(15, True), MUTED, "mm")
    c.text(600, 420, "คำสั่ง: F = เดินหน้า · B = ถอย · L = ซ้าย · R = ขวา · S = หยุด", F(17, True), INK, "mm")
    c.save("rc-car-architecture.png")


def design_process():
    c = Canvas(1000, 680, "กระบวนการออกแบบเชิงวิศวกรรม", "วนซ้ำจนได้ผลงานที่ตอบโจทย์")
    steps = [("1. ระบุปัญหา", BLUE), ("2. รวบรวมข้อมูล", CYAN), ("3. ออกแบบ", GREEN), ("4. สร้างต้นแบบ", AMBER), ("5. ทดสอบ", RED), ("6. ปรับปรุง / นำเสนอ", PURPLE)]
    cx, cy, R = 500, 380, 220
    for i, (s, col) in enumerate(steps):
        a = -math.pi / 2 + i * 2 * math.pi / len(steps)
        x, y = cx + R * math.cos(a), cy + R * math.sin(a)
        light = tuple(int(v + (255 - v) * 0.85) for v in col)
        c.box(x - 115, y - 34, x + 115, y + 34, fill=light, outline=col, r=30, label=s, lf=F(17, True), lfill=col)
        a2 = a + 2 * math.pi / len(steps)
        p0 = (cx + (R - 30) * math.cos(a + 0.33), cy + (R - 30) * math.sin(a + 0.33))
        p1 = (cx + (R - 30) * math.cos(a2 - 0.33), cy + (R - 30) * math.sin(a2 - 0.33))
        c.arrow(p0, p1, GRAY, 3)
    c.text(cx, cy, "Lotus\nNano Bot", F(20, True), MUTED, "mm")
    c.save("design-process.png")


def station_layout():
    c = Canvas(1100, 600, "การจัดสถานีการทดลอง (Station Rotation)", "แต่ละกลุ่มอยู่สถานีละ 20-25 นาที แล้วหมุนตามลูกศร")
    pos = [(160, 160), (480, 140), (800, 160), (800, 420), (160, 420)]
    cols = [BLUE, GREEN, AMBER, PURPLE, RED]
    for i, ((x, y), col) in enumerate(zip(pos, cols)):
        light = tuple(int(v + (255 - v) * 0.85) for v in col)
        c.box(x, y, x + 200, y + 110, fill=light, outline=col, r=14)
        c.text(x + 100, y + 30, f"สถานี {i + 1}", F(20, True), col, "mm")
        c.text(x + 100, y + 62, "เซนเซอร์ + README", F(14), INK, "mm")
        c.text(x + 100, y + 84, "+ สายจัมเปอร์", F(14), INK, "mm")
    arrows = [((360, 215), (480, 200)), ((680, 200), (800, 215)), ((900, 270), (900, 420)), ((800, 475), (360, 475)), ((260, 420), (260, 270))]
    for p0, p1 in arrows:
        c.arrow(p0, p1, GRAY, 4)
    c.box(430, 320, 670, 410, fill=DARK, outline=DARK, label="โต๊ะครู\nอุปกรณ์สำรอง", lfill=(255, 255, 255), lf=F(16, True))
    c.text(550, 560, "พิมพ์ README ของเซนเซอร์วางไว้ทุกสถานี · ใช้แบบฟอร์มรายงานการทดลองเดียวกัน", F(16), MUTED, "mm")
    c.save("station-layout.png")


if __name__ == "__main__":
    for fn in (board_port_map, setup_loop, pullup_active_low, debounce, pwm_duty_cycle, rgb_color_mixing,
               relay_principle, adc_ao_do, hysteresis, one_wire_protocol, ir_modulation, encoder_quadrature,
               note_frequencies, h_bridge, line_follower, rc_car_architecture, design_process, station_layout):
        fn()
