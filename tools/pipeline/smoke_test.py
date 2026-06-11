"""Smoke test: verify headless bpy can do everything the asset pipeline needs."""
import bpy
import sys

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. mesh from python data
mesh = bpy.data.meshes.new("m")
mesh.from_pydata(
    [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0), (0, 0, 1.5)],
    [],
    [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)],
)
mesh.update()
obj = bpy.data.objects.new("TestObj", mesh)
bpy.context.collection.objects.link(obj)

# 2. subdivision modifier + apply
mod = obj.modifiers.new("subsurf", "SUBSURF")
mod.levels = 2
mod.render_levels = 2
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.modifier_apply(modifier="subsurf")
print("verts after subsurf:", len(obj.data.vertices))

# 3. armature + auto weights
arm = bpy.data.armatures.new("arm")
arm_obj = bpy.data.objects.new("Armature", arm)
bpy.context.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="EDIT")
b = arm.edit_bones.new("root")
b.head = (0, 0, 0)
b.tail = (0, 0, 1)
b2 = arm.edit_bones.new("tip")
b2.head = (0, 0, 1)
b2.tail = (0, 0, 1.6)
b2.parent = b
bpy.ops.object.mode_set(mode="OBJECT")

obj.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
print("vertex groups:", [g.name for g in obj.vertex_groups])

# 4. keyframed action
bpy.ops.object.mode_set(mode="POSE")
pb = arm_obj.pose.bones["tip"]
arm_obj.animation_data_create()
action = bpy.data.actions.new("wave")
arm_obj.animation_data.action = action
for f, rx in [(1, 0.0), (12, 0.8), (24, 0.0)]:
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = (rx, 0, 0)
    pb.keyframe_insert("rotation_euler", frame=f)
bpy.ops.object.mode_set(mode="OBJECT")

# 5. material with image texture
img = bpy.data.images.new("tex", 64, 64)
img.pixels = [0.5, 0.3, 0.2, 1.0] * (64 * 64)
mat = bpy.data.materials.new("fur")
mat.use_nodes = True
tex_node = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex_node.image = img
bsdf = mat.node_tree.nodes["Principled BSDF"]
mat.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
obj.data.materials.append(mat)

# 6. UV unwrap
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15)
bpy.ops.object.mode_set(mode="OBJECT")

# 7. glTF export with animation
out = "/tmp/smoke.glb"
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_animations=True,
    export_apply=True,
)
import os
print("glb size:", os.path.getsize(out))
print("SMOKE OK")
