"""Longer story Reel from a spec: reuse already-rendered avatar sentences ("old")
and cover new narration ("new", a single voice-over file) with photos.

Everything here is local and free. The spec (JSON) lists segments in order:
  {"id": "A", "kind": "old", "text": "..."}                          -> cut from the avatar render
  {"id": "B", "kind": "new", "text": "...", "photos": [...], "label": "..."}  -> VO over photos

  python -m remix.story content/intro/intro_en_long.json \
      --avatar avatar.mp4 --avatar-script content/scripts/intro.en.txt \
      --vo new_vo.mp3 --photos content/intro/photos --out outputs/intro_en_long.mp4
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .reel import CAP_FONT, aligned_words, make_reel

SQ = 1080
FPS = 30


def _norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def find_span(words, text: str) -> tuple[float, float]:
    """Time span of `text` inside aligned `words` (exact word-sequence match)."""
    target = [_norm(w) for w in text.split()]
    seq = [_norm(w[0]) for w in words]
    for i in range(len(seq) - len(target) + 1):
        if seq[i:i + len(target)] == target:
            return float(words[i][1]), float(words[i + len(target) - 1][2])
    raise ValueError(f"text not found in aligned words: {text[:60]}")


def run(cmd: list) -> None:
    subprocess.run([str(c) for c in cmd], check=True)


def label_png(text: str, path: Path, rtl: bool) -> None:
    font = ImageFont.truetype(str(CAP_FONT), 52)
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    w = int(d0.textlength(text, font=font, direction="rtl" if rtl else "ltr")) + 64
    img = Image.new("RGBA", (SQ, SQ), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0 = SQ - 48 - w if rtl else 48
    d.rounded_rectangle((x0, 48, x0 + w, 48 + 92), radius=46, fill=(6, 16, 66, 225),
                        outline=(255, 210, 63, 255), width=4)
    d.text((x0 + w / 2, 48 + 46), text, font=font, fill=(255, 210, 63), anchor="mm",
           direction="rtl" if rtl else "ltr")
    img.save(path)


XF = 0.4   # crossfade length between shots and segments (seconds)


def photo_clip(photo: Path, dur: float, out: Path, zoom_in: bool = True) -> None:
    """Ken Burns: cover-crop the photo to a square and zoom slowly and steadily.

    Zooming at 3x resolution keeps the per-frame crop movement sub-pixel at the
    output size, which removes the shake of a plain zoompan.
    """
    frames = max(int(round(dur * FPS)), 1)
    big = SQ * 3
    z = f"1+0.06*on/{frames}"
    run(["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", photo, "-vf",
         f"scale={big}:{big}:force_original_aspect_ratio=increase:flags=lanczos,crop={big}:{big},"
         f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={SQ}x{SQ}:fps={FPS},"
         f"setsar=1,format=yuv420p", "-frames:v", frames, "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "18", out])


def duration(p: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                 "csv=p=0", str(p)], capture_output=True, text=True).stdout)


def xfade_filter(lengths: list[float], d: float = XF) -> str:
    """filter_complex chain cross-fading inputs 0..n-1 (video only) into [vx].

    Each input is padded by d (last frame held), so the fades eat the padding and
    shot k still starts at sum(lengths[:k]): the picture stays in sync with audio
    that is simply concatenated.
    """
    n = len(lengths)
    fc = "".join(f"[{i}:v]tpad=stop_mode=clone:stop_duration={d},settb=AVTB,fps={FPS},"
                 f"format=yuv420p[p{i}];" for i in range(n))
    if n == 1:
        return fc + "[p0]null[vx]"
    prev, off = "p0", 0.0
    for i in range(1, n):
        off += lengths[i - 1]
        out = "vx" if i == n - 1 else f"x{i}"
        fc += f"[{prev}][p{i}]xfade=transition=fade:duration={d}:offset={off:.3f}[{out}];"
        prev = out
    return fc.rstrip(";")


def build(spec_path: str, avatar: str, avatar_script: str, vo: str, photos: str, out: str) -> Path:
    from .heygen import read_script
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    lang, rtl = spec["lang"], spec["lang"] == "he"
    work = Path(out).resolve().with_name(Path(out).stem + "_work")
    work.mkdir(parents=True, exist_ok=True)
    pdir = Path(photos)

    old_words = aligned_words(read_script(avatar_script), Path(avatar), lang)
    # the shared voice-over covers every "new" segment without its own "vo" file
    shared = [s for s in spec["segments"] if s["kind"] == "new" and not s.get("vo")]
    new_text = " ".join(s.get("spoken", s["text"]) for s in shared)
    vo_words = aligned_words(new_text, Path(vo), lang)
    own_vo = {s["id"]: (Path(spec_path).parent / s["vo"]).resolve() for s in spec["segments"] if s.get("vo")}
    own_words = {k: aligned_words(next(x.get("spoken", x["text"]) for x in spec["segments"] if x["id"] == k), v, lang)
                 for k, v in own_vo.items()}

    parts = []
    for k, seg in enumerate(spec["segments"]):
        clip = work / f"{k:02d}_{seg['id']}.mp4"
        if seg["kind"] == "old":
            a, b = find_span(old_words, seg["text"])
            a, b = max(a - 0.10, 0), b + 0.25
            vf = "setsar=1,format=yuv420p"
            inputs = ["-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", avatar]
            if seg.get("label"):
                lp = work / f"label_{seg['id']}.png"
                label_png(seg["label"], lp, rtl)
                inputs += ["-i", str(lp)]
                vf = f"[0:v][1:v]overlay=0:0,{vf}"
            run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex" if seg.get("label") else "-vf", vf,
                 "-r", FPS, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                 "-af", "aresample=48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", clip])
        else:
            seg_vo = str(own_vo.get(seg["id"], vo))
            a, b = find_span(own_words.get(seg["id"], vo_words), seg.get("spoken", seg["text"]))
            a, b = max(a - 0.08, 0), b + 0.35
            dur = b - a
            shots = [pdir / Path(p.replace("upload:", "")).name for p in seg["photos"]]
            each = dur / len(shots)
            sub = []
            for i, ph in enumerate(shots):
                sp = work / f"{k:02d}_{seg['id']}_p{i}.mp4"
                photo_clip(ph, each, sp)
                sub.append(sp)
            vid = work / f"{k:02d}_{seg['id']}_v.mp4"
            run(["ffmpeg", "-loglevel", "error", "-y", *sum((["-i", str(p)] for p in sub), []),
                 "-filter_complex", xfade_filter([duration(p) for p in sub]), "-map", "[vx]",
                 "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", vid])
            inputs = ["-i", str(vid), "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", seg_vo]
            vf = "[0:v]setsar=1,format=yuv420p[v]"
            if seg.get("label"):
                lp = work / f"label_{seg['id']}.png"
                label_png(seg["label"], lp, rtl)
                inputs += ["-i", str(lp)]
                vf = "[0:v][2:v]overlay=0:0,setsar=1,format=yuv420p[v]"
            run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", vf, "-map", "[v]",
                 "-map", "1:a", "-t", f"{dur:.3f}", "-r", FPS, "-c:v", "libx264", "-preset", "veryfast",
                 "-crf", "18", "-af", "aresample=48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", clip])
        parts.append(clip)
        print(f"segment {seg['id']} ({seg['kind']}): {clip.name}")

    # concatenate with a re-encode so timestamps are clean
    n = len(parts)
    lengths = [duration(p) for p in parts]
    ins = sum((["-i", str(p)] for p in parts), [])
    fc = (xfade_filter(lengths) + ";" + "".join(f"[{i}:a]" for i in range(n))
          + f"concat=n={n}:v=0:a=1[a]")
    square = work / "square.mp4"
    run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", fc, "-map", "[vx]", "-map", "[a]",
         "-t", f"{sum(lengths):.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", square])

    script = " ".join(s["text"] for s in spec["segments"])
    return make_reel(str(square), script, spec["title"], lang, out, spec.get("cta"),
                     spec.get("name"), spec.get("role"))


def main(argv: list[str]) -> None:
    import argparse
    p = argparse.ArgumentParser(prog="remix.story")
    p.add_argument("spec")
    p.add_argument("--avatar", required=True)
    p.add_argument("--avatar-script", required=True)
    p.add_argument("--vo", required=True)
    p.add_argument("--photos", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args(argv)
    build(a.spec, a.avatar, a.avatar_script, a.vo, a.photos, a.out)


if __name__ == "__main__":
    main(sys.argv[1:])
