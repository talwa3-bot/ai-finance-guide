"""Unified command line:  python -m remix <command> ...

  setup     clone the three repos and build an isolated env for each
  download  fetch model weights into ./models
  doctor    show what is installed and ready
  edit      edit an existing video with VACE (preprocess + generate in one step)
  generate  run Wan2.1 directly (t2v / i2v / vace tasks with your own masks)
  wangp     open the WanGP studio, or process a saved WanGP queue headless
  ui        one web interface for all of the above
  cloud     deploy / download models / get the UI address on a cloud GPU (Modal)

Add --cloud before edit/generate to run that job on a cloud GPU instead of here:
  python -m remix --cloud edit --task depth --video in.mp4 --prompt "..."
"""
from __future__ import annotations

import argparse
import sys

from . import cloud, runner
from .registry import ENGINES, MODELS, VACE_TASKS


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="remix", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="print commands without running them")
    p.add_argument("--cloud", action="store_true",
                   help="run edit/generate on a cloud GPU (Modal) instead of this machine")
    p.add_argument("--gpu", help="cloud GPU type override, e.g. L40S, A100-80GB, H100")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("setup", help="install engines")
    s.add_argument("engines", nargs="*", help=f"any of: {', '.join(ENGINES)} (default: all)")
    s.add_argument("--update", action="store_true", help="git pull existing engines")

    d = sub.add_parser("download", help="download model weights")
    d.add_argument("models", nargs="*",
                   help=f"any of: {', '.join(MODELS)} (default: Wan2.1-VACE-1.3B VACE-Annotators)")

    sub.add_parser("doctor", help="check installation")

    e = sub.add_parser("edit", help="edit a video with VACE")
    e.add_argument("--task", required=True,
                   help=f"preprocess task, e.g. {', '.join(VACE_TASKS)}")
    e.add_argument("--video", help="source video")
    e.add_argument("--prompt", required=True)
    e.add_argument("--size", choices=["1.3B", "14B"], default="1.3B")
    e.add_argument("--mode", help="task mode, e.g. bbox / mask / salient")
    e.add_argument("--bbox", help="x1,y1,x2,y2 for bbox mode")
    e.add_argument("--image", help="reference image(s), comma separated (swap/reference tasks)")
    e.add_argument("extra", nargs=argparse.REMAINDER, help="after --, passed to VACE as-is")

    g = sub.add_parser("generate", help="run Wan2.1 generate.py")
    g.add_argument("--task", default="vace-1.3B",
                   help="t2v-1.3B, t2v-14B, i2v-14B, vace-1.3B, vace-14B ...")
    g.add_argument("--prompt", required=True)
    g.add_argument("--size", help="e.g. 832*480 or 1280*720")
    g.add_argument("--image", help="start image (i2v)")
    g.add_argument("--video", help="source/control video (vace)")
    g.add_argument("--mask", help="mask video (vace)")
    g.add_argument("--ref", nargs="*", help="reference images (vace)")
    g.add_argument("extra", nargs=argparse.REMAINDER, help="after --, passed to generate.py as-is")

    w = sub.add_parser("wangp", help="open WanGP or process a saved queue")
    w.add_argument("--process", help="saved queue .zip to render headless")
    w.add_argument("extra", nargs=argparse.REMAINDER, help="after --, passed to wgp.py as-is")

    u = sub.add_parser("ui", help="unified web interface")
    u.add_argument("--port", type=int, default=7870)
    u.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to accept other devices")
    u.add_argument("--share", action="store_true")

    c = sub.add_parser("cloud", help="manage the cloud GPU deployment (Modal)")
    c.add_argument("action", choices=["deploy", "models", "url"],
                   help="deploy the app / download weights into the cloud / print the UI address")
    c.add_argument("models", nargs="*", help="for 'models': which weights (default: 1.3B + annotators)")

    a = p.parse_args(argv)
    runner.DRY_RUN = a.dry_run
    extra = [x for x in getattr(a, "extra", []) or [] if x != "--"]

    if a.cmd == "setup":
        keys = a.engines or list(ENGINES)
        if bad := [k for k in keys if k not in ENGINES]:
            p.error(f"unknown engine(s): {bad}. choose from {list(ENGINES)}")
        runner.setup(keys, update=a.update)
    elif a.cmd == "download":
        names = a.models or ["Wan2.1-VACE-1.3B", "VACE-Annotators"]
        if bad := [m for m in names if m not in MODELS]:
            p.error(f"unknown model(s): {bad}. choose from {list(MODELS)}")
        runner.download(names)
    elif a.cmd == "doctor":
        runner.doctor()
    elif a.cmd == "edit":
        if a.task not in VACE_TASKS:
            print(f"note: '{a.task}' is not in the common task list; passing it to VACE as-is")
        if a.cloud:
            sys.exit(cloud.submit(cloud.edit_job(a, extra), a.dry_run, a.gpu))
        runner.check_inputs(a.video, *(a.image.split(",") if a.image else []))
        runner.ensure_ready(ENGINES["vace"])
        started = runner.now()
        code = runner.run(runner.vace_edit_cmd(a.task, a.video, a.prompt, a.size, a.mode,
                                               a.bbox, extra, a.image), cwd=ENGINES["vace"].path)
        if a.dry_run:
            print("\n(dry-run: nothing was run)")
            sys.exit(0)
        out = runner.collect_vace_result(started)
        print(f"\nResult: {out}" if out else f"\nFinished with code {code}; see VACE/results/")
        sys.exit(code)
    elif a.cmd == "generate":
        if a.cloud:
            sys.exit(cloud.submit(cloud.generate_job(a, extra), a.dry_run, a.gpu))
        runner.check_inputs(a.image, a.video, a.mask, *(a.ref or []))
        runner.ensure_ready(ENGINES["wan21"])
        out = runner.new_output("wan21")
        code = runner.run(runner.wan_generate_cmd(a.task, a.prompt, a.size, a.image, a.video,
                                                  a.mask, a.ref, out, extra),
                          cwd=ENGINES["wan21"].path)
        if a.dry_run:
            print(f"\n(dry-run: nothing was run; a real run would save {out})")
            sys.exit(0)
        print(f"\nResult: {out}" if out.exists() else f"\nFinished with code {code}; no video saved")
        sys.exit(code)
    elif a.cmd == "wangp":
        runner.ensure_ready(ENGINES["wangp"])
        sys.exit(runner.run(runner.wangp_cmd(a.process, extra), cwd=ENGINES["wangp"].path))
    elif a.cmd == "ui":
        from .ui import launch
        launch(a.port, a.share, a.host)
    elif a.cmd == "cloud":
        if a.action == "deploy":
            sys.exit(cloud.deploy(a.dry_run))
        if a.action == "models":
            names = a.models or ["Wan2.1-VACE-1.3B", "VACE-Annotators"]
            if bad := [m for m in names if m not in MODELS]:
                p.error(f"unknown model(s): {bad}. choose from {list(MODELS)}")
            sys.exit(cloud.download_models(names, a.dry_run))
        sys.exit(cloud.ui_url(a.dry_run))


if __name__ == "__main__":
    main()
