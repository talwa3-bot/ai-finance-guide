"""Engine and model registry.

Each engine lives in its own folder and its own Python environment, because
their dependencies conflict (VACE pins torch 2.5.1 / Python 3.10, while WanGP
uses torch 2.10 / Python 3.11). The orchestrator never imports them; it runs
them as subprocesses with the right interpreter.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINES_DIR = ROOT / "engines"
MODELS_DIR = ROOT / "models"
OUTPUTS_DIR = ROOT / "outputs"


@dataclass
class Engine:
    key: str
    title: str
    repo: str
    folder: str
    python: str
    torch: list[str]
    install: list[list[str]] = field(default_factory=list)

    @property
    def path(self) -> Path:
        return ENGINES_DIR / self.folder

    @property
    def venv(self) -> Path:
        return ENGINES_DIR / f".venv-{self.key}"

    @property
    def py(self) -> Path:
        win = self.venv / "Scripts" / "python.exe"
        return win if win.exists() else self.venv / "bin" / "python"


# flash_attn (in VACE and Wan2.1 requirements) must be built against the torch that
# is already installed, so it cannot go through pip's isolated build. Install it
# on its own first; the requirements file then finds it already satisfied.
FLASH_ATTN = [
    ["packaging", "ninja", "psutil", "setuptools", "wheel"],
    ["flash_attn", "--no-build-isolation"],
]

ENGINES: dict[str, Engine] = {
    "vace": Engine(
        key="vace",
        title="VACE - all-in-one video editing (V2V, masked V2V, reference-to-video)",
        repo="https://github.com/ali-vilab/VACE.git",
        folder="VACE",
        python="3.10",
        torch=["torch==2.5.1", "torchvision==0.20.1",
               "--index-url", "https://download.pytorch.org/whl/cu124"],
        install=[
            *FLASH_ATTN,
            ["-r", "requirements.txt"],
            ["wan@git+https://github.com/Wan-Video/Wan2.1"],
            ["-r", "requirements/annotator.txt"],
        ],
    ),
    "wan21": Engine(
        key="wan21",
        title="Wan2.1 - base model (text/image to video, VACE tasks)",
        repo="https://github.com/Wan-Video/Wan2.1.git",
        folder="Wan2.1",
        python="3.10",
        torch=["torch==2.5.1", "torchvision==0.20.1",
               "--index-url", "https://download.pytorch.org/whl/cu124"],
        install=[*FLASH_ATTN, ["-r", "requirements.txt"]],
    ),
    "wangp": Engine(
        key="wangp",
        title="WanGP - full low-VRAM studio UI (Wan, LTX, Hunyuan, H3 ...)",
        repo="https://github.com/deepbeepmeep/WanGP.git",
        folder="WanGP",
        python="3.11",
        torch=["torch==2.10.0", "torchvision==0.25.0", "torchaudio==2.10.0",
               "--index-url", "https://download.pytorch.org/whl/cu130"],
        install=[["-r", "requirements.txt"]],
    ),
}


@dataclass
class Model:
    key: str
    repo_id: str
    used_by: tuple[str, ...]
    note: str


MODELS: dict[str, Model] = {
    "Wan2.1-VACE-1.3B": Model("Wan2.1-VACE-1.3B", "Wan-AI/Wan2.1-VACE-1.3B",
                              ("vace", "wan21"), "480p editing, ~8-12GB VRAM"),
    "Wan2.1-VACE-14B": Model("Wan2.1-VACE-14B", "Wan-AI/Wan2.1-VACE-14B",
                             ("vace", "wan21"), "720p editing, needs a large GPU"),
    "VACE-Annotators": Model("VACE-Annotators", "ali-vilab/VACE-Annotators",
                             ("vace",), "preprocessors: depth, pose, masks, inpainting"),
    "Wan2.1-T2V-1.3B": Model("Wan2.1-T2V-1.3B", "Wan-AI/Wan2.1-T2V-1.3B",
                             ("wan21",), "plain text-to-video"),
}

# Sensible defaults per size
SIZES = {
    "1.3B": {"vace_size": "480p", "wan_size": "832*480", "model": "Wan2.1-VACE-1.3B"},
    "14B": {"vace_size": "720p", "wan_size": "1280*720", "model": "Wan2.1-VACE-14B"},
}

# VACE preprocessing tasks (see VACE/vace/configs). Common ones listed for the UI;
# any other task name is passed through as-is.
VACE_TASKS = [
    "depth", "pose", "flow", "gray", "scribble", "layout_track",
    "inpainting", "outpainting", "frameref", "clipref",
    "swap_anything", "reference_anything", "move_anything",
    "animate_anything", "expand_anything",
]
