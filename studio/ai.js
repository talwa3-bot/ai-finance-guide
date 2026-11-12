'use strict';
/* ===== AI studio: create, edit, critique, trends ===== */
let aiSec = 'make', aiCrit = null, aiStatus = '', aiPost = '', aiTpl = 'problem', aiFmt = '9:16', aiLen = 30;
const TRENDS_DATE = '12.11.2026';
const TREND_RULES = [
  'הוק ברור בשלוש השניות הראשונות, עוד לפני הלוגו',
  'כתוביות צרובות בתוך הסרטון, כי רוב הצפייה בלי קול',
  'אנכי או ריבוע לנייד. בלינקדאין עד 90 שניות, עדיף 30 עד 60',
  'רעיון אחד לסרטון, עם הוכחה או מספר, ולא פרסומת מלוטשת',
  'קריאה אחת לפעולה בסוף'
];
const TEMPLATES = {
  problem: ['בעיה אחת של לקוח', 'מציגים בעיה אמיתית אחת של איש כספים, מסבירים למה היא קורית ונותנים פתרון אחד. זה הכיוון החזק ביותר כרגע לתוכן עסקי קצר.', 'hook that names one real pain, 2-3 short scenes explaining why it happens, one scene with the fix, cta'],
  hook3: ['הוק ושלוש נקודות', 'לימוד מהיר: הבטחה בפתיחה ושלושה צעדים קצרים. מתאים לטיפים ולהדרכות.', 'hook with a promise, exactly three numbered point scenes, cta'],
  myth: ['מיתוס מול מציאות', 'פותחים בהנחה נפוצה ושוברים אותה. מייצר תגובות ודיון.', 'hook stating a common belief, a scene that says it is wrong, 2 scenes with the reality and proof, cta'],
  number: ['מספר אחד גדול', 'נתון אחד מפתיע על המסך ומה עושים איתו. טקסט על וידאו בלי דיבור, 15 עד 60 שניות.', 'a number scene as the hook (kind number), 2-3 scenes explaining what it means, cta'],
  question: ['שאלה שמחפשים', 'עונים על שאלה ספציפית שאנשים מקלידים בחיפוש. הכותרת היא השאלה עצמה.', 'hook that is the exact question, 3 scenes that answer it step by step, cta'],
  proof: ['לפני ואחרי', 'מראים תהליך לפני ואחרי שימוש בבינה מלאכותית, עם תוצאה מדידה.', 'hook with the result, a "before" scene, an "after" scene, a number scene with the measured gain, cta']
};
const aiErr = e => e && e.code === 'rate_limited' ? 'יותר מדי בקשות. נסי שוב בעוד רגע.' : e && e.code === 'invalid_json' ? 'התשובה חזרה בפורמט לא צפוי. נסי שוב.' : e && e.code === 'refused' ? 'קלוד לא יכול לעזור בבקשה הזאת.' : 'העוזר לא זמין כרגע. נסי שוב.';
async function aiJSON(prompt, status, opts) {
  if (!AI || aiBusy) return null; aiBusy = true; aiStatus = status; renderPanel();
  try { return await AI.json(prompt, Object.assign({ cache: false }, opts || {})); }
  catch (e) { if (e && e.code === 'not_granted') AI = null; toast(aiErr(e)); return null; }
  finally { aiBusy = false; aiStatus = ''; renderPanel(); }
}
function projectBrief() {
  const p = S.p, tx = p.clips.filter(c => c.type === 'text' || c.type === 'caption').sort((a, b) => a.start - b.start);
  return {
    format: p.fmt, seconds: +projDur().toFixed(1), captionStyle: p.cap.style, captionSize: p.cap.size,
    videoClips: p.clips.filter(c => c.type === 'video').length, imageClips: p.clips.filter(c => c.type === 'image').length, audioClips: p.clips.filter(c => c.type === 'audio').length,
    cuts: p.clips.filter(c => ['video', 'image', 'solid'].includes(c.type)).length,
    texts: tx.map(c => ({ id: c.id, kind: c.type, start: +c.start.toFixed(1), seconds: +c.dur.toFixed(1), text: c.text, size: c.type === 'text' ? c.size : undefined }))
  };
}

/* ----- create ----- */
function buildFromPlan(plan, fmt) {
  const p = newProject(); p.name = String(plan.title || 'סרטון חדש').slice(0, 60); p.fmt = fmt; p.w = FORMATS[fmt][0]; p.h = FORMATS[fmt][1];
  p.cap.style = 'karaoke'; p.cap.size = fmt === '16:9' ? 54 : 62;
  const tall = p.h > p.w, bgs = [BRAND.deep, BRAND.ink, '#0A2390']; let t = 0;
  const zoom = d => [{ t: 0, x: 0, y: 0, scale: 1, rot: 0, opacity: 1 }, { t: +d.toFixed(3), x: 0, y: 0, scale: 1.06, rot: 0, opacity: 1 }];
  (plan.scenes || []).slice(0, 12).forEach((s, i) => {
    const d = clamp(+s.seconds || 4, 1.5, 12), hook = i === 0, hasBody = !!(s.body && String(s.body).trim());
    p.clips.push(mkClip({ type: 'solid', trackId: 'v1', start: t, dur: d, color: bgs[i % 3], grad: true, tin: i ? 'fade' : 'none' }));
    if (s.kind === 'number' && s.number) {
      p.clips.push(mkText({ trackId: 'txt', start: t, dur: d, text: String(s.number), size: 220, font: 'Secular One', color: BRAND.gold, y: tall ? -0.16 : -0.14, kf: [] }));
      if (s.heading) p.clips.push(mkText({ trackId: 'v2', start: t + 0.3, dur: d - 0.3, text: String(s.heading), size: 62, weight: 700, y: tall ? 0.04 : 0.12, anim: 'slide' }));
    } else {
      const c = mkText({ trackId: 'txt', start: t, dur: d, text: String(s.heading || ''), size: hook ? 112 : 88, color: hook || s.kind === 'cta' ? BRAND.gold : '#FFFFFF', y: hasBody ? (tall ? -0.14 : -0.12) : -0.04 });
      c.kf = zoom(d).map(k => Object.assign(k, { y: c.y })); p.clips.push(c);
      if (hasBody) p.clips.push(mkText({ trackId: 'v2', start: t + 0.35, dur: d - 0.35, text: String(s.body), size: 52, weight: 500, y: tall ? 0.08 : 0.14, anim: 'slide' }));
    }
    const ch = chunkText(s.narration, 4), tot = ch.reduce((a, c) => a + c.length + 2, 0); let pos = t;
    ch.forEach(x => { const dd = d * (x.length + 2) / tot; p.clips.push(mkClip({ type: 'caption', trackId: 'cap', start: +pos.toFixed(3), dur: +dd.toFixed(3), text: x })); pos += dd; });
    t += d;
  });
  // text tracks: body lines live on a second text track
  const v2 = p.tracks.find(x => x.id === 'v2'); v2.type = 'text'; v2.name = 'טקסט משני';
  const bug = { id: 'bug', type: 'video', name: 'לוגו' }; p.tracks.splice(p.tracks.findIndex(x => x.id === 'v1'), 0, bug);
  S.p = p;
  if (t > 0) p.clips.push(logoBug('bug', t));
  // closing card: the logo and the community's promise, in every format
  p.clips.push(brandCard({ trackId: 'v1', start: t, dur: 3, tin: 'fade' }));
  p.clips.push(taglineClip({ trackId: 'txt', start: t + 0.5, dur: 2.5 }));
  S.sel = null; setCanvas(); seek(0.5); commit();
}
async function aiMake() {
  const brief = ($('#aiBrief') ? $('#aiBrief').value : '').trim(); if (!brief) return toast('כתבי על מה הסרטון');
  const tp = TEMPLATES[aiTpl];
  const plan = await aiJSON(`You are the senior content editor and video director of AI Finance, an Israeli community of 2,000+ finance professionals (CFOs, controllers, FP&A, CPAs) whose promise is "bridging the gap between the world of finance and the world of AI". Every video must serve that promise: it takes a real task from a finance professional's work and shows, in plain practical terms, how AI helps with it. Speak as a peer from inside the profession, not as a tech vendor. Plan a short social video in HEBREW.

Topic / brief from the creator:
${brief}

Format: ${aiFmt}. Target total length: ${aiLen} seconds. Structure to follow ("${tp[0]}"): ${tp[2]}.
Rules: the first scene is the hook and lasts at most 3 seconds; one idea only; concrete and practical, no hype; headings up to 6 words; body up to 12 words; narration is what the on-screen captions will say for that scene (1-2 short spoken sentences that fit its seconds at a natural pace, about 2.5 Hebrew words per second); the last scene is a single call to action to join the AI Finance community; no emojis; no long dashes; do not mix English words inside Hebrew sentences (the name AI Finance is allowed). Never invent statistics: use a number only if the creator's brief contains it, otherwise do not use kind "number".

Reply with only JSON: {"title": string, "scenes": [{"kind": "hook"|"point"|"number"|"quote"|"cta", "heading": string, "body": string, "number": string, "narration": string, "seconds": number}], "post": string}
"post" is a LinkedIn post in Hebrew that accompanies the video: sharp first line, 900-1300 characters, short paragraphs, one call to action, then 5 hashtags in English only.`, 'קלוד כותב תסריט ובונה סצנות...');
  if (!plan || !Array.isArray(plan.scenes) || !plan.scenes.length) return;
  buildFromPlan(plan, aiFmt); aiPost = String(plan.post || ''); aiCrit = null; aiSec = 'make'; renderPanel();
  toast('הסרטון נבנה: ' + plan.scenes.length + ' סצנות. אפשר לנגן, לערוך ולבקש ביקורת.');
}

/* ----- edit ----- */
async function aiEdit(instruction) {
  const b = projectBrief(); if (!b.texts.length) return toast('אין בסרטון טקסטים או כתוביות לערוך');
  const out = await aiJSON(`You are a meticulous Hebrew content editor for AI Finance (audience: Israeli CFOs, controllers, FP&A, CPAs). Edit the on-screen texts and captions of a short video.
Instruction: ${instruction}
Keep the meaning and the creator's voice; keep each item roughly the same length or shorter so it still fits its screen time; no emojis; no long dashes; do not mix English words inside Hebrew sentences. Do not add facts or numbers that are not already there.
Items (JSON): ${JSON.stringify(b.texts.map(x => ({ id: x.id, kind: x.kind, seconds: x.seconds, text: x.text })))}
Reply with only a JSON array of {"id": string, "text": string} for the items you changed (omit unchanged ones).`, 'קלוד עורך את הטקסטים...');
  if (!Array.isArray(out)) return; let n = 0;
  out.forEach(o => { const c = S.p.clips.find(x => x.id === o.id); if (c && typeof o.text === 'string' && o.text.trim() && o.text !== c.text) { c.text = o.text.trim(); n++; } });
  if (n) { commit(); toast('עודכנו ' + n + ' טקסטים. אפשר לחזור אחורה עם בטל.'); } else toast('לא נדרשו שינויים');
}

/* ----- critique ----- */
function waitMedia() {
  return new Promise(res => {
    const t0 = performance.now();
    (function chk() {
      let ok = true;
      for (const c of S.p.clips) { if (c.type !== 'video') continue; const l = S.t - c.start; if (l < 0 || l >= c.dur) continue; const e = getEl(c); if (!e || e.el.seeking || e.el.readyState < 2) ok = false; }
      if (ok || performance.now() - t0 > 1500) res(); else setTimeout(chk, 60);
    })();
  });
}
async function captureFrames(n) {
  pause(); const was = S.t, sel = S.sel, d = projDur(), times = [Math.min(0.6, d / 2)], out = []; S.sel = null;
  for (let i = 1; i < n; i++) times.push(d * (i + 0.5) / n);
  const sc = Math.min(1, 640 / Math.max(cv.width, cv.height)), sm = document.createElement('canvas'); sm.width = Math.round(cv.width * sc); sm.height = Math.round(cv.height * sc);
  for (const t of times) {
    S.t = t; syncMedia(); await waitMedia(); S.exporting = true; draw(); S.exporting = false;
    sm.getContext('2d').drawImage(cv, 0, 0, sm.width, sm.height);
    const b = await new Promise(r => sm.toBlob(r, 'image/jpeg', 0.8)); if (b) out.push(b);
  }
  S.sel = sel; seek(was); return { frames: out, times };
}
async function aiCritique() {
  if (!AI || aiBusy) return;
  let cap = { frames: [], times: [] }, max = 0;
  try { const lim = await AI.limits(); max = lim && lim.images ? Math.min(4, lim.images.maxCount) : 0; } catch (e) { }
  if (max) { aiStatus = 'מצלם פריימים מהסרטון...'; renderPanel(); try { cap = await captureFrames(max); } catch (e) { cap = { frames: [], times: [] }; } }
  const b = projectBrief(), withImg = cap.frames.length > 0;
  const r = await aiJSON(`You are a demanding senior content editor and creative director reviewing a short social video made by AI Finance (Israeli community of finance professionals: CFOs, controllers, FP&A, CPAs). Review it honestly; do not flatter. Write in HEBREW, short and specific, no long dashes, no English words inside Hebrew sentences.

Video data (JSON): ${JSON.stringify(b)}
${withImg ? 'Attached are ' + cap.frames.length + ' frames captured at seconds ' + cap.times.map(t => t.toFixed(1)).join(', ') + '. Judge layout, readability, contrast, text size on a phone, clutter and brand look from them.' : 'No frames are attached, so judge the look only from the data and say that the visual review is limited.'}
Brand: royal blue backgrounds, white and gold text, AI Finance logo.
Current best practice for this audience (as of ${TRENDS_DATE}): ${TREND_RULES.join('; ')}.

Score six areas from 1 to 10: "הוק", "תוכן ומסר", "קצב ומבנה", "נראות וקריאות", "מיתוג", "התאמה לפלטפורמה ולטרנדים".
Then propose up to 6 fixes. A fix may carry an automatic action only of these types: {"type":"setText","id":<id of an item in texts>,"text":<new text>}, {"type":"textSize","id":<id of a kind "text" item>,"value":<number 30-240>}, {"type":"capStyle","value":"box"|"clean"|"brand"|"karaoke"|"pop"}, {"type":"capSize","value":<number 40-110>}. Anything else is {"type":"note"}. Do not invent facts or numbers in new texts.
Reply with only JSON: {"score": number 0-100, "verdict": string (one sentence), "sections": [{"name": string, "score": number, "good": string, "fix": string}], "fixes": [{"label": string, "why": string, "action": {...}}]}`,
    'קלוד צופה בסרטון וכותב ביקורת...', withImg ? { images: cap.frames } : {});
  if (!r || !Array.isArray(r.sections)) return;
  aiCrit = { r, withImg, at: fmtT(projDur()) }; aiSec = 'crit'; renderPanel();
}
function applyFixes() {
  if (!aiCrit) return; let n = 0;
  (aiCrit.r.fixes || []).forEach(f => {
    const a = f.action || {}, c = a.id ? S.p.clips.find(x => x.id === a.id) : null;
    if (a.type === 'setText' && c && typeof a.text === 'string' && a.text.trim()) { c.text = a.text.trim(); n++; }
    else if (a.type === 'textSize' && c && c.type === 'text' && +a.value) { c.size = clamp(+a.value, 30, 240); n++; }
    else if (a.type === 'capStyle' && CAP_STYLES.some(s => s[0] === a.value)) { S.p.cap.style = a.value; n++; }
    else if (a.type === 'capSize' && +a.value) { S.p.cap.size = clamp(+a.value, 40, 110); n++; }
  });
  if (n) { commit(); toast('הוחלו ' + n + ' תיקונים. אפשר לחזור אחורה עם בטל.'); } else toast('אין תיקונים אוטומטיים להחלה');
}

/* ----- panel ----- */
const SECS = [['make', 'יצירה'], ['edit', 'עריכת תוכן'], ['crit', 'ביקורת'], ['trend', 'טרנדים']];
PANELS.ai = function () {
  const head = `<div class="chips" style="margin-bottom:12px">${SECS.map(([k, t]) => `<button type="button" class="chip${aiSec === k ? ' on' : ''}" data-a="aiSec" data-v="${k}">${t}</button>`).join('')}</div>`;
  const off = AI ? '' : '<p class="hint">יכולות הבינה פעילות כשהעורך פתוח בתוך קלוד. אם הן לא נטענו, רענני את העמוד.</p>';
  const dis = !AI || aiBusy ? ' disabled' : '', busy = aiBusy || aiStatus ? `<p class="hint busy">${esc(aiStatus || 'קלוד עובד...')}</p>` : '';
  let h = '';
  if (aiSec === 'make') {
    h = `<h4>סרטון חדש מרעיון</h4><textarea id="aiBrief" rows="4" placeholder="על מה הסרטון? למשל: שלוש בדיקות שסמנכ״ל כספים צריך לעשות לפני שמכניסים בינה מלאכותית לסגירת חודש"></textarea>
    <label class="f two"><span>מבנה</span><select id="aiTplSel">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}"${aiTpl === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></label>
    <label class="f two"><span>פורמט</span><select id="aiFmtSel">${[['9:16', 'רילס וטיקטוק 9:16'], ['4:5', 'פיד לינקדאין 4:5'], ['1:1', 'ריבוע 1:1'], ['16:9', 'רוחבי 16:9']].map(([k, t]) => `<option value="${k}"${aiFmt === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f two"><span>אורך</span><select id="aiLenSel">${[15, 30, 45, 60, 90].map(n => `<option value="${n}"${aiLen === n ? ' selected' : ''}>${n} שניות</option>`).join('')}</select></label>
    <button type="button" class="btn wide gold" data-a="aiMake"${dis}>יצירת הסרטון</button>${busy}
    <p class="hint">קלוד כותב תסריט, מחלק לסצנות ובונה ציר זמן מלא: רקעים ממותגים, כותרות, כתוביות, תג לוגו וסיומת. הסרטון הנוכחי מוחלף, ואפשר לחזור אליו עם בטל. מספרים וסטטיסטיקות נכנסים רק אם כתבת אותם בעצמך.</p>
    ${aiPost ? `<h4>פוסט נלווה</h4><div class="aiout">${esc(aiPost)}</div><button type="button" class="btn sm" data-a="aiCopyPost" style="margin-top:8px">העתקת הפוסט</button>` : ''}`;
  } else if (aiSec === 'edit') {
    h = `<h4>עריכת כל הטקסטים והכתוביות</h4><div class="col">
    <button type="button" class="btn" data-a="aiEditGo" data-v="Tighten every text: cut filler words, make each line sharper and more direct."${dis}>הידוק וחידוד</button>
    <button type="button" class="btn" data-a="aiEditGo" data-v="Proofread only: fix spelling, grammar and punctuation in Hebrew. Change nothing else."${dis}>הגהה בלבד</button>
    <button type="button" class="btn" data-a="aiEditGo" data-v="Rewrite only the first text (the hook) so it stops the scroll in 3 seconds for a finance professional. Leave the rest."${dis}>חיזוק ההוק</button></div>
    <h4>הוראת עריכה חופשית</h4><textarea id="aiInstr" rows="2" placeholder="למשל: טון ישיר יותר, פחות מילים מקצועיות"></textarea>
    <button type="button" class="btn wide" data-a="aiEditFree"${dis}>ביצוע העריכה</button>${busy}
    <h4>עוד</h4><div class="col"><button type="button" class="btn" data-a="aiHook"${dis}>שלוש הצעות להוק פתיחה</button><button type="button" class="btn" data-a="aiPost"${dis}>פוסט נלווה לסרטון</button><button type="button" class="btn" data-a="aiTrans"${dis}>תרגום הכתוביות לאנגלית</button></div>
    <textarea id="aiTopic" rows="2" placeholder="הקשר נוסף להוק ולפוסט (לא חובה)" style="margin-top:8px"></textarea>
    ${aiHooks.length ? '<h4>לחיצה מוסיפה כהוק בתחילת הסרטון</h4><div class="col">' + aiHooks.map((t, i) => `<button type="button" class="btn" data-a="aiUseHook" data-v="${i}">${esc(t)}</button>`).join('') + '</div>' : ''}
    ${aiOut ? `<h4>תוצאה</h4><div class="aiout">${esc(aiOut)}</div><button type="button" class="btn sm" data-a="aiCopy" style="margin-top:8px">העתקה</button>` : ''}`;
  } else if (aiSec === 'crit') {
    h = `<h4>ביקורת עורך על הסרטון</h4><button type="button" class="btn wide gold" data-a="aiCrit"${dis}>ביקורת מלאה עכשיו</button>${busy}
    <p class="hint">קלוד מקבל את מבנה הסרטון, כל הטקסטים ועד ארבעה פריימים, ומבקר הוק, מסר, קצב, נראות, מיתוג והתאמה לפלטפורמה. הוא לא שומע את הקול ולא רואה תנועה, רק תמונות עצירה.</p>`;
    if (aiCrit) {
      const r = aiCrit.r, auto = (r.fixes || []).filter(f => f.action && f.action.type && f.action.type !== 'note').length;
      h += `<div class="score"><b>${Math.round(+r.score || 0)}</b><span>${esc(r.verdict || '')}</span></div>
      ${aiCrit.withImg ? '' : '<p class="hint">הביקורת הזאת נעשתה בלי פריימים, לכן החלק החזותי מוגבל.</p>'}
      <div class="col">${r.sections.map(s => `<div class="crit"><div class="ch"><b>${esc(s.name)}</b><i class="pill ${+s.score >= 8 ? 'g' : +s.score >= 6 ? 'm' : 'b'}">${esc(s.score)}/10</i></div>${s.good ? `<p>${esc(s.good)}</p>` : ''}${s.fix ? `<p class="fx">לתיקון: ${esc(s.fix)}</p>` : ''}</div>`).join('')}</div>
      ${(r.fixes || []).length ? `<h4>תיקונים מוצעים</h4><div class="col">${r.fixes.map(f => `<div class="crit"><div class="ch"><b>${esc(f.label || '')}</b>${f.action && f.action.type && f.action.type !== 'note' ? '<i class="pill g">אוטומטי</i>' : '<i class="pill m">ידני</i>'}</div><p>${esc(f.why || '')}</p></div>`).join('')}</div>
      <button type="button" class="btn wide" data-a="aiApply" style="margin-top:8px"${auto ? '' : ' disabled'}>החלת ${auto} התיקונים האוטומטיים</button>` : ''}`;
    }
  } else {
    h = `<h4>מה עובד עכשיו בסרטונים קצרים לקהל עסקי</h4><div class="col">${TREND_RULES.map(t => `<div class="crit"><p>${esc(t)}</p></div>`).join('')}</div>
    <h4>מבנים מוכנים</h4><div class="col">${Object.entries(TEMPLATES).map(([k, v]) => `<div class="crit"><div class="ch"><b>${v[0]}</b><button type="button" class="btn sm" data-a="aiUseTpl" data-v="${k}">בנייה במבנה הזה</button></div><p>${v[1]}</p></div>`).join('')}</div>
    <p class="hint">הרשימה נאספה מסקירות שוק ב-${TRENDS_DATE} ואינה מתעדכנת לבד. הביקורת והיצירה משתמשות בה. לעדכון, בקשי מקלוד בשיחה סקירת טרנדים חדשה.</p>`;
  }
  return head + off + h;
};
const _renderPanel = renderPanel;
renderPanel = function () { const keep = {}; ['aiBrief', 'aiInstr'].forEach(id => { const e = $('#' + id); if (e) keep[id] = e.value; }); _renderPanel(); for (const id in keep) { const e = $('#' + id); if (e) e.value = keep[id]; } };
$('#panel').addEventListener('change', e => {
  if (e.target.id === 'aiTplSel') aiTpl = e.target.value;
  if (e.target.id === 'aiFmtSel') aiFmt = e.target.value;
  if (e.target.id === 'aiLenSel') aiLen = +e.target.value;
});
Object.assign(ACT, {
  aiSec(v) { aiSec = v; renderPanel(); },
  aiMake() { aiMake(); },
  aiEditGo(v) { aiEdit(v); },
  aiEditFree() { const t = ($('#aiInstr').value || '').trim(); t ? aiEdit(t) : toast('כתבי הוראת עריכה'); },
  aiCrit() { aiCritique(); },
  aiApply() { applyFixes(); },
  aiUseTpl(v) { aiTpl = v; aiSec = 'make'; renderPanel(); },
  aiCopyPost() { try { navigator.clipboard.writeText(aiPost).then(() => toast('הועתק'), () => toast('אפשר לסמן ולהעתיק ידנית')); } catch (e) { toast('אפשר לסמן ולהעתיק ידנית'); } }
});
