"""Local post-production for Instagram Reels. Free: no API calls.

  - fit any avatar render into 1080x1920 (vertical renders are scaled; square or
    landscape ones sit on a blurred copy of themselves)
  - burn in captions: the script text, timed with faster-whisper word timestamps
    taken from the rendered audio (the words shown are the script's, not the ASR's)
  - Hebrew is right-to-left; libass + fribidi handle the shaping

Usage: python -m remix finish <render.mp4> <script.txt> [--lang he|en] [--out file.mp4]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

W, H = 1080, 1920
FONT = "DejaVu Sans"          # has Hebrew glyphs; override with --font
MAX_CHARS = {"he": 26, "en": 30}   # per caption line, keeps 2 short lines on screen


def probe(path: Path) -> tuple[int, int, float]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height:format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    s = d["streams"][0]
    return int(s["width"]), int(s["height"]), float(d["format"]["duration"])


def chunks(text: str, lang: str) -> list[str]:
    """Split the script into short caption chunks at punctuation, then by length."""
    limit = MAX_CHARS.get(lang, 28)
    out: list[str] = []
    for sentence in re.split(r"(?<=[.!?:,])\s+|\n+", text):
        words, line = sentence.split(), ""
        for w in words:
            if line and len(line) + 1 + len(w) > limit:
                out.append(line)
                line = w
            else:
                line = f"{line} {w}".strip()
        if line:
            out.append(line)
    return out


def word_times(media: Path, lang: str) -> list[tuple[float, float]]:
    """Start/end of every spoken word, from faster-whisper (CPU)."""
    from faster_whisper import WhisperModel
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(media), "-vn", "-ac", "1",
                          "-ar", "16000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    segs, _ = WhisperModel("small", device="cpu", compute_type="int8").transcribe(
        audio, language=lang, word_timestamps=True, vad_filter=False)
    return [(w.start, w.end) for s in segs for w in (s.words or [])]


def timed_chunks(text: str, lang: str, media: Path, duration: float) -> list[tuple[float, float, str]]:
    """Give each caption chunk a time span.

    The script and the ASR words rarely match one to one, so chunks are placed by
    their share of the script's words along the spoken timeline (first to last word).
    """
    parts = chunks(text, lang)
    try:
        wt = word_times(media, lang)
    except Exception as e:  # no faster-whisper or no speech found: spread evenly
        print(f"note: word timing unavailable ({e}); spreading captions evenly")
        wt = []
    start, end = (wt[0][0], wt[-1][1]) if wt else (0.0, duration)
    total = sum(len(p.split()) for p in parts) or 1
    out, t, acc = [], start, 0
    for p in parts:
        acc += len(p.split())
        t_end = start + (end - start) * acc / total
        if wt:  # snap to the nearest real word end, so a caption never cuts a word
            t_end = min((w[1] for w in wt), key=lambda x: abs(x - t_end))
        out.append((t, max(t_end, t + 0.4), p))
        t = t_end
    return out


def ass_time(t: float) -> str:
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def write_ass(cues: list[tuple[float, float, str]], path: Path, font: str) -> None:
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},74,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,5,2,2,80,80,330,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    rtl = any("\u0590" <= ch <= "\u05FF" for _, _, t in cues for ch in t)
    mark = "\u200f" if rtl else ""   # RLM: keeps Hebrew punctuation on the correct side
    lines = [f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{mark}{txt}{mark}"
             for a, b, txt in cues]
    path.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


def finish(render: str, script_text: str, lang: str, out: str | None = None,
           font: str = FONT, captions: bool = True, dry_run: bool = False) -> Path:
    src = Path(render).expanduser().resolve()
    dest = Path(out) if out else src.with_name(src.stem + "_reel.mp4")
    if dry_run:
        print(f"finish {src} -> {dest} (1080x1920, captions={'on' if captions else 'off'}, lang={lang})")
        return dest
    w, h, dur = probe(src)
    if abs(w / h - W / H) < 0.01:
        vf = f"[0:v]scale={W}:{H},setsar=1[v0]"
    else:  # square / landscape: blurred fill behind, sharp copy in the middle
        vf = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{H},boxblur=30:2[bg];[b]scale={W}:-2[fg];"
              f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v0]")
    last = "[v0]"
    if captions:
        ass = dest.with_suffix(".ass")
        write_ass(timed_chunks(script_text, lang, src, dur), ass, font)
        vf += f";[v0]subtitles={ass.as_posix()}[v1]"
        last = "[v1]"
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-filter_complex", vf,
           "-map", last, "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dest)]
    subprocess.run(cmd, check=True)
    print(f"reel: {dest}")
    return dest


def main(argv: list[str]) -> None:
    import argparse
    from .heygen import read_script
    p = argparse.ArgumentParser(prog="remix finish")
    p.add_argument("render")
    p.add_argument("script")
    p.add_argument("--lang", default="he", choices=["he", "en"])
    p.add_argument("--out")
    p.add_argument("--font", default=FONT)
    p.add_argument("--no-captions", action="store_true")
    a = p.parse_args(argv)
    finish(a.render, read_script(a.script), a.lang, a.out, a.font, not a.no_captions)


if __name__ == "__main__":
    main(sys.argv[1:])
