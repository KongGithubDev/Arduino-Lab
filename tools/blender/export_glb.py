"""Export the board and every module to glTF binary for the web simulator.

    blender -b --factory-startup --python tools/blender/export_glb.py

Writes simulator/models/lotus-nano-bot.glb and simulator/models/<key>.glb.
Port / pin empties (PORT_*, PIN_*) are kept as nodes so the simulator can find
where wires attach.
"""
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
REPO_DIR = str(HERE.parents[1])
OUT = HERE.parents[1] / "simulator" / "models"
OUT.mkdir(parents=True, exist_ok=True)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
g = globals()
exec(open(HERE / "lotus_board.py", encoding="utf-8").read(), g)
exec(open(HERE / "ky_modules.py", encoding="utf-8").read(), g)


def text_to_mesh(coll):
    for o in list(coll.objects):
        if o.type == "FONT":
            bpy.context.view_layer.objects.active = o
            for s in bpy.context.view_layer.objects:
                s.select_set(False)
            o.select_set(True)
            bpy.ops.object.convert(target="MESH")
        if o.type == "CURVE":
            pass


def export(coll_name, root_name, path):
    coll = bpy.data.collections[coll_name]
    text_to_mesh(coll)
    root = bpy.data.objects[root_name]
    # export in metres but with the root at the origin
    loc = root.location.copy()
    root.location = (0, 0, 0)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in coll.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_extras=True,
    )
    root.location = loc
    print("exported", path.name)


export("LotusNanoBot", "LotusNanoBot", OUT / "lotus-nano-bot.glb")
for key in SPECS:
    build_module(key)
    export("KY_" + key, "KY_" + key, OUT / f"{key}.glb")
    coll = bpy.data.collections["KY_" + key]
    coll.hide_viewport = True
