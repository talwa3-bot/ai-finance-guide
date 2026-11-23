"""Modal deployment of Video Remix Studio (cloud GPU).

Deploy once from the project folder:

    pip install modal && modal setup
    modal secret create remix-ui REMIX_UI_PASSWORD=<choose-a-password>
    python -m remix cloud deploy          # same as: modal deploy cloud/modal_app.py
    python -m remix cloud models          # download weights into the cloud volume (once)
    python -m remix cloud url             # the Hebrew UI address, open it on the phone

The image is built from remix/registry.py: every engine is cloned and gets its
own uv venv, exactly like `python -m remix setup`. The orchestrator still never
imports engine code; jobs run as `python -m remix ...` subprocesses.
"""
from __future__ import annotations

import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

import modal

# remix/ sits next to cloud/ locally; inside the container it is mounted at /root/studio.
for p in (Path(__file__).resolve().parent.parent, Path("/root/studio")):
    if (p / "remix").is_dir() and str(p) not in sys.path:
        sys.path.insert(0, str(p))

from remix.cloud import APP_NAME, REMOTE_INPUTS, REMOTE_ROOT  # noqa: E402
from remix.registry import ENGINES, ENGINES_DIR, ROOT  # noqa: E402
from remix.runner import install_steps  # noqa: E402

# Which engines to bake into the image. WanGP needs torch 2.10 + CUDA 13, which
# needs a newer GPU driver than many cloud hosts have, so it is opt-in:
#   REMIX_CLOUD_ENGINES=vace,wan21,wangp modal deploy cloud/modal_app.py
CLOUD_ENGINES = os.environ.get("REMIX_CLOUD_ENGINES", "vace,wan21").split(",")
UI_GPU = os.environ.get("REMIX_CLOUD_UI_GPU", "L40S")
UI_PORT = 7870


def _remote(p: Path) -> str:
    """Translate a local project path to its location in the image."""
    return str(Path(REMOTE_ROOT) / Path(p).relative_to(ROOT))


def _engine_commands() -> list[str]:
    cmds = []
    for key in CLOUD_ENGINES:
        e = ENGINES[key]
        cmds.append(f"git clone --depth 1 {e.repo} {_remote(e.path)}")
        cmds.append(f"uv venv {_remote(e.venv)} --python {e.python}")
        for cmd, cwd in install_steps(e, "uv"):
            args = [_remote(c) if isinstance(c, Path) else c for c in cmd]
            cmds.append(f"cd {_remote(cwd)} && {shlex.join(args)}")
    return cmds


image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0", "build-essential")
    .pip_install("uv", "gradio>=4.44", "huggingface_hub>=0.24")
    .env({"MAX_JOBS": "8"})  # bounds the flash_attn build if no prebuilt wheel matches
    .run_commands(f"mkdir -p {_remote(ENGINES_DIR)}", *_engine_commands())
    # Orchestrator code last and not copied, so editing remix/ never rebuilds the engines.
    .add_local_dir(ROOT / "remix", f"{REMOTE_ROOT}/remix", ignore=["__pycache__"])
)

app = modal.App(APP_NAME, image=image)
models = modal.Volume.from_name("remix-models", create_if_missing=True)
outputs = modal.Volume.from_name("remix-outputs", create_if_missing=True)
VOLUMES = {f"{REMOTE_ROOT}/models": models, f"{REMOTE_ROOT}/outputs": outputs}


def _remix(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "remix", *args], cwd=REMOTE_ROOT,
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def _link_models() -> None:
    from remix import runner
    runner.link_models()


@app.function(volumes=VOLUMES, timeout=4 * 3600)
def download_models(names: list[str]) -> str:
    proc = _remix("download", *names)
    models.commit()
    return proc.stdout[-4000:]


@app.function(gpu="L40S", volumes=VOLUMES, timeout=3600, scaledown_window=120)
def run_job(argv: list[str], files: dict[str, bytes]) -> dict:
    """Run one `python -m remix <argv>` call. GPU is overridden per call by the client."""
    job_dir = Path(REMOTE_INPUTS)
    job_dir.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (job_dir / Path(name).name).write_bytes(data)
    _link_models()

    out_dir = Path(REMOTE_ROOT) / "outputs"
    out_dir.mkdir(exist_ok=True)
    before = set(out_dir.glob("*.mp4"))
    started = time.time()
    print("$ python -m remix " + shlex.join(argv), flush=True)
    proc = subprocess.Popen([sys.executable, "-m", "remix", *argv], cwd=REMOTE_ROOT, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1)
    log = []
    assert proc.stdout
    for line in proc.stdout:
        print(line, end="", flush=True)   # visible live in the Modal dashboard
        log.append(line)
    proc.wait()

    new = [p for p in set(out_dir.glob("*.mp4")) - before
           if p.stat().st_size > 0 and p.stat().st_mtime >= started - 1]
    result = {"code": proc.returncode, "log_tail": "".join(log)[-6000:], "name": None, "video": None}
    if new:
        newest = max(new, key=lambda p: p.stat().st_mtime)
        outputs.commit()
        result.update(name=newest.name, video=newest.read_bytes())
    return result


@app.function(gpu=UI_GPU, volumes=VOLUMES, timeout=4 * 3600, scaledown_window=300,
              max_containers=1, secrets=[modal.Secret.from_name("remix-ui")])
@modal.concurrent(max_inputs=20)
@modal.web_server(UI_PORT, startup_timeout=180)
def ui() -> None:
    """The same Hebrew UI as `python -m remix ui`, password protected, for the phone.

    The GPU container stays up while the page is in use and shuts down after
    5 idle minutes. Results are also saved in the remix-outputs volume.
    """
    _link_models()
    subprocess.Popen([sys.executable, "-m", "remix", "ui", "--host", "0.0.0.0",
                      "--port", str(UI_PORT)], cwd=REMOTE_ROOT)
