#!/usr/bin/env python3
"""Build the playable French Quarter from committed OSM data.

Reads assets/map/osm_raw/*.json (fetched by fetch_osm.py, committed),
projects lon/lat to local meters, rotates the map so Bourbon Street runs
along +Z (the game's historical street axis), clips to the Quarter proper
(Rampart->river, Canal->Esplanade), scales by GAME_SCALE, triangulates
building footprints (ear clipping — the game ships precomputed geometry,
no runtime triangulator), matches the curated landmark list against OSM
names, and writes assets/map/quarter.json for src/level/quarter.ts.

Deterministic: same inputs -> same output.

Usage: python3 tools/map/build_map.py
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets" / "map" / "osm_raw"
OUT = ROOT / "assets" / "map" / "quarter.json"

GAME_SCALE = 0.65  # horizontal scale; heights stay 1:1 (stylized toy-town)
ORIGIN_LAT, ORIGIN_LON = 29.9579, -90.0633  # St. Louis Cathedral front
M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(ORIGIN_LAT))

# Streets that matter for gameplay/signage; everything else is decoration.
MAJOR_STREETS = {
    "Bourbon Street", "Royal Street", "Chartres Street", "Decatur Street",
    "Dauphine Street", "Burgundy Street", "North Rampart Street",
    "North Peters Street", "Canal Street", "Esplanade Avenue",
    "Iberville Street", "Bienville Street", "Conti Street",
    "Saint Louis Street", "Toulouse Street", "Saint Peter Street",
    "Orleans Street", "Saint Ann Street", "Dumaine Street",
    "Saint Philip Street", "Ursulines Avenue", "Governor Nicholls Street",
    "Barracks Street", "Madison Street", "Wilkinson Street",
    "Exchange Place", "Pirates Alley", "Pirate's Alley", "Pere Antoine Alley",
    "Père Antoine Alley", "Cabildo Alley", "French Market Place",
    "Saint Ann Street", "Decatur Street", "Madison Avenue", "Clinton Street",
}
STREET_WIDTH = {  # full road width, scaled meters
    "primary": 11.0, "primary_link": 9.0, "secondary": 9.0, "tertiary": 7.5,
    "residential": 7.0, "unclassified": 7.0, "living_street": 6.5,
    "pedestrian": 6.0, "service": 4.5, "footway": 2.6, "steps": 2.2,
    "cycleway": 2.6, "path": 2.4,
}


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# ---- curated landmarks: key -> (aliases for OSM match, fallback lat/lon, category) ----
LANDMARKS: dict[str, tuple[list[str], tuple[float, float], str]] = {
    "stlouis_cathedral": (["cathedral basilica of saint louis", "st louis cathedral"], (29.95795, -90.06360), "cathedral"),
    "cabildo": (["the cabildo", "cabildo"], (29.95745, -90.06415), "museum"),
    "presbytere": (["the presbytere", "presbytere"], (29.95835, -90.06305), "museum"),
    "jackson_square": (["jackson square"], (29.95740, -90.06300), "park"),
    "pontalba_upper": (["upper pontalba", "pontalba apartments"], (29.95690, -90.06370), "landmark"),
    "pontalba_lower": (["lower pontalba"], (29.95815, -90.06245), "landmark"),
    "cafe_du_monde": (["cafe du monde"], (29.95745, -90.06165), "cafe"),
    "french_market": (["french market"], (29.96050, -90.05870), "market"),
    "jax_brewery": (["jax brewery", "jackson brewery"], (29.95625, -90.06365), "venue"),
    "preservation_hall": (["preservation hall"], (29.95828, -90.06525), "venue"),
    "pat_obriens": (["pat obriens", "pat o briens"], (29.95820, -90.06545), "bar"),
    "lafittes_blacksmith": (["lafittes blacksmith", "lafitte s blacksmith"], (29.96115, -90.06520), "bar"),
    "old_absinthe_house": (["old absinthe house"], (29.95435, -90.06905), "bar"),
    "hotel_monteleone": (["hotel monteleone", "monteleone"], (29.95480, -90.06680), "hotel"),
    "antoines": (["antoines", "antoine s"], (29.95630, -90.06630), "restaurant"),
    "galatoires": (["galatoires", "galatoire s"], (29.95475, -90.06855), "restaurant"),
    "napoleon_house": (["napoleon house"], (29.95580, -90.06520), "bar"),
    "court_two_sisters": (["court of the two sisters", "court of two sisters"], (29.95760, -90.06480), "restaurant"),
    "ms_rau": (["m s rau", "ms rau", "rau antiques"], (29.95780, -90.06480), "shop"),
    "voodoo_shop": (["marie laveau", "house of voodoo"], (29.95900, -90.06440), "shop"),
    "cornstalk_hotel": (["cornstalk hotel", "cornstalk"], (29.95950, -90.06280), "hotel"),
    "lalaurie_mansion": (["lalaurie"], (29.96130, -90.06080), "landmark"),
    "ursuline_convent": (["ursuline convent", "old ursuline"], (29.96030, -90.06030), "museum"),
    "beauregard_keyes": (["beauregard keyes", "beauregard-keyes"], (29.96050, -90.06060), "museum"),
    "madame_johns": (["madame john"], (29.95950, -90.06380), "museum"),
    "us_mint": (["new orleans mint", "old us mint", "old united states mint"], (29.96130, -90.05810), "museum"),
    "central_grocery": (["central grocery"], (29.95870, -90.06070), "shop"),
    "tujagues": (["tujagues", "tujague s"], (29.95580, -90.06450), "restaurant"),
    "coops_place": (["coops place", "coop s place"], (29.96080, -90.05950), "restaurant"),
    "mollys_market": (["mollys at the market", "molly s at the market"], (29.96070, -90.05960), "bar"),
    "clover_grill": (["clover grill"], (29.96060, -90.06480), "restaurant"),
    "lafitte_in_exile": (["lafitte in exile", "cafe lafitte"], (29.96050, -90.06490), "bar"),
    "cats_meow": (["cats meow", "cat s meow"], (29.95850, -90.06560), "bar"),
    "tropical_isle": (["tropical isle"], (29.95930, -90.06500), "bar"),
    "musical_legends": (["musical legends park"], (29.95560, -90.06900), "park"),
    "faulkner_house": (["faulkner house"], (29.95810, -90.06410), "shop"),
    "washington_artillery": (["washington artillery park"], (29.95690, -90.06230), "landmark"),
    "moonwalk": (["moonwalk", "moon walk"], (29.95680, -90.06150), "landmark"),
    "verti_marte": (["verti marte"], (29.96190, -90.06200), "shop"),
    "croissant_dor": (["croissant dor", "croissant d or"], (29.96030, -90.06140), "cafe"),
    "erin_rose": (["erin rose"], (29.95620, -90.06830), "bar"),
    "checkpoint_charlies": (["checkpoint charlie"], (29.96320, -90.05880), "bar"),
    "cabrini_playground": (["cabrini playground"], (29.96280, -90.06280), "park"),
    "exchange_place_lm": (["exchange place", "exchange alley"], (29.95450, -90.06950), "landmark"),
    "old_ursuline_garden": (["st anthonys garden", "saint anthony s garden", "cathedral garden"], (29.95850, -90.06400), "park"),
    "bourbon_orleans": (["bourbon orleans hotel"], (29.95880, -90.06490), "hotel"),
    "brennans": (["brennans", "brennan s restaurant"], (29.95610, -90.06700), "restaurant"),
    "royal_pharmacy": (["pharmacy museum", "pharmacie"], (29.95560, -90.06560), "museum"),
    "gumbo_shop": (["gumbo shop"], (29.95790, -90.06460), "restaurant"),
    "acme_oyster": (["acme oyster"], (29.95490, -90.06930), "restaurant"),
    "felixs": (["felixs", "felix s restaurant"], (29.95480, -90.06920), "restaurant"),
    # ours, fictional — takes the 325 Bourbon strip-club lot (Stilettos)
    "lipstixx": ([], (29.95560, -90.06880), "club"),
    "travel_agency": ([], (29.95545, -90.06860), "shop"),
}


def project(lat: float, lon: float) -> tuple[float, float]:
    """lon/lat -> unrotated local meters (east, north)."""
    return ((lon - ORIGIN_LON) * M_PER_DEG_LON, (lat - ORIGIN_LAT) * M_PER_DEG_LAT)


def load(name: str) -> list[dict]:
    return json.loads((RAW / f"{name}.json").read_text())["elements"]


# ---------------------------------------------------------------- geometry --
def poly_area(pts: list[tuple[float, float]]) -> float:
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def simplify(pts: list[tuple[float, float]], eps: float = 0.35) -> list[tuple[float, float]]:
    """Drop near-duplicate and collinear vertices (scaled meters)."""
    out: list[tuple[float, float]] = []
    for p in pts:
        if out and math.dist(out[-1], p) < eps:
            continue
        out.append(p)
    if len(out) > 1 and math.dist(out[0], out[-1]) < eps:
        out.pop()
    # collinear pass
    res: list[tuple[float, float]] = []
    n = len(out)
    for i in range(n):
        a, b, c = out[(i - 1) % n], out[i], out[(i + 1) % n]
        cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(cross) > 0.08:
            res.append(b)
    return res if len(res) >= 3 else out


def ear_clip(pts: list[tuple[float, float]]) -> list[int]:
    """Triangulate a simple CCW polygon. Returns flat index triples."""
    n = len(pts)
    if n < 3:
        return []
    if n == 3:
        return [0, 1, 2]
    idx = list(range(n))
    tris: list[int] = []
    guard = 0
    while len(idx) > 3 and guard < 4 * n * n:
        guard += 1
        found = False
        for k in range(len(idx)):
            i0, i1, i2 = idx[(k - 1) % len(idx)], idx[k], idx[(k + 1) % len(idx)]
            ax, ay = pts[i0]
            bx, by = pts[i1]
            cx, cy = pts[i2]
            cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
            if cross <= 1e-9:  # reflex or degenerate
                continue
            # any other vertex inside?
            ok = True
            for j in idx:
                if j in (i0, i1, i2):
                    continue
                px, py = pts[j]
                d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
                d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
                d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
                if d1 >= -1e-9 and d2 >= -1e-9 and d3 >= -1e-9:
                    ok = False
                    break
            if ok:
                tris.extend((i0, i1, i2))
                idx.pop(k)
                found = True
                break
        if not found:
            break
    if len(idx) == 3:
        tris.extend(idx)
    elif len(idx) > 3:
        # fallback: fan from first remaining (slightly wrong for concave leftovers)
        for k in range(1, len(idx) - 1):
            tris.extend((idx[0], idx[k], idx[k + 1]))
    return tris


def dist_pt_seg(p, a, b) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return math.dist(p, a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.dist(p, (ax + t * dx, ay + t * dy))


# ------------------------------------------------------------------- build --
def main() -> None:
    buildings_raw = load("buildings")
    highways_raw = load("highways")
    pois_raw = load("pois")
    waterparks_raw = load("water_parks")
    river_raw = load("river")

    # --- rotation: Bourbon Street bearing -> +Z ---
    bourbon_pts: list[tuple[float, float]] = []
    for e in highways_raw:
        if e["type"] == "way" and e.get("tags", {}).get("name") == "Bourbon Street":
            bourbon_pts += [project(g["lat"], g["lon"]) for g in e.get("geometry", [])]
    # principal direction via endpoints spread (Canal end vs Esplanade end)
    bourbon_pts.sort(key=lambda p: p[0] + p[1])
    d = (bourbon_pts[-1][0] - bourbon_pts[0][0], bourbon_pts[-1][1] - bourbon_pts[0][1])
    ang = math.atan2(d[0], d[1])  # rotate so this direction becomes +Z
    cos_a, sin_a = math.cos(ang), math.sin(ang)

    def to_game(lat: float, lon: float) -> tuple[float, float]:
        e, n = project(lat, lon)
        # rotate (e,n) by -ang around origin: z' along Bourbon, x' perpendicular
        z = (e * sin_a + n * cos_a) * GAME_SCALE
        x = (e * cos_a - n * sin_a) * GAME_SCALE
        return (x, z)

    # ensure river side is +X: cathedral fallback is river-side of Bourbon
    cx, cz = to_game(29.95795, -90.06360)
    bx = sum(p[0] * cos_a - p[1] * sin_a for p in bourbon_pts) / len(bourbon_pts) * GAME_SCALE
    flip = -1.0 if cx < bx else 1.0

    def G(lat: float, lon: float) -> tuple[float, float]:
        x, z = to_game(lat, lon)
        return (flip * x, z)

    # --- clip rectangle from boundary streets ---
    def street_mean(name: str, axis: int) -> float:
        vals = []
        for e in highways_raw:
            if e["type"] == "way" and e.get("tags", {}).get("name") == name:
                for g in e.get("geometry", []):
                    p = G(g["lat"], g["lon"])
                    vals.append(p[axis])
        vals.sort()
        return vals[len(vals) // 2] if vals else 0.0

    z_canal = street_mean("Canal Street", 1)
    z_esp = street_mean("Esplanade Avenue", 1)
    x_rampart = street_mean("North Rampart Street", 0)
    z0, z1 = min(z_canal, z_esp) - 8, max(z_canal, z_esp) + 8
    x_land = x_rampart - 8  # rampart is on the -x side after the flip

    # --- river shoreline: pick the bank way on the Quarter side ---
    bank_candidates = []
    for e in river_raw:
        if e["type"] != "way" or not e.get("geometry"):
            continue
        pts = [G(g["lat"], g["lon"]) for g in e["geometry"]]
        mean_x = sum(p[0] for p in pts) / len(pts)
        bank_candidates.append((mean_x, pts))
    bank_candidates.sort(key=lambda t: abs(t[0]))  # nearest bank to the Quarter
    shoreline = bank_candidates[0][1]
    shoreline = [p for p in shoreline if z0 - 60 < p[1] < z1 + 60]
    shoreline.sort(key=lambda p: p[1])
    shoreline = simplify(shoreline, eps=4.0)
    x_river_max = max(p[0] for p in shoreline)

    # flip guarantees the river is at +x, so Rampart (land edge) is at -x
    def in_quarter(x: float, z: float, margin: float = 0.0) -> bool:
        if not (z0 - margin < z < z1 + margin):
            return False
        return x_land - margin < x < x_river_max + 90

    city_x = G(29.95795, -90.06360)[0]  # cathedral: the city side of the shoreline

    # --- buildings ---
    def assemble_relation(rel: dict) -> list[tuple[float, float]] | None:
        outers = [m for m in rel.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        if not outers:
            return None
        # chain outer ways into one ring
        segs = [[(g["lat"], g["lon"]) for g in m["geometry"]] for m in outers]
        ring = segs.pop(0)
        while segs:
            ext = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += list(reversed(s))[1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = list(reversed(s))[:-1] + ring
                else:
                    continue
                segs.pop(i)
                ext = True
                break
            if not ext:
                break
        return ring

    buildings = []
    skipped = 0
    for e in buildings_raw:
        tags = e.get("tags", {})
        if e["type"] == "way":
            geom = e.get("geometry")
            if not geom:
                continue
            ring = [(g["lat"], g["lon"]) for g in geom]
        else:
            ring = assemble_relation(e)
            if not ring:
                continue
        pts = [G(la, lo) for la, lo in ring]
        cxm = sum(p[0] for p in pts) / len(pts)
        czm = sum(p[1] for p in pts) / len(pts)
        if not in_quarter(cxm, czm):
            continue
        # drop anything across the river (Algiers): beyond shoreline x at that z
        near = min(shoreline, key=lambda s: abs(s[1] - czm))
        if (cxm - near[0]) * (city_x - near[0]) < 0:
            continue
        pts = simplify(pts)
        if len(pts) < 3:
            skipped += 1
            continue
        area = poly_area(pts)
        if abs(area) < 12.0:  # tiny sheds (scaled m²)
            skipped += 1
            continue
        if area < 0:
            pts.reverse()
        tri = ear_clip(pts)
        if not tri:
            skipped += 1
            continue
        levels_tag = tags.get("building:levels")
        try:
            levels = max(1.0, float(levels_tag)) if levels_tag else 0.0
        except ValueError:
            levels = 0.0
        if not levels:
            h_tag = tags.get("height")
            try:
                levels = max(1.0, float(re.sub(r"[^0-9.]", "", h_tag)) / 3.4) if h_tag else 0.0
            except (ValueError, TypeError):
                levels = 0.0
        if not levels:
            levels = 2 + (e["id"] % 3 == 0) + (e["id"] % 7 == 0)  # 2-4, deterministic
        levels = min(levels, 12)  # cartoon cap (Monteleone et al.)
        buildings.append({
            "id": e["id"],
            "pts": [round(c, 1) for p in pts for c in p],
            "tri": tri,
            "lv": round(levels, 1),
            "name": tags.get("name"),
            "c": [round(cxm, 1), round(czm, 1)],
        })

    # --- streets ---
    streets = []
    node_streets: dict[int, set[str]] = {}
    node_pos: dict[int, tuple[float, float]] = {}
    for e in highways_raw:
        if e["type"] != "way" or not e.get("geometry"):
            continue
        tags = e.get("tags", {})
        cls = tags.get("highway", "")
        if cls not in STREET_WIDTH:
            continue
        name = tags.get("name", "")
        pts = [G(g["lat"], g["lon"]) for g in e["geometry"]]
        pts = [p for p in pts if in_quarter(p[0], p[1], margin=14)]
        # keep only city-side points (drops Algiers Point fragments)
        pts = [p for p in pts
               if (p[0] - min(shoreline, key=lambda s: abs(s[1] - p[1]))[0])
               * (city_x - min(shoreline, key=lambda s: abs(s[1] - p[1]))[0]) >= 0
               or dist_pt_seg(p, shoreline[0], shoreline[-1]) < 30]
        if len(pts) < 2:
            continue
        # drop unnamed footways/service except inside the quarter (they're alleys/paths)
        if cls in ("footway", "steps", "cycleway", "path") and not name:
            continue
        keep_name = name if name in MAJOR_STREETS else (name or "")
        streets.append({
            "name": keep_name,
            "cls": cls,
            "w": STREET_WIDTH[cls] if name in MAJOR_STREETS or cls in ("primary", "secondary") else min(STREET_WIDTH[cls], 6.5),
            "pts": [round(c, 1) for p in pts for c in p],
        })
        if name in MAJOR_STREETS:
            geom = e["geometry"]
            for nid, g in zip(e.get("nodes", []), geom):
                p = G(g["lat"], g["lon"])
                if not in_quarter(p[0], p[1], margin=10):
                    continue
                node_streets.setdefault(nid, set()).add(name)
                node_pos[nid] = p

    intersections = []
    seen_pairs: set[tuple[str, ...]] = set()
    for nid, names in node_streets.items():
        if len(names) < 2:
            continue
        p = node_pos[nid]
        key = tuple(sorted(names) + [str(round(p[0] / 18)), str(round(p[1] / 18))])
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        intersections.append({"p": [round(p[0], 1), round(p[1], 1)], "names": sorted(names)})

    # --- POIs ---
    pois = []
    for e in pois_raw:
        tags = e.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        if e["type"] == "node":
            p = G(e["lat"], e["lon"])
        else:
            geom = e.get("geometry")
            if not geom:
                continue
            xs = [G(g["lat"], g["lon"]) for g in geom]
            p = (sum(q[0] for q in xs) / len(xs), sum(q[1] for q in xs) / len(xs))
        if not in_quarter(p[0], p[1]):
            continue
        cat = (tags.get("amenity") or tags.get("shop") or tags.get("tourism")
               or tags.get("leisure") or tags.get("historic") or "misc")
        pois.append({"n": name, "p": [round(p[0], 1), round(p[1], 1)], "c": cat})

    # --- parks / grass ---
    parks = []
    for e in waterparks_raw:
        tags = e.get("tags", {})
        kind = tags.get("leisure") or tags.get("landuse")
        if kind not in ("park", "garden", "grass"):
            continue
        geom = e.get("geometry")
        if not geom:
            continue
        pts = simplify([G(g["lat"], g["lon"]) for g in geom])
        if len(pts) < 3:
            continue
        cxm = sum(p[0] for p in pts) / len(pts)
        czm = sum(p[1] for p in pts) / len(pts)
        if not in_quarter(cxm, czm):
            continue
        if poly_area(pts) < 0:
            pts.reverse()
        tri = ear_clip(pts)
        if not tri:
            continue
        parks.append({
            "name": tags.get("name"),
            "pts": [round(c, 1) for p in pts for c in p],
            "tri": tri,
        })

    # --- land polygon: bounds rect on the city side, east edge = shoreline ---
    shore_in = [p for p in shoreline if z0 <= p[1] <= z1]
    land_pts = ([(x_land, z0), (shoreline[0][0], z0)]
                + shore_in
                + [(shoreline[-1][0], z1), (x_land, z1)])
    if poly_area(land_pts) < 0:
        land_pts.reverse()
    land = {
        "pts": [round(c, 1) for p in land_pts for c in p],
        "tri": ear_clip(land_pts),
    }

    # --- Riverfront streetcar rails (railway=tram on the city side) ---
    trams = []
    for e in waterparks_raw:
        if e.get("tags", {}).get("railway") != "tram" or not e.get("geometry"):
            continue
        pts = [G(g["lat"], g["lon"]) for g in e["geometry"]]
        pts = [p for p in pts if in_quarter(p[0], p[1], margin=20)]
        if len(pts) < 2:
            continue
        # riverfront line only: near the shoreline
        mean_shore_d = sum(
            abs(p[0] - min(shoreline, key=lambda s: abs(s[1] - p[1]))[0]) for p in pts
        ) / len(pts)
        if mean_shore_d > 60:
            continue
        trams.append([round(c, 1) for p in pts for c in p])

    # --- river polygon: shoreline + closure on the far side ---
    river_far = 160.0  # how far the water extends past the shore (scaled)
    far_sign = 1.0 if city_x < shoreline[0][0] else -1.0
    river_pts = list(shoreline) + [
        (shoreline[-1][0] + far_sign * river_far, shoreline[-1][1]),
        (shoreline[0][0] + far_sign * river_far, shoreline[0][1]),
    ]
    if poly_area(river_pts) < 0:
        river_pts.reverse()
    river = {
        "pts": [round(c, 1) for p in river_pts for c in p],
        "tri": ear_clip(river_pts),
    }

    # --- landmarks: match curated list against OSM names ---
    name_index: list[tuple[str, tuple[float, float], int | None]] = []
    for bi, b in enumerate(buildings):
        if b["name"]:
            name_index.append((norm_name(b["name"]), tuple(b["c"]), bi))
    for q in pois:
        name_index.append((norm_name(q["n"]), tuple(q["p"]), None))

    landmarks = []
    matched = 0
    for key, (aliases, (fla, flo), cat) in LANDMARKS.items():
        fb = G(fla, flo)
        best = None
        for nm, pos, bi in name_index:
            if any(a in nm or nm in a for a in aliases if len(a) > 4):
                d = math.dist(pos, fb)
                if best is None or d < best[0]:
                    best = (d, pos, bi)
        if best and best[0] < 220:  # sanity radius (scaled m)
            pos, bi = best[1], best[2]
            matched += 1
            src = "osm"
        else:
            pos, bi = fb, None
            src = "fallback"
        # snap to containing/nearest building footprint center for signage
        if bi is None:
            nearest = min(buildings, key=lambda b: math.dist(tuple(b["c"]), pos))
            if math.dist(tuple(nearest["c"]), pos) < 26:
                bi = buildings.index(nearest)
        landmarks.append({
            "key": key, "p": [round(pos[0], 1), round(pos[1], 1)],
            "bld": bi, "cat": cat, "src": src,
        })

    # --- building fronts: nearest major street + facing edge ---
    major_lines = []
    for s in streets:
        if s["name"] in MAJOR_STREETS:
            pl = s["pts"]
            major_lines.append((s["name"], [(pl[i], pl[i + 1]) for i in range(0, len(pl), 2)]))
    for b in buildings:
        c = tuple(b["c"])
        best = None
        for name, line in major_lines:
            for i in range(len(line) - 1):
                d = dist_pt_seg(c, line[i], line[i + 1])
                if best is None or d < best[0]:
                    best = (d, name)
        if best and best[0] < 34:
            pl = b["pts"]
            n = len(pl) // 2
            # facade edge: longest-ish edge whose midpoint is closest to that
            # street (tiny corner edges must not win the storefront)
            be, bd = -1, 1e9
            for min_len in (3.5, 0.0):  # prefer real edges; fall back to any
                for i in range(n):
                    ex0, ez0 = pl[2 * i], pl[2 * i + 1]
                    ex1, ez1 = pl[(2 * i + 2) % (2 * n)], pl[(2 * i + 3) % (2 * n)]
                    if math.hypot(ex1 - ex0, ez1 - ez0) < min_len:
                        continue
                    mx, mz = (ex0 + ex1) / 2, (ez0 + ez1) / 2
                    for name, line in major_lines:
                        if name != best[1]:
                            continue
                        for j in range(len(line) - 1):
                            d = dist_pt_seg((mx, mz), line[j], line[j + 1])
                            if d < bd:
                                bd, be = d, i
                if be >= 0:
                    break
            # f[2] is the FRONT EDGE distance to the street (not centroid):
            # deep lots still get storefronts and galleries
            b["f"] = [max(0, be), best[1], round(bd, 1)]

    out = {
        "meta": {
            "scale": GAME_SCALE,
            "origin": [ORIGIN_LAT, ORIGIN_LON],
            "rotationRad": round(ang, 6),
            "flipX": flip,
            "bounds": [round(x_land, 1), round(z0, 1),
                       round(x_river_max + river_far, 1), round(z1, 1)],
            "attribution": "Map data © OpenStreetMap contributors (ODbL)",
        },
        "buildings": buildings,
        "streets": streets,
        "intersections": intersections,
        "pois": pois,
        "parks": parks,
        "river": river,
        "land": land,
        "trams": trams,
        "shoreline": [round(c, 1) for p in shoreline for c in p],
        "landmarks": landmarks,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    mb = OUT.stat().st_size / 1e6
    print(f"buildings {len(buildings)} (skipped {skipped}) · streets {len(streets)} · "
          f"intersections {len(intersections)} · pois {len(pois)} · parks {len(parks)}")
    print(f"landmarks matched {matched}/{len(LANDMARKS)} via OSM, rest fallback")
    for lm in landmarks:
        if lm["src"] == "fallback" and LANDMARKS[lm["key"]][0]:
            print(f"  fallback: {lm['key']}")
    print(f"bounds {out['meta']['bounds']}  ->  {OUT.name} {mb:.2f} MB")


if __name__ == "__main__":
    main()
