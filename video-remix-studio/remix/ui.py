"""One web interface over all three engines (Hebrew, right-to-left)."""
from __future__ import annotations

import subprocess

import gradio as gr

from . import runner
from .registry import ENGINES, VACE_TASKS

_wangp_proc: subprocess.Popen | None = None

CSS = """
.gradio-container { direction: rtl; text-align: right; }
textarea, input { direction: auto; }
"""


def _missing(key: str) -> str | None:
    e = ENGINES[key]
    if not e.py.exists():
        return f"המנוע לא מותקן. הריצי:\npython -m remix setup {key}\n"
    return None


def do_edit(video, task, prompt, size, mode, bbox, ref):
    if msg := _missing("vace"):
        yield msg, None
        return
    log = ""
    started = runner.now()
    cmd = runner.vace_edit_cmd(task, video, prompt, size, mode or None, bbox or None,
                               image=ref or None)
    for line in runner.stream(cmd, cwd=ENGINES["vace"].path):
        log += line
        yield log, None
    yield log, runner.collect_vace_result(started)


def do_generate(task, prompt, image, video, mask, refs):
    if msg := _missing("wan21"):
        yield msg, None
        return
    out = runner.new_output("wan21")
    ref_paths = [r if isinstance(r, str) else r.name for r in (refs or [])]
    cmd = runner.wan_generate_cmd(task, prompt, None, image, video, mask, ref_paths or None, out)
    log = ""
    for line in runner.stream(cmd, cwd=ENGINES["wan21"].path):
        log += line
        yield log, None
    yield log, str(out) if out.exists() else None


def start_wangp():
    global _wangp_proc
    if msg := _missing("wangp"):
        return msg
    if _wangp_proc and _wangp_proc.poll() is None:
        return "וואן ג׳יפי כבר פועל. פתחי את הכתובת שמופיעה בטרמינל (ברירת מחדל: http://localhost:7860)."
    _wangp_proc = subprocess.Popen([str(c) for c in runner.wangp_cmd()], cwd=ENGINES["wangp"].path)
    return "וואן ג׳יפי עולה. בעוד רגע פתחי את http://localhost:7860"


def stop_wangp():
    global _wangp_proc
    if _wangp_proc and _wangp_proc.poll() is None:
        _wangp_proc.terminate()
        return "וואן ג׳יפי נעצר."
    return "וואן ג׳יפי לא פועל."


def build() -> gr.Blocks:
    with gr.Blocks(title="Video Remix Studio", css=CSS) as app:
        gr.Markdown("# סטודיו לשחזור ועריכת סרטונים\nשלושה מנועים פתוחים בממשק אחד.")

        with gr.Tab("עריכת סרטון קיים"):
            gr.Markdown("מעלים סרטון, בוחרים סוג עיבוד, וכותבים מה צריך לראות בגרסה החדשה. "
                        "למשל: עומק או תנוחה שומרים על התנועה ומחליפים את המראה; "
                        "השלמה (inpainting) מחליפה אזור מסומן.")
            with gr.Row():
                video = gr.Video(label="סרטון מקור")
                with gr.Column():
                    task = gr.Dropdown(VACE_TASKS, value="depth", label="סוג עיבוד",
                                       allow_custom_value=True)
                    prompt = gr.Textbox(label="תיאור התוצאה (באנגלית עובד הכי טוב)", lines=3)
                    size = gr.Radio(["1.3B", "14B"], value="1.3B", label="גודל מודל")
                    mode = gr.Textbox(label="מצב (רשות), למשל bbox")
                    bbox = gr.Textbox(label="מלבן (רשות): x1,y1,x2,y2")
                    ref = gr.Image(label="תמונת ייחוס (להחלפת דמות או אובייקט)", type="filepath")
                    go = gr.Button("הרצה", variant="primary")
            with gr.Row():
                log = gr.Textbox(label="יומן ריצה", lines=14)
                result = gr.Video(label="תוצאה")
            go.click(do_edit, [video, task, prompt, size, mode, bbox, ref], [log, result])

        with gr.Tab("יצירה ושליטה מתקדמת"):
            gr.Markdown("הרצה ישירה של וואן 2.1. במשימות vace אפשר לתת סרטון, מסכה ותמונות ייחוס משלך.")
            with gr.Row():
                with gr.Column():
                    gtask = gr.Dropdown(["vace-1.3B", "vace-14B", "t2v-1.3B", "t2v-14B", "i2v-14B"],
                                        value="vace-1.3B", label="משימה", allow_custom_value=True)
                    gprompt = gr.Textbox(label="תיאור", lines=3)
                    gimage = gr.Image(label="תמונת פתיחה (i2v)", type="filepath")
                with gr.Column():
                    gvideo = gr.Video(label="סרטון מקור (vace)")
                    gmask = gr.Video(label="סרטון מסכה (vace)")
                    grefs = gr.File(label="תמונות ייחוס (vace)", file_count="multiple")
            ggo = gr.Button("הרצה", variant="primary")
            with gr.Row():
                glog = gr.Textbox(label="יומן ריצה", lines=14)
                gresult = gr.Video(label="תוצאה")
            ggo.click(do_generate, [gtask, gprompt, gimage, gvideo, gmask, grefs], [glog, gresult])

        with gr.Tab("סטודיו מלא"):
            gr.Markdown("וואן ג׳יפי הוא סטודיו שלם עם עורך מסכות, הסרת רקע, מחלצי תנוחה ועומק, "
                        "ומודלים נוספים. הוא נפתח בחלון משלו.")
            status = gr.Textbox(label="מצב")
            with gr.Row():
                gr.Button("הפעלה", variant="primary").click(start_wangp, None, status)
                gr.Button("עצירה").click(stop_wangp, None, status)
    return app


def launch(port: int = 7870, share: bool = False) -> None:
    build().queue().launch(server_port=port, share=share)
