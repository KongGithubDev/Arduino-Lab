"""Render "module wired to Lotus Nano Bot" diagrams with Cycles.

Run inside Blender after lotus_board.py and ky_modules.py:
    KEYS = None  # or ["photoresistor", ...]
    exec(open(r"<repo>/tools/blender/render_wiring.py", encoding="utf-8").read())

Writes  tools/blender/renders/<key>.png  and  <key>.json  (pixel positions of the
wire ends) which tools/blender/label_wiring.py turns into the final labelled
assets/diagrams/<key>-lotus.png.
"""
import json
import math
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

OUTDIR = REPO / "tools" / "blender" / "renders"
OUTDIR.mkdir(exist_ok=True)
SPEC = json.loads((REPO / "tools" / "blender" / "wiring_spec.json").read_text(encoding="utf-8"))

POWER_NAMES = ["+", "+5V", "V+", "VCC", "VDD"]
GROUND_NAMES = ["-", "G", "GND"]
WIRE_COLORS = {"GND": "#1a1a1a", "5V": "#d62020"}
SIGNAL_COLORS = ["#f2c200", "#1f6fe0", "#20a040", "#e87a10", "#9b3fd4"]
ROW_NAME = {"S": "S", "5V": "5V", "GND": "GND"}
MODULE_POS = Vector((0.078, 0.058, 0.0))  # metres, right of / behind the board

WIRE_COLL = "WiringWires"


def wire_coll():
    c = bpy.data.collections.get(WIRE_COLL)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(WIRE_COLL)
        bpy.context.scene.collection.children.link(c)
    return c


def wire_mat(hexcol):
    name = "wire_" + hexcol
    return bpy.data.materials.get(name) or material(name, srgb(hexcol), rough=0.35, coat=0.3)


def make_wire(coll, points, hexcol, radius=0.0007):
    cu = bpy.data.curves.new("wire", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.resolution_u = 24
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new("wire", cu)
    o.data.materials.append(wire_mat(hexcol))
    coll.objects.link(o)
    return o


def dupont(coll, at, direction, hexcol):
    """Black female Dupont housing whose open end sits on `at`, body along `direction`."""
    L, s = 0.0140, 0.0026
    d = direction.normalized()
    centre = at + d * (L / 2)
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    o = bpy.context.active_object
    o.scale = (s, s, L) if abs(d.z) > 0.5 else ((L, s, s) if abs(d.x) > 0.5 else (s, L, s))
    o.data.materials.append(MAT["plastic_black"])
    b = o.modifiers.new("bevel", "BEVEL")
    b.width = 0.0002
    b.segments = 2
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    return at + d * L


def resolve_pins(root_name, wires):
    pins = {o.name[4:]: o for o in bpy.data.objects if o.name.startswith("PIN_") and o.parent and o.parent.name == root_name}
    # strip Blender's .001 suffixes
    pins = {k.split(".")[0]: v for k, v in pins.items()}
    used, out = set(), []
    signal_pool = [k for k in pins if k not in POWER_NAMES + GROUND_NAMES]
    for w in sorted(wires, key=lambda w: (w["optional"], w["role"] != "S")):
        name = w["pin"]
        cand = None
        if name in pins and name not in used:
            cand = name
        elif w["role"] == "5V":
            cand = next((k for k in POWER_NAMES if k in pins and k not in used), None)
        elif w["role"] == "GND":
            cand = next((k for k in GROUND_NAMES if k in pins and k not in used), None)
        else:
            analog = name.upper() in ("AO", "A0", "VRX", "VRY")
            pref = sorted(signal_pool, key=lambda k: (0 if (k.upper() == "AO") == analog else 1))
            cand = next((k for k in pref if k not in used), None)
        if cand:
            used.add(cand)
            out.append((w, cand, pins[cand]))
        elif not w["optional"]:
            print("  !! no pin for", name)
    return out


def setup_camera(objs):
    cam = bpy.data.objects.get("DiagramCam")
    if not cam:
        cam = bpy.data.objects.new("DiagramCam", bpy.data.cameras.new("DiagramCam"))
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.location = (0.022, 0.024, 0.5)
    cam.rotation_euler = (0, 0, 0)
    cam.data.ortho_scale = 0.165
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 1000
    sc.render.resolution_percentage = 100
    return cam


def render_one(spec):
    key = spec["key"]
    sc = bpy.context.scene
    for c in bpy.data.collections:
        if c.name.startswith("KY_"):
            c.hide_render = c.hide_viewport = (c.name != "KY_" + key)
    if not bpy.data.collections.get("KY_" + key):
        build_module(key)
    mc = bpy.data.collections["KY_" + key]
    mc.hide_render = mc.hide_viewport = False
    root = bpy.data.objects["KY_" + key]
    root.location = MODULE_POS
    root.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()

    coll = wire_coll()
    cam = setup_camera(None)
    res = {"key": key, "code": spec["code"], "name": spec["name"], "w": sc.render.resolution_x, "h": sc.render.resolution_y, "wires": []}
    sig_i = 0
    resolved = resolve_pins(root.name, spec["wires"])
    n = len(resolved)
    for idx, (w, pin_label, pin_obj) in enumerate(resolved):
        row = w["role"]
        port_obj = bpy.data.objects.get(f"PORT_{w['port']}_{ROW_NAME[row]}")
        if port_obj is None:
            print("  !! no port", w["port"], row)
            continue
        if row == "S":
            col = SIGNAL_COLORS[sig_i % len(SIGNAL_COLORS)]
            sig_i += 1
        else:
            col = WIRE_COLORS[row]
        p_port = port_obj.matrix_world.translation.copy()
        p_pin = pin_obj.matrix_world.translation.copy()
        top = dupont(coll, p_port - Vector((0, 0, 0.0042)), Vector((0, 0, 1)), col)
        side = dupont(coll, p_pin + Vector((0.0040, 0, 0)), Vector((-1, 0, 0)), col)
        lift = 0.010 + idx * 0.0016
        pts = [top, top + Vector((0, 0, lift)), top + Vector((0, 0.020 + idx * 0.003, lift + 0.004)),
               side + Vector((-0.018 - (n - idx) * 0.002, 0, 0.004)), side]
        make_wire(coll, pts, col)
        a = world_to_camera_view(sc, cam, top)
        b = world_to_camera_view(sc, cam, side)
        res["wires"].append({
            "pin": w["pin"], "model_pin": pin_label, "port": w["port"], "role": row, "color": col, "optional": w["optional"],
            "board_px": [a.x * res["w"], (1 - a.y) * res["h"]], "module_px": [b.x * res["w"], (1 - b.y) * res["h"]],
        })
    sc.render.filepath = str(OUTDIR / f"{key}.png")
    bpy.ops.render.render(write_still=True)
    (OUTDIR / f"{key}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print("rendered", key)


sc = bpy.context.scene
sc.cycles.samples = globals().get("SAMPLES", 96)
sc.cycles.use_denoising = True
sc.render.film_transparent = False
keys = globals().get("KEYS") or [s["key"] for s in SPEC]
for spec in SPEC:
    if spec["key"] in keys:
        render_one(spec)
