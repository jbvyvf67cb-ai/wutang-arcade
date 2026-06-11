#!/usr/bin/env python3
"""Fetch the real French Quarter from OpenStreetMap via Overpass.

Raw responses are committed to assets/map/osm_raw/ so the map build
(tools/map/build_map.py) is reproducible offline. Re-run only to refresh
the source data.

Usage: python3 tools/map/fetch_osm.py
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
# south, west, north, east — Rampart to the Mississippi, Canal to Esplanade
BBOX = "29.949,-90.0745,29.9665,-90.055"
OUT = Path(__file__).resolve().parents[2] / "assets" / "map" / "osm_raw"

QUERIES = {
    "buildings": f"""
[out:json][timeout:120];
(
  way["building"]({BBOX});
  relation["building"]({BBOX});
);
out body geom;
""",
    "highways": f"""
[out:json][timeout:120];
(
  way["highway"]({BBOX});
);
out body geom;
""",
    "pois": f"""
[out:json][timeout:120];
(
  node["amenity"]({BBOX});
  node["shop"]({BBOX});
  node["tourism"]({BBOX});
  node["leisure"]({BBOX});
  node["historic"]({BBOX});
  way["amenity"]({BBOX});
  way["shop"]({BBOX});
  way["tourism"]({BBOX});
  way["leisure"]({BBOX});
  way["historic"]({BBOX});
);
out body geom;
""",
    "water_parks": f"""
[out:json][timeout:120];
(
  way["natural"="water"]({BBOX});
  relation["natural"="water"]({BBOX});
  way["waterway"="riverbank"]({BBOX});
  way["leisure"="park"]({BBOX});
  way["leisure"="garden"]({BBOX});
  way["landuse"="grass"]({BBOX});
  way["railway"]({BBOX});
);
out body geom;
""",
}


def fetch(name: str, query: str) -> None:
    print(f"fetching {name}…", flush=True)
    data = urllib.parse.urlencode({"data": query}).encode()
    payload = None
    for attempt in range(6):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "joshua-bear-game/2.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                payload = json.load(r)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            wait = 2 ** (attempt + 1)
            print(f"  {url} failed ({e}); retrying in {wait}s", flush=True)
            time.sleep(wait)
    if payload is None:
        raise RuntimeError(f"all mirrors failed for {name}")
    out = OUT / f"{name}.json"
    out.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"  {len(payload.get('elements', []))} elements -> {out} ({out.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for i, (name, q) in enumerate(QUERIES.items()):
        if i:
            time.sleep(3)  # be polite to Overpass
        fetch(name, q)
