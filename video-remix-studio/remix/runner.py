"""Setup, model download and job execution for every engine."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Iterator

from .registry import ENGINES, ENGINES_DIR, MODELS, MODELS_DIR, OUTPUTS_DIR, SIZES, Engine

DRY_RUN = False


# ---------------------------------------------------------------- helpers
def _fmt(cmd: list) -> str:
    return " ".join(f'"{c}"' if " " in str(c) else str(c) for c in cmd)


def run(cmd: list, cwd: Path | None = None) -> int:
    print(f"\n$ {_fmt(cmd)}" + (f"   (in {cwd})" if cwd else ""), flush=True)
    if DRY_RUN:
        return 0
    return subprocess.call([str(c) for c in cmd], cwd=cwd)


def stream(cmd: list, cwd: Path | None = None) -> Iterator[str]:
    """Run a command and yield its output line by line (used by the UI)."""
    yield f"$ {_fmt(cmd)}\n"
    if DRY_RUN:
        return
    proc = subprocess.Popen([str(c) for c in cmd], cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    assert proc.stdout
    for line in proc.stdout:
        yield line
    proc.wait()
    yield f"\n[exit code {proc.returncode}]\n"


def require_uv() -> str:
    uv = shutil.which("uv")
    if not uv:
        sys.exit("uv is required to create per-engine Python versions.\n"
                 "Install it with:  pip install uv   (or see https://docs.astral.sh/uv/)")
    return uv


def ensure_ready(engine: Engine) -> None:
    if DRY_RUN:
        return
    if not engine.path.exists() or not engine.py.exists():
        sys.exit(f"Engine '{engine.key}' is not installed. Run:  python -m remix setup {engine.key}")


def new_output(prefix: str) -> Path:
    OUTPUTS_DIR.mkdir(exist_ok=True)
    return OUTPUTS_DIR / f"{prefix}_{datetime.now():%Y%m%d_%H%M%S}.mp4"


def abspath(p: str | None) -> str | None:
    return str(Path(p).expanduser().resolve()) if p else None


# ---------------------------------------------------------------- setup
def setup(keys: list[str], update: bool = False) -> None:
    uv = require_uv()
    ENGINES_DIR.mkdir(exist_ok=True)
    for key in keys:
        e = ENGINES[key]
        print(f"\n=== {e.key}: {e.title}")
        if not e.path.exists():
            run(["git", "clone", "--depth", "1", e.repo, e.path])
        elif update:
            run(["git", "pull"], cwd=e.path)
        if not e.py.exists() or DRY_RUN:
            run([uv, "venv", e.venv, "--python", e.python])
        pip = [uv, "pip", "install", "--python", e.py]
        run(pip + e.torch)
        for step in e.install:
            if run(pip + step, cwd=e.path) != 0:
                print(f"!! step failed for {key}: {_fmt(step)} (continuing)")
        run(pip + ["huggingface_hub"])
    print("\nDone. Next:  python -m remix download")


# ---------------------------------------------------------------- models
def download(names: list[str]) -> None:
    from huggingface_hub import snapshot_download  # orchestrator dependency

    MODELS_DIR.mkdir(exist_ok=True)
    for name in names:
        m = MODELS[name]
        target = MODELS_DIR / m.key
        print(f"\n=== {m.key}  <-  {m.repo_id}  ({m.note})")
        if not DRY_RUN:
            snapshot_download(repo_id=m.repo_id, local_dir=str(target))
    link_models()


def link_models() -> None:
    """VACE looks for models under VACE/models/. Link the shared folder there."""
    vace_models = ENGINES["vace"].path / "models"
    if not ENGINES["vace"].path.exists() or DRY_RUN:
        return
    vace_models.mkdir(exist_ok=True)
    for m in MODELS_DIR.iterdir() if MODELS_DIR.exists() else []:
        link = vace_models / m.name
        if not link.exists():
            try:
                link.symlink_to(m, target_is_directory=True)
            except OSError:  # Windows without symlink rights
                print(f"Could not link {m} -> {link}; copy it manually if VACE cannot find it.")


# ---------------------------------------------------------------- jobs
def vace_edit_cmd(task: str, video: str | None, prompt: str, size: str = "1.3B",
                  mode: str | None = None, bbox: str | None = None,
                  extra: list[str] | None = None, image: str | None = None) -> list:
    e = ENGINES["vace"]
    s = SIZES[size]
    cmd = [e.py, "vace/vace_pipeline.py", "--base", "wan", "--task", task, "--prompt", prompt,
           "--model_name", f"vace-{size}", "--size", s["vace_size"],
           "--ckpt_dir", MODELS_DIR / s["model"]]
    if video:
        cmd += ["--video", abspath(video)]
    if mode:
        cmd += ["--mode", mode]
    if bbox:
        cmd += ["--bbox", bbox]
    if image:  # reference image(s) for swap/reference/animate tasks
        cmd += ["--image", ",".join(abspath(i) for i in image.split(","))]
    return cmd + (extra or [])


def collect_vace_result(started: float) -> Path | None:
    results = ENGINES["vace"].path / "results"
    vids = [p for p in results.rglob("out_video*.mp4") if p.stat().st_mtime >= started] \
        if results.exists() else []
    if not vids:
        return None
    newest = max(vids, key=lambda p: p.stat().st_mtime)
    dest = new_output("vace")
    shutil.copy2(newest, dest)
    return dest


def wan_generate_cmd(task: str, prompt: str, size: str | None = None, image: str | None = None,
                     video: str | None = None, mask: str | None = None,
                     refs: list[str] | None = None, out: Path | None = None,
                     extra: list[str] | None = None) -> list:
    e = ENGINES["wan21"]
    is_14b = "14B" in task
    model = {
        "vace-1.3B": "Wan2.1-VACE-1.3B", "vace-14B": "Wan2.1-VACE-14B",
        "t2v-1.3B": "Wan2.1-T2V-1.3B",
    }.get(task, task)
    cmd = [e.py, "generate.py", "--task", task, "--prompt", prompt,
           "--size", size or SIZES["14B" if is_14b else "1.3B"]["wan_size"],
           "--ckpt_dir", MODELS_DIR / model,
           "--save_file", out or new_output("wan21")]
    if not is_14b:  # fit small GPUs
        cmd += ["--offload_model", "True", "--t5_cpu"]
    if image:
        cmd += ["--image", abspath(image)]
    if video:
        cmd += ["--src_video", abspath(video)]
    if mask:
        cmd += ["--src_mask", abspath(mask)]
    if refs:
        cmd += ["--src_ref_images", ",".join(abspath(r) for r in refs)]
    return cmd + (extra or [])


def wangp_cmd(process: str | None = None, extra: list[str] | None = None) -> list:
    e = ENGINES["wangp"]
    cmd = [e.py, "wgp.py"]
    if process:
        cmd += ["--process", abspath(process)]
    return cmd + (extra or [])


# ---------------------------------------------------------------- doctor
def doctor() -> None:
    print("Project:", ENGINES_DIR.parent)
    gpu = shutil.which("nvidia-smi")
    if gpu:
        subprocess.call([gpu, "--query-gpu=name,memory.total", "--format=csv,noheader"])
    else:
        print("GPU: nvidia-smi not found (CUDA GPU required for generation)")
    print("uv:", shutil.which("uv") or "missing")
    print("ffmpeg:", shutil.which("ffmpeg") or "missing (recommended)")
    for e in ENGINES.values():
        state = "ready" if e.py.exists() and e.path.exists() else "not installed"
        print(f"engine {e.key:6} {state:14} {e.path}")
    for m in MODELS.values():
        state = "downloaded" if (MODELS_DIR / m.key).exists() else "missing"
        print(f"model  {m.key:20} {state}")
    print("outputs:", OUTPUTS_DIR)


def now() -> float:
    return time.time() - 1
