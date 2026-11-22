# Video Remix Studio - context for Claude Code

## What this is
One project that unifies three open-source video engines behind one CLI and one Gradio UI:
- **VACE** (`ali-vilab/VACE`): edit existing videos (V2V, masked V2V, swap/reference anything).
- **Wan2.1** (`Wan-Video/Wan2.1`): base model, `generate.py` for t2v / i2v / vace tasks.
- **WanGP** (`deepbeepmeep/WanGP`): full low-VRAM studio UI (`wgp.py`), headless `--process queue.zip`.

## Architecture (do not break this)
- Engines have conflicting deps (VACE/Wan2.1: Python 3.10 + torch 2.5.1 cu124; WanGP: Python 3.11 + torch 2.10 cu130).
- Each engine is cloned into `engines/<Name>` with its own venv `engines/.venv-<key>` created by `uv`.
- The orchestrator (`remix/`) NEVER imports engine code. It runs them as subprocesses with the engine's own python.
- Shared weights live in `models/`, symlinked into `engines/VACE/models/`. Results are copied into `outputs/`.

## Files
- `remix/registry.py` - engines, models, sizes, VACE task list. Add a new engine here first.
- `remix/runner.py` - setup, download, command builders (`vace_edit_cmd`, `wan_generate_cmd`, `wangp_cmd`), doctor.
- `remix/__main__.py` - CLI (`python -m remix ...`).
- `remix/ui.py` - Gradio UI, Hebrew RTL labels, port 7870 (WanGP keeps its own 7860).

## Commands
```bash
pip install -r requirements.txt
python -m remix doctor                 # what is installed
python -m remix setup [vace wan21 wangp]
python -m remix download [model ...]
python -m remix --dry-run edit --task depth --video in.mp4 --prompt "..."   # print, don't run
python -m remix ui
```

## Verified engine arguments (checked against source, Nov 2026)
- `vace/vace_pipeline.py`: `--base wan --task --video --mode --bbox --image --prompt --model_name --size --ckpt_dir` (+ `--save_dir`, `--sample_steps`, ...). Output: `results/<model_name>/<timestamp>/out_video.mp4`.
- `generate.py`: `--task --size --ckpt_dir --prompt --image --src_video --src_mask --src_ref_images --save_file --offload_model --t5_cpu`.
- `wgp.py`: no args opens the UI; `--process <queue.zip>` runs headless.
Anything after `--` on the CLI is passed through untouched. If an engine renames an argument, update the builder in `runner.py`.

## Requirements to actually generate
NVIDIA GPU (1.3B ~8-12GB VRAM; 14B needs much more), git, uv, ffmpeg recommended.

## Working conventions for this repo
- Keep the orchestrator dependency-light (gradio, huggingface_hub, uv only).
- Test changes with `--dry-run` before running real jobs; real jobs need a GPU.
- User-facing UI text and README are in Hebrew; code and comments in English.

## Ideas / next steps
- Connect to AI Finance Studio (the user's video editor) as a backend for "remix this clip".
- Job queue + history page in the UI.
- Cloud GPU runner (RunPod/Modal) for machines without a strong GPU.
