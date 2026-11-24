"""Build a realistic Lotus Nano Bot model in Blender.

Run inside Blender (or through MCP):
    exec(open(r"<repo>/tools/blender/lotus_board.py", encoding="utf-8").read())

All dimensions are millimetres in a "layout frame": x right, y towards the header
(back) edge, z up. Everything is parented to the empty "LotusNanoBot" which is
scaled 0.001 so the model is real size in metres.
Header pin tips are exported as empties named  PORT_<name>_<GND|5V|S>.
"""
import math
from pathlib import Path

import bmesh
import bpy

REPO = Path(globals().get("REPO_DIR", r"C:\Users\kongw\OneDrive\Documents\PROJECT\Surajit\Arduino-Lab"))
TEX = REPO / "tools" / "blender" / "textures"

PITCH = 2.54
PCB_W, PCB_D, PCB_CY = 76.0, 55.0, 2.0
BASE_TOP = 3.0
PCB_Z = 13.0           # bottom of the shield PCB
PCB_T = 1.6
TOP = PCB_Z + PCB_T    # top surface of the shield
HEADER_GROUPS = [
    (-33.0, ["A0", "A1", "A2", "A3", "A4", "A5"]),
    (-16.6, ["A6", "D0", "D1", "D3"]),
    (7.6, ["SV1", "SV2", "SV3"]),
    (19.6, ["AA0", "AA1", "AA2", "AA3"]),
]
ROW_Y = {"GND": 24.6, "5V": 22.06, "S": 19.52}

COLL_NAME = "LotusNanoBot"


# ------------------------------------------------------------------ helpers
def collection():
    if COLL_NAME in bpy.data.collections:
        coll = bpy.data.collections[COLL_NAME]
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(coll)
    return coll


COLL = collection()
ROOT = bpy.data.objects.new("LotusNanoBot", None)
COLL.objects.link(ROOT)
ROOT.scale = (0.001, 0.001, 0.001)


def link(obj, parent=None):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    COLL.objects.link(obj)
    obj.parent = parent or ROOT
    return obj


def material(name, color=(0.5, 0.5, 0.5), rough=0.5, metal=0.0, coat=0.0, coat_rough=0.1,
             transmission=0.0, ior=1.45, alpha=1.0, emission=None, emission_strength=0.0, image=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    inp = bsdf.inputs
    inp["Base Color"].default_value = (*color, 1)
    inp["Roughness"].default_value = rough
    inp["Metallic"].default_value = metal
    for key in ("Coat Weight", "Clearcoat"):
        if key in inp:
            inp[key].default_value = coat
            break
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in inp:
            inp[key].default_value = coat_rough
            break
    for key in ("Transmission Weight", "Transmission"):
        if key in inp:
            inp[key].default_value = transmission
            break
    inp["IOR"].default_value = ior
    inp["Alpha"].default_value = alpha
    if emission is not None:
        for key in ("Emission Color", "Emission"):
            if key in inp:
                inp[key].default_value = (*emission, 1)
                break
        inp["Emission Strength"].default_value = emission_strength
    if image:
        for n in [n for n in nt.nodes if n.type == "TEX_IMAGE"]:
            nt.nodes.remove(n)
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(image), check_existing=True)
        tex.interpolation = "Cubic"
        nt.links.new(tex.outputs["Color"], inp["Base Color"])
    if alpha < 1:
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            m.blend_method = "BLEND"
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


MAT = {
    "acrylic": material("acrylic_black", srgb("#030303"), rough=0.12, coat=0.6, coat_rough=0.08),
    "pcb_edge": material("pcb_edge", srgb("#6f6b52"), rough=0.8),
    "pcb_black": material("pcb_black", srgb("#141518"), rough=0.45, coat=0.6, coat_rough=0.3),
    "gold": material("gold", srgb("#d9b44a"), rough=0.22, metal=1.0),
    "tin": material("tin", srgb("#cfd3d8"), rough=0.28, metal=1.0),
    "zinc": material("zinc", srgb("#d6dbe0"), rough=0.42, metal=0.9),
    "nylon": material("nylon_black", srgb("#0d0d0e"), rough=0.35, coat=0.5),
    "plastic_black": material("plastic_black", srgb("#141416"), rough=0.55),
    "plastic_gray": material("plastic_gray", srgb("#3a3b3e"), rough=0.5),
    "plastic_red": material("plastic_red", srgb("#c8161b"), rough=0.4),
    "plastic_white": material("plastic_white", srgb("#efece4"), rough=0.45),
    "plastic_yellow": material("plastic_yellow", srgb("#f4c400"), rough=0.4),
    "jst": material("jst_cream", srgb("#efe4c6"), rough=0.5),
    "ic": material("ic_black", srgb("#18181a"), rough=0.62),
    "blue_cap": material("button_blue", srgb("#1d6fe0"), rough=0.3, coat=0.4),
    "tant": material("tantalum", srgb("#e7a91f"), rough=0.35),
    "res_blue": material("resistor_blue", srgb("#4d8fd6"), rough=0.4),
    "glass_black": material("oled_glass", srgb("#020203"), rough=0.04, coat=1.0, coat_rough=0.02),
    "acrylic_clear": material("acrylic_clear", srgb("#fff7e6"), rough=0.03, transmission=1.0, ior=1.49),
    "led_green": material("led_green", srgb("#2ecc40"), rough=0.15, transmission=0.6, emission=srgb("#2ecc40"), emission_strength=0.0),
    "steel": material("steel", srgb("#b9bec4"), rough=0.32, metal=1.0),
    "rubber": material("rubber", srgb("#0b0b0b"), rough=0.85),
}
for key, img in (("tex_shield", "lotus_shield.png"), ("tex_nano", "nano.png"), ("tex_tb", "tb6612.png"), ("tex_oled", "oled_pcb.png")):
    MAT[key] = material(key, rough=0.55, coat=0.15, coat_rough=0.4, image=TEX / img)


def box(name, sx, sy, sz, x, y, z, mat, bevel=0.0, parent=None, rot_z=0.0):
    """Box with its bottom at z."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    o.rotation_euler[2] = rot_z
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
    link(o, parent)
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def cyl(name, r, h, x, y, z, mat, seg=32, parent=None, r2=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r if r2 is None else r2, depth=h, location=(x, y, z + h / 2), rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    link(o, parent)
    return o


def textured_plane(name, sx, sy, x, y, z, mat, parent=None, rot_z=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, 1)
    o.rotation_euler[2] = rot_z
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    link(o, parent)
    return o


def pcb(name, w, d, x, y, z, top_mat, edge=None, t=PCB_T, parent=None, rot_z=0.0):
    slab = box(name, w, d, t - 0.02, x, y, z, edge or MAT["pcb_edge"], bevel=0.15, parent=parent, rot_z=rot_z)
    textured_plane(name + "_top", w, d, x, y, z + t, top_mat, parent=parent, rot_z=rot_z)
    return slab


def empty(name, x, y, z):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 1.2
    e.location = (x, y, z)
    if name.startswith("PORT_"):
        parts = name.split("_")
        e["port"] = parts[1]
        e["row"] = parts[2]
    link(e)
    return e


def hexagon(name, r, h, x, y, z, mat):
    return cyl(name, r, h, x, y, z, mat, seg=6)


# ------------------------------------------------------------------ base + standoffs
box("base_acrylic", 86, 64, BASE_TOP, 0, PCB_CY - 0.5, 0, MAT["acrylic"], bevel=0.5)
corner = [(-PCB_W / 2 + 3.2, PCB_CY - PCB_D / 2 + 3.2), (PCB_W / 2 - 3.2, PCB_CY - PCB_D / 2 + 3.2),
          (-PCB_W / 2 + 3.2, PCB_CY + PCB_D / 2 - 6.5), (PCB_W / 2 - 3.2, PCB_CY + PCB_D / 2 - 6.5)]
for i, (x, y) in enumerate(corner):
    cyl(f"standoff_{i}", 2.6, PCB_Z - BASE_TOP, x, y, BASE_TOP, MAT["nylon"], seg=24)
    hexagon(f"nut_{i}", 3.2, 2.4, x, y, TOP, MAT["zinc"])
    cyl(f"screw_{i}", 1.5, 4.5, x, y, TOP + 2.4, MAT["zinc"], seg=16)
    cyl(f"screw_head_{i}", 2.8, 1.6, x, y, -1.6, MAT["zinc"], seg=24)

# ------------------------------------------------------------------ shield PCB
pcb("shield_pcb", PCB_W, PCB_D, 0, PCB_CY, PCB_Z, MAT["tex_shield"], edge=MAT["pcb_black"])

# ------------------------------------------------------------------ 3-row headers
ROW_HOUSING = {"GND": MAT["plastic_gray"], "5V": MAT["plastic_red"], "S": MAT["plastic_white"]}
PIN_H = 11.5
for x0, names in HEADER_GROUPS:
    n = len(names)
    cx = x0 + (n - 1) * PITCH / 2
    servo = names[0].startswith("SV")
    for row, y in ROW_Y.items():
        hm = MAT["plastic_yellow"] if (servo and row == "S") else ROW_HOUSING[row]
        box(f"hdr_{names[0]}_{row}", n * PITCH, 2.45, 2.5, cx, y, TOP, hm, bevel=0.15)
        for i, name in enumerate(names):
            x = x0 + i * PITCH
            box(f"pin_{name}_{row}", 0.64, 0.64, PIN_H, x, y, TOP - 3.0, MAT["gold"], bevel=0.12)
            empty(f"PORT_{name}_{row}", x, y, TOP - 3.0 + PIN_H)

# JST-XH motor connectors ML / MR
for name, x in (("ML", -4.3), ("MR", 1.3)):
    box(f"jst_{name}", 5.0, 5.8, 7.0, x, 21.2, TOP, MAT["jst"], bevel=0.2)
    box(f"jst_{name}_slot", 4.0, 4.2, 0.3, x, 21.6, TOP + 7.0, MAT["plastic_black"])
    for dx in (-1.25, 1.25):
        box(f"jst_{name}_pin", 0.64, 0.64, 5.5, x + dx, 21.6, TOP + 2.0, MAT["tin"])
    empty(f"PORT_{name}_JST", x, 21.6, TOP + 7.0)

# ------------------------------------------------------------------ Arduino Nano on female headers
NX, NY = -0.4, -4.6
NZ = TOP + 8.5
for side in (-7.62, 7.62):
    box(f"nano_socket_{side}", 2.5, 15 * PITCH, 8.5, NX + side, NY, TOP, MAT["plastic_black"], bevel=0.15)
pcb("nano_pcb", 18.0, 43.2, NX, NY, NZ, MAT["tex_nano"], edge=material("nano_blue", srgb("#1f4fa3"), rough=0.45))
NT = NZ + PCB_T
box("atmega328p", 7.0, 7.0, 1.0, NX + 0.2, NY - 1.0, NT, MAT["ic"], bevel=0.1, rot_z=math.radians(45))
for k in range(4):
    a = math.radians(45 + 90 * k)
    for j in range(8):
        off = -2.6 + j * 0.74
        dx, dy = math.cos(a) * 3.9, math.sin(a) * 3.9
        px, py = -math.sin(a) * off, math.cos(a) * off
        box("qfp_leg", 0.3, 0.9 if abs(math.cos(a)) < 0.5 else 0.3, 0.2, NX + 0.2 + dx + px, NY - 1.0 + dy + py, NT, MAT["tin"], rot_z=a)
box("nano_usb", 7.8, 9.2, 3.9, NX, NY - 21.6 + 3.6, NT, MAT["steel"], bevel=0.3)
box("nano_reset_base", 3.6, 6.0, 1.3, NX, NY + 8.2, NT, MAT["steel"])
box("nano_reset_btn", 1.8, 3.2, 0.8, NX, NY + 8.2, NT + 1.3, MAT["plastic_white"], bevel=0.2)
box("nano_crystal", 3.2, 1.4, 0.9, NX - 3.5, NY + 4.0, NT, MAT["steel"], bevel=0.3, rot_z=math.radians(-30))
for i in range(4):
    box(f"nano_led_{i}", 1.0, 1.6, 0.5, NX - 3.6 + i * 2.4, NY + 12.6, NT, material(f"nano_led_mat_{i}", srgb("#f5f0e0"), rough=0.3))
box("nano_icsp", 5.08, 7.62, 2.5, NX, NY + 19.0, NT, MAT["plastic_black"], bevel=0.15)
for i in range(3):
    for j in range(2):
        box("icsp_pin", 0.64, 0.64, 8.0, NX - 1.27 + j * 2.54, NY + 16.46 + i * 2.54, NT, MAT["gold"])

# ------------------------------------------------------------------ TB6612 module
TX, TY = 17.4, 7.75
for side in (-7.62, 7.62):
    box(f"tb_socket_{side}", 2.5, 8 * PITCH, 8.5, TX + side, TY, TOP, MAT["plastic_black"], bevel=0.15)
pcb("tb6612_pcb", 18.4, 21.0, TX, TY, TOP + 8.5, MAT["tex_tb"], edge=material("tb_red", srgb("#c22a22"), rough=0.45))
TT = TOP + 8.5 + PCB_T
box("tb6612_chip", 6.5, 4.4, 1.1, TX, TY + 0.5, TT, MAT["ic"], bevel=0.08, rot_z=math.radians(90))
box("tb6612_tant", 3.5, 2.8, 1.9, TX, TY + 6.2, TT, MAT["tant"], bevel=0.25)
for dx in (-2.0, 2.0):
    box("tb_smd", 1.6, 0.8, 0.5, TX + dx, TY + 3.0, TT, material("smd_cap", srgb("#a48a5c"), rough=0.5))
for i in range(8):
    for side in (-7.62, 7.62):
        cyl("tb_pad", 0.9, 0.25, TX + side, TY + 8.5 - 2.0 - i * PITCH + 0.5, TT, MAT["tin"], seg=16)

# ------------------------------------------------------------------ OLED (on headers, inside a clear acrylic case) + buzzer under it
OX, OY = -26.75, 2.6
OZ = TOP + 9.0
cyl("buzzer", 6.0, 8.5, OX + 1.0, OY - 2.0, TOP, MAT["plastic_black"], seg=48)
box("oled_socket", 4 * PITCH, 2.5, 9.0, OX, OY + 11.8, TOP, MAT["plastic_black"])
pcb("oled_pcb", 27.0, 27.5, OX, OY, OZ, MAT["tex_oled"], edge=material("oled_blue", srgb("#1f4fa3"), rough=0.45))
box("oled_glass", 26.0, 19.0, 1.3, OX, OY - 1.2, OZ + PCB_T, MAT["glass_black"], bevel=0.2)
box("oled_flex", 9.0, 3.0, 0.2, OX, OY - 11.6, OZ + PCB_T, material("flex", srgb("#d39a1c"), rough=0.4))
screen = textured_plane("oled_screen", 22.0, 11.0, OX, OY - 0.4, OZ + PCB_T + 1.32, material("oled_screen", srgb("#000000"), rough=0.2, emission=srgb("#7fd3ff"), emission_strength=0.0))
for (dx, dy) in ((-13.2, 13.4), (13.2, 13.4), (-13.2, -13.4), (13.2, -13.4)):
    cyl("oled_case_post", 1.2, 8.0, OX + dx, OY + dy, OZ - 2.0, MAT["acrylic_clear"], seg=16)
    cyl("oled_case_screw", 1.4, 0.9, OX + dx, OY + dy, OZ + 6.0, MAT["zinc"], seg=20)
box("oled_case_top", 30.0, 30.0, 2.0, OX, OY, OZ + 4.0, MAT["acrylic_clear"], bevel=0.6)

# ------------------------------------------------------------------ ADS1115 / bluetooth / compass headers
box("ads_header", 2.5, 10 * PITCH, 8.5, 31.8, 17.2 - 4.5 * PITCH, TOP, MAT["plastic_black"], bevel=0.15)
box("bt_header", 4 * PITCH, 2.5, 8.5, 32.5, 21.9 + 0.2, TOP, MAT["plastic_black"], bevel=0.15)
box("compass_header", 5 * PITCH, 2.5, 8.5, 15.78, -7.2, TOP, MAT["plastic_black"], bevel=0.15)
res = cyl("compass_resistor", 1.1, 6.0, 15.8, -13.6, TOP + 0.6, MAT["res_blue"], rot=(0, math.radians(90), 0))
for i, c in enumerate(("#8b4513", "#000000", "#ff0000", "#d4af37")):
    cyl("res_band", 1.15, 0.45, 13.6 + i * 1.2, -13.6, TOP + 0.6, material(f"band_{c}", srgb(c), rough=0.4), seg=20, rot=(0, math.radians(90), 0))

# ------------------------------------------------------------------ T-plug (red, Deans) at the right edge
box("tplug_housing", 12.0, 8.0, 6.5, 34.0, -11.2, TOP, MAT["plastic_red"], bevel=0.6)
box("tplug_blade_a", 6.0, 0.4, 4.5, 41.5, -13.0, TOP + 1.0, MAT["gold"])
box("tplug_blade_b", 0.4, 6.0, 4.5, 42.2, -10.2, TOP + 1.0, MAT["gold"])

# ------------------------------------------------------------------ D2 push button
BX, BY = 28.4, -17.9
box("btn_base", 6.2, 6.2, 3.4, BX, BY, TOP, MAT["plastic_black"], bevel=0.2)
box("btn_plate", 5.6, 5.6, 0.3, BX, BY, TOP + 3.4, MAT["steel"])
cyl("btn_cap", 2.9, 4.6, BX, BY, TOP + 3.6, MAT["blue_cap"], seg=40)
for dx in (-3.25, 3.25):
    for dy in (-2.25, 2.25):
        box("btn_leg", 0.8, 0.4, 1.2, BX + dx, BY + dy, TOP, MAT["tin"])

# ------------------------------------------------------------------ Knob A7 (potentiometer)
KX, KY = -17.2, -16.9
box("pot_body", 9.8, 10.8, 6.6, KX, KY, TOP, MAT["steel"], bevel=0.3)
box("pot_bushing", 7.0, 7.0, 1.0, KX, KY, TOP + 6.6, MAT["steel"])
bm = bmesh.new()
n = 36
verts_b, verts_t = [], []
for i in range(n):
    a = 2 * math.pi * i / n
    r = 3.0 if i % 2 == 0 else 2.75
    verts_b.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0)))
    verts_t.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 11.0)))
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((verts_b[i], verts_b[j], verts_t[j], verts_t[i]))
bm.faces.new(list(reversed(verts_b)))
bm.faces.new(verts_t)
me = bpy.data.meshes.new("knob_shaft")
bm.to_mesh(me)
bm.free()
shaft = bpy.data.objects.new("knob_shaft", me)
shaft.location = (KX, KY, TOP + 7.6)
shaft.data.materials.append(MAT["plastic_black"])
link(shaft)
box("knob_slot", 0.8, 5.6, 0.3, KX, KY, TOP + 18.6, MAT["rubber"])

# ------------------------------------------------------------------ power LED + slide switch
cyl("pwr_led", 1.5, 3.6, -36.1, -14.3, TOP + 2.0, MAT["led_green"], seg=32)
cyl("pwr_led_dome", 1.5, 0.01, -36.1, -14.3, TOP + 5.6, MAT["led_green"], seg=32)
box("pwr_led_rim", 3.6, 3.6, 0.6, -36.1, -14.3, TOP + 2.0, MAT["led_green"])
box("switch_body", 8.6, 3.8, 3.6, -29.5, -21.2, TOP, MAT["steel"], bevel=0.2)
box("switch_lever", 1.6, 1.6, 2.2, -27.6, -21.2, TOP + 3.6, MAT["plastic_black"], bevel=0.2)

print("Lotus Nano Bot built:", len(COLL.objects), "objects")
