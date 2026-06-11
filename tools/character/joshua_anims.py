"""Joshua's 16 animation clips, keyframed programmatically at 24fps.

Sign conventions (verified against viewer screenshots, iterate as needed):
- vertical bones (hips/spine/neck/head): rotX+ pitches forward, rotY yaws, rotZ tilts
- thigh/upper_arm: rotX+ swings the limb forward
- shin: rotX- bends the knee back; forearm: rotX+ bends the elbow
- eye blink = bone scale (1,1,0.1)
"""
from __future__ import annotations

import bpy
import math

FPS = 24


class Animator:
    def __init__(self, arm_obj):
        self.arm = arm_obj
        arm_obj.animation_data_create()
        for pb in arm_obj.pose.bones:
            pb.rotation_mode = "XYZ"

    def clear_pose(self):
        for pb in self.arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)

    def key(self, bone, frame, rot=None, loc=None, scl=None):
        pb = self.arm.pose.bones[bone]
        if rot is not None:
            pb.rotation_euler = rot
            pb.keyframe_insert("rotation_euler", frame=frame)
        if loc is not None:
            pb.location = loc
            pb.keyframe_insert("location", frame=frame)
        if scl is not None:
            pb.scale = scl
            pb.keyframe_insert("scale", frame=frame)

    def key_rest_all(self, frame=1):
        for pb in self.arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
            pb.keyframe_insert("rotation_euler", frame=frame)
            if pb.name in ("hips", "root"):
                pb.keyframe_insert("location", frame=frame)
            if pb.name.startswith("eye"):
                pb.keyframe_insert("scale", frame=frame)

    def begin(self, name):
        self.clear_pose()
        action = bpy.data.actions.new(name)
        self.arm.animation_data.action = action
        self.key_rest_all(1)
        return action

    def finish(self, action, last_frame):
        action.use_fake_user = True
        track = self.arm.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 1, action)
        track.mute = True
        self.arm.animation_data.action = None

    def blink(self, f, dur=3):
        for side in ("eye.L", "eye.R"):
            self.key(side, f, scl=(1, 1, 1))
            self.key(side, f + 1, scl=(1, 1, 0.1))
            self.key(side, f + dur, scl=(1, 1, 0.1))
            self.key(side, f + dur + 1, scl=(1, 1, 1))


def build_all_clips(arm_obj):
    A = Animator(arm_obj)
    bpy.context.scene.render.fps = FPS

    # ---------- idle (3s loop) ----------
    a = A.begin("idle")
    for f, breathe in [(1, 0.0), (18, 0.05), (36, 0.0), (54, 0.05), (72, 0.0)]:
        A.key("spine", f, rot=(breathe, 0, 0))
        A.key("hips", f, loc=(0, -breathe * 0.15, 0))
    for f, yaw in [(1, 0.0), (24, 0.10), (48, -0.08), (72, 0.0)]:
        A.key("head", f, rot=(0.02, yaw, 0))
    for f, wag in [(1, 0.1), (36, -0.1), (72, 0.1)]:
        A.key("tail", f, rot=(0, 0, wag))
    for f in (1, 36, 72):
        A.key("forearm.L", f, rot=(0.3, 0, 0))
    A.key("forearm.R", 1, rot=(0.3, 0, 0))
    A.key("forearm.R", 72, rot=(0.3, 0, 0))
    # idle scratch beat: right paw to belly around f40
    A.key("upper_arm.R", 30, rot=(0, 0, 0))
    A.key("upper_arm.R", 40, rot=(0.55, 0, -0.25))
    A.key("forearm.R", 40, rot=(0.9, 0, 0))
    A.key("upper_arm.R", 52, rot=(0, 0, 0))
    A.key("forearm.R", 52, rot=(0, 0, 0))
    A.blink(30)
    A.blink(62)
    A.finish(a, 72)

    # ---------- idle_bored (4s, drowsy) ----------
    a = A.begin("idle_bored")
    A.key("head", 1, rot=(0.05, 0, 0))
    A.key("head", 20, rot=(-0.5, 0, 0.12))
    A.key("spine", 20, rot=(-0.2, 0, 0))
    for side in ("eye.L", "eye.R"):
        A.key(side, 10, scl=(1, 1, 1))
        A.key(side, 26, scl=(1, 1, 0.1))
        A.key(side, 78, scl=(1, 1, 0.1))
        A.key(side, 88, scl=(1, 1, 1))
    # snore bob
    for f, b in [(26, 0.0), (44, 0.06), (62, 0.0), (78, 0.06)]:
        A.key("neck", f, rot=(-(0.3 + b), 0, 0))
    # startle awake at the end
    A.key("head", 88, rot=(0.25, 0.3, 0))
    A.key("spine", 88, rot=(-0.08, 0, 0))
    A.key("head", 96, rot=(0, 0, 0))
    A.key("spine", 96, rot=(0, 0, 0))
    A.finish(a, 96)

    # ---------- walk (1s loop, upright Banjo strut) ----------
    a = A.begin("walk")
    for f, s in [(1, 1), (13, -1), (24, 1)]:
        A.key("thigh.L", f, rot=(0.55 * s, 0, 0))
        A.key("thigh.R", f, rot=(-0.55 * s, 0, 0))
        A.key("shin.L", f, rot=(-0.25 + 0.2 * s, 0, 0))
        A.key("shin.R", f, rot=(-0.25 - 0.2 * s, 0, 0))
        A.key("foot.L", f, rot=(0.15 * s, 0, 0))
        A.key("foot.R", f, rot=(-0.15 * s, 0, 0))
        A.key("upper_arm.L", f, rot=(-0.4 * s, 0, 0))
        A.key("upper_arm.R", f, rot=(0.4 * s, 0, 0))
        A.key("forearm.L", f, rot=(0.35, 0, 0))
        A.key("forearm.R", f, rot=(0.35, 0, 0))
        A.key("hips", f, rot=(0.04, 0.08 * s, -0.03 * s))
        A.key("spine", f, rot=(0.05, -0.06 * s, 0.03 * s))
        A.key("head", f, rot=(-0.04, 0.05 * s, 0))
        A.key("tail", f, rot=(0, 0, 0.25 * s))
    for f in (7, 19):  # passing pose: body up
        A.key("hips", f, loc=(0, 0.035, 0))
    for f in (1, 13, 24):
        A.key("hips", f, loc=(0, -0.02, 0))
    A.finish(a, 24)

    # ---------- run (0.75s loop, all-fours gallop) ----------
    a = A.begin("run")
    for f in (1, 9, 18):
        A.key("spine", f, rot=(-1.05, 0, 0))
        A.key("hips", f, rot=(-0.35, 0, 0))
        A.key("neck", f, rot=(0.8, 0, 0))
        A.key("head", f, rot=(0.55, 0, 0))
        A.key("tail", f, rot=(0.3, 0, 0))
    # gallop: arms pair vs legs pair
    for f, ph in [(1, 1), (9, -1), (18, 1)]:
        A.key("upper_arm.L", f, rot=(1.0 + 0.5 * ph, 0, 0))
        A.key("upper_arm.R", f, rot=(1.0 + 0.5 * ph, 0, 0))
        A.key("forearm.L", f, rot=(0.4 - 0.3 * ph, 0, 0))
        A.key("forearm.R", f, rot=(0.4 - 0.3 * ph, 0, 0))
        A.key("thigh.L", f, rot=(0.5 - 0.7 * ph, 0, 0))
        A.key("thigh.R", f, rot=(0.5 - 0.7 * ph, 0, 0))
        A.key("shin.L", f, rot=(-0.5 + 0.4 * ph, 0, 0))
        A.key("shin.R", f, rot=(-0.5 + 0.4 * ph, 0, 0))
        A.key("hips", f, loc=(0, -0.25 + 0.1 * ph, 0))
    A.finish(a, 18)

    # ---------- jump (anticipate + tuck, plays once) ----------
    a = A.begin("jump")
    A.key("hips", 2, loc=(0, -0.28, 0))
    A.key("spine", 2, rot=(-0.35, 0, 0))
    A.key("hips", 6, loc=(0, 0.05, 0))
    A.key("spine", 6, rot=(0.12, 0, 0))
    A.key("upper_arm.L", 6, rot=(-1.2, 0, -0.4))
    A.key("upper_arm.R", 6, rot=(-1.2, 0, 0.4))
    A.key("thigh.L", 10, rot=(0.9, 0, 0))
    A.key("thigh.R", 10, rot=(0.85, 0, 0))
    A.key("shin.L", 10, rot=(-1.1, 0, 0))
    A.key("shin.R", 10, rot=(-1.1, 0, 0))
    A.finish(a, 10)

    # ---------- fall (loop) ----------
    a = A.begin("fall")
    for f, w in [(1, 0.15), (8, -0.15), (16, 0.15)]:
        A.key("upper_arm.L", f, rot=(-0.4, 0, -1.3 + w))
        A.key("upper_arm.R", f, rot=(-0.4, 0, 1.3 - w))
        A.key("thigh.L", f, rot=(0.35 + w, 0, 0))
        A.key("thigh.R", f, rot=(0.35 - w, 0, 0))
        A.key("spine", f, rot=(-0.12, 0, w * 0.4))
        A.key("head", f, rot=(-0.15, 0, -w * 0.5))
    A.finish(a, 16)

    # ---------- land (heavy squash + bow-tie waggle) ----------
    a = A.begin("land")
    A.key("hips", 2, loc=(0, -0.45, 0))
    A.key("spine", 2, rot=(-0.5, 0, 0))
    A.key("upper_arm.L", 2, rot=(0.9, 0, -0.3))
    A.key("upper_arm.R", 2, rot=(0.9, 0, 0.3))
    A.key("thigh.L", 2, rot=(1.1, 0, 0.15))
    A.key("thigh.R", 2, rot=(1.1, 0, -0.15))
    A.key("shin.L", 2, rot=(-1.4, 0, 0))
    A.key("shin.R", 2, rot=(-1.4, 0, 0))
    for f, w in [(2, 0.6), (4, -0.45), (6, 0.3), (8, -0.15), (10, 0.0)]:
        A.key("bowtie", f, rot=(0, 0, w))
    A.key("hips", 10, loc=(0, 0, 0))
    A.key("spine", 10, rot=(0, 0, 0))
    A.key("upper_arm.L", 10, rot=(0, 0, 0))
    A.key("upper_arm.R", 10, rot=(0, 0, 0))
    A.key("thigh.L", 10, rot=(0, 0, 0))
    A.key("thigh.R", 10, rot=(0, 0, 0))
    A.key("shin.L", 10, rot=(0, 0, 0))
    A.key("shin.R", 10, rot=(0, 0, 0))
    A.finish(a, 10)

    # ---------- doublejump (windmill flail) ----------
    a = A.begin("doublejump")
    for f, ang in [(1, 0.0), (5, math.pi), (9, 2 * math.pi)]:
        A.key("upper_arm.L", f, rot=(ang, 0, -0.5))
        A.key("upper_arm.R", f, rot=(ang, 0, 0.5))
    for f, s in [(1, 1), (5, -1), (9, 1), (13, -1)]:
        A.key("thigh.L", f, rot=(0.6 * s, 0, 0))
        A.key("thigh.R", f, rot=(-0.6 * s, 0, 0))
        A.key("head", f, rot=(-0.1, 0, 0.2 * s))
    A.key("spine", 7, rot=(0.2, 0, 0))
    A.finish(a, 14)

    # ---------- attack: one BIG committed claw swipe ----------
    a = A.begin("attack")
    # windup: arm cocked high behind, torso coiled
    A.key("upper_arm.R", 2, rot=(-1.4, 0, 1.0))
    A.key("forearm.R", 2, rot=(1.9, 0, 0))
    A.key("hand.R", 2, rot=(0.5, 0, 0))
    A.key("spine", 2, rot=(0.05, -0.6, 0))
    A.key("hips", 2, rot=(0, -0.25, 0))
    A.key("head", 2, rot=(0, -0.3, 0))
    A.key("upper_arm.L", 2, rot=(0.3, 0, -0.3))
    # STRIKE: huge cross-body arc, claws leading, lunge into it
    A.key("upper_arm.R", 5, rot=(2.0, 0, -1.0))
    A.key("forearm.R", 5, rot=(0.15, 0, 0))
    A.key("hand.R", 5, rot=(-0.5, 0, 0))
    A.key("spine", 5, rot=(-0.2, 0.7, 0))
    A.key("hips", 5, rot=(0, 0.3, 0))
    A.key("head", 5, rot=(0.1, 0.35, 0))
    A.key("upper_arm.L", 5, rot=(-0.6, 0, -0.6))
    A.key("bowtie", 5, rot=(0, 0, 0.5))
    # follow-through hold
    A.key("upper_arm.R", 8, rot=(1.7, 0, -1.15))
    A.key("forearm.R", 8, rot=(0.8, 0, 0))
    A.key("spine", 8, rot=(-0.15, 0.55, 0))
    A.key("bowtie", 8, rot=(0, 0, -0.3))
    # recover
    for b in ("upper_arm.R", "forearm.R", "hand.R", "spine", "hips", "head", "upper_arm.L", "bowtie"):
        A.key(b, 14, rot=(0, 0, 0))
    A.finish(a, 14)

    # ---------- hit react ----------
    a = A.begin("hit")
    A.key("spine", 2, rot=(0.35, 0, 0.1))
    A.key("head", 2, rot=(0.4, 0, 0))
    A.key("upper_arm.L", 2, rot=(-0.5, 0, -0.7))
    A.key("upper_arm.R", 2, rot=(-0.5, 0, 0.7))
    A.key("forearm.L", 2, rot=(1.2, 0, 0))
    A.key("forearm.R", 2, rot=(1.2, 0, 0))
    for b in ("spine", "head", "upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"):
        A.key(b, 8, rot=(0, 0, 0))
    A.finish(a, 8)

    # ---------- ko (collapse, hold) ----------
    a = A.begin("ko")
    A.key("hips", 6, loc=(0, -0.55, 0))
    A.key("spine", 8, rot=(-0.6, 0, 0.1))
    A.key("head", 10, rot=(-0.6, 0, 0.3))
    A.key("hips", 14, loc=(0, -0.85, 0))
    A.key("thigh.L", 14, rot=(1.5, 0, 0.5))
    A.key("thigh.R", 14, rot=(1.5, 0, -0.5))
    A.key("shin.L", 14, rot=(-2.0, 0, 0))
    A.key("shin.R", 14, rot=(-2.0, 0, 0))
    A.key("upper_arm.L", 14, rot=(0.3, 0, -1.1))
    A.key("upper_arm.R", 14, rot=(0.3, 0, 1.1))
    for side in ("eye.L", "eye.R"):
        A.key(side, 12, scl=(1, 1, 1))
        A.key(side, 16, scl=(1, 1, 0.1))
    A.finish(a, 24)

    # ---------- dance (2s loop: shimmy + disco points) ----------
    a = A.begin("dance")
    for i, f in enumerate(range(1, 49, 6)):
        s = 1 if i % 2 == 0 else -1
        A.key("hips", f, rot=(0, 0.25 * s, 0.18 * s), loc=(0.05 * s, -0.1, 0))
        A.key("spine", f, rot=(0, -0.2 * s, -0.12 * s))
        A.key("head", f, rot=(0.1, 0.15 * s, -0.1 * s))
        A.key("tail", f, rot=(0, 0, 0.5 * s))
        A.key("bowtie", f, rot=(0, 0, 0.25 * s))
        # disco arms: one up one down, alternating
        A.key("upper_arm.L", f, rot=(-0.6 - 0.9 * max(s, 0), 0, -0.9))
        A.key("upper_arm.R", f, rot=(-0.6 - 0.9 * max(-s, 0), 0, 0.9))
        A.key("forearm.L", f, rot=(0.6, 0, 0))
        A.key("forearm.R", f, rot=(0.6, 0, 0))
    A.blink(20)
    A.finish(a, 48)

    # ---------- drop (squat slam: it's hot, drop it) ----------
    a = A.begin("drop")
    A.key("hips", 3, loc=(0, -0.30, 0))
    # THE squat
    A.key("hips", 8, loc=(0, -0.80, 0), rot=(-0.15, 0, 0))
    A.key("thigh.L", 8, rot=(1.9, 0, 0.55))
    A.key("thigh.R", 8, rot=(1.9, 0, -0.55))
    A.key("shin.L", 8, rot=(-2.3, 0, 0))
    A.key("shin.R", 8, rot=(-2.3, 0, 0))
    A.key("foot.L", 8, rot=(0.5, 0, 0))
    A.key("foot.R", 8, rot=(0.5, 0, 0))
    # palm to the pavement
    A.key("upper_arm.R", 8, rot=(1.5, 0, 0.3))
    A.key("forearm.R", 8, rot=(0.4, 0, 0))
    A.key("upper_arm.L", 8, rot=(-1.0, 0, -1.2))
    A.key("head", 8, rot=(-0.5, 0, 0))
    # head pops back up, holds the squat
    A.key("head", 14, rot=(0.25, 0, 0))
    A.key("hips", 20, loc=(0, -0.80, 0))
    A.finish(a, 20)

    # ---------- victory (collage placed) ----------
    a = A.begin("victory")
    for f, up in [(4, 1), (16, 0), (24, 1), (36, 0)]:
        A.key("upper_arm.L", f, rot=(-1.4 * up, 0, -1.2 * up))
        A.key("upper_arm.R", f, rot=(-1.4 * up, 0, 1.2 * up))
        A.key("hips", f, loc=(0, 0.12 * up, 0))
    for f, s in [(36, 1), (40, -1), (44, 1), (48, 0)]:
        A.key("head", f, rot=(0, 0.35 * s, 0))
        A.key("tail", f, rot=(0, 0, 0.6 * s))
    A.blink(44)
    A.finish(a, 48)

    # ---------- wake (gutter cold-open, 4s) ----------
    a = A.begin("wake")
    # face-down flat, head turned, arms splayed, eyes shut
    A.key("hips", 1, loc=(0, -1.05, 0.3), rot=(1.50, 0, 0))
    A.key("spine", 1, rot=(0.1, 0, 0))
    A.key("head", 1, rot=(-0.4, 0.8, 0))
    A.key("upper_arm.L", 1, rot=(0.5, 0, -1.4))
    A.key("upper_arm.R", 1, rot=(0.9, 0, 0.8))
    A.key("thigh.L", 1, rot=(0.2, 0, 0.4))
    A.key("thigh.R", 1, rot=(-0.1, 0, -0.3))
    for side in ("eye.L", "eye.R"):
        A.key(side, 1, scl=(1, 1, 0.1))
        A.key(side, 55, scl=(1, 1, 0.1))
        A.key(side, 60, scl=(1, 1, 1))
        A.key(side, 64, scl=(1, 1, 0.1))
        A.key(side, 70, scl=(1, 1, 1))
    # hold... twitch at 24
    A.key("head", 24, rot=(-0.4, 0.6, 0))
    A.key("head", 30, rot=(-0.4, 0.8, 0))
    # push up to knees
    A.key("hips", 48, loc=(0, -0.6, 0.15), rot=(0.6, 0, 0))
    A.key("upper_arm.L", 48, rot=(1.2, 0, -0.3))
    A.key("upper_arm.R", 48, rot=(1.2, 0, 0.3))
    A.key("forearm.L", 48, rot=(0.4, 0, 0))
    A.key("forearm.R", 48, rot=(0.4, 0, 0))
    A.key("thigh.L", 48, rot=(1.4, 0, 0.2))
    A.key("thigh.R", 48, rot=(1.4, 0, -0.2))
    A.key("shin.L", 48, rot=(-1.8, 0, 0))
    A.key("shin.R", 48, rot=(-1.8, 0, 0))
    # stagger upright with a wobble
    A.key("hips", 72, loc=(0, -0.1, 0), rot=(0.1, 0, 0))
    A.key("spine", 72, rot=(0.1, 0, 0.15))
    A.key("thigh.L", 72, rot=(0.2, 0, 0))
    A.key("thigh.R", 72, rot=(0.2, 0, 0))
    A.key("shin.L", 72, rot=(-0.3, 0, 0))
    A.key("shin.R", 72, rot=(-0.3, 0, 0))
    A.key("upper_arm.L", 72, rot=(0, 0, 0))
    A.key("upper_arm.R", 72, rot=(0, 0, 0))
    A.key("forearm.L", 72, rot=(0, 0, 0))
    A.key("forearm.R", 72, rot=(0, 0, 0))
    A.key("spine", 82, rot=(0.05, 0, -0.12))
    # settle, scratch head
    A.key("hips", 88, loc=(0, 0, 0), rot=(0, 0, 0))
    A.key("spine", 88, rot=(0, 0, 0))
    A.key("upper_arm.R", 88, rot=(-1.6, 0, 0.7))
    A.key("forearm.R", 88, rot=(1.6, 0, 0))
    A.key("head", 88, rot=(0.1, -0.2, 0.1))
    A.key("upper_arm.R", 96, rot=(0, 0, 0))
    A.key("forearm.R", 96, rot=(0, 0, 0))
    A.key("head", 96, rot=(0, 0, 0))
    A.finish(a, 96)

    # ---------- swim (surface doggy paddle, loop) ----------
    a = A.begin("swim")
    for f in (1, 12, 24):
        A.key("hips", f, rot=(-1.25, 0, 0), loc=(0, -0.45, 0.2))
        A.key("neck", f, rot=(0.9, 0, 0))
        A.key("head", f, rot=(0.45, 0, 0))
    for f, s in [(1, 1), (12, -1), (24, 1)]:
        A.key("upper_arm.L", f, rot=(1.5 - 0.6 * s, 0, -0.2))
        A.key("upper_arm.R", f, rot=(1.5 + 0.6 * s, 0, 0.2))
        A.key("forearm.L", f, rot=(0.9 + 0.3 * s, 0, 0))
        A.key("forearm.R", f, rot=(0.9 - 0.3 * s, 0, 0))
    for f, s in [(1, 1), (7, -1), (12, 1), (18, -1), (24, 1)]:
        A.key("thigh.L", f, rot=(0.2 * s, 0, 0))
        A.key("thigh.R", f, rot=(-0.2 * s, 0, 0))
    A.finish(a, 24)

    A.clear_pose()
    print(f"clips: {len(bpy.data.actions)}")
