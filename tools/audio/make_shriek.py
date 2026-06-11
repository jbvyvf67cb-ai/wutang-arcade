"""The Huntress' war cry: espeak-ng -> pitch-warp + ring-mod + reverb -> WAV.

"I am the huntress, and Chris is my prey!"
"""
import os
import subprocess
import wave
import numpy as np

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../assets/audio"))
os.makedirs(OUT_DIR, exist_ok=True)
RAW = "/tmp/shriek_raw.wav"

subprocess.run(
    [
        "espeak-ng", "-v", "en+f5", "-p", "95", "-s", "140", "-a", "190",
        "-w", RAW,
        "I am the huntress!, and Chris... is my prey!",
    ],
    check=True,
)

with wave.open(RAW) as w:
    sr = w.getframerate()
    data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64)

x = data / 32768.0

# 1. drop pitch ~25% (resample) for a throatier register, keep the speed-creep
idx = np.arange(0, len(x) - 1, 0.78)
lo = x[idx.astype(int)]
# 2. layer a +1 octave ghost (every other sample) for the screechy double-voice
hi_idx = np.arange(0, len(x) - 1, 1.55)
hi = x[hi_idx.astype(int)] * 0.45
n = max(len(lo), len(hi))
lo = np.pad(lo, (0, n - len(lo)))
hi = np.pad(hi, (0, n - len(hi)))
mix = lo + hi
# 3. ring-mod warble (possessed-tremolo)
t = np.arange(n) / sr
mix *= 1.0 + 0.35 * np.sin(2 * np.pi * 11 * t) * np.sin(2 * np.pi * 3 * t)
# 4. cheap schroeder-ish reverb: a few feedback combs + decay tail
out = np.copy(mix)
for delay_ms, gain in [(83, 0.40), (127, 0.30), (211, 0.22), (313, 0.15)]:
    d = int(sr * delay_ms / 1000)
    buf = np.zeros(n + d * 6)
    buf[: n] += mix
    acc = mix
    for r in range(1, 6):
        acc = acc * gain
        buf[d * r : d * r + n] += acc
    out = np.pad(out, (0, len(buf) - len(out)))
    out += buf * 0.5
out = out / np.max(np.abs(out)) * 0.92

with wave.open(os.path.join(OUT_DIR, "huntress_shriek.wav"), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print("shriek:", os.path.join(OUT_DIR, "huntress_shriek.wav"), len(out) / sr, "s")
