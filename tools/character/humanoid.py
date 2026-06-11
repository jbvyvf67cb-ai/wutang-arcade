"""Parametric humanoid enemies: frat boy, pirate, the Huntress.

Shares bearlib tube construction (no primitives). One rig, costume variants
via proportions + vertex colors + accessories. ~6 clips each.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

import bpy
import math
from bearlib import MeshData, Station, add_tube, add_cone, add_box, add_sphere

S = Station


def build_humanoid(kind: str) -> MeshData:
    md = MeshData()
    troll = kind == "huntress"
    hunch = 0.18 if troll else 0.0
    h = 0.92 if troll else 1.0  # huntress is squat

    # torso
    if kind == "frat":
        chest_w, belly_w = 0.30, 0.30  # gym chest, beer belly
    elif kind == "pirate":
        chest_w, belly_w = 0.30, 0.33
    else:
        chest_w, belly_w = 0.34, 0.26  # hunched wide shoulders
    add_tube(md, [
        S((0, 0.00, 0.86 * h), 0.21, 0.18),
        S((0, -0.01, 1.02 * h), belly_w, 0.26),
        S((0, -0.02 + hunch * 0.3, 1.22 * h), chest_w * 0.95, 0.24),
        S((0, 0.0 + hunch, 1.38 * h), chest_w, 0.24),
        S((0, 0.04 + hunch * 1.5, 1.47 * h), chest_w * 0.62, 0.16),
    ], n=10, tag="torso")

    # neck + head
    add_tube(md, [
        S((0, 0.02 + hunch * 1.6, 1.42 * h), 0.085, 0.08),
        S((0, hunch * 1.8, 1.55 * h), 0.075, 0.07),
    ], n=8, tag="skin")
    hz = 1.64 * h
    hy = hunch * 1.9
    add_tube(md, [
        S((0, 0.10 + hy, hz + 0.02), 0.095, 0.10),
        S((0, 0.02 + hy, hz + 0.04), 0.115, 0.115),
        S((0, -0.085 + hy, hz + 0.02), 0.105, 0.105),
        S((0, -0.14 + hy, hz - 0.025), 0.075, 0.07),
    ], n=10, tag="skin", up_hint=(0, 0, 1))
    # nose
    nose_len = 0.10 if troll else 0.045
    add_tube(md, [
        S((0, -0.13 + hy, hz + 0.01), 0.028, 0.025),
        S((0, -0.13 - nose_len + hy, hz - 0.01 - (0.03 if troll else 0)), 0.018, 0.016),
    ], n=6, tag="nose")
    # eyes
    for sx in (1, -1):
        add_sphere(md, (sx * 0.052, -0.095 + hy, hz + 0.045), 0.020, tag="eye")
    # jaw/chin for non-troll, underbite for troll
    if troll:
        add_tube(md, [
            S((0, -0.06 + hy, hz - 0.08), 0.085, 0.04),
            S((0, -0.17 + hy, hz - 0.075), 0.07, 0.035),
        ], n=8, tag="skin")

    # ---- costume / hair accessories ----
    if kind == "frat":
        # backwards cap: dome + bill at the back
        add_tube(md, [
            S((0, 0.02 + hy, hz + 0.10), 0.105, 0.10),
            S((0, 0.02 + hy, hz + 0.155), 0.085, 0.075),
        ], n=10, tag="cap")
        add_box(md, (0, 0.16 + hy, hz + 0.10), (0.10, 0.14, 0.02), tag="cap")
        # croakies strap
        add_box(md, (0, 0.10 + hy, hz + 0.045), (0.21, 0.02, 0.018), tag="cap")
    elif kind == "pirate":
        # tricorn-ish hat: brim disc + crown
        add_tube(md, [
            S((0, 0.0 + hy, hz + 0.115), 0.155, 0.145),
            S((0, 0.0 + hy, hz + 0.135), 0.150, 0.140),
        ], n=10, tag="hat")
        add_tube(md, [
            S((0, 0.0 + hy, hz + 0.13), 0.095, 0.09),
            S((0, 0.0 + hy, hz + 0.21), 0.075, 0.07),
        ], n=8, tag="hat")
        # eye patch
        add_box(md, (0.052, -0.105 + hy, hz + 0.05), (0.05, 0.012, 0.045), tag="hat")
    else:
        # huntress: wild hair spikes
        for i in range(7):
            a = (i / 7) * math.pi * 1.6 - math.pi * 0.3
            bx, bz = math.cos(a) * 0.09, hz + 0.07 + math.sin(a) * 0.05
            add_cone(md, (bx, 0.06 + hy, bz), (bx * 2.2, 0.16 + hy, bz + 0.14), 0.035, tag="hair")

    # ---- arms ----
    arm_len = 1.25 if troll else 1.0  # troll knuckle-dragger arms
    for sx in (1, -1):
        add_tube(md, [
            S((sx * 0.24, 0.0 + hunch, 1.38 * h), 0.075, 0.075),
            S((sx * 0.33, 0.01 + hunch * 0.5, (1.38 - 0.22 * arm_len) * h), 0.065, 0.065),
            S((sx * 0.37, 0.0, (1.38 - 0.42 * arm_len) * h), 0.055, 0.055),
            S((sx * 0.39, -0.02, (1.38 - 0.52 * arm_len) * h), 0.05, 0.05),
        ], n=8, tag="sleeve" if kind != "huntress" else "skin")
        add_tube(md, [
            S((sx * 0.39, -0.02, (1.38 - 0.54 * arm_len) * h), 0.055, 0.05),
            S((sx * 0.395, -0.03, (1.38 - 0.62 * arm_len) * h), 0.06, 0.045),
        ], n=8, tag="skin")
        if troll:
            for ox in (-0.03, 0.0, 0.03):
                zb = (1.38 - 0.62 * arm_len) * h
                add_cone(md, (sx * 0.395 + ox, -0.05, zb), (sx * 0.395 + ox * 1.4, -0.09, zb - 0.07), 0.012, tag="claw")

    # cutlass in pirate right hand
    if kind == "pirate":
        zb = (1.38 - 0.62) * 0.99
        add_box(md, (0.42, -0.10, zb), (0.025, 0.30, 0.05), tag="blade")
        add_box(md, (0.42, -0.035, zb), (0.06, 0.025, 0.06), tag="hat")

    # ---- legs ----
    for sx in (1, -1):
        add_tube(md, [
            S((sx * 0.12, 0.0, 0.90 * h), 0.105, 0.11),
            S((sx * 0.13, -0.01, 0.48 * h), 0.075, 0.08),
            S((sx * 0.135, 0.02, 0.10), 0.06, 0.065),
        ], n=8, tag="pants" if kind != "huntress" else "skin")
        # shoe
        add_tube(md, [
            S((sx * 0.14, 0.08, 0.055), 0.065, 0.055, bottom=0.3),
            S((sx * 0.14, -0.10, 0.05), 0.07, 0.045, bottom=0.3),
        ], n=8, tag="shoe")

    return md


PALETTES = {
    "frat": {
        "torso": (0.92, 0.45, 0.65),  # salmon polo
        "skin": (0.85, 0.62, 0.45),
        "sleeve": (0.92, 0.45, 0.65),
        "pants": (0.80, 0.72, 0.55),  # khaki shorts
        "shoe": (0.95, 0.95, 0.92),
        "cap": (0.25, 0.30, 0.55),
        "nose": (0.80, 0.55, 0.40),
        "eye": (0.08, 0.06, 0.05),
        "hat": (0.2, 0.2, 0.2), "hair": (0.3, 0.2, 0.1), "blade": (0.7, 0.7, 0.75), "claw": (0.8, 0.8, 0.7),
    },
    "pirate": {
        "torso": (0.55, 0.12, 0.14),  # red coat
        "skin": (0.72, 0.52, 0.38),
        "sleeve": (0.55, 0.12, 0.14),
        "pants": (0.18, 0.16, 0.20),
        "shoe": (0.12, 0.10, 0.08),
        "hat": (0.13, 0.11, 0.10),
        "nose": (0.68, 0.46, 0.32),
        "eye": (0.08, 0.06, 0.05),
        "cap": (0.2, 0.2, 0.2), "hair": (0.3, 0.2, 0.1), "blade": (0.75, 0.78, 0.82), "claw": (0.8, 0.8, 0.7),
    },
    "huntress": {
        "torso": (0.35, 0.42, 0.28),  # mossy rags
        "skin": (0.48, 0.55, 0.38),  # green-grey troll skin
        "sleeve": (0.35, 0.42, 0.28),
        "pants": (0.30, 0.34, 0.24),
        "shoe": (0.25, 0.22, 0.18),
        "hair": (0.65, 0.30, 0.12),  # alarming orange
        "nose": (0.42, 0.50, 0.33),
        "eye": (0.85, 0.75, 0.1),  # yellow eyes
        "cap": (0.2, 0.2, 0.2), "hat": (0.2, 0.2, 0.2), "blade": (0.7, 0.7, 0.75), "claw": (0.75, 0.72, 0.6),
    },
}

H_BONES = [
    ("root", (0, 0, 0), (0, 0.25, 0), None),
    ("hips", (0, 0, 0.92), (0, 0, 1.15), "root"),
    ("spine", (0, 0, 1.15), (0, 0, 1.40), "hips"),
    ("head", (0, 0, 1.45), (0, 0, 1.78), "spine"),
    ("upper_arm.L", (0.24, 0, 1.38), (0.37, 0, 0.96), "spine"),
    ("hand.L", (0.37, 0, 0.96), (0.40, -0.03, 0.74), "upper_arm.L"),
    ("upper_arm.R", (-0.24, 0, 1.38), (-0.37, 0, 0.96), "spine"),
    ("hand.R", (-0.37, 0, 0.96), (-0.40, -0.03, 0.74), "upper_arm.R"),
    ("thigh.L", (0.12, 0, 0.90), (0.13, 0, 0.48), "hips"),
    ("foot.L", (0.13, 0, 0.48), (0.14, -0.04, 0.05), "thigh.L"),
    ("thigh.R", (-0.12, 0, 0.90), (-0.13, 0, 0.48), "hips"),
    ("foot.R", (-0.13, 0, 0.48), (-0.14, -0.04, 0.05), "thigh.R"),
]


def build_enemy(kind: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    md = build_humanoid(kind)
    mesh = bpy.data.meshes.new(f"{kind}_mesh")
    mesh.from_pydata(md.verts, [], md.faces)
    mesh.update()
    obj = bpy.data.objects.new(kind, mesh)
    bpy.context.collection.objects.link(obj)

    # vertex colors from palette
    pal = PALETTES[kind]
    attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for i, tag in enumerate(md.tags):
        r, g, b = pal.get(tag, (0.5, 0.5, 0.5))
        attr.data[i].color = (r, g, b, 1.0)

    mat = bpy.data.materials.new(f"{kind}_mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    obj.data.materials.append(mat)

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = 1  # enemies cheaper than the star
    bpy.ops.object.modifier_apply(modifier="subsurf")
    for p in mesh.polygons:
        p.use_smooth = True

    arm = bpy.data.armatures.new(f"{kind}_rig")
    arm_obj = bpy.data.objects.new(f"{kind}Rig", arm)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, head, tail, parent in H_BONES:
        b = arm.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = eb[parent]
        eb[name] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    return obj, arm_obj


def animate_enemy(arm_obj, kind: str):
    from joshua_anims import Animator

    A = Animator(arm_obj)
    troll = kind == "huntress"

    a = A.begin("e_idle")
    for f, b in [(1, 0.0), (24, 0.05), (48, 0.0)]:
        A.key("spine", f, rot=(-b - (0.5 if troll else 0.0), 0, 0))
        A.key("hips", f, loc=(0, -b * 0.2, 0))
        if troll:
            A.key("head", f, rot=(0.45 + b, 0, 0))
            A.key("upper_arm.L", f, rot=(0.25, 0, -0.2 - b))
            A.key("upper_arm.R", f, rot=(0.25, 0, 0.2 + b))
    A.finish(a, 48)

    a = A.begin("e_walk")
    for f, s in [(1, 1), (10, -1), (20, 1)]:
        A.key("thigh.L", f, rot=(0.5 * s, 0, 0))
        A.key("thigh.R", f, rot=(-0.5 * s, 0, 0))
        A.key("upper_arm.L", f, rot=(-0.35 * s, 0, -0.1))
        A.key("upper_arm.R", f, rot=(0.35 * s, 0, 0.1))
        A.key("spine", f, rot=((-0.5 if troll else 0.02), 0.05 * s, 0))
        if troll:
            A.key("head", f, rot=(0.5, -0.05 * s, 0))
    A.finish(a, 20)

    # telegraph: frat shoulder-rear / pirate cutlass raise / huntress SHRIEK rear-up
    a = A.begin("e_telegraph")
    if kind == "frat":
        A.key("spine", 8, rot=(0.35, -0.5, 0))
        A.key("upper_arm.R", 8, rot=(-0.9, 0, 0.5))
        A.key("hips", 8, loc=(0, -0.15, 0))
        A.key("spine", 14, rot=(0.35, -0.5, 0))
    elif kind == "pirate":
        A.key("upper_arm.R", 10, rot=(-2.4, 0, 0.3))
        A.key("hand.R", 10, rot=(-0.5, 0, 0))
        A.key("spine", 10, rot=(0.15, -0.25, 0))
        A.key("spine", 16, rot=(0.15, -0.25, 0))
        A.key("upper_arm.R", 16, rot=(-2.4, 0, 0.3))
    else:
        # rear up to full height, arms wide, jaw open — the shriek
        A.key("spine", 6, rot=(0.55, 0, 0))
        A.key("head", 6, rot=(-0.55, 0, 0))
        A.key("upper_arm.L", 8, rot=(-1.2, 0, -1.5))
        A.key("upper_arm.R", 8, rot=(-1.2, 0, 1.5))
        A.key("hips", 8, loc=(0, 0.12, 0))
        A.key("spine", 20, rot=(0.55, 0, 0.06))
        A.key("head", 20, rot=(-0.55, 0, -0.06))
    A.finish(a, 14 if kind == "frat" else (16 if kind == "pirate" else 20))

    # attack: charge pose / slash / pounce-flight
    a = A.begin("e_attack")
    if kind == "frat":
        A.key("spine", 3, rot=(-0.5, 0.3, 0))
        A.key("upper_arm.R", 3, rot=(1.2, 0, -0.3))
        A.key("upper_arm.L", 3, rot=(0.6, 0, -0.2))
        A.key("spine", 12, rot=(-0.5, 0.3, 0))
    elif kind == "pirate":
        A.key("upper_arm.R", 4, rot=(1.6, 0, -0.4))
        A.key("hand.R", 4, rot=(0.6, 0, 0))
        A.key("spine", 4, rot=(-0.3, 0.4, 0))
        for b in ("upper_arm.R", "hand.R", "spine"):
            A.key(b, 12, rot=(0, 0, 0))
    else:
        # mid-pounce: superman arms, legs trailing
        A.key("spine", 2, rot=(-1.1, 0, 0))
        A.key("head", 2, rot=(0.7, 0, 0))
        A.key("upper_arm.L", 2, rot=(1.8, 0, -0.4))
        A.key("upper_arm.R", 2, rot=(1.8, 0, 0.4))
        A.key("thigh.L", 2, rot=(-0.7, 0, 0.2))
        A.key("thigh.R", 2, rot=(-0.7, 0, -0.2))
        A.key("spine", 12, rot=(-1.1, 0, 0))
    A.finish(a, 12)

    a = A.begin("e_hit")
    A.key("spine", 2, rot=(0.5, 0, 0.2))
    A.key("head", 2, rot=(0.4, 0, 0))
    A.key("upper_arm.L", 2, rot=(-0.6, 0, -0.8))
    A.key("upper_arm.R", 2, rot=(-0.6, 0, 0.8))
    for b in ("spine", "head", "upper_arm.L", "upper_arm.R"):
        A.key(b, 8, rot=(0, 0, 0))
    A.finish(a, 8)

    A.clear_pose()


def export_enemy(kind: str, out_dir: str):
    obj, arm_obj = build_enemy(kind)
    animate_enemy(arm_obj, kind)
    out = os.path.abspath(os.path.join(out_dir, f"{kind}.glb"))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True, export_yup=True)
    print(f"{kind}: {len(obj.data.vertices)} verts -> {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "../../assets/models")
    os.makedirs(out_dir, exist_ok=True)
    for kind in ("frat", "pirate", "huntress"):
        export_enemy(kind, out_dir)
