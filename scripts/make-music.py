"""Synthesise short, quirky, royalty-free background loops for the pantomime memes.
Run: python3 scripts/make-music.py  ->  assets/music/quirky-*.wav (converted to mp3 by ffmpeg)."""
import math, struct, wave, subprocess, os, random

SR = 44100

def note_hz(n):  # MIDI note number
    return 440.0 * 2 ** ((n - 69) / 12)

def track(bpm, melody, bass, bars, seed, name):
    random.seed(seed)
    beat = 60 / bpm
    step = beat / 2  # eighth notes
    total = int(SR * step * 8 * bars) + SR
    buf = [0.0] * total

    def add(start, dur, f, amp, kind):
        s0 = int(start * SR)
        n = int(dur * SR)
        for i in range(n):
            if s0 + i >= total:
                break
            t = i / SR
            if kind == "pluck":
                v = (math.sin(2 * math.pi * f * t) + 0.35 * math.sin(4 * math.pi * f * t) + 0.12 * math.sin(6 * math.pi * f * t)) * math.exp(-9 * t)
            elif kind == "bass":
                v = (math.sin(2 * math.pi * f * t) + 0.25 * math.sin(4 * math.pi * f * t)) * math.exp(-5 * t) * min(1, t * 200)
            elif kind == "hat":
                v = (random.random() * 2 - 1) * math.exp(-60 * t)
            elif kind == "clap":
                v = (random.random() * 2 - 1) * (math.exp(-30 * t) + 0.5 * math.exp(-30 * max(0, t - 0.012)))
            else:
                v = 0
            buf[s0 + i] += v * amp

    for bar in range(bars):
        for k in range(8):
            t0 = (bar * 8 + k) * step
            m = melody[(bar % len(melody))][k]
            if m:
                add(t0, step * 1.6, note_hz(m), 0.32, "pluck")
            if k % 2 == 0:
                b = bass[bar % len(bass)][k // 2]
                if b:
                    add(t0, step * 1.8, note_hz(b), 0.42, "bass")
            add(t0 + step / 2, 0.05, 0, 0.06, "hat")
            if k in (2, 6):
                add(t0, 0.12, 0, 0.12, "clap")

    peak = max(abs(x) for x in buf) or 1
    out = f"assets/music/{name}.wav"
    with wave.open(out, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x / peak * 0.85)) * 32767)) for x in buf))
    mp3 = out.replace(".wav", ".mp3")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", out, "-af", "afade=t=out:st=%f:d=0.8" % (total / SR - 1.2), "-b:a", "128k", mp3], check=True)
    os.remove(out)
    print(mp3)

# Sneaky, bouncy (C major / A minor). 0 = rest.
mel1 = [[72, 0, 76, 0, 79, 76, 0, 72], [74, 0, 77, 0, 81, 77, 74, 0], [72, 0, 76, 79, 84, 0, 79, 76], [74, 77, 74, 71, 72, 0, 0, 0]]
bass1 = [[48, 55, 52, 55], [50, 57, 53, 57], [48, 55, 52, 55], [43, 50, 47, 43]]
track(124, mel1, bass1, 16, 1, "quirky-sneaky")

mel2 = [[69, 72, 0, 76, 0, 72, 74, 0], [67, 71, 0, 74, 0, 71, 72, 0], [65, 69, 0, 72, 77, 76, 74, 72], [64, 0, 68, 0, 71, 0, 0, 0]]
bass2 = [[45, 52, 45, 52], [43, 50, 43, 50], [41, 48, 41, 48], [40, 47, 40, 44]]
track(136, mel2, bass2, 16, 2, "quirky-bounce")
