"""Add Thai labels to the Blender renders and write assets/diagrams/<key>-lotus.png

    python tools/blender/label_wiring.py [keys...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RENDERS = ROOT / "tools" / "blender" / "renders"
OUT = ROOT / "assets" / "diagrams"
FONTS = Path("C:/Windows/Fonts")
F_BOLD = FONTS / "LeelaUIb.ttf"
F_REG = FONTS / "LeelawUI.ttf"
SLOT = {"S": ("ขาว", "#9aa0a6"), "5V": ("แดง", "#d62020"), "GND": ("ดำ", "#1a1a1a")}
ROLE = {"S": "สัญญาณ", "5V": "ไฟ 5V", "GND": "กราวด์"}


def font(p, s):
    return ImageFont.truetype(str(p), s)


def darker(hexcol):
    h = hexcol.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if r + g + b > 600:  # very light wires -> use a readable grey
        return "#6b6b6b"
    k = 0.8 if (r + g + b) > 360 else 1.0
    return "#%02x%02x%02x" % (int(r * k), int(g * k), int(b * k))


def label(key):
    meta = json.loads((RENDERS / f"{key}.json").read_text(encoding="utf-8"))
    render = Image.open(RENDERS / f"{key}.png").convert("RGB")
    HEAD = 130
    bgc = render.getpixel((5, 5))
    img = Image.new("RGB", (render.width, render.height + HEAD), bgc)
    img.paste(render, (0, HEAD))
    d = ImageDraw.Draw(img)
    W, H = img.size

    # title band
    d.text((40, 26), f"{meta['code']}  {meta['name']}", font=font(F_BOLD, 46), fill="#111111")
    d.text((42, 84), "การต่อสายกับบอร์ด Lotus Nano Bot", font=font(F_REG, 28), fill="#555555")
    for w in meta["wires"]:
        w["module_px"][1] += HEAD
        w["board_px"][1] += HEAD

    # wire labels: stacked list placed just left of the module header
    wires = meta["wires"]
    ys = sorted(w["module_px"][1] for w in wires)
    x_mod = min(w["module_px"][0] for w in wires)
    f = font(F_BOLD, 27)
    rows = sorted(wires, key=lambda w: w["module_px"][1])
    top = max(ys) + 110
    for i, w in enumerate(rows):
        slot_name, _ = SLOT[w["role"]]
        port = w["port"]
        opt = " (ไม่บังคับ)" if w["optional"] else ""
        text = f"ขา {w['pin']} เสียบกับ {port} ช่อง{slot_name}{opt}"
        tw = d.textlength(text, font=f)
        x = min(x_mod + 10, W - 50 - tw)
        y = top + i * 46
        col = darker(w["color"])
        d.rounded_rectangle([x - 14, y - 6, x + tw + 14, y + 38], radius=10, fill="#ffffff", outline=col, width=3)
        d.text((x, y), text, font=f, fill=col)

    # legend (header slot colours) bottom-right
    lx, ly = W - 430, H - 230
    d.rounded_rectangle([lx, ly, W - 30, H - 30], radius=16, fill="#ffffff", outline="#cfcfcf", width=2)
    d.text((lx + 24, ly + 18), "หัวต่อแต่ละพอร์ตบนบอร์ด", font=font(F_BOLD, 26), fill="#111111")
    for i, (row, (cname, ccol)) in enumerate((("S", SLOT["S"]), ("5V", SLOT["5V"]), ("GND", SLOT["GND"]))):
        y = ly + 64 + i * 42
        fill = {"S": "#f4f2ec", "5V": "#d62020", "GND": "#2a2a2a"}[row]
        d.rounded_rectangle([lx + 26, y + 4, lx + 70, y + 30], radius=5, fill=fill, outline="#888888", width=2)
        d.text((lx + 84, y), f"ช่อง{cname} = {ROLE[row]} ({row})", font=font(F_REG, 25), fill="#222222")

    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / f"{key}-lotus.png", optimize=True)
    print("wrote", OUT / f"{key}-lotus.png")


if __name__ == "__main__":
    keys = sys.argv[1:] or [p.stem for p in sorted(RENDERS.glob("*.json"))]
    for k in keys:
        label(k)
