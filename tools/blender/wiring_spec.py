"""Parse every sensors/*/README.md and modules/*/README.md wiring block into
tools/blender/wiring_spec.json for the Blender renderer.

    python tools/blender/wiring_spec.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARROW = re.compile(r"^(?P<left>.+?)\s*[─━-]{3,}\s*►\s*(?P<right>.+)$")
PORT = re.compile(r"\b(5V|GND|D1[0-2]|D[0-3]|A[0-7])\b")
POWER = {"VCC", "VDD", "+", "+5V", "V+", "5V", "VCC (+)"}
GROUND = {"GND", "G", "-", "GND (-)"}
SERVO = {"D10": "SV1", "D11": "SV2", "D12": "SV3"}


def parse(path: Path):
    text = path.read_text(encoding="utf-8")
    title = text.splitlines()[0].lstrip("# ").strip()
    m = re.match(r"(KY-\d+)\s*-+\s*(.+)", title)
    code, name = (m.group(1), m.group(2).strip()) if m else ("", title)
    sec = re.search(r"^## การต่อสายไฟ.*?$(.*?)^```(.*?)^```", text, re.S | re.M)
    wires = []
    if sec:
        for line in sec.group(2).splitlines():
            a = ARROW.match(line.strip())
            if not a:
                continue
            pin = re.sub(r"\s*\(.*?\)\s*$", "", a.group("left").strip()) or a.group("left").strip()
            right = a.group("right")
            ports = PORT.findall(right)
            if not ports:
                continue
            port = SERVO.get(ports[0], ports[0])
            role = "5V" if port == "5V" else "GND" if port == "GND" else "S"
            wires.append({"pin": pin, "port": port, "role": role, "optional": "optional" in right.lower()})
    # power / ground land on the column of the first signal
    signal_cols = [w["port"] for w in wires if w["role"] == "S" and not w["optional"]] or [w["port"] for w in wires if w["role"] == "S"]
    col = signal_cols[0] if signal_cols else "A0"
    for w in wires:
        if w["role"] == "5V":
            w["port"] = col
        elif w["role"] == "GND":
            w["port"] = col
    return {"key": path.parent.name, "code": code, "name": name, "wires": wires}


def main():
    specs = []
    for base in ("sensors", "modules"):
        for p in sorted((ROOT / base).glob("*/README.md")):
            specs.append(parse(p))
    out = Path(__file__).with_name("wiring_spec.json")
    out.write_text(json.dumps(specs, ensure_ascii=False, indent=1), encoding="utf-8")
    for s in specs:
        print(s["key"], [(w["pin"], w["port"], w["role"]) for w in s["wires"]])


if __name__ == "__main__":
    main()
