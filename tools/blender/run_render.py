"""Headless entry point:
    blender -b --factory-startup --python tools/blender/run_render.py -- [keys...] [--samples N]
"""
import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
REPO_DIR = str(HERE.parents[1])
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAMPLES = 96
if "--samples" in argv:
    i = argv.index("--samples")
    SAMPLES = int(argv[i + 1])
    del argv[i:i + 2]
KEYS = argv or None

# clean factory scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

g = globals()
exec(open(HERE / "lotus_board.py", encoding="utf-8").read(), g)
exec(open(HERE / "ky_modules.py", encoding="utf-8").read(), g)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dev_type in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = dev_type
            prefs.get_devices()
            if any(d.type == dev_type for d in prefs.devices):
                for d in prefs.devices:
                    d.use = True
                sc.cycles.device = "GPU"
                print("using GPU", dev_type)
                break
        except TypeError:
            pass
except Exception as e:
    print("gpu setup skipped:", e)

world = bpy.data.worlds.new("World")
sc.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (1, 1, 1, 1)
bg.inputs[1].default_value = 0.25


def area(name, loc, size, energy, rot):
    d = bpy.data.lights.new(name, "AREA")
    d.size = size
    d.energy = energy
    o = bpy.data.objects.new(name, d)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot


area("Key", (0.12, -0.10, 0.40), 0.35, 3, (math.radians(25), 0, math.radians(40)))
area("Fill", (-0.20, 0.05, 0.35), 0.45, 2, (math.radians(-15), math.radians(-30), 0))
area("Top", (-0.25, 0.30, 0.45), 0.6, 3, (math.radians(-35), math.radians(-30), 0))

bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0, -0.0018))
ground = bpy.context.active_object
gm = bpy.data.materials.new("ground")
gm.use_nodes = True
gb = next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
gb.inputs["Base Color"].default_value = (0.92, 0.92, 0.92, 1)
gb.inputs["Roughness"].default_value = 0.9
ground.data.materials.append(gm)
try:
    ground.is_shadow_catcher = False
except AttributeError:
    pass
sc.view_settings.view_transform = "Standard" if "Standard" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else sc.view_settings.view_transform

exec(open(HERE / "render_wiring.py", encoding="utf-8").read(), g)
