"""Generate wiring diagrams (assets/diagrams/*-wiring.png) from each README.

The script reads the first code block under the "## การต่อสายไฟ" heading of every
sensors/*/README.md and modules/*/README.md, e.g.

    VCC  ──────────► 5V
    DO   ──────────► D3 หรือ A1 (D15)
    AO   ──────────► A0 (optional)

and draws the module photo, its pins, the Lotus Nano Bot ports and colored wires.
Run it again whenever a wiring table changes:

    python tools/generate_wiring_diagrams.py
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = Path("C:/Windows/Fonts")
FONT_REG = next((p for p in [FONT_DIR / "LeelawUI.ttf", FONT_DIR / "leelawad.ttf", FONT_DIR / "tahoma.ttf"] if p.exists()), None)
FONT_BOLD = next((p for p in [FONT_DIR / "LeelaUIb.ttf", FONT_DIR / "leelawdb.ttf", FONT_DIR / "tahomabd.ttf"] if p.exists()), FONT_REG)
FONT_MONO = FONT_DIR / "consolab.ttf"

S = 2  # supersampling factor
W, H = 1200, 680


def font(path, size):
    return ImageFont.truetype(str(path), size * S)


F_TITLE = font(FONT_BOLD, 30)
F_SUB = font(FONT_REG, 17)
F_PIN = font(FONT_MONO if FONT_MONO.exists() else FONT_BOLD, 20)
F_PORT = font(FONT_MONO if FONT_MONO.exists() else FONT_BOLD, 22)
F_SMALL = font(FONT_REG, 15)
F_NOTE = font(FONT_REG, 16)
F_BOARD = font(FONT_BOLD, 22)
F_PIN_TH = font(FONT_BOLD, 20)

BG = (248, 250, 252)
INK = (15, 23, 42)
MUTED = (100, 116, 139)
PCB = (22, 101, 52)
PCB_EDGE = (20, 83, 45)
CARD = (255, 255, 255)
BORDER = (203, 213, 225)
WARN = (180, 83, 9)

SIGNAL_COLORS = [(234, 179, 8), (37, 99, 235), (22, 163, 74), (147, 51, 234), (234, 88, 12), (8, 145, 178)]
RED = (220, 38, 38)
BLACK = (30, 30, 30)

PORT_INFO = {
    "5V": "ไฟเลี้ยง 5V",
    "3.3V": "ไฟเลี้ยง 3.3V",
    "GND": "กราวด์",
    "D0": "RX (Serial/Bluetooth)",
    "D1": "TX (Serial/Bluetooth)",
    "D2": "ปุ่มบนบอร์ด",
    "D3": "Digital / PWM (ร่วมกับ Buzzer)",
    "D13": "LED บนบอร์ด Nano",
    "A0": "Analog / Digital 14",
    "A1": "Analog / Digital 15",
    "A2": "Analog / Digital 16",
    "A3": "Analog / Digital 17",
    "A6": "Analog อย่างเดียว",
}

ARROW = re.compile(r"^(?P<left>.+?)\s*[─━-]{3,}\s*►\s*(?P<right>.+)$")
PORT = re.compile(r"\b(5V|3\.3V|GND|D1[0-3]|D[0-9]|A[0-7])\b")


def parse_readme(path: Path):
    text = path.read_text(encoding="utf-8")
    title = text.splitlines()[0].lstrip("# ").strip()
    m = re.match(r"(KY-\d+)\s*-+\s*(.+)", title)
    code, name = (m.group(1), m.group(2).strip()) if m else ("", title)

    sec = re.search(r"^## การต่อสายไฟ.*?$(.*?)^```(.*?)^```", text, re.S | re.M)
    if not sec:
        return None
    rows = []
    for line in sec.group(2).splitlines():
        a = ARROW.match(line.strip())
        if not a:
            continue
        left = a.group("left").strip()
        right = a.group("right").strip()
        ports = PORT.findall(right)
        if not ports:
            continue
        optional = "optional" in right.lower()
        alt = None
        if "หรือ" in right:
            alt_part = right.split("หรือ", 1)[1].strip()
            alt = re.sub(r"\s*\((optional|INPUT_PULLUP|ใช้ INPUT_PULLUP)\)", "", alt_part).strip()
        note = None
        if "INPUT_PULLUP" in right:
            note = "INPUT_PULLUP"
        rows.append({"pin": left, "port": ports[0], "optional": optional, "alt": alt, "note": note})

    img = re.search(r"!\[[^\]]*\]\(\.\./\.\./(assets/images/[^)]+)\)", text)
    diag = re.search(r"!\[[^\]]*\]\(\.\./\.\./(assets/diagrams/[^)]+-wiring\.png)\)", text)
    return {
        "code": code,
        "name": name,
        "rows": rows,
        "image": ROOT / img.group(1) if img else None,
        "out": ROOT / diag.group(1) if diag else None,
    }


def wire_color(pin: str, port: str, idx: int):
    p = pin.upper()
    if port == "GND" or p.startswith("GND") or p.startswith("G ") or p == "G" or p.startswith("-"):
        return BLACK
    if port in ("5V", "3.3V"):
        return RED
    return SIGNAL_COLORS[idx % len(SIGNAL_COLORS)]


def bezier(p0, p1, p2, p3, n=80):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def draw_wire(d, a, b, color, dashed):
    mx = (a[0] + b[0]) / 2
    pts = [a, b] if a[1] == b[1] and not dashed else bezier(a, (mx, a[1]), (mx, b[1]), b)
    width = 7 * S
    if dashed:
        for i in range(0, len(pts) - 1, 4):
            d.line(pts[i:i + 3], fill=color, width=width, joint="curve")
    else:
        d.line(pts, fill=color, width=width, joint="curve")


def rr(d, box, r, fill, outline=None, width=1):
    d.rounded_rectangle([v * S for v in box], radius=r * S, fill=fill, outline=outline, width=width * S)


def text(d, xy, s, f, fill=INK, anchor="la"):
    d.text((xy[0] * S, xy[1] * S), s, font=f, fill=fill, anchor=anchor)


def render(info):
    rows = info["rows"]
    img = Image.new("RGB", (W * S, H * S), BG)
    d = ImageDraw.Draw(img)

    # Title
    text(d, (40, 30), f"{info['code']}  {info['name']}".strip(), F_TITLE)
    text(d, (40, 74), "แผนผังการต่อสายกับ Lotus Nano Bot (Arduino Nano)", F_SUB, MUTED)

    n = len(rows)
    pitch = 62
    top = 200 + max(0, (5 - n)) * pitch // 2
    pin_y = [top + i * pitch for i in range(n)]

    # Module card
    mod_box = (40, 120, 400, 600)
    rr(d, mod_box, 18, CARD, BORDER, 2)
    if info["image"] and info["image"].exists():
        ph = Image.open(info["image"]).convert("RGB")
        # crop to center square-ish around content
        w, h = ph.size
        side = min(w, h)
        if w > h * 1.3:  # wide photos: zoom center
            side = int(h * 0.8)
        left, upper = (w - side) // 2, (h - side) // 2
        ph = ph.crop((left, upper, left + side, upper + side)).resize((240 * S, 240 * S), Image.LANCZOS)
        mask = Image.new("L", ph.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, ph.size[0], ph.size[1]], radius=14 * S, fill=255)
        img.paste(ph, (60 * S, 140 * S), mask)
    text(d, (180, 400), info["code"] or "Module", F_BOARD, INK, "ma")
    label = info["name"] if len(info["name"]) <= 26 else info["name"][:25] + "…"
    text(d, (180, 432), label, F_SMALL, MUTED, "ma")

    # Module header pins (right edge of card)
    hx = 400
    rr(d, (hx - 14, pin_y[0] - 26, hx + 14, pin_y[-1] + 26), 6, (30, 41, 59))
    for i, r in enumerate(rows):
        y = pin_y[i]
        d.ellipse([(hx - 7) * S, (y - 7) * S, (hx + 7) * S, (y + 7) * S], fill=(212, 175, 55))
        pin_label = r["pin"]
        pf = F_PIN if pin_label.isascii() else F_PIN_TH
        tw = d.textlength(pin_label, font=pf) / S
        bx = hx - 30 - tw - 16
        rr(d, (bx, y - 17, hx - 26, y + 17), 8, (241, 245, 249), BORDER, 1)
        text(d, (bx + 8, y), pin_label, pf, INK, "lm")

    # Board card
    bx0, bx1 = 780, 1160
    rr(d, (bx0, 120, bx1, 600), 18, PCB, PCB_EDGE, 3)
    text(d, ((bx0 + bx1) / 2, 138), "Lotus Nano Bot", F_BOARD, (240, 253, 244), "ma")
    # nano chip
    rr(d, (bx0 + 200, 200, bx0 + 340, 520), 10, (17, 24, 39))
    text(d, (bx0 + 270, 350), "Arduino", F_SMALL, (203, 213, 225), "mm")
    text(d, (bx0 + 270, 372), "Nano", F_SMALL, (203, 213, 225), "mm")

    px = bx0
    rr(d, (px - 14, pin_y[0] - 26, px + 14, pin_y[-1] + 26), 6, (30, 41, 59))
    for i, r in enumerate(rows):
        y = pin_y[i]
        d.ellipse([(px - 7) * S, (y - 7) * S, (px + 7) * S, (y + 7) * S], fill=(212, 175, 55))
        text(d, (px + 26, y - 9), r["port"], F_PORT, (255, 255, 255), "lm")
        text(d, (px + 26, y + 14), PORT_INFO.get(r["port"], ""), F_SMALL, (187, 247, 208), "lm")

    # Wires
    for i, r in enumerate(rows):
        color = wire_color(r["pin"], r["port"], i)
        draw_wire(d, (hx * S + 7 * S, pin_y[i] * S), (px * S - 7 * S, pin_y[i] * S), color, r["optional"])

    # Notes
    notes = []
    if any(r["optional"] for r in rows):
        notes.append("เส้นประ = ต่อหรือไม่ต่อก็ได้ (optional)")
    for r in rows:
        if r["alt"]:
            notes.append(f"ทางเลือก: {r['pin']} ต่อที่ {r['alt']}")
        if r["note"]:
            notes.append(f"{r['pin']}: ใช้ pinMode(..., INPUT_PULLUP)")
    if any(r["port"] == "D3" for r in rows) or any(r["alt"] and "D3" in r["alt"] for r in rows):
        notes.append("D3 ต่อร่วมกับ Buzzer บนบอร์ด: ถ้าสั่งเป็น Output/tone() จะมีเสียง")
    ny = 618
    x = 40
    for s in notes[:4]:
        tw = d.textlength("• " + s, font=F_NOTE) / S
        if x + tw > W - 40:
            x = 40
            ny += 24
        warn = "D3" in s and "Buzzer" in s
        text(d, (x, ny), "• " + s, F_NOTE, WARN if warn else MUTED)
        x += tw + 28

    # Legend
    lx = 440
    for lbl, col in (("VCC/5V", RED), ("GND", BLACK), ("สัญญาณ", SIGNAL_COLORS[0])):
        d.line([(lx * S, 104 * S), ((lx + 26) * S, 104 * S)], fill=col, width=6 * S)
        text(d, (lx + 34, 104), lbl, F_SMALL, MUTED, "lm")
        lx += 120

    out = img.resize((W, H), Image.LANCZOS)
    return out


def main():
    paths = sorted((ROOT / "sensors").glob("*/README.md")) + sorted((ROOT / "modules").glob("*/README.md"))
    only = set(sys.argv[1:])
    count = 0
    for p in paths:
        if only and p.parent.name not in only:
            continue
        info = parse_readme(p)
        if not info or not info["rows"] or not info["out"]:
            print(f"SKIP {p.parent.name}: no wiring block or diagram reference")
            continue
        render(info).save(info["out"], optimize=True)
        count += 1
        print(f"OK   {p.parent.name}: {len(info['rows'])} wires -> {info['out'].relative_to(ROOT)}")
    print(f"{count} diagrams generated")


if __name__ == "__main__":
    main()
