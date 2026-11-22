"""Run jobs on a cloud GPU (Modal) instead of this machine.

The local side only uploads input files, calls the deployed Modal function and
saves the returned video into ./outputs. On the cloud side the same `remix` CLI
runs the engines as subprocesses, exactly like a local run (see cloud/modal_app.py).

Nothing here imports engine code. `modal` is imported lazily, so `--dry-run`
works without the modal package or an account.
"""
from __future__ import annotations

import shlex
import subprocess
import sys
from pathlib import Path

from .registry import OUTPUTS_DIR, ROOT

APP_NAME = "video-remix-studio"
REMOTE_ROOT = "/root/studio"          # project root inside the cloud image
REMOTE_INPUTS = "/tmp/remix-job"      # per-job input files inside the container
MODAL_APP_FILE = ROOT / "cloud" / "modal_app.py"

# GPU per model size. 1.3B fits easily on 48GB; 14B wants 80GB.
GPU_FOR_SIZE = {"1.3B": "L40S", "14B": "A100-80GB"}


class Job:
    """A remix CLI call whose local file arguments are rewritten to remote paths."""

    def __init__(self, command: str, gpu: str):
        self.command = command
        self.gpu = gpu
        self.argv: list[str] = [command]
        self.uploads: dict[str, Path] = {}   # remote name -> local path

    def opt(self, flag: str, value: str | None) -> None:
        if value:
            self.argv += [flag, value]

    def file(self, flag: str, value: str | None, sep: str | None = None) -> None:
        """Add a file option. `sep` handles comma separated lists (VACE --image)."""
        if not value:
            return
        parts = value.split(sep) if sep else [value]
        self.argv += [flag, (sep or "").join(self._upload(p) for p in parts)]

    def files(self, flag: str, values: list[str] | None) -> None:
        if values:
            self.argv += [flag, *[self._upload(v) for v in values]]

    def _upload(self, local: str) -> str:
        path = Path(local).expanduser().resolve()
        name = f"{len(self.uploads)}_{path.name}"
        self.uploads[name] = path
        return f"{REMOTE_INPUTS}/{name}"


def edit_job(a, extra: list[str]) -> Job:
    j = Job("edit", GPU_FOR_SIZE[a.size])
    j.opt("--task", a.task)
    j.file("--video", a.video)
    j.opt("--prompt", a.prompt)
    j.opt("--size", a.size)
    j.opt("--mode", a.mode)
    j.opt("--bbox", a.bbox)
    j.file("--image", a.image, sep=",")
    if extra:
        j.argv += ["--", *extra]
    return j


def generate_job(a, extra: list[str]) -> Job:
    j = Job("generate", GPU_FOR_SIZE["14B" if "14B" in a.task else "1.3B"])
    j.opt("--task", a.task)
    j.opt("--prompt", a.prompt)
    j.opt("--size", a.size)
    j.file("--image", a.image)
    j.file("--video", a.video)
    j.file("--mask", a.mask)
    j.files("--ref", a.ref)
    if extra:
        j.argv += ["--", *extra]
    return j


def submit(job: Job, dry_run: bool, gpu: str | None = None) -> int:
    gpu = gpu or job.gpu
    print(f"cloud: Modal app '{APP_NAME}', function run_job, GPU {gpu}")
    missing = False
    for name, local in job.uploads.items():
        if local.exists():
            print(f"  upload  {local}  ({local.stat().st_size:,} bytes)  ->  {REMOTE_INPUTS}/{name}")
        else:
            print(f"  upload  {local}  (warning: not found)")
            missing = True
    print(f"  remote  cd {REMOTE_ROOT} && python -m remix {shlex.join(job.argv)}")
    print(f"  result  -> {OUTPUTS_DIR}/<name>.mp4")
    if dry_run:
        print("(dry-run: nothing was uploaded or run)")
        return 0
    if missing:
        sys.exit("Missing input file(s); nothing was sent.")

    fn = _modal().Function.from_name(APP_NAME, "run_job").with_options(gpu=gpu)
    files = {name: local.read_bytes() for name, local in job.uploads.items()}
    print("cloud: running (first call starts a container, this can take a few minutes) ...",
          flush=True)
    res = fn.remote(job.argv, files)
    print(res["log_tail"])
    if res.get("video"):
        OUTPUTS_DIR.mkdir(exist_ok=True)
        dest = OUTPUTS_DIR / res["name"]
        dest.write_bytes(res["video"])
        print(f"\nResult: {dest}")
    else:
        print(f"\nNo video came back (exit code {res['code']}).")
    return res["code"]


# ---------------------------------------------------------------- management
def deploy(dry_run: bool) -> int:
    cmd = ["modal", "deploy", str(MODAL_APP_FILE)]
    print(f"$ {shlex.join(cmd)}")
    if dry_run:
        return 0
    return subprocess.call(cmd)


def download_models(names: list[str], dry_run: bool) -> int:
    print(f"cloud: Modal app '{APP_NAME}', function download_models -> volume remix-models")
    print(f"  remote  cd {REMOTE_ROOT} && python -m remix download {shlex.join(names)}")
    if dry_run:
        print("(dry-run: nothing was run)")
        return 0
    fn = _modal().Function.from_name(APP_NAME, "download_models")
    print(fn.remote(names))
    return 0


def ui_url(dry_run: bool) -> int:
    if dry_run:
        print(f"cloud: would look up the web URL of '{APP_NAME}' / ui")
        return 0
    print(_modal().Function.from_name(APP_NAME, "ui").get_web_url())
    return 0


def _modal():
    try:
        import modal
    except ImportError:
        sys.exit("The cloud runner needs the modal package:  pip install modal  &&  modal setup")
    return modal
