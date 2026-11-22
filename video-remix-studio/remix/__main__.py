"""Unified command line:  python -m remix <command> ...

  setup     clone the three repos and build an isolated env for each
  download  fetch model weights into ./models
  doctor    show what is installed and ready
  edit      edit an existing video with VACE (preprocess + generate in one step)
  generate  run Wan2.1 directly (t2v / i2v / vace tasks with your own masks)
  wangp     open the WanGP studio, or process a saved WanGP queue headless
  ui        one web interface for all of the above
"""
from __future__ import annotations

import argparse
import sys

from . import runner
from .registry import ENGINES, MODELS, VACE_TASKS


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="remix", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="print commands without running them")
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
    u.add_argument("--share", action="store_true")

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
        runner.ensure_ready(ENGINES["vace"])
        started = runner.now()
        code = runner.run(runner.vace_edit_cmd(a.task, a.video, a.prompt, a.size, a.mode,
                                               a.bbox, extra, a.image), cwd=ENGINES["vace"].path)
        out = None if a.dry_run else runner.collect_vace_result(started)
        print(f"\nResult: {out}" if out else f"\nFinished with code {code}; see VACE/results/")
        sys.exit(code)
    elif a.cmd == "generate":
        runner.ensure_ready(ENGINES["wan21"])
        out = runner.new_output("wan21")
        code = runner.run(runner.wan_generate_cmd(a.task, a.prompt, a.size, a.image, a.video,
                                                  a.mask, a.ref, out, extra),
                          cwd=ENGINES["wan21"].path)
        print(f"\nResult: {out}")
        sys.exit(code)
    elif a.cmd == "wangp":
        runner.ensure_ready(ENGINES["wangp"])
        sys.exit(runner.run(runner.wangp_cmd(a.process, extra), cwd=ENGINES["wangp"].path))
    elif a.cmd == "ui":
        from .ui import launch
        launch(a.port, a.share)


if __name__ == "__main__":
    main()
