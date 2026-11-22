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
           dry_run: bool = False, poll_every: int = 15, max_wait: int = 3600) -> Path | None:
    script = Path(script_file).expanduser().read_text(encoding="utf-8").strip()
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
            dest = OUTPUTS_DIR / f"heygen_{Path(script_file).stem}_{vid}.mp4"
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
