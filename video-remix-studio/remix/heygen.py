"""'Make it mine': turn a source video into a video presented by your HeyGen avatar.

Flow (each step is its own command, so the script can be reviewed in between):
  1. transcribe  source video -> outputs/<name>.transcript.txt  (local faster-whisper, CPU ok)
  2. (you / Claude) rewrite the transcript in your own words -> <name>.script.txt
  3. render      script -> HeyGen POST /v3/videos with your avatar look + voice,
                 poll GET /v3/videos/{id}, download into outputs/

HeyGen API v3, checked against developers.heygen.com (Nov 2026):
  POST /v3/videos           {type:"avatar", avatar_id:<look id>, script, voice_id?,
                             engine:{type}, aspect_ratio?, resolution?, title?}
  GET  /v3/videos/{id}      data.status (completed / failed), data.video_url,
                            data.failure_code, data.failure_message
  GET  /v3/avatars/looks    ?ownership=private -> data[].id, name, supported_api_engines,
                            default_voice_id, status
  GET  /v3/models/audio/voices ?type=private -> voice_id, name, language, status
Auth header: X-Api-Key (env HEYGEN_API_KEY; in a Claude cloud session the network
proxy injects the real key, so any placeholder value works there).

Uses only the standard library for HTTP; faster-whisper is needed only for `transcribe`.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .registry import OUTPUTS_DIR

API = "https://api.heygen.com"
PREFERRED_ENGINES = ["heygen-avatar-6", "heygen-avatar-6-turbo", "avatar_v", "avatar_iv", "avatar_iii"]
ASPECTS = ["9:16", "16:9", "1:1", "4:5", "5:4", "auto"]


# ---------------------------------------------------------------- http
def _key() -> str:
    key = os.environ.get("HEYGEN_API_KEY")
    if not key:
        sys.exit("Set HEYGEN_API_KEY (your HeyGen API key) first.")
    return key


def _call(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"X-Api-Key": _key(), "Accept": "application/json",
                                          **({"Content-Type": "application/json"} if data else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"HeyGen {method} {path} failed: HTTP {e.code}\n{e.read().decode(errors='replace')[:2000]}")


def _data(resp: dict):
    """v3 responses wrap the payload in `data`; tolerate an unwrapped body."""
    return resp.get("data", resp)


# ---------------------------------------------------------------- listing
def avatars() -> list[dict]:
    looks, token = [], None
    while True:
        q = {"ownership": "private", "limit": 50, **({"token": token} if token else {})}
        resp = _call("GET", "/v3/avatars/looks", query=q)
        looks += _data(resp) or []
        if not resp.get("has_more"):
            return looks
        token = resp.get("next_token")


def voices() -> list[dict]:
    out, token = [], None
    while True:
        q = {"type": "private", "limit": 50, **({"token": token} if token else {})}
        resp = _call("GET", "/v3/models/audio/voices", query=q)
        items = _data(resp)
        out += items if isinstance(items, list) else []
        if not resp.get("has_more"):
            return out
        token = resp.get("next_token")


def check() -> dict:
    """Verify the key (GET /v3/users/me, as HeyGen's docs recommend)."""
    me = _data(_call("GET", "/v3/users/me"))
    print("HeyGen key works.", json.dumps(me, ensure_ascii=False)[:300])
    return me


PRESENTER_NAMES = {"tal": ["tal", "טל", "wallenstein", "ולנשטין"], "roi": ["roi", "רועי"]}


def _match(name: str | None, keys: list[str]) -> bool:
    n = (name or "").lower()
    return any(k in n for k in keys)


def setup_presenters(path: Path, dry_run: bool = False) -> None:
    """Fill avatar/voice ids in presenters.json by matching names in your HeyGen account.

    Only fills empty fields and only when exactly one match exists; never touches
    consent_confirmed. Anything ambiguous is printed for a human (or Claude) to pick.
    """
    presenters = json.loads(path.read_text(encoding="utf-8"))
    if dry_run:
        print(f"would list your avatars and voices and fill empty ids in {path}")
        return
    check()
    looks, vs = avatars(), voices()
    changed = False
    for key, p in presenters.items():
        keys = PRESENTER_NAMES.get(key, [key])
        ready = [a for a in looks if _match(a.get("name"), keys) and a.get("status") in (None, "completed")]
        if not p.get("avatar_id"):
            if len(ready) == 1:
                p["avatar_id"] = ready[0]["id"]
                changed = True
                print(f"{key}: avatar {ready[0]['id']} ({ready[0].get('name')})")
            else:
                print(f"{key}: {len(ready)} matching avatar looks, pick one:")
                for a in ready:
                    print(f"   {a['id']}  {a.get('name')!r}")
        mine = [v for v in vs if _match(v.get("name"), keys) and v.get("status") in (None, "ACTIVE")]
        for lang in ("he", "en"):
            if p.setdefault("voices", {}).get(lang):
                continue
            by_lang = [v for v in mine if (v.get("language") or "").lower().startswith(lang)]
            pick = by_lang if len(by_lang) == 1 else mine if len(mine) == 1 else []
            if pick:
                p["voices"][lang] = pick[0]["voice_id"]
                changed = True
                print(f"{key}: {lang} voice {pick[0]['voice_id']} ({pick[0].get('name')})")
            else:
                default = next((a.get("default_voice_id") for a in ready if a.get("default_voice_id")), None)
                print(f"{key}: no single {lang} voice match"
                      + (f"; the avatar's default voice {default} will be used" if default else ""))
    if changed:
        path.write_text(json.dumps(presenters, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"saved {path}")


def print_avatars() -> None:
    for a in avatars():
        print(f"{a.get('id')}  {a.get('name')!r}  status={a.get('status')}  "
              f"voice={a.get('default_voice_id')}  engines={','.join(a.get('supported_api_engines') or [])}")


def print_voices() -> None:
    for v in voices():
        print(f"{v.get('voice_id')}  {v.get('name')!r}  lang={v.get('language')}  "
              f"mode={v.get('mode')}  status={v.get('status')}")


# ---------------------------------------------------------------- transcribe
def transcribe(video: str, model: str = "small", language: str | None = None,
               dry_run: bool = False) -> Path:
    src = Path(video).expanduser().resolve()
    OUTPUTS_DIR.mkdir(exist_ok=True)
    out = OUTPUTS_DIR / f"{src.stem}.transcript.txt"
    print(f"transcribe {src}  (faster-whisper {model}, language={language or 'auto'})  ->  {out}")
    if dry_run:
        return out
    if not src.exists():
        sys.exit(f"Input not found: {src}")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("Transcription needs:  pip install faster-whisper")
    wav = OUTPUTS_DIR / f"{src.stem}.16k.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vn", "-ac", "1",
                    "-ar", "16000", str(wav)], check=True)
    try:
        # Feed samples directly: ffmpeg already produced 16 kHz mono, and this avoids
        # faster-whisper's PyAV decoder (breaks with some PyAV versions).
        import wave

        import numpy as np
        with wave.open(str(wav)) as w:
            audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        segments, info = WhisperModel(model, device="cpu", compute_type="int8").transcribe(
            audio, language=language, vad_filter=True)
        text = "\n".join(s.text.strip() for s in segments)
    finally:
        wav.unlink(missing_ok=True)
    out.write_text(text + "\n", encoding="utf-8")
    print(f"language detected: {info.language} ({info.language_probability:.0%}), "
          f"{info.duration:.0f}s of audio, {len(text)} characters")
    return out


# ---------------------------------------------------------------- render
def pick_engine(look: dict) -> str:
    supported = look.get("supported_api_engines") or []
    for e in PREFERRED_ENGINES:
        if e in supported:
            return e
    if supported:
        return supported[0]
    sys.exit(f"Avatar look {look.get('id')} lists no supported API engine.")


def build_request(script: str, avatar_id: str, engine: str, voice_id: str | None,
                  aspect: str | None, resolution: str | None, title: str | None) -> dict:
    body = {"type": "avatar", "avatar_id": avatar_id, "engine": {"type": engine}, "script": script}
    if voice_id:
        body["voice_id"] = voice_id
    if aspect:
        body["aspect_ratio"] = aspect
    if resolution:
        body["resolution"] = resolution
    if title:
        body["title"] = title
    return body


def render(script_file: str, avatar_id: str | None, voice_id: str | None, aspect: str | None,
           resolution: str | None, title: str | None, engine: str | None,
           dry_run: bool = False, poll_every: int = 15, max_wait: int = 3600,
           dest: Path | None = None) -> Path | None:
    script = read_script(script_file)
    if not script:
        sys.exit("The script file is empty.")
    avatar_id = avatar_id or os.environ.get("HEYGEN_AVATAR_ID")
    voice_id = voice_id or os.environ.get("HEYGEN_VOICE_ID")
    title = title or Path(script_file).stem

    if dry_run:
        body = build_request(script, avatar_id or "<your look id>",
                             engine or "<from the look's supported_api_engines>",
                             voice_id, aspect, resolution, title)
        print("POST", API + "/v3/videos")
        print(json.dumps(body, ensure_ascii=False, indent=2))
        print("then poll GET /v3/videos/<id> until completed, download data.video_url -> outputs/")
        print("(dry-run: nothing was sent to HeyGen)")
        return None

    if not avatar_id:
        sys.exit("No avatar chosen. Run `python -m remix heygen avatars` and pass --avatar <id> "
                 "(or set HEYGEN_AVATAR_ID).")
    look = _data(_call("GET", f"/v3/avatars/looks/{avatar_id}"))
    engine = engine or pick_engine(look)
    body = build_request(script, avatar_id, engine, voice_id, aspect, resolution, title)
    print(f"HeyGen: avatar {look.get('name')!r}, engine {engine}, "
          f"voice {voice_id or look.get('default_voice_id') or 'avatar default'}, "
          f"{len(script)} characters")
    created = _data(_call("POST", "/v3/videos", body))
    vid = created.get("video_id") or created.get("id")
    if not vid:
        sys.exit(f"HeyGen did not return a video id: {created}")
    print(f"video id {vid}; rendering ...", flush=True)

    waited = 0
    while waited <= max_wait:
        st = _data(_call("GET", f"/v3/videos/{vid}"))
        status = st.get("status")
        if status == "completed":
            OUTPUTS_DIR.mkdir(exist_ok=True)
            dest = dest or OUTPUTS_DIR / f"heygen_{Path(script_file).stem}_{vid}.mp4"
            urllib.request.urlretrieve(st["video_url"], dest)
            print(f"\nResult: {dest}")
            return dest
        if status == "failed":
            sys.exit(f"HeyGen render failed: {st.get('failure_code')} {st.get('failure_message')}")
        print(f"  status: {status} ({waited}s)", flush=True)
        time.sleep(poll_every)
        waited += poll_every
    sys.exit(f"Still rendering after {max_wait}s. Check later:  python -m remix heygen status {vid}")


def status(video_id: str) -> None:
    print(json.dumps(_data(_call("GET", f"/v3/videos/{video_id}")), ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- scripts
def read_script(path: str | Path) -> str:
    """Script text without comment lines (lines starting with '#' are notes for the editor)."""
    lines = Path(path).expanduser().read_text(encoding="utf-8").splitlines()
    return "\n".join(l for l in lines if not l.lstrip().startswith("#")).strip()


# ---------------------------------------------------------------- captions (source material)
def vtt_to_text(vtt: str) -> str:
    """Plain text from a WebVTT file, collapsing the rolling duplicates of auto captions."""
    import re
    out: list[str] = []
    for line in vtt.splitlines():
        line = line.strip()
        if not line or line == "WEBVTT" or "-->" in line or line.startswith(("Kind:", "Language:", "NOTE")):
            continue
        line = re.sub(r"<[^>]+>", "", line).strip()
        if line and (not out or line != out[-1]):
            out.append(line)
    return "\n".join(out)


def captions(url: str, dest_dir: Path, dry_run: bool = False) -> Path | None:
    """Fetch a YouTube video's captions (English) as plain text via yt-dlp."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "yt_dlp", "-q", "--skip-download", "--write-subs", "--write-auto-subs",
           "--sub-langs", "en.*,en", "--sub-format", "vtt", "-o", str(dest_dir / "%(id)s"), url]
    print("$ " + " ".join(cmd))
    if dry_run:
        return None
    if subprocess.call(cmd) != 0:
        print(f"!! no captions for {url}")
        return None
    vtts = sorted(dest_dir.glob("*.vtt"), key=lambda p: p.stat().st_mtime)
    if not vtts:
        return None
    txt = vtts[-1].with_suffix("").with_suffix(".txt")
    txt.write_text(vtt_to_text(vtts[-1].read_text(encoding="utf-8")) + "\n", encoding="utf-8")
    print(f"captions -> {txt}")
    return txt


# ---------------------------------------------------------------- batch
def load_presenters(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing {path}. Fill avatar and voice ids from `python -m remix heygen avatars|voices`.")
    return json.loads(path.read_text(encoding="utf-8"))


WORDS_PER_SECOND = {"he": 2.1, "en": 2.5}   # measured on Tal's voice, Nov 2026


def usage_total() -> float:
    """Total charged on this key over the last 30 days (GET /v3/usage)."""
    now = int(time.time())
    resp = _call("GET", "/v3/usage", query={"start_time": now - 30 * 86400, "end_time": now})
    return sum(p.get("charged", 0) - p.get("refunded", 0)
               for row in resp.get("data", []) for p in row.get("pools", []))


def ledger_spent(ledger: Path, vid: str) -> float:
    import csv
    if not ledger.exists():
        return 0.0
    return sum(float(r["cost_usd"]) for r in csv.DictReader(ledger.open(encoding="utf-8"))
               if r["video"] == vid)


def ledger_add(ledger: Path, row: dict) -> None:
    import csv
    new = not ledger.exists()
    with ledger.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(row))
        if new:
            w.writeheader()
        w.writerow(row)


def batch(catalog: Path, scripts_dir: Path, presenters_file: Path, langs: list[str],
          ids: list[str] | None, aspect: str | None, dry_run: bool) -> None:
    """Render every catalog row that has a script, then finish it locally as a Reel.

    - Skips videos already finished in outputs/ (safe to re-run).
    - Refuses a presenter whose consent is not confirmed.
    - Looks rotate per video from the presenter's `looks` list.
    - Budget guard: estimated render cost plus what this video already spent
      (tests included, from content/costs.csv) must stay under `budget_per_video_usd`.
    - Each render's real cost is read from GET /v3/usage and logged to costs.csv.
    """
    import csv
    from .finish import finish
    presenters = load_presenters(presenters_file)
    ledger = catalog.parent / "costs.csv"
    rows = list(csv.DictReader(catalog.open(encoding="utf-8")))
    todo, problems = [], []
    for r in rows:
        if ids and r["id"] not in ids:
            continue
        who = presenters.get(r["presenter"])
        who = who if isinstance(who, dict) else {}
        looks = who.get("looks") or [{"id": who.get("avatar_id"), "aspect": who.get("aspect")}]
        look = looks[(int(r["id"]) - 1) % len(looks)]
        engine = who.get("engine")
        rate = float(who.get("usd_per_second", 0))
        budget = float(who.get("budget_per_video_usd", 0))
        for lang in langs:
            if lang not in r["languages"].split("+"):
                continue
            vid = f"{r['id']}_{lang}"
            script = scripts_dir / f"{r['id']}.{lang}.txt"
            raw = OUTPUTS_DIR / f"aifinance_{vid}_raw.mp4"
            reel = OUTPUTS_DIR / f"aifinance_{vid}.mp4"
            if reel.exists():
                print(f"skip  {reel.name} (already finished)")
                continue
            if not script.exists():
                problems.append(f"{vid}: no script at {script}")
                continue
            if not who.get("consent_confirmed"):
                problems.append(f"{vid}: presenter '{r['presenter']}' consent not confirmed")
                continue
            if not look.get("id"):
                problems.append(f"{vid}: presenter '{r['presenter']}' has no look id")
                continue
            words = len(read_script(script).split())
            est_s = words / WORDS_PER_SECOND.get(lang, 2.2)
            est = est_s * rate * 1.15
            spent = ledger_spent(ledger, vid)
            if not raw.exists() and budget and spent + est > budget:
                problems.append(f"{vid}: estimate ${est:.2f} + spent ${spent:.2f} > budget ${budget:.2f}")
                continue
            todo.append((r, lang, vid, script, raw, reel, look, engine, who, est_s, est, spent))

    print(f"\n{len(todo)} video(s) to make, {len(problems)} blocked")
    for p in problems:
        print("  blocked:", p)
    for r, lang, vid, script, raw, reel, look, engine, who, est_s, est, spent in todo:
        print(f"\n=== {vid} look {look.get('label', look['id'])}: {r['title']}  "
              f"(~{est_s:.0f}s, est ${est:.2f}, spent so far ${spent:.2f})")
        if not raw.exists():
            before = None if dry_run else usage_total()
            render(str(script), look["id"], (who.get("voices") or {}).get(lang),
                   aspect or look.get("aspect") or "9:16", None, f"AI Finance {vid}", engine,
                   dry_run=dry_run, dest=raw)
            if not dry_run:
                time.sleep(5)
                cost = round(usage_total() - before, 4)
                secs = probe_seconds(raw)
                ledger_add(ledger, {"video": vid, "kind": "render", "engine": engine or "",
                                    "look": look["id"], "seconds": f"{secs:.1f}", "cost_usd": cost,
                                    "time": time.strftime("%Y-%m-%d %H:%M")})
                print(f"cost ${cost:.2f} for {secs:.1f}s; total for {vid}: ${spent + cost:.2f}")
        finish(str(raw), read_script(script), lang, str(reel), dry_run=dry_run)


def probe_seconds(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                          "default=nw=1:nk=1", str(path)], capture_output=True, text=True).stdout
    return float(out.strip() or 0)
