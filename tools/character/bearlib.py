"""Mesh-generation helpers for the character pipeline.

Everything is built from 'tubes': chains of elliptical cross-section loops
bridged with quads. No engine primitives, no blobs — silhouettes are authored
station-by-station.

Blender coordinates: Z up, character faces -Y.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


Vec = tuple[float, float, float]


@dataclass
class Station:
    """One cross-section of a tube."""
    center: Vec
    rx: float  # half-width in the loop's local X
    rz: float  # half-height in the loop's local Y
    # optional squash of the bottom half (0..1, 1 = full ellipse) for flat-bottomed parts
    bottom: float = 1.0


@dataclass
class MeshData:
    verts: list[Vec] = field(default_factory=list)
    faces: list[tuple[int, ...]] = field(default_factory=list)
    # part tag per vertex (for vertex-color zones and skinning hints)
    tags: list[str] = field(default_factory=list)


def _normalize(v: Vec) -> Vec:
    l = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)


def _sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(a: Vec, s: float) -> Vec:
    return (a[0] * s, a[1] * s, a[2] * s)


def _cross(a: Vec, b: Vec) -> Vec:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _frame(direction: Vec, up_hint: Vec = (0, 0, 1)) -> tuple[Vec, Vec]:
    """Right/up vectors perpendicular to direction."""
    d = _normalize(direction)
    if abs(d[0] * up_hint[0] + d[1] * up_hint[1] + d[2] * up_hint[2]) > 0.98:
        up_hint = (0, 1, 0)
    right = _normalize(_cross(up_hint, d))
    up = _normalize(_cross(d, right))
    return right, up


def add_tube(
    md: MeshData,
    stations: list[Station],
    n: int = 10,
    tag: str = "body",
    cap_start: bool = True,
    cap_end: bool = True,
    up_hint: Vec = (0, 0, 1),
) -> None:
    """Bridge elliptical loops along a chain of stations into a closed tube."""
    base = len(md.verts)
    rings: list[list[int]] = []
    prev_right: Vec | None = None
    for i, st in enumerate(stations):
        if i == 0:
            direction = _sub(stations[1].center, st.center)
        elif i == len(stations) - 1:
            direction = _sub(st.center, stations[i - 1].center)
        else:
            direction = _sub(stations[i + 1].center, stations[i - 1].center)
        d = _normalize(direction)
        if prev_right is None:
            right, up = _frame(direction, up_hint)
        else:
            # parallel transport: minimally rotate previous frame onto the new
            # direction so consecutive rings can never flip/twist
            dot = prev_right[0] * d[0] + prev_right[1] * d[1] + prev_right[2] * d[2]
            r = _sub(prev_right, _scale(d, dot))
            if r[0] ** 2 + r[1] ** 2 + r[2] ** 2 < 1e-8:
                right, up = _frame(direction, up_hint)
            else:
                right = _normalize(r)
                up = _normalize(_cross(d, right))
        prev_right = right
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            cx, sy = math.cos(a), math.sin(a)
            if sy < 0:
                sy *= st.bottom
            p = _add(st.center, _add(_scale(right, cx * st.rx), _scale(up, sy * st.rz)))
            ring.append(len(md.verts))
            md.verts.append(p)
            md.tags.append(tag)
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(n):
            md.faces.append((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    if cap_start:
        md.faces.append(tuple(reversed(rings[0])))
    if cap_end:
        md.faces.append(tuple(rings[-1]))


def add_cone(
    md: MeshData,
    base_center: Vec,
    tip: Vec,
    radius: float,
    n: int = 6,
    tag: str = "claw",
) -> None:
    """Small claw cone from base disc to tip point."""
    right, up = _frame(_sub(tip, base_center))
    ring = []
    for k in range(n):
        a = 2 * math.pi * k / n
        p = _add(
            base_center,
            _add(_scale(right, math.cos(a) * radius), _scale(up, math.sin(a) * radius)),
        )
        ring.append(len(md.verts))
        md.verts.append(p)
        md.tags.append(tag)
    tip_i = len(md.verts)
    md.verts.append(tip)
    md.tags.append(tag)
    for k in range(n):
        md.faces.append((ring[k], ring[(k + 1) % n], tip_i))
    md.faces.append(tuple(reversed(ring)))


def add_box(
    md: MeshData,
    center: Vec,
    size: Vec,
    tag: str = "prop",
    rot_y: float = 0.0,
    taper_x: float = 1.0,
) -> None:
    """Rounded-by-subsurf box; taper_x narrows the +Y(back) face for wedge shapes.

    rot_y rotates around the Y axis (Blender front axis) for bow-tie wings.
    """
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    base = len(md.verts)
    corners = []
    for sz in (-1, 1):
        for sy in (-1, 1):
            tx = taper_x if sy > 0 else 1.0
            for sx in (-1, 1):
                corners.append((sx * hx * tx, sy * hy, sz * hz))
    cr, sr = math.cos(rot_y), math.sin(rot_y)
    for x, y, z in corners:
        rx = x * cr - z * sr
        rz = x * sr + z * cr
        md.verts.append((center[0] + rx, center[1] + y, center[2] + rz))
        md.tags.append(tag)
    quads = [
        (0, 1, 3, 2), (6, 7, 5, 4),  # bottom, top
        (0, 2, 6, 4), (3, 1, 5, 7),  # sides
        (1, 0, 4, 5), (2, 3, 7, 6),  # front, back
    ]
    for q in quads:
        md.faces.append(tuple(base + i for i in q))


def add_disc_ear(
    md: MeshData,
    center: Vec,
    radius: float,
    thickness: float,
    tilt: float,
    tag: str = "ear",
    n: int = 10,
) -> None:
    """Bear ear: a thick disc, tilted outward, half-embedded in the skull."""
    # two slightly domed rings bridged: front face + back face
    front, back = [], []
    ca, sa = math.cos(tilt), math.sin(tilt)

    def place(k: int, off: float, r: float) -> Vec:
        a = 2 * math.pi * k / n
        # disc in XZ plane, then tilted around Y-ish axis outward
        x, z = math.cos(a) * r, math.sin(a) * r
        # tilt: rotate disc normal (0,-1,0) outward around Z by tilt sign of center.x
        s = 1 if center[0] >= 0 else -1
        xr = x * ca - off * sa * s
        yo = (x * sa * s + off * ca) * -1
        return (center[0] + xr, center[1] + yo, center[2] + z)

    for k in range(n):
        front.append(len(md.verts))
        md.verts.append(place(k, -thickness / 2, radius))
        md.tags.append(tag)
    for k in range(n):
        back.append(len(md.verts))
        md.verts.append(place(k, thickness / 2, radius * 0.92))
        md.tags.append(tag)
    for k in range(n):
        md.faces.append((front[k], front[(k + 1) % n], back[(k + 1) % n], back[k]))
    md.faces.append(tuple(reversed(front)))
    md.faces.append(tuple(back))


def add_sphere(
    md: MeshData,
    center: Vec,
    radius: float,
    tag: str = "eye",
    rings: int = 6,
    segs: int = 8,
    squash: float = 1.0,
) -> None:
    """Latitude/longitude ball for eyes (small, never reads as primitive)."""
    base = len(md.verts)
    grid: list[list[int]] = []
    for i in range(1, rings):
        phi = math.pi * i / rings
        row = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            p = (
                center[0] + radius * math.sin(phi) * math.cos(th),
                center[1] + radius * math.sin(phi) * math.sin(th),
                center[2] + radius * math.cos(phi) * squash,
            )
            row.append(len(md.verts))
            md.verts.append(p)
            md.tags.append(tag)
        grid.append(row)
    top = len(md.verts)
    md.verts.append((center[0], center[1], center[2] + radius * squash))
    md.tags.append(tag)
    bot = len(md.verts)
    md.verts.append((center[0], center[1], center[2] - radius * squash))
    md.tags.append(tag)
    for j in range(segs):
        md.faces.append((top, grid[0][j], grid[0][(j + 1) % segs]))
        md.faces.append((bot, grid[-1][(j + 1) % segs], grid[-1][j]))
    for i in range(len(grid) - 1):
        for j in range(segs):
            md.faces.append(
                (grid[i][j], grid[i][(j + 1) % segs], grid[i + 1][(j + 1) % segs], grid[i + 1][j])
            )
