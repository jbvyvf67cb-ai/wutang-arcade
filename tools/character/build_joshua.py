"""Build Joshua: model + rig + clips -> assets/models/joshua.glb"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

import bpy
from joshua import build_joshua
from joshua_anims import build_all_clips

obj, arm_obj = build_joshua()
build_all_clips(arm_obj)

out = os.path.join(os.path.dirname(__file__), "../../assets/models/joshua.glb")
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(out),
    export_format="GLB",
    export_animations=True,
    export_yup=True,
)
print("exported:", os.path.abspath(out), os.path.getsize(os.path.abspath(out)), "bytes")
print("animations:", [a.name for a in bpy.data.actions])
