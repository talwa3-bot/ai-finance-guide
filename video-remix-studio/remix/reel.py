"""Designed Instagram Reel from a square avatar render. Local and free (ffmpeg + Pillow).

Layout (1080x1920):
  brand gradient background, AI Finance logo at the top, the video title,
  the avatar in a rounded frame with punch-in zooms on alternate sentences,
  word-by-word captions with the spoken word highlighted, a progress bar,
  and an end card with the call to action.

Captions use the SCRIPT's words; their timing comes from faster-whisper word
timestamps aligned to the script with difflib, so a misheard word never shows.

  python -m remix.reel avatar.mp4 script.txt --title "..." --lang he --out reel.mp4
"""
from __future__ import annotations

import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1920
ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "content" / "brand"
FONTS = {"he": "Noto Sans Hebrew", "en": "Noto Sans"}
ACCENT = "&H003FD2FF"      # ASS BGR: warm yellow #FFD23F
AV = 900                   # avatar frame size
AV_Y = 520                 # avatar frame top


# ---------------------------------------------------------------- assets
def brand_assets() -> dict[str, Path]:
    """Background gradient, rounded-frame mask and logo (built once, cached in content/brand)."""
    BRAND.mkdir(parents=True, exist_ok=True)
    bg, mask, logo = BRAND / "bg.png", BRAND / "avatar_mask.png", BRAND / "logo.png"
    if not bg.exists():
        img = Image.new("RGB", (W, H))
        px = img.load()
        top, bottom = (6, 16, 66), (16, 52, 170)
        for y in range(H):
            k = y / (H - 1)
            row = tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3))
            for x in range(W):
                px[x, y] = row
        glow = Image.new("L", (W, H), 0)
        ImageDraw.Draw(glow).ellipse((-200, 700, W + 200, 1500), fill=90)
        glow = glow.filter(ImageFilter.GaussianBlur(160))
        img = Image.composite(Image.new("RGB", (W, H), (60, 120, 255)), img, glow)
        d = ImageDraw.Draw(img)
        for gx in range(0, W, 54):          # faint dot grid, a nod to the logo's circuit look
            for gy in range(0, H, 54):
                d.point((gx, gy), fill=(70, 110, 220))
        img.save(bg)
    if not mask.exists():
        m = Image.new("L", (AV, AV), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, AV - 1, AV - 1), radius=56, fill=255)
        m.save(mask)
    if not logo.exists():
        src = next(BRAND.glob("logo_source.*"), None)
        if src:
            im = Image.open(src).convert("RGB")
            w, h = im.size
            im.crop((int(w * .06), int(h * .33), int(w * .95), int(h * .66))).save(logo)
    return {"bg": bg, "mask": mask, "logo": logo}


# ---------------------------------------------------------------- timing
def _norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower().replace("״", "").replace("׳", ""))


def aligned_words(script: str, media: Path, lang: str) -> list[tuple[str, float, float]]:
    """Every script word with a start/end time from the audio."""
    from faster_whisper import WhisperModel
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(media), "-vn", "-ac", "1",
                          "-ar", "16000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    segs, _ = WhisperModel("small", device="cpu", compute_type="int8").transcribe(
        audio, language=lang, word_timestamps=True, vad_filter=False)
    # (no initial_prompt: with the script as a prompt, whisper skipped the opening words)
    asr = [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or []) if w.word.strip()]
    words = script.split()
    times: list[tuple[float, float] | None] = [None] * len(words)
    sm = difflib.SequenceMatcher(a=[_norm(w) for w in words], b=[_norm(w[0]) for w in asr],
                                 autojunk=False)
    for block in sm.get_matching_blocks():
        for k in range(block.size):
            _, s, e = asr[block.b + k]
            times[block.a + k] = (s, e)
    # fill gaps by spreading between known neighbours
    total = len(raw) / 2 / 16000
    known = [i for i, t in enumerate(times) if t]
    if not known:
        step = total / max(len(words), 1)
        return [(w, i * step, (i + 1) * step) for i, w in enumerate(words)]
    out = []
    for i, w in enumerate(words):
        if times[i]:
            out.append((w, *times[i]))
            continue
        prev = max((k for k in known if k < i), default=None)
        nxt = min((k for k in known if k > i), default=None)
        a = times[prev][1] if prev is not None else 0.0
        b = times[nxt][0] if nxt is not None else total
        n_gap = (nxt if nxt is not None else len(words)) - (prev if prev is not None else -1) - 1
        pos = i - (prev if prev is not None else -1) - 1
        step = (b - a) / max(n_gap, 1)
        out.append((w, a + pos * step, a + (pos + 1) * step))
    return out


def sentences(words: list[tuple[str, float, float]]) -> list[tuple[float, float]]:
    """Time spans of sentences (used for the punch-in zooms)."""
    spans, start = [], None
    for w, s, e in words:
        start = s if start is None else start
        if re.search(r"[.?!:]$", w):
            spans.append((start, e))
            start = None
    if start is not None:
        spans.append((start, words[-1][2]))
    return spans


# ---------------------------------------------------------------- subtitles
def _t(x: float) -> str:
    return f"{int(x // 3600)}:{int(x % 3600 // 60):02d}:{x % 60:05.2f}"


def build_ass(words, title: str, cta: str, lang: str, dur: float, path: Path,
              name: str | None = None, role: str | None = None) -> None:
    font = FONTS.get(lang, "Noto Sans")
    rtl = lang == "he"
    m = "‏" if rtl else ""
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,{font},70,&H00FFFFFF,&H00FFFFFF,&H00401000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,8,70,70,265,1
Style: Cap,{font},84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,6,3,8,60,60,1470,1
Style: Name,{font},62,&H00FFFFFF,&H00FFFFFF,&H00401000,&HC0401000,1,0,0,0,100,100,0,0,3,18,0,2,0,0,0,1
Style: Role,{font},42,&H003FD2FF,&H00FFFFFF,&H00401000,&HC0401000,0,0,0,0,100,100,0,0,3,14,0,2,0,0,0,1
Style: End,{font},86,&H00FFFFFF,&H00FFFFFF,&H00401000,&H00000000,1,0,0,0,100,100,0,0,1,4,0,5,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    end_card = dur - 2.6 if dur > 8 else dur
    ev.append(f"Dialogue: 0,{_t(0)},{_t(end_card)},Title,,0,0,0,,{{\\fad(300,200)}}{m}{title}{m}")
    if name:  # lower third over the bottom of the avatar frame, first ~4.5 s
        y = AV_Y + AV - 150
        ev.append(f"Dialogue: 3,{_t(0.4)},{_t(4.8)},Name,,0,0,0,,{{\\fad(250,250)\\pos(540,{y})}}{m}{name}{m}")
        if role:
            ev.append(f"Dialogue: 3,{_t(0.6)},{_t(4.8)},Role,,0,0,0,,{{\\fad(250,250)\\pos(540,{y + 70})}}{m}{role}{m}")
    ev.append(f"Dialogue: 2,{_t(end_card)},{_t(dur)},End,,0,0,0,,{{\\fad(250,0)\\pos(540,1180)}}{m}{cta}{m}")
    path.write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- captions (image layer)
CAP_FONT = BRAND / "AIFinanceSans-Bold.ttf"   # Noto Sans Hebrew + Noto Sans merged
CAP_Y = 1450          # top of the caption band
CAP_SIZE = 84


def caption_events(words, end_card: float):
    """(start, end, chunk_words, active_index): up to 3 words, never across a sentence end."""
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) == 3 or re.search(r"[.?!:,]$", w[0]):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    ev = []
    for ci, ch in enumerate(chunks):
        nxt = chunks[ci + 1][0][1] if ci + 1 < len(chunks) else ch[-1][2] + 0.3
        for wi, (w, s, e) in enumerate(ch):
            until = min(ch[wi + 1][1] if wi + 1 < len(ch) else nxt, end_card)
            if s < end_card and until > s:
                ev.append((s, until, [x[0] for x in ch], wi))
    return ev


def render_caption(words: list[str], active: int, rtl: bool, path: Path) -> None:
    """One caption frame: white text with outline, the active word in yellow.

    Pillow + raqm lays the whole line out (correct RTL order and punctuation);
    the yellow copy is masked to the active word's span.
    """
    from PIL import ImageFont
    font = ImageFont.truetype(str(CAP_FONT), CAP_SIZE)
    direction = "rtl" if rtl else "ltr"
    text = " ".join(words)
    img = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = W // 2, 100
    kw = dict(font=font, anchor="mm", direction=direction)
    d.text((cx + 4, cy + 5), text, fill=(0, 0, 0, 150), stroke_width=7, stroke_fill=(0, 0, 0, 150), **kw)
    d.text((cx, cy), text, fill="white", stroke_width=7, stroke_fill="black", **kw)
    full = font.getlength(text, direction=direction)
    before = font.getlength(" ".join(words[:active]) + (" " if active else ""), direction=direction)
    wlen = font.getlength(words[active], direction=direction)
    if rtl:   # first word sits at the right edge
        x1 = cx + full / 2 - before
        x0 = x1 - wlen
    else:
        x0 = cx - full / 2 + before
        x1 = x0 + wlen
    hi = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(hi).text((cx, cy), text, fill=(255, 210, 63), stroke_width=7, stroke_fill="black", **kw)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rectangle((x0 - 6, 0, x1 + 6, 200), fill=255)
    img.paste(hi, (0, 0), mask)
    img.save(path)


def caption_track(events, rtl: bool, dur: float, workdir: Path) -> Path:
    """Concat-demuxer list of caption PNGs (transparent gaps), aligned to the timeline."""
    workdir.mkdir(parents=True, exist_ok=True)
    blank = workdir / "blank.png"
    Image.new("RGBA", (W, 200), (0, 0, 0, 0)).save(blank)
    lines, t = ["ffconcat version 1.0"], 0.0
    for i, (s, e, ws, a) in enumerate(events):
        if s > t + 0.01:
            lines += [f"file '{blank.as_posix()}'", f"duration {s - t:.3f}"]
        f = workdir / f"cap_{i:03d}.png"
        render_caption(ws, a, rtl, f)
        lines += [f"file '{f.as_posix()}'", f"duration {e - s:.3f}"]
        t = e
    lines += [f"file '{blank.as_posix()}'", f"duration {max(dur - t, 0.1):.3f}",
              f"file '{blank.as_posix()}'"]
    lst = workdir / "captions.ffconcat"
    lst.write_text("\n".join(lines) + "\n")
    return lst


# ---------------------------------------------------------------- compose
def probe_duration(p: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)


def make_reel(avatar: str, script: str, title: str, lang: str, out: str,
              cta: str | None = None, name: str | None = None, role: str | None = None,
              punch: bool = False) -> Path:
    src, dest = Path(avatar).resolve(), Path(out).resolve()
    assets = brand_assets()
    dur = probe_duration(src)
    words = aligned_words(script, src, lang)
    spans = sentences(words)
    cta = cta or ("עקבו אחרי AI Finance" if lang == "he" else "Follow AI Finance")
    ass = dest.with_suffix(".ass")
    end_card_t = dur - 2.6 if dur > 8 else dur
    caps = caption_track(caption_events(words, end_card_t), lang == "he", dur,
                         dest.with_name(dest.stem + "_caps"))
    build_ass(words, title, cta, lang, dur, ass, name, role)

    # punch-in: every second sentence is shown at 112% (a "jump cut" look)
    # optional punch-in on alternate sentences; off by default (it reads as "jumping")
    zoom_on = ("+".join(f"between(t,{a:.2f},{b:.2f})" for i, (a, b) in enumerate(spans) if i % 2)
               if punch else "") or "0"
    z = f"(1+0.12*({zoom_on}))"
    end_card = dur - 2.6 if dur > 8 else dur
    logo = assets["logo"]
    fc = (
        f"[1:v]loop=-1:1,trim=duration={dur:.2f},setsar=1[bg];"
        f"[0:v]scale={AV}:{AV},crop=w='{AV}/{z}':h='{AV}/{z}':x='({AV}-ow)/2':y='({AV}-oh)/2',"
        f"scale={AV}:{AV},setsar=1,format=rgba[av0];"
        f"[2:v]format=gray,loop=-1:1,trim=duration={dur:.2f}[mk];"
        f"[av0][mk]alphamerge[av];"
        f"[bg][av]overlay=x=(W-w)/2:y={AV_Y}[b1];"
        f"[b1]drawbox=x=(iw-{AV})/2-6:y={AV_Y}-6:w={AV}+12:h={AV}+12:color=0x7FB2FF@0.35:t=6[b2];"
    )
    inputs = ["-i", str(src), "-loop", "1", "-i", str(assets["bg"]), "-loop", "1", "-i", str(assets["mask"])]
    last = "[b2]"
    if logo.exists():
        inputs += ["-loop", "1", "-i", str(logo)]
        fc += (f"[3:v]scale=520:-1,setsar=1[lg];{last}[lg]overlay=x=(W-w)/2:y=70:"
               f"enable='lt(t,{end_card:.2f})'[b3];")
        last = "[b3]"
        # end card: dim + big logo
        fc += (f"{last}drawbox=x=0:y=0:w=iw:h=ih:color=0x06103F@0.82:t=fill:"
               f"enable='gte(t,{end_card:.2f})'[b4];"
               f"[3:v]scale=860:-1,setsar=1[lg2];[b4][lg2]overlay=x=(W-w)/2:y=720:"
               f"enable='gte(t,{end_card:.2f})'[b5];")
        last = "[b5]"
    cap_in = len([x for x in inputs if x == "-i"])
    inputs += ["-f", "concat", "-safe", "0", "-i", str(caps)]
    fc += (f"[{cap_in}:v]fps=30,format=rgba[cp];{last}[cp]overlay=x=0:y={CAP_Y}:eof_action=pass[b5c];"
           f"[b5c]drawbox=x=0:y=ih-14:w='iw*t/{dur:.2f}':h=14:color=0xFFD23F@0.95:t=fill[b6];"
           f"[b6]subtitles={ass.as_posix()}[v]")
    cmd = ["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[v]",
           "-map", "0:a", "-t", f"{dur:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "medium",
           "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
           "-movflags", "+faststart", str(dest)]
    subprocess.run(cmd, check=True)
    print(f"reel: {dest}  ({dur:.1f}s, {len(words)} words, {len(spans)} sentences)")
    return dest


def main(argv: list[str]) -> None:
    import argparse
    from .heygen import read_script
    p = argparse.ArgumentParser(prog="remix.reel")
    p.add_argument("avatar")
    p.add_argument("script")
    p.add_argument("--title", required=True)
    p.add_argument("--lang", default="he", choices=["he", "en"])
    p.add_argument("--cta")
    p.add_argument("--out", required=True)
    p.add_argument("--name", help="lower-third name, shown for the first seconds")
    p.add_argument("--role", help="lower-third role line under the name")
    a = p.parse_args(argv)
    make_reel(a.avatar, read_script(a.script), a.title, a.lang, a.out, a.cta, a.name, a.role)


if __name__ == "__main__":
    main(sys.argv[1:])
