"""Silkscreen / PCB textures for the Blender model of the Lotus Nano Bot.

Writes PNGs into tools/blender/textures/. Coordinates are in millimetres in the
board frame: x to the right, y towards the back edge (header side), origin at the
PCB centre. 30 px per mm.

    python tools/blender/make_textures.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "textures"
OUT.mkdir(exist_ok=True)
PX = 30  # px per mm
FONTS = Path("C:/Windows/Fonts")


def font(size_mm, bold=True, serif=False):
    name = ("timesbd.ttf" if bold else "times.ttf") if serif else ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(str(FONTS / name), max(6, int(size_mm * PX)))


# ------------------------------------------------------------------ Lotus shield
# Board outline (mm) – must match lotus_board.py
PCB_W, PCB_D = 76.0, 55.0
PCB_CY = 2.0  # PCB centre y offset relative to the layout origin


class Canvas:
    def __init__(self, w_mm, d_mm, bg):
        self.w, self.d = w_mm, d_mm
        self.img = Image.new("RGB", (int(w_mm * PX), int(d_mm * PX)), bg)
        self.g = ImageDraw.Draw(self.img)

    def p(self, x, y):
        """board mm -> image px (y up in board frame)."""
        return (x + self.w / 2) * PX, (self.d / 2 - y) * PX

    def text(self, x, y, s, size, fill="#f2f2ee", anchor="mm", rot=0, serif=False, bold=True):
        f = font(size, bold, serif)
        if rot == 0:
            self.g.text(self.p(x, y), s, font=f, fill=fill, anchor=anchor)
            return
        bbox = self.g.textbbox((0, 0), s, font=f)
        tw, th = bbox[2] - bbox[0] + 8, bbox[3] - bbox[1] + 8
        layer = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((tw / 2, th / 2), s, font=f, fill=fill, anchor="mm")
        layer = layer.rotate(rot, expand=True)
        cx, cy = self.p(x, y)
        self.img.paste(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)), layer)

    def rect(self, x0, y0, x1, y1, outline="#f2f2ee", width_mm=0.25, fill=None):
        a, b = self.p(x0, y1), self.p(x1, y0)
        self.g.rectangle([a, b], outline=outline, width=max(1, int(width_mm * PX)), fill=fill)

    def circle(self, x, y, r, fill=None, outline=None, width_mm=0.2):
        cx, cy = self.p(x, y)
        self.g.ellipse([cx - r * PX, cy - r * PX, cx + r * PX, cy + r * PX], fill=fill, outline=outline, width=max(1, int(width_mm * PX)))

    def line(self, pts, fill, width_mm):
        self.g.line([self.p(*q) for q in pts], fill=fill, width=max(1, int(width_mm * PX)), joint="curve")

    def save(self, name):
        self.img.save(OUT / name)
        print("wrote", OUT / name)


# Header columns (shared with lotus_board.py through the same numbers)
PITCH = 2.54
HEADER_GROUPS = [
    (-33.0, ["A0", "A1", "A2", "A3", "A4", "A5"]),
    (-16.6, ["A6", "D0", "D1", "D3"]),
    (7.6, ["SV1", "SV2", "SV3"]),
    (19.6, ["AA0", "AA1", "AA2", "AA3"]),
]
ROW_Y = {"GND": 24.6, "5V": 22.06, "S": 19.52}


def column_x():
    cols = {}
    for x0, names in HEADER_GROUPS:
        for i, n in enumerate(names):
            cols[n] = x0 + i * PITCH
    return cols


def lotus_shield():
    c = Canvas(PCB_W, PCB_D, "#141518")
    # board frame -> layout frame: layout y = board y + PCB_CY
    def T(x, y):
        return x, y - PCB_CY

    # subtle copper traces under the mask
    import random
    random.seed(7)
    trace = "#191b1e"
    for _ in range(70):
        x = random.uniform(-36, 36)
        y = random.uniform(-24, 22)
        pts = [T(x, y)]
        for _ in range(random.randint(2, 4)):
            if random.random() < 0.5:
                x += random.uniform(-14, 14)
            else:
                y += random.uniform(-10, 10)
            pts.append(T(max(-37, min(37, x)), max(-26, min(26, y))))
        c.line(pts, trace, random.choice([0.2, 0.3, 0.45]))

    cols = column_x()
    # header labels on the back tab (rotated 90 deg like the real silkscreen)
    for name, x in cols.items():
        c.text(*T(x, 27.6), name, 1.45, rot=90)
    c.text(*T(-4.3, 27.5), "ML", 2.0)
    c.text(*T(1.3, 27.5), "MR", 2.0)
    # row legend
    c.text(*T(-37.0, ROW_Y["GND"]), "G", 1.2)
    c.text(*T(-37.0, ROW_Y["5V"]), "V", 1.2)
    c.text(*T(-37.0, ROW_Y["S"]), "S", 1.2)
    # pads under header pins
    for x in cols.values():
        for y in ROW_Y.values():
            c.circle(*T(x, y), 0.85, fill="#c9b27a")

    # OLED outline + label
    c.rect(*T(-40, -10.8), *T(-13.5, 15.9), width_mm=0.2)
    # Nano footprint
    c.rect(*T(-9.6, -27), *T(8.8, 17.6), width_mm=0.2)
    # TB6612 footprint
    c.rect(*T(8.2, -3), *T(26.6, 18.5), width_mm=0.2)
    c.text(*T(17.4, -4.5), "AO1  AO2  BO2  BO1", 0.9)
    # ADS1115 header labels (vertical column on the right)
    for i, s in enumerate(["VDD", "GND", "SCL", "SDA", "ADDR", "ALRT", "A0", "A1", "A2", "A3"]):
        c.text(*T(33.2, 17.2 - i * PITCH), s, 1.05, anchor="lm")
    c.text(*T(32.3, 21.4), "bluetooth", 1.1)
    # compass box
    c.rect(*T(9.0, -16.0), *T(22.6, -6.2), width_mm=0.25)
    for i, s in enumerate(["DRDY", "SDA", "SCL", "GND", "VCC"]):
        c.text(*T(10.7 + i * PITCH, -8.9), s, 0.75, rot=90)
    c.text(*T(15.8, -12.0), "Compass", 1.0)
    # logos
    c.text(*T(15.8, -19.4), "LOTUS", 2.4, serif=True)
    c.text(*T(15.8, -22.3), "NANO BOT SHIELD", 1.55, serif=True)
    c.text(*T(-31.5, -14.0), "LOTUS", 3.0, serif=True)
    c.text(*T(-31.5, -17.2), "ARDUIBOT", 2.0, serif=True)
    c.text(*T(-24.0, -20.4), "Kru J jatur", 0.9, bold=False)
    c.text(*T(-30.0, -24.2), "OFF   ON", 1.1)
    c.text(*T(-11.0, -23.8), "A7", 1.3)
    c.text(*T(24.2, -16.2), "D2", 1.5, serif=True)
    c.text(*T(-36.5, -19.5), "PWR", 0.9)
    c.save("lotus_shield.png")


# ------------------------------------------------------------------ Arduino Nano
def nano():
    w, d = 18.0, 43.2
    c = Canvas(w, d, "#1f4fa3")
    left = ["D12", "D11", "D10", "D9", "D8", "D7", "D6", "D5", "D4", "D3", "D2", "GND", "RST", "RX0", "TX1"]
    right = ["D13", "3V3", "REF", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "5V", "RST", "GND", "VIN"]
    for i in range(15):
        y = -d / 2 + 3.3 + i * 2.54
        for x, lab, anchor, lx in ((-7.62, left[i], "lm", -6.2), (7.62, right[i], "rm", 6.2)):
            c.circle(x, y, 0.95, fill="#d8c48a")
            c.circle(x, y, 0.45, fill="#222")
            c.text(lx, y, lab, 0.95, anchor=anchor)
    c.text(0, 6.6, "NANO", 1.6)
    for i, s in enumerate(["RX", "TX", "PWR", "L"]):
        c.text(-3.6 + i * 2.4, 14.0, s, 0.8)
    c.text(0, -16.0, "ARDUINO", 1.1)
    c.save("nano.png")


# ------------------------------------------------------------------ TB6612
def tb6612():
    w, d = 18.4, 21.0
    c = Canvas(w, d, "#c22a22")
    for i in range(8):
        y = d / 2 - 2.0 - i * 2.54
        for x in (-7.62, 7.62):
            c.circle(x, y, 1.05, fill="#d8d8d8")
            c.circle(x, y, 0.5, fill="#444")
    c.text(0, -7.4, "TB6612FNG", 1.4)
    c.save("tb6612.png")


# ------------------------------------------------------------------ OLED module
def oled():
    w, d = 27.0, 27.5
    c = Canvas(w, d, "#1f4fa3")
    for i, s in enumerate(["GND", "VCC", "SCL", "SDA"]):
        x = -3.81 + i * 2.54
        c.circle(x, 11.8, 0.9, fill="#d8c48a")
        c.text(x, 9.6, s, 0.75)
    for x, y in ((-11.5, 11.5), (11.5, 11.5), (-11.5, -11.5), (11.5, -11.5)):
        c.circle(x, y, 1.1, fill="#d8c48a")
        c.circle(x, y, 0.7, fill="#0b0b0b")
    c.save("oled_pcb.png")


# ------------------------------------------------------------------ Lotus logo decal for the base plate (unused areas)
if __name__ == "__main__":
    lotus_shield()
    nano()
    tb6612()
    oled()
