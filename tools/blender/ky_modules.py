"""Procedural models of the 37-in-1 sensor kit modules (Blender).

    exec(open(r"<repo>/tools/blender/ky_modules.py", encoding="utf-8").read())
    build_module("photoresistor", collection_name="KY_photoresistor")

Module frame (mm): PCB lies in the XY plane, top surface at z = 1.6.
The male header is on the -X edge with right-angle pins pointing to -X (towards the board).
Pin tips are empties named PIN_<label>.  The root empty is scaled 0.001 (metres).
"""
import math

import bpy

PITCH = 2.54
T = 1.6

if "MAT" not in globals():
    raise RuntimeError("run lotus_board.py first (it defines materials and helpers)")


def _mat(name, hexcol, **kw):
    return material(name, srgb(hexcol), **kw)


MM = {
    "pcb_black": _mat("ky_pcb_black", "#16181b", rough=0.45, coat=0.5, coat_rough=0.3),
    "pcb_red": _mat("ky_pcb_red", "#b8261f", rough=0.45, coat=0.5, coat_rough=0.3),
    "silk": _mat("ky_silk", "#f2f2ee", rough=0.6),
    "pad": _mat("ky_pad", "#d0d3d8", rough=0.3, metal=1.0),
    "led_red": _mat("ky_led_red", "#ff3020", rough=0.08, transmission=0.85, ior=1.5),
    "led_clear": _mat("ky_led_clear", "#f4f6ff", rough=0.04, transmission=1.0, ior=1.5),
    "led_diffuse": _mat("ky_led_diffuse", "#f3efe6", rough=0.35, transmission=0.4, ior=1.5),
    "ir_dark": _mat("ky_ir_dark", "#111118", rough=0.1, coat=0.8),
    "ir_purple": _mat("ky_ir_purple", "#5a5a8a", rough=0.08, transmission=0.6, ior=1.5),
    "brass": _mat("ky_brass", "#c9a447", rough=0.25, metal=1.0),
    "glass": _mat("ky_glass", "#f8fbff", rough=0.02, transmission=1.0, ior=1.5),
    "mercury": _mat("ky_mercury", "#d6dade", rough=0.05, metal=1.0),
    "blue_plastic": _mat("ky_blue_plastic", "#2b4fb8", rough=0.4),
    "sky": _mat("ky_sky", "#5aa9e6", rough=0.6),
    "relay_blue": _mat("ky_relay_blue", "#2546b4", rough=0.35, coat=0.3),
    "terminal_blue": _mat("ky_terminal", "#1f62d6", rough=0.4),
    "orange": _mat("ky_orange", "#d8701e", rough=0.2, transmission=0.3),
    "ldr": _mat("ky_ldr", "#d8a03c", rough=0.4),
    "ldr_track": _mat("ky_ldr_track", "#7a2a10", rough=0.5),
    "bead": _mat("ky_bead", "#101010", rough=0.3, coat=0.6),
    "mic": _mat("ky_mic", "#c8ccd2", rough=0.35, metal=0.9),
    "felt": _mat("ky_felt", "#141414", rough=0.95),
    "tcrt_blue": _mat("ky_tcrt_blue", "#2d3c9c", rough=0.2, transmission=0.3),
    "tcrt_black": _mat("ky_tcrt_black", "#0d0d10", rough=0.2),
    "white": MAT["plastic_white"],
    "black": MAT["plastic_black"],
    "gold": MAT["gold"],
    "tin": MAT["tin"],
    "steel": MAT["steel"],
    "ic": MAT["ic"],
    "trim": _mat("ky_trimpot", "#2266d0", rough=0.35),
}


class Builder:
    def __init__(self, coll_name, root_name):
        self.coll = bpy.data.collections.get(coll_name)
        if self.coll:
            for o in list(self.coll.objects):
                bpy.data.objects.remove(o, do_unlink=True)
        else:
            self.coll = bpy.data.collections.new(coll_name)
            bpy.context.scene.collection.children.link(self.coll)
        self.root = bpy.data.objects.new(root_name, None)
        self.coll.objects.link(self.root)
        self.root.scale = (0.001, 0.001, 0.001)

    def own(self, o):
        for c in o.users_collection:
            c.objects.unlink(o)
        self.coll.objects.link(o)
        o.parent = self.root
        return o

    def box(self, sx, sy, sz, x, y, z, mat, bevel=0.0, rz=0.0, name="part"):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
        o = bpy.context.active_object
        o.name = name
        o.scale = (sx, sy, sz)
        o.rotation_euler[2] = rz
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.data.materials.append(mat)
        if bevel:
            b = o.modifiers.new("bevel", "BEVEL")
            b.width = bevel
            b.segments = 3
            b.limit_method = "ANGLE"
        return self.own(o)

    def cyl(self, r, h, x, y, z, mat, seg=32, r2=None, rot=(0, 0, 0), name="part"):
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r if r2 is None else r2, depth=h, location=(x, y, z + h / 2), rotation=rot)
        o = bpy.context.active_object
        o.name = name
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        return self.own(o)

    def hcyl(self, r, length, x, y, z, mat, axis="x", seg=32, name="part"):
        """Horizontal cylinder centred at (x, y, z)."""
        rot = (0, math.radians(90), 0) if axis == "x" else (math.radians(90), 0, 0)
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=length, location=(x, y, z), rotation=rot)
        o = bpy.context.active_object
        o.name = name
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        return self.own(o)

    def sphere(self, r, x, y, z, mat, name="part", sz=1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=(x, y, z))
        o = bpy.context.active_object
        o.name = name
        o.scale[2] = sz
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        return self.own(o)

    def empty(self, name, x, y, z):
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 1.0
        e.location = (x, y, z)
        if name.startswith("PIN_"):
            e["pin"] = name[4:]
        self.coll.objects.link(e)
        e.parent = self.root
        return e

    def text(self, s, x, y, size=1.2, rz=0.0):
        curve = bpy.data.curves.new("silk", "FONT")
        curve.body = s
        curve.size = size
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        o = bpy.data.objects.new("silk_" + s, curve)
        o.location = (x, y, T + 0.01)
        o.rotation_euler[2] = rz
        o.data.materials.append(MM["silk"])
        self.coll.objects.link(o)
        o.parent = self.root
        return o


# ------------------------------------------------------------------ common pieces
def ky_pcb(b, w, d, color="black", holes=((1, 1),), pins=("S", "+", "-"), header_x=None):
    """PCB centred at origin. Header along -X edge. Returns pin y positions."""
    mat = MM["pcb_red"] if color == "red" else MM["pcb_black"]
    b.box(w, d, T, 0, 0, 0, mat, bevel=0.2, name="pcb")
    hx = -w / 2 + 1.4 if header_x is None else header_x
    n = len(pins)
    ys = [((n - 1) / 2 - i) * PITCH for i in range(n)]
    # header housing under the PCB edge + right-angle pins
    b.box(2.5, n * PITCH, 2.5, hx, 0, -2.5, MM["black"], bevel=0.15, name="header")
    for p, y in zip(pins, ys):
        b.box(0.64, 0.64, 4.2, hx, y, -1.25, MM["gold"], name="pin_v")
        b.box(8.5, 0.64, 0.64, hx - 4.25, y, -1.25 - 0.32, MM["gold"], name="pin_h")
        b.cyl(0.85, 0.05, hx, y, T, MM["pad"], seg=16, name="pad")
        b.text(p, hx + 2.6, y, size=1.15)
        b.empty("PIN_" + p, hx - 8.3, y, -1.25)
    # mounting holes
    for (sx, sy) in holes:
        hxp, hyp = sx * (w / 2 - 2.6), sy * (d / 2 - 2.6)
        b.cyl(1.55, 0.05, hxp, hyp, T, MM["pad"], seg=24, name="hole_ring")
        b.cyl(1.0, 0.06, hxp, hyp, T, MM["ic"], seg=24, name="hole")
    return ys


def smd(b, x, y, w=1.6, d=0.8, mat=None, rz=0.0):
    b.box(w * 0.7, d, 0.45, x, y, T, mat or MM["ic"], rz=rz, name="smd")
    for s in (-1, 1):
        b.box(w * 0.15, d, 0.45, x + s * w * 0.42 * math.cos(rz), y + s * w * 0.42 * math.sin(rz), T, MM["tin"], rz=rz, name="smd_cap")


def led5(b, x, y, mat, h=7.0, r=2.5, bent=False):
    """Standing 5 mm LED (bent=True: lying flat, lens towards +X)."""
    if bent:
        b.hcyl(r, 5.5, x + 2.8, y, T + r + 1.2, mat, name="led_body")
        b.sphere(r, x + 5.5, y, T + r + 1.2, mat, name="led_dome")
        b.hcyl(r * 1.12, 0.8, x + 0.4, y, T + r + 1.2, mat, name="led_rim")
        for dy in (-1.27, 1.27):
            b.box(2.0, 0.45, 0.45, x - 1.0, y + dy * 0.6, T + r + 1.2, MM["tin"], name="leg")
        return
    b.cyl(r * 1.12, 0.8, x, y, T + h - 5.5, mat, name="led_rim")
    b.cyl(r, 5.0, x, y, T + h - 5.0, mat, name="led_body")
    b.sphere(r, x, y, T + h, mat, name="led_dome")
    for dy in (-1.27, 1.27):
        b.box(0.45, 0.45, h - 5.5, x, y + dy * 0.5, T, MM["tin"], name="leg")


def to92(b, x, y, mat, h=4.5, legs=3.0, flat_to=0.0):
    o = b.cyl(2.3, h, x, y, T + legs, mat, seg=32, name="to92")
    b.box(2.6, 4.6, h, x - 1.15, y, T + legs, mat, name="to92_flat")
    for dy in (-1.27, 0, 1.27):
        b.box(0.45, 0.45, legs, x, y + dy, T, MM["tin"], name="leg")
    return o


def comparator_board(b, w=32.0, d=14.0, pins=("AO", "G", "+", "DO")):
    """Red 4-pin LM393 sensor board (KY-024/025/026/028/036/037/038)."""
    ky_pcb(b, w, d, color="red", holes=((1, 0),), pins=pins)
    b.box(4.9, 3.9, 1.5, -2.5, -2.6, T, MM["ic"], bevel=0.1, name="lm393")
    for i in range(4):
        for s in (-1, 1):
            b.box(0.4, 1.0, 0.25, -4.4 + i * 1.27, -2.6 + s * 2.4, T, MM["tin"], name="soic_leg")
    b.box(9.5, 4.8, 10.0, -1.0, 3.6, T, MM["trim"], bevel=0.4, name="trimpot")
    b.cyl(1.1, 0.8, -4.9, 3.6, T + 10.0, MM["steel"], seg=16, name="trim_screw")
    for i, xx in enumerate((-8.0, 3.6, 5.6)):
        smd(b, xx, -5.0 + (i % 2) * 2.0)
    b.box(1.6, 0.8, 0.6, -7.5, 4.6, T, MM["led_diffuse"], name="pwr_led")
    b.box(1.6, 0.8, 0.6, -7.5, 1.0, T, MM["led_diffuse"], name="d_led")
    return 6.0  # x where the sensing element goes


def black_board(b, pins=("S", "+", "-"), w=18.5, d=15.0):
    ky_pcb(b, w, d, color="black", holes=((1, 1), (1, -1)), pins=pins)
    smd(b, 0.5, -4.5)


# ------------------------------------------------------------------ per-module builders
def m_led(color_mat, pins=("S", "+", "-"), bent=False, two=False):
    def f(b):
        black_board(b, pins)
        led5(b, 3.5, 0, color_mat, bent=bent)
    return f


def m_rgb(b):
    black_board(b, ("B", "G", "R", "-"))
    b.cyl(2.5, 0.8, 3.5, 0, T + 2.0, MM["led_diffuse"], name="led_rim")
    b.cyl(2.5, 5.0, 3.5, 0, T + 2.5, MM["led_diffuse"], name="led_body")
    b.sphere(2.5, 3.5, 0, T + 7.5, MM["led_diffuse"], name="led_dome")
    for dy in (-1.9, -0.63, 0.63, 1.9):
        b.box(0.45, 0.45, 2.0, 3.5, dy * 0.6, T, MM["tin"])


def m_smd_rgb(b):
    black_board(b, ("B", "G", "R", "-"))
    b.box(5.0, 5.0, 1.5, 3.0, 0, T, MM["white"], bevel=0.2, name="smd_package")
    b.cyl(2.0, 0.1, 3.0, 0, T + 1.5, MM["led_diffuse"], name="led_dome")


def m_two_color(mini=False):
    def f(b):
        black_board(b, ("-", "R", "G") if not mini else ("-", "R", "G"))
        led5(b, 3.5, 0, MM["led_diffuse"], r=2.5 if not mini else 1.5, h=7.0 if not mini else 5.0)
    return f


def m_laser(b):
    black_board(b, ("S", "+", "-"))
    b.hcyl(3.0, 11.0, 4.5, 0, T + 3.2, MM["brass"])
    b.hcyl(2.2, 0.4, 10.1, 0, T + 3.2, MM["glass"], name="laser_lens")


def m_buzzer(active):
    def f(b):
        black_board(b, ("S", "+", "-"))
        b.cyl(6.0, 8.5 if active else 7.5, 3.0, 0, T + 0.3, MM["black"], seg=48)
        if active:
            b.cyl(5.0, 0.05, 3.0, 0, T + 8.8, MM["white"], seg=48)
        else:
            b.cyl(1.2, 0.1, 3.0, 0, T + 7.8, MM["ic"], seg=24)
    return f


def m_button(b):
    black_board(b, ("S", "+", "-"))
    b.box(6.2, 6.2, 3.4, 3.0, 0, T, MM["black"], bevel=0.2)
    b.box(5.6, 5.6, 0.3, 3.0, 0, T + 3.4, MM["steel"])
    b.cyl(1.75, 1.6, 3.0, 0, T + 3.7, MM["black"], seg=32)


def m_relay(b):
    ky_pcb(b, 34.0, 26.0, color="black", holes=((1, 1), (1, -1)), pins=("S", "+", "-"))
    b.box(19.0, 15.5, 15.5, 2.0, 0, T, MM["relay_blue"], bevel=0.5)
    b.box(8.0, 15.0, 10.0, 13.0, 0, T, MM["terminal_blue"], bevel=0.3)
    for dy in (-5.0, 0, 5.0):
        b.cyl(1.6, 0.6, 13.0, dy, T + 10.0, MM["steel"], seg=24)
    b.box(1.6, 0.8, 0.6, -10.0, 8.0, T, MM["led_red"], name="relay_led")


def m_joystick(b):
    ky_pcb(b, 34.0, 26.0, color="black", holes=((1, 1), (1, -1), (-1, 1), (-1, -1)), pins=("GND", "+5V", "VRX", "VRY", "SW"))
    b.box(16.0, 16.0, 11.0, 4.0, 0, T, MM["black"], bevel=0.6)
    b.cyl(3.0, 7.0, 4.0, 0, T + 11.0, MM["black"], seg=32)
    b.cyl(9.5, 6.0, 4.0, 0, T + 16.0, MAT["rubber"], r2=8.0, seg=48)
    b.sphere(8.0, 4.0, 0, T + 22.0, MAT["rubber"], sz=0.35)


def m_rotary(b):
    ky_pcb(b, 26.0, 19.0, color="black", holes=((1, 1), (1, -1)), pins=("CLK", "DT", "SW", "+", "GND"))
    b.box(12.0, 13.0, 6.5, 4.0, 0, T, MM["steel"], bevel=0.3)
    b.cyl(3.5, 6.0, 4.0, 0, T + 6.5, MM["steel"], seg=32)
    b.cyl(3.0, 12.0, 4.0, 0, T + 12.5, MM["steel"], seg=32)


def m_dht(b):
    black_board(b, ("S", "+", "-"), w=20.0, d=18.0)
    b.box(12.0, 15.5, 5.5, 3.5, 0, T, MM["sky"], bevel=0.3)
    for i in range(4):
        for j in range(5):
            b.box(1.4, 1.6, 0.4, 0.5 + i * 2.3, -4.8 + j * 2.4, T + 5.4, MM["black"])


def m_to92(color="#111111"):
    def f(b):
        black_board(b, ("S", "+", "-"))
        to92(b, 4.0, 0, _mat("to92_" + color, color, rough=0.5))
    return f


def m_thermistor(b):
    black_board(b, ("S", "+", "-"))
    b.box(6.0, 0.45, 0.45, 6.0, -0.6, T + 2.0, MM["tin"])
    b.box(6.0, 0.45, 0.45, 6.0, 0.6, T + 2.0, MM["tin"])
    b.sphere(1.4, 9.5, 0, T + 2.0, MM["bead"], sz=0.8)


def m_ldr(b):
    black_board(b, ("S", "+", "-"))
    b.cyl(2.5, 1.8, 4.0, 0, T + 4.0, MM["ldr"], seg=40)
    for i in range(5):
        b.box(3.4, 0.25, 0.05, 4.0, -1.4 + i * 0.7, T + 5.8, MM["ldr_track"])
    for dy in (-1.0, 1.0):
        b.box(0.45, 0.45, 4.0, 4.0, dy, T, MM["tin"])


def m_reed(glass_tube=True, red=False):
    def f(b):
        if red:
            x0 = comparator_board(b)
        else:
            black_board(b, ("S", "+", "-"))
            x0 = 0.0
        b.hcyl(1.2, 14.0, x0 + 4.0, 0, T + 2.0, MM["glass"])
        b.box(9.0, 0.5, 0.3, x0 + 4.0, 0, T + 2.0, MM["gold"])
    return f


def m_mercury(b):
    black_board(b, ("S", "+", "-"))
    b.hcyl(2.0, 10.0, 4.0, 0, T + 4.5, MM["glass"])
    b.sphere(1.3, 1.5, 0, T + 4.3, MM["mercury"])
    for dy in (-0.8, 0.8):
        b.box(0.4, 0.4, 3.0, -1.0, dy, T, MM["tin"])


def m_ball_tilt(b):
    black_board(b, ("S", "+", "-"))
    b.box(4.5, 8.0, 4.5, 3.5, 0, T + 0.5, MM["blue_plastic"], bevel=0.6)


def m_mic(red=True):
    def f(b):
        x0 = comparator_board(b)
        if red:
            b.cyl(4.9 if True else 3.0, 5.0, x0 + 5.0, 0, T, MM["mic"], seg=48)
            b.cyl(4.4, 0.05, x0 + 5.0, 0, T + 5.0, MM["felt"], seg=48)
    return f


def m_mic_small(b):
    x0 = comparator_board(b)
    b.cyl(3.0, 4.0, x0 + 4.0, 0, T, MM["mic"], seg=40)
    b.cyl(2.6, 0.05, x0 + 4.0, 0, T + 4.0, MM["felt"], seg=40)


def m_flame(b):
    x0 = comparator_board(b)
    led5(b, x0 + 4.0, 0, MM["ir_dark"], bent=True)


def m_touch(b):
    x0 = comparator_board(b)
    to92(b, x0 + 5.0, 0, MM["steel"], legs=6.0)


def m_linear_hall(b):
    x0 = comparator_board(b)
    b.box(4.0, 1.5, 3.0, x0 + 6.0, 0, T + 3.0, MM["ic"])
    for dy in (-1.27, 0, 1.27):
        b.box(4.0, 0.4, 0.4, x0 + 3.0, dy, T + 3.0, MM["tin"])


def m_temp_digital(b):
    x0 = comparator_board(b)
    b.box(5.0, 0.45, 0.45, x0 + 3.0, -0.6, T + 2.0, MM["tin"])
    b.box(5.0, 0.45, 0.45, x0 + 3.0, 0.6, T + 2.0, MM["tin"])
    b.sphere(1.4, x0 + 6.5, 0, T + 2.0, MM["bead"], sz=0.8)


def m_ir_rx(b):
    black_board(b, ("S", "+", "-"))
    b.box(6.0, 5.0, 7.0, 4.0, 0, T + 2.5, MM["ic"], bevel=0.3)
    b.sphere(1.9, 6.6, 0, T + 6.5, MM["ic"], sz=1.0)
    b.box(6.6, 5.6, 0.4, 4.0, 0, T + 2.3, MM["steel"])


def m_ir_tx(b):
    black_board(b, ("S", "+", "-"))
    led5(b, 3.0, 0, MM["led_clear"], bent=True)


def m_heartbeat(b):
    black_board(b, ("S", "+", "-"))
    led5(b, 2.0, -2.8, MM["led_clear"], h=6.0)
    led5(b, 2.0, 2.8, MM["ir_dark"], h=6.0)


def m_tap(b):
    black_board(b, ("S", "+", "-"))
    b.box(8.0, 6.0, 4.0, 3.0, 0, T, MM["black"], bevel=0.3)
    b.cyl(1.5, 6.0, 3.0, 0, T + 4.0, MM["steel"], seg=16)


def m_shock(b):
    black_board(b, ("S", "+", "-"))
    b.hcyl(2.2, 7.0, 4.5, 0, T + 2.6, MM["steel"])
    b.hcyl(0.5, 3.0, 8.5, 0, T + 2.6, MM["steel"])


def m_light_cup(b):
    black_board(b, ("G", "+", "S", "L"))
    b.hcyl(2.0, 9.0, 4.0, -2.0, T + 4.0, MM["glass"])
    b.sphere(1.3, 1.5, -2.0, T + 3.8, MM["mercury"])
    led5(b, 4.0, 3.5, MM["led_red"], h=6.0, r=1.5)  # cup LED (pin L)


def m_light_block(b):
    black_board(b, ("S", "+", "-"))
    b.box(6.0, 2.5, 10.0, 3.5, -3.0, T, MM["black"], bevel=0.2)
    b.box(6.0, 2.5, 10.0, 3.5, 3.0, T, MM["black"], bevel=0.2)
    b.box(6.0, 8.5, 2.5, 3.5, 0, T, MM["black"], bevel=0.2)


def m_tracking(b):
    ky_pcb(b, 40.0, 10.5, color="black", holes=((1, 0),), pins=("S", "V+", "G"))
    b.box(9.5, 5.6, 0.5, 13.0, 0, -0.5, MM["black"])
    b.cyl(2.3, 6.0, 13.0, -1.4, -6.5, MM["tcrt_blue"], seg=24)
    b.cyl(2.3, 6.0, 13.0, 1.4, -6.5, MM["tcrt_black"], seg=24)
    b.box(9.5, 4.8, 10.0, -2.0, 0, T, MM["trim"], bevel=0.4)
    b.box(4.9, 3.9, 1.5, 6.0, 0, T, MM["ic"], bevel=0.1)


def m_avoidance(b):
    ky_pcb(b, 42.0, 13.0, color="black", holes=((1, 0),), pins=("GND", "+", "OUT", "EN"))
    b.box(5.0, 5.0, 3.5, -4.0, 3.0, T, MM["white"])
    b.cyl(1.2, 0.5, -4.0, 3.0, T + 3.5, MM["steel"], seg=16)
    b.box(5.0, 5.0, 3.5, 4.0, 3.0, T, MM["white"])
    b.cyl(1.2, 0.5, 4.0, 3.0, T + 3.5, MM["steel"], seg=16)
    b.box(4.9, 3.9, 1.5, 2.0, -3.0, T, MM["ic"], bevel=0.1)
    led5(b, 16.0, -3.0, MM["led_clear"], bent=True, r=2.5)
    led5(b, 16.0, 3.0, MM["ir_dark"], bent=True, r=2.5)


def m_7color(b):
    black_board(b, ("S", "+", "-"))
    led5(b, 3.5, 0, MM["led_clear"])


def m_hall_small(b):
    black_board(b, ("S", "+", "-"))
    to92(b, 4.0, 0, MM["ic"], h=3.0, legs=3.0)


SPECS = {
    # sensors
    "ds18b20-temperature-sensor": ("KY-001", m_to92("#141414")),
    "vibration-sensor": ("KY-002", m_shock),
    "hall-magnetic-sensor": ("KY-003", m_hall_small),
    "light-blocking-sensor": ("KY-010", m_light_block),
    "analog-temperature-sensor": ("KY-013", m_thermistor),
    "temperature-humidity-sensor": ("KY-015", m_dht),
    "mercury-switch": ("KY-017", m_mercury),
    "photoresistor": ("KY-018", m_ldr),
    "tilt-switch": ("KY-020", m_ball_tilt),
    "magnetic-spring-sensor": ("KY-021", m_reed()),
    "ir-receiver": ("KY-022", m_ir_rx),
    "linear-hall-sensor": ("KY-024", m_linear_hall),
    "reed-switch": ("KY-025", m_reed(red=True)),
    "flame-sensor": ("KY-026", m_flame),
    "light-cup-module": ("KY-027", m_light_cup),
    "digital-temperature-sensor": ("KY-028", m_temp_digital),
    "tap-module": ("KY-031", m_tap),
    "avoidance-sensor": ("KY-032", m_avoidance),
    "tracking-sensor": ("KY-033", m_tracking),
    "analog-hall-sensor": ("KY-035", m_hall_small),
    "touch-sensor": ("KY-036", m_touch),
    "big-sound-sensor": ("KY-037", m_mic()),
    "small-sound-sensor": ("KY-038", m_mic_small),
    "heartbeat-sensor": ("KY-039", m_heartbeat),
    "rotary-encoder": ("KY-040", m_rotary),
    "passive-buzzer": ("KY-006", m_buzzer(False)),
    # modules
    "button-module": ("KY-004", m_button),
    "ir-emission-module": ("KY-005", m_ir_tx),
    "laser-module": ("KY-008", m_laser),
    "smd-rgb-led": ("KY-009", m_smd_rgb),
    "two-color-led": ("KY-011", m_two_color()),
    "active-buzzer": ("KY-012", m_buzzer(True)),
    "rgb-led": ("KY-016", m_rgb),
    "relay-module": ("KY-019", m_relay),
    "joystick-module": ("KY-023", m_joystick),
    "mini-two-color-led": ("KY-029", m_two_color(mini=True)),
    "7-color-flash-led": ("KY-034", m_7color),
}


def build_module(key, location=(0.0, 0.0, 0.0)):
    code, fn = SPECS[key]
    b = Builder("KY_" + key, "KY_" + key)
    fn(b)
    b.root.location = location
    return b


print("ky_modules loaded:", len(SPECS), "specs")
