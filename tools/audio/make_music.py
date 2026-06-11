"""Soundtrack: public-domain compositions arranged in code, rendered with
fluidsynth + FluidR3_GM, encoded to seamless-loop MP3s.

Provenance (all compositions public domain in the US):
- "When the Saints Go Marching In" — traditional, pre-1900
- "Tiger Rag" — Original Dixieland Jass Band, published 1917
- "St. James Infirmary" — traditional (pre-1925 folk lineage)
- "The Entertainer" — Scott Joplin, 1902 (d. 1917)
- "Gutter Sunrise Blues" — original composition for this game (12-bar blues)
The recordings themselves are rendered here and belong to the project.
"""
import json
import os
import struct
import subprocess
import wave

import mido
import lameenc
import numpy as np

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../assets/audio/music"))
os.makedirs(OUT, exist_ok=True)
SF2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
TPB = 480  # ticks per beat

# GM programs
TRUMPET, MUTED_TRUMPET, TROMBONE, TUBA = 56, 59, 57, 58
CLARINET, BANJO, PIANO, DRAWBAR = 71, 105, 0, 16


class Song:
    def __init__(self, bpm, programs):
        self.bpm = bpm
        self.programs = programs  # ch -> program
        self.events = []  # (tick, kind, ch, note, vel)

    def note(self, ch, midi_note, start_beats, dur_beats, vel=88):
        t0 = int(start_beats * TPB)
        t1 = int((start_beats + dur_beats * 0.93) * TPB)
        self.events.append((t0, 1, ch, midi_note, vel))
        self.events.append((t1, 0, ch, midi_note, 0))

    def drum(self, midi_note, start_beats, vel=80):
        self.note(9, midi_note, start_beats, 0.25, vel)

    def save(self, path, total_beats):
        mid = mido.MidiFile(ticks_per_beat=TPB)
        tr = mido.MidiTrack()
        mid.tracks.append(tr)
        tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(self.bpm), time=0))
        for ch, prog in self.programs.items():
            tr.append(mido.Message("program_change", channel=ch, program=prog, time=0))
        evs = sorted(self.events, key=lambda e: (e[0], e[1]))
        last = 0
        for t, kind, ch, note, vel in evs:
            msg = mido.Message("note_on" if kind else "note_off", channel=ch, note=note, velocity=vel, time=t - last)
            tr.append(msg)
            last = t
        # pad to exact loop end
        end = int(total_beats * TPB)
        tr.append(mido.MetaMessage("end_of_track", time=max(0, end - last)))
        mid.save(path)
        return total_beats * 60 / self.bpm  # loop seconds


def swing_ride(s, bars, vel=46):
    for b in range(bars):
        for beat in range(4):
            t = b * 4 + beat
            s.drum(51, t, vel)
            s.drum(51, t + 0.66, vel - 16)
        s.drum(36, b * 4, 70)
        s.drum(36, b * 4 + 2, 60)
        s.drum(38, b * 4 + 1, 52)
        s.drum(38, b * 4 + 3, 55)


def oompah(s, ch, chords, vel=78):
    """chords: list per bar of (root_midi, third_or_fifth_midi, chord_notes)"""
    for b, (root, alt, chord) in enumerate(chords):
        s.note(ch, root, b * 4, 0.9, vel)
        s.note(ch, alt, b * 4 + 2, 0.9, vel - 8)
        for beat in (1, 3):
            for n in chord:
                s.note(2, n, b * 4 + beat, 0.5, 52)


C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B = range(60, 72)


def chord(root, kind="maj"):
    iv = {"maj": (0, 4, 7), "min": (0, 3, 7), "7": (0, 4, 7, 10), "min7": (0, 3, 7, 10)}[kind]
    return [root + i for i in iv]


def saints():
    s = Song(165, {0: TRUMPET, 1: TUBA, 2: BANJO, 3: TROMBONE})
    bars = 16
    prog = [
        (C - 24, G - 24, chord(C - 12)), (C - 24, E - 24, chord(C - 12)), (C - 24, G - 24, chord(C - 12)), (C - 24, G - 24, chord(C - 12)),
        (C - 24, E - 24, chord(C - 12)), (C - 24, G - 24, chord(C - 12)), (G - 24, D - 24, chord(G - 12, "7")), (G - 24, B - 36, chord(G - 12, "7")),
        (C - 24, G - 24, chord(C - 12)), (C - 12, Bb - 12, chord(C - 12, "7")), (F - 24, A - 24, chord(F - 12)), (F - 24, C - 24, chord(F - 12, "min")),
        (C - 24, G - 24, chord(C - 12)), (G - 24, F - 24, chord(G - 12, "7")), (C - 24, G - 24, chord(C - 12)), (G - 24, G - 36, chord(G - 12, "7")),
    ]
    oompah(s, 1, prog)
    swing_ride(s, bars)
    mel = [
        (C, 0, 1), (E, 1, 1), (F, 2, 1), (G, 3, 5),
        (C, 8, 1), (E, 9, 1), (F, 10, 1), (G, 11, 5),
        (C, 16, 1), (E, 17, 1), (F, 18, 1), (G, 19, 2), (E, 21, 2), (C, 23, 2), (E, 25, 2), (D, 27, 5),
        (E, 32, 1), (E, 33, 1), (D, 34, 2), (C, 36, 2), (C, 38, 1), (E, 39, 2), (G, 41, 2), (G, 43, 1), (F, 44, 4),
        (E, 48, 2), (F, 50, 1), (G, 51, 2), (E, 53, 2), (C, 55, 2), (D, 57, 2), (C, 59, 4),
    ]
    for n, t, d in mel:
        s.note(0, n + 12, t, d, 96)
        s.note(3, n - 12, t, d, 56)  # trombone shadow
    return s, bars * 4


def tiger():
    s = Song(200, {0: CLARINET, 1: TUBA, 2: BANJO, 3: TROMBONE})
    bars = 16
    prog = []
    seq = [(F, "maj")] * 4 + [(C, "7")] * 4 + [(C, "7")] * 2 + [(F, "maj")] * 2 + [(Bb, "maj"), (Bb, "min"), (F, "maj"), (C, "7")]
    for r, k in seq:
        prog.append((r - 24, r - 17, chord(r - 12, k)))
    oompah(s, 1, prog, 84)
    swing_ride(s, bars, 52)
    # "hold that tiger" motif: held high note answered by trombone growl
    for rep in range(4):
        base = rep * 16
        hi = A if rep % 2 == 0 else G
        s.note(0, hi + 12, base, 3, 100)
        s.note(0, F + 12, base + 3, 1, 92)
        s.note(3, F - 5, base + 4, 1.5, 80)
        s.note(3, E - 5, base + 5.5, 1.5, 80)
        s.note(3, F - 5, base + 7, 1, 84)
        s.note(0, hi + 12, base + 8, 2, 100)
        s.note(0, F + 12, base + 10, 0.5, 92)
        s.note(0, G + 12, base + 10.5, 0.5, 92)
        s.note(0, A + 12, base + 11, 1, 96)
        for i, n in enumerate((F, G, A, C + 12)):
            s.note(0, n + 12, base + 12 + i * 0.5, 0.5, 88)
        s.note(0, F + 24, base + 14, 2, 102)
    return s, bars * 4


def stjames():
    s = Song(86, {0: MUTED_TRUMPET, 1: TUBA, 2: PIANO})
    bars = 16
    Dm, Gm, A7, Bb7 = chord(D - 12, "min"), chord(G - 12, "min"), chord(A - 12, "7"), chord(Bb - 12, "7")
    seq = [Dm, Dm, Gm, Gm, Dm, Dm, A7, A7, Dm, Dm, Gm, Bb7, Dm, A7, Dm, A7]
    roots = [D - 24, D - 24, G - 24, G - 24, D - 24, D - 24, A - 24, A - 24, D - 24, D - 24, G - 24, Bb - 24, D - 24, A - 24, D - 24, A - 24]
    for b in range(bars):
        s.note(1, roots[b], b * 4, 1.8, 64)
        s.note(1, roots[b] + 7, b * 4 + 2, 1.8, 58)
        for n in seq[b]:
            s.note(2, n, b * 4 + 1, 0.8, 40)
            s.note(2, n, b * 4 + 3, 0.8, 36)
    for b in range(0, bars, 2):  # sparse brushes
        s.drum(51, b * 4, 30)
        s.drum(51, b * 4 + 2.66, 24)
    mel = [
        (D, 0, 1), (F, 1, 1), (A, 2, 2), (A, 4, 2), (A, 6, 1), (G, 7, 1),
        (F, 8, 1), (D, 9, 2), (F, 11, 2), (D, 13, 3),
        (F, 16, 1), (G, 17, 1), (A, 18, 2), (Bb, 20, 1.5), (A, 21.5, 1.5), (G, 23, 2),
        (F, 25, 1), (E, 26, 1), (D, 27, 5),
        (D + 12, 32, 2), (C + 12, 34, 1), (A, 35, 2), (F, 37, 1), (A, 38, 2), (G, 40, 2), (F, 42, 1), (E, 43, 1),
        (D, 44, 2), (F, 46, 1), (E, 47, 1), (D, 48, 4),
        (A, 52, 1.5), (G, 53.5, 1.5), (F, 55, 1), (E, 56, 2), (Db, 58, 2), (D, 60, 4),
    ]
    for n, t, d in mel:
        s.note(0, n, t, d, 84)
    return s, bars * 4


def entertainer():
    s = Song(92, {0: PIANO, 2: PIANO})
    bars = 16
    # stride left hand
    lh = [
        (C - 24, chord(C - 12)), (C - 24, chord(C - 12)), (G - 24, chord(G - 12, "7")), (C - 24, chord(C - 12)),
        (C - 24, chord(C - 12)), (F - 24, chord(F - 12)), (C - 24, chord(C - 12)), (G - 24, chord(G - 12, "7")),
        (C - 24, chord(C - 12)), (C - 24, chord(C - 12)), (G - 24, chord(G - 7 - 12, "7")), (C - 24, chord(C - 12)),
        (F - 24, chord(F - 12)), (C - 24, chord(C - 12)), (G - 24, chord(G - 12, "7")), (C - 24, chord(C - 12)),
    ]
    for b, (root, ch_notes) in enumerate(lh):
        for half in (0, 2):
            s.note(2, root, b * 4 + half, 0.9, 62)
            for n in ch_notes:
                s.note(2, n, b * 4 + half + 1, 0.9, 50)
    # A-strain melody (the famous one)
    def phrase(base):
        seq = [
            (D + 14, 0, 0.5), (Eb + 14, 0.5, 0.5), (E + 14, 1, 0.5), (C + 12, 1.5, 1), (E + 14, 2.5, 0.5), (C + 12, 3, 1), (E + 14, 4, 0.5), (C + 12, 4.5, 2.5),
            (C + 24, 8, 0.5), (D + 24, 8.5, 0.5), (Eb + 24, 9, 0.5), (E + 24, 9.5, 0.5), (C + 24, 10, 0.5), (D + 24, 10.5, 0.5), (E + 24, 11, 0.5),
            (B + 12, 11.5, 0.5), (D + 24, 12, 0.5), (C + 24, 12.5, 2.5),
        ]
        for n, t, d in seq:
            s.note(0, n - 12, base + t, d, 80)
    phrase(0)
    phrase(16)
    phrase(32)
    # turnaround
    for i, n in enumerate((E + 12, D + 12, C + 12, G, E, C)):
        s.note(0, n, 48 + i * 1.2, 1.1, 74)
    for i, n in enumerate((C + 12, E + 12, G + 12, C + 24)):
        s.note(0, n, 56 + i * 0.5, 0.5, 84)
    s.note(0, C + 24, 58, 4, 90)
    return s, bars * 4


def gutter_blues():
    """Original sleepy 12-bar — Joshua's headache in F."""
    s = Song(64, {0: MUTED_TRUMPET, 2: PIANO, 1: TUBA})
    bars = 12
    seq = [chord(F - 12, "7"), chord(F - 12, "7"), chord(F - 12, "7"), chord(F - 12, "7"),
           chord(Bb - 12, "7"), chord(Bb - 12, "7"), chord(F - 12, "7"), chord(F - 12, "7"),
           chord(C - 12, "7"), chord(Bb - 12, "7"), chord(F - 12, "7"), chord(C - 12, "7")]
    roots = [F - 24, F - 24, F - 24, F - 24, Bb - 24, Bb - 24, F - 24, F - 24, C - 24, Bb - 24, F - 24, C - 24]
    for b in range(bars):
        s.note(1, roots[b], b * 4, 3.5, 48)
        for i, n in enumerate(seq[b]):
            s.note(2, n, b * 4 + 1 + i * 0.07, 1.5, 34)
            s.note(2, n, b * 4 + 3 + i * 0.07, 0.8, 28)
    mel = [
        (A, 2, 1.5), (Ab, 3.5, 0.5), (F, 4, 3),
        (F, 10, 1), (Ab, 11, 1), (A, 12, 2), (C + 12, 14, 2),
        (Bb, 18, 1.5), (Ab, 19.5, 0.5), (F, 20, 3),
        (C + 12, 32, 2), (Bb, 34, 1), (A, 35, 1), (F, 36, 2), (Ab, 38, 1), (F, 39, 1), (F, 40, 4),
    ]
    for n, t, d in mel:
        s.note(0, n, t, d, 62)
    return s, bars * 4


def render(name, song, total_beats):
    mid_path = f"/tmp/{name}.mid"
    wav_path = f"/tmp/{name}.wav"
    loop_secs = song.save(mid_path, total_beats)
    subprocess.run(
        ["fluidsynth", "-ni", "-g", "0.7", "-r", "32000", "-F", wav_path, SF2, mid_path],
        check=True, capture_output=True,
    )
    with wave.open(wav_path) as w:
        sr = w.getframerate()
        nch = w.getnchannels()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, nch)
    n_loop = int(loop_secs * sr)
    body = data[:n_loop].astype(np.int32)
    tail = data[n_loop : n_loop + min(sr, len(data) - n_loop)]
    # fold the release tail back onto the loop start -> seamless
    if len(tail) > 0:
        body[: len(tail)] += tail.astype(np.int32)
    body = np.clip(body, -32768, 32767).astype(np.int16)
    if nch == 1:
        body = np.column_stack([body, body])
    enc = lameenc.Encoder()
    enc.set_bit_rate(96)
    enc.set_in_sample_rate(sr)
    enc.set_channels(2)
    enc.set_quality(2)
    mp3 = enc.encode(body.tobytes()) + enc.flush()
    out = os.path.join(OUT, f"{name}.mp3")
    with open(out, "wb") as f:
        f.write(bytes(mp3))
    print(f"{name}: {loop_secs:.1f}s loop, {len(mp3)//1024}KB")
    return loop_secs


manifest = {}
for name, builder, meta in [
    ("block1_gutter_blues", gutter_blues, {"title": "Gutter Sunrise Blues", "composer": "original (this project)", "year": 2026, "pd_basis": "original work"}),
    ("block2_tiger_rag", tiger, {"title": "Tiger Rag", "composer": "Original Dixieland Jass Band", "year": 1917, "pd_basis": "composition pre-1931; rendition ours"}),
    ("alley_st_james", stjames, {"title": "St. James Infirmary", "composer": "traditional", "year": "pre-1925", "pd_basis": "traditional; rendition ours"}),
    ("block3_saints", saints, {"title": "When the Saints Go Marching In", "composer": "traditional", "year": "pre-1900", "pd_basis": "traditional; rendition ours"}),
    ("assembly_entertainer", entertainer, {"title": "The Entertainer", "composer": "Scott Joplin", "year": 1902, "pd_basis": "composition PD (Joplin d. 1917); rendition ours"}),
]:
    song, beats = builder()
    secs = render(name, song, beats)
    manifest[name] = {**meta, "loop_seconds": round(secs, 2)}

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
print("manifest written")
