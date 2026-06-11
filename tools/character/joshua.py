"""Joshua the bear: parametric model + rig.

Run via build_joshua.py. Coordinates: Blender Z-up, faces -Y, meters.
Standing height ~1.95m to ear tips.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

import bpy
import math
from bearlib import MeshData, Station, add_tube, add_cone, add_box, add_disc_ear, add_sphere

S = Station


def build_mesh() -> MeshData:
    md = MeshData()

    # ---- torso: pear-bodied, belly forward (-Y), shoulder hump back ----
    add_tube(md, [
        S((0, 0.01, 0.80), 0.25, 0.21),
        S((0, 0.00, 0.95), 0.35, 0.31),
        S((0, -0.06, 1.12), 0.37, 0.36),
        S((0, -0.01, 1.30), 0.345, 0.33),
        S((0, 0.05, 1.44), 0.355, 0.30),
        S((0, 0.10, 1.54), 0.21, 0.20),
    ], n=12, tag="body")

    # ---- neck (deep overlaps both ends: subsurf shrinks small tubes) ----
    add_tube(md, [
        S((0, 0.05, 1.40), 0.170, 0.160),
        S((0, 0.00, 1.52), 0.150, 0.140),
        S((0, -0.05, 1.66), 0.135, 0.125),
    ], n=10, tag="body")

    # ---- head: skull -> brow -> muzzle step -> snout ----
    add_tube(md, [
        S((0, 0.19, 1.72), 0.150, 0.150),
        S((0, 0.05, 1.75), 0.188, 0.177),
        S((0, -0.09, 1.745), 0.177, 0.160),
        S((0, -0.19, 1.685), 0.118, 0.105),
        S((0, -0.28, 1.672), 0.095, 0.087),
    ], n=12, tag="head", up_hint=(0, 0, 1))

    # nose pad (own tag: near-black, glossy), base embedded in the snout
    add_tube(md, [
        S((0, -0.25, 1.676), 0.070, 0.060),
        S((0, -0.365, 1.668), 0.048, 0.042),
    ], n=8, tag="nose")

    # lower jaw
    add_tube(md, [
        S((0, -0.08, 1.625), 0.100, 0.055),
        S((0, -0.27, 1.612), 0.068, 0.040),
    ], n=8, tag="muzzle")

    # ears: thick tilted discs half-embedded in the skull
    add_disc_ear(md, (0.125, 0.045, 1.90), radius=0.088, thickness=0.06, tilt=0.45)
    add_disc_ear(md, (-0.125, 0.045, 1.90), radius=0.088, thickness=0.06, tilt=0.45)

    # eyes (proud of the skull so they read at 3/4 angles)
    add_sphere(md, (0.082, -0.172, 1.785), 0.037, tag="eye")
    add_sphere(md, (-0.082, -0.172, 1.785), 0.037, tag="eye")
    # brow ridges (small tubes above eyes -> expressive, breaks sphere-head)
    for sx in (1, -1):
        add_tube(md, [
            S((sx * 0.115, -0.148, 1.825), 0.032, 0.020),
            S((sx * 0.042, -0.165, 1.835), 0.036, 0.022),
        ], n=6, tag="head")

    # ---- arms (A-pose, slightly out) ----
    for sx in (1, -1):
        add_tube(md, [
            S((sx * 0.27, 0.00, 1.44), 0.118, 0.118),
            S((sx * 0.38, 0.01, 1.26), 0.105, 0.105),
            S((sx * 0.43, 0.02, 1.13), 0.095, 0.095),
            S((sx * 0.46, 0.00, 1.01), 0.088, 0.088),
            S((sx * 0.48, -0.02, 0.92), 0.082, 0.082),
        ], n=10, tag="arm")
        # paw (hand)
        add_tube(md, [
            S((sx * 0.485, -0.02, 0.94), 0.095, 0.082),
            S((sx * 0.49, -0.04, 0.78), 0.110, 0.070),
        ], n=8, tag="paw")
        # 4 claws per hand, bases embedded in the paw
        for i, ox in enumerate((-0.055, -0.018, 0.018, 0.055)):
            add_cone(
                md,
                (sx * 0.49 + ox, -0.045, 0.80),
                (sx * 0.49 + ox * 1.3, -0.10, 0.70),
                0.016,
            )

    # ---- legs ----
    for sx in (1, -1):
        add_tube(md, [
            S((sx * 0.165, 0.00, 0.94), 0.160, 0.170),
            S((sx * 0.185, -0.02, 0.52), 0.120, 0.128),
            S((sx * 0.195, 0.03, 0.13), 0.100, 0.106),
        ], n=10, tag="leg")
        # plantigrade foot: heel back, toes forward, flat bottom
        add_tube(md, [
            S((sx * 0.20, 0.14, 0.095), 0.115, 0.090, bottom=0.25),
            S((sx * 0.20, -0.02, 0.085), 0.125, 0.082, bottom=0.25),
            S((sx * 0.20, -0.19, 0.075), 0.128, 0.072, bottom=0.30),
        ], n=10, tag="paw", up_hint=(0, 0, 1))
        for i, ox in enumerate((-0.065, -0.022, 0.022, 0.065)):
            add_cone(
                md,
                (sx * 0.20 + ox, -0.17, 0.055),
                (sx * 0.20 + ox * 1.15, -0.27, 0.018),
                0.021,
            )

    # ---- tail nub (rooted deep in the rump) ----
    add_tube(md, [
        S((0, 0.22, 1.00), 0.090, 0.090),
        S((0, 0.36, 0.95), 0.052, 0.052),
    ], n=8, tag="body")

    # ---- bow tie (own bone; waggles), proud of the neck fur ----
    add_box(md, (0, -0.255, 1.50), (0.085, 0.062, 0.070), tag="bowtie")
    add_box(md, (0.112, -0.242, 1.50), (0.170, 0.055, 0.118), tag="bowtie", rot_y=0.14)
    add_box(md, (-0.112, -0.242, 1.50), (0.170, 0.055, 0.118), tag="bowtie", rot_y=-0.14)

    return md


COLORS = {
    "body": (0.330, 0.205, 0.115),
    "arm": (0.310, 0.190, 0.105),
    "leg": (0.310, 0.190, 0.105),
    "head": (0.370, 0.235, 0.135),
    "muzzle": (0.580, 0.440, 0.280),
    "nose": (0.045, 0.038, 0.035),
    "ear": (0.290, 0.175, 0.100),
    "paw": (0.235, 0.140, 0.082),
    "claw": (0.720, 0.660, 0.540),
    "eye": (0.035, 0.028, 0.025),
    "bowtie": (0.620, 0.060, 0.085),
}


def apply_vertex_colors(mesh, md: MeshData):
    attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for i, tag in enumerate(md.tags):
        r, g, b = COLORS[tag]
        v = md.verts[i]
        # belly + chest patch: lighter tan on the front of the torso
        if tag == "body" and v[1] < -0.14 and 0.92 < v[2] < 1.42 and abs(v[0]) < 0.22:
            r, g, b = (0.545, 0.415, 0.265)
        # subtle dorsal darkening
        if tag in ("body", "head") and v[1] > 0.12:
            r, g, b = (r * 0.82, g * 0.82, b * 0.82)
        attr.data[i].color = (r, g, b, 1.0)


def make_materials(obj):
    # fur: vertex-colored, rough, with sheen for fur light response
    fur = bpy.data.materials.new("joshua_fur")
    fur.use_nodes = True
    bsdf = fur.node_tree.nodes["Principled BSDF"]
    attr = fur.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    fur.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.88
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.6
        bsdf.inputs["Sheen Roughness"].default_value = 0.45

    gloss = bpy.data.materials.new("joshua_gloss")
    gloss.use_nodes = True
    gb = gloss.node_tree.nodes["Principled BSDF"]
    gattr = gloss.node_tree.nodes.new("ShaderNodeVertexColor")
    gattr.layer_name = "Col"
    gloss.node_tree.links.new(gattr.outputs["Color"], gb.inputs["Base Color"])
    gb.inputs["Roughness"].default_value = 0.18

    satin = bpy.data.materials.new("joshua_satin")
    satin.use_nodes = True
    sb = satin.node_tree.nodes["Principled BSDF"]
    sattr = satin.node_tree.nodes.new("ShaderNodeVertexColor")
    sattr.layer_name = "Col"
    satin.node_tree.links.new(sattr.outputs["Color"], sb.inputs["Base Color"])
    sb.inputs["Roughness"].default_value = 0.35
    if "Sheen Weight" in sb.inputs:
        sb.inputs["Sheen Weight"].default_value = 0.9

    obj.data.materials.append(fur)    # 0
    obj.data.materials.append(gloss)  # 1: eyes, nose, claws
    obj.data.materials.append(satin)  # 2: bow tie
    return obj


def assign_material_slots(obj, md: MeshData):
    gloss_tags = {"eye", "nose", "claw"}
    for poly in obj.data.polygons:
        tag = md.tags[obj.data.loops[poly.loop_start].vertex_index]
        if tag in gloss_tags:
            poly.material_index = 1
        elif tag == "bowtie":
            poly.material_index = 2
        else:
            poly.material_index = 0


BONES = [
    # name, head, tail, parent
    ("root", (0, 0, 0), (0, 0.3, 0), None),
    ("hips", (0, 0.0, 0.95), (0, 0.0, 1.22), "root"),
    ("spine", (0, 0.0, 1.22), (0, 0.0, 1.46), "hips"),
    ("neck", (0, 0.02, 1.49), (0, -0.05, 1.62), "spine"),
    ("head", (0, -0.05, 1.62), (0, -0.05, 1.93), "neck"),
    ("ear.L", (0.115, 0.045, 1.86), (0.115, 0.045, 1.97), "head"),
    ("ear.R", (-0.115, 0.045, 1.86), (-0.115, 0.045, 1.97), "head"),
    ("eye.L", (0.082, -0.172, 1.785), (0.082, -0.235, 1.785), "head"),
    ("eye.R", (-0.082, -0.172, 1.785), (-0.082, -0.235, 1.785), "head"),
    ("jaw", (0, -0.10, 1.63), (0, -0.25, 1.61), "head"),
    ("bowtie", (0, -0.12, 1.50), (0, -0.24, 1.50), "neck"),
    ("tail", (0, 0.28, 1.0), (0, 0.41, 0.93), "hips"),
    ("upper_arm.L", (0.30, 0.0, 1.42), (0.43, 0.02, 1.13), "spine"),
    ("forearm.L", (0.43, 0.02, 1.13), (0.48, -0.02, 0.92), "upper_arm.L"),
    ("hand.L", (0.48, -0.02, 0.92), (0.49, -0.07, 0.73), "forearm.L"),
    ("upper_arm.R", (-0.30, 0.0, 1.42), (-0.43, 0.02, 1.13), "spine"),
    ("forearm.R", (-0.43, 0.02, 1.13), (-0.48, -0.02, 0.92), "upper_arm.R"),
    ("hand.R", (-0.48, -0.02, 0.92), (-0.49, -0.07, 0.73), "forearm.R"),
    ("thigh.L", (0.165, 0.0, 0.94), (0.185, -0.02, 0.52), "hips"),
    ("shin.L", (0.185, -0.02, 0.52), (0.195, 0.03, 0.16), "thigh.L"),
    ("foot.L", (0.195, 0.03, 0.16), (0.20, -0.20, 0.05), "shin.L"),
    ("thigh.R", (-0.165, 0.0, 0.94), (-0.185, -0.02, 0.52), "hips"),
    ("shin.R", (-0.185, -0.02, 0.52), (-0.195, 0.03, 0.16), "thigh.R"),
    ("foot.R", (-0.195, 0.03, 0.16), (-0.20, -0.20, 0.05), "shin.R"),
]


def build_rig():
    arm = bpy.data.armatures.new("joshua_rig")
    arm_obj = bpy.data.objects.new("JoshuaRig", arm)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, head, tail, parent in BONES:
        b = arm.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = eb[parent]
        eb[name] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def fix_island_weights(obj, md_tags_post):
    """Hard-bind eyes/bowtie/ears so blink+waggle bones own them fully.

    md_tags_post: per-vertex tags re-derived by position on the final mesh.
    """
    def force(verts, group_name):
        if not verts:
            return
        for g in obj.vertex_groups:
            g.remove(verts)
        obj.vertex_groups[group_name].add(verts, 1.0, "REPLACE")

    eye_l, eye_r, bow, ear_l, ear_r = [], [], [], [], []
    for i, v in enumerate(obj.data.vertices):
        x, y, z = v.co
        if (x - 0.082) ** 2 + (y + 0.172) ** 2 + (z - 1.785) ** 2 < 0.0026:
            eye_l.append(i)
        elif (x + 0.082) ** 2 + (y + 0.172) ** 2 + (z - 1.785) ** 2 < 0.0026:
            eye_r.append(i)
        elif y < -0.14 and 1.44 < z < 1.56 and abs(x) < 0.22 and y > -0.30:
            bow.append(i)
        elif z > 1.80 and x > 0.09 and abs(y) < 0.15:
            ear_l.append(i)
        elif z > 1.80 and x < -0.09 and abs(y) < 0.15:
            ear_r.append(i)
    for name in ("eye.L", "eye.R", "bowtie", "ear.L", "ear.R"):
        if name not in obj.vertex_groups:
            obj.vertex_groups.new(name=name)
    force(eye_l, "eye.L")
    force(eye_r, "eye.R")
    force(bow, "bowtie")
    force(ear_l, "ear.L")
    force(ear_r, "ear.R")


def build_joshua():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    md = build_mesh()
    mesh = bpy.data.meshes.new("joshua_mesh")
    mesh.from_pydata(md.verts, [], md.faces)
    mesh.update()
    obj = bpy.data.objects.new("Joshua", mesh)
    bpy.context.collection.objects.link(obj)

    apply_vertex_colors(mesh, md)
    make_materials(obj)
    assign_material_slots(obj, md)

    # make all face normals point outward (hand-built winding is inconsistent)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # subdivision -> organic surfaces (applied so skinning sees final verts)
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = 2
    bpy.ops.object.modifier_apply(modifier="subsurf")
    for p in mesh.polygons:
        p.use_smooth = True

    # rig + auto weights
    arm_obj = build_rig()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    fix_island_weights(obj, None)

    print(f"Joshua: {len(mesh.vertices)} verts, {len(mesh.polygons)} faces")
    return obj, arm_obj
