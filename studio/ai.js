'use strict';
/* ===== AI studio: create, edit, critique, trends ===== */
// Who Claude is writing for. AI Finance by default; a replaced brand speaks for itself.
function brandCtx() {
  const b = S.brand;
  if (b.name === BRAND0.name && !String(b.about).trim()) return 'AI Finance, an Israeli community of 2,000+ finance professionals (CFOs, controllers, FP&A, CPAs) whose promise is "bridging the gap between the world of finance and the world of AI"';
  return 'the brand "' + b.name + '"' + (String(b.tagline).trim() ? ', whose tagline is "' + String(b.tagline).replace(/\s+/g, ' ').trim() + '"' : '') + (String(b.about).trim() ? '. Its owner describes the brand and its audience as: ' + String(b.about).trim() : '') + '. Write for that audience and in that spirit';
}
const brandIsDefault = () => S.brand.name === BRAND0.name && !String(S.brand.about).trim();
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
  const tall = p.h > p.w, bgs = S.brand.color !== BRAND.deep ? [S.brand.color, S.brand.color, S.brand.color] : [BRAND.deep, BRAND.ink, '#0A2390']; let t = 0;
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
  pushTag({ trackId: 'txt', start: t + 0.5, dur: 2.5 });
  S.sel = null; setCanvas(); seek(0.5); commit();
}
async function aiMake() {
  const brief = ($('#aiBrief') ? $('#aiBrief').value : '').trim(); if (!brief) return toast('כתבי על מה הסרטון');
  const tp = TEMPLATES[aiTpl];
  const plan = await aiJSON(`You are the senior content editor and video director of ${brandCtx()}. ${brandIsDefault() ? "Every video must serve that promise: it takes a real task from a finance professional's work and shows, in plain practical terms, how AI helps with it. Speak as a peer from inside the profession, not as a tech vendor." : ''} Plan a short social video in HEBREW.

Topic / brief from the creator:
${brief}

Format: ${aiFmt}. Target total length: ${aiLen} seconds. Structure to follow ("${tp[0]}"): ${tp[2]}.
Rules: the first scene is the hook and lasts at most 3 seconds; one idea only; concrete and practical, no hype; headings up to 6 words; body up to 12 words; narration is what the on-screen captions will say for that scene (1-2 short spoken sentences that fit its seconds at a natural pace, about 2.5 Hebrew words per second); the last scene is a single call to action: ${brandIsDefault() ? 'to join the AI Finance community' : (S.brand.cta || 'one clear next step')}; no emojis; no long dashes; do not mix English words inside Hebrew sentences (the brand name ${S.brand.name} is allowed). Never invent statistics: use a number only if the creator's brief contains it, otherwise do not use kind "number".

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

/* ----- automatic marketing edit of an uploaded video -----
   Listen to the footage, understand it, then build a short marketing video around it:
   tight cuts, burned-in captions, an opening hook, key points over the footage,
   chapter cards between sections, the logo, and a closing card with one call to action. */
let autoBusy = false;
const autoStep = t => { const e = $('#autoStep'); if (e) e.textContent = t; };
const autoBar = w => { const e = $('#autoBar'); if (e) e.style.width = clamp(w, 0, 100) + '%'; };
const LISTEN_MAX = 240;

// Speech to text in the browser. Plays the file silently at normal speed into the browser's speech
// recognition, so it takes as long as the video. Resolves [{a, b, text}] in source seconds, or null.
function transcribe(m, onProg) {
  return new Promise(res => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // recognition from a media track ships together with these members; without them start() would open the microphone
    if (!SR || !m || !m.url || m.duration > LISTEN_MAX || !(typeof SR.available === 'function' || 'processLocally' in SR.prototype)) return res(null);
    const segs = []; let el, rec, tr, done = false, mark = 0, guard = 0;
    const fin = () => { if (done) return; done = true; clearTimeout(guard); try { rec.onend = null; rec.stop(); } catch (e) { } try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { } res(segs.length ? segs : null); };
    try {
      el = document.createElement(m.kind === 'video' ? 'video' : 'audio'); el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = m.url;
      guard = setTimeout(fin, (m.duration * 1.3 + 10) * 1000); transcribe.cancel = fin;
      // give up early when nothing plays, or when a long stretch passes and not one word was recognised
      setTimeout(() => { if (!done && el.currentTime < 0.5) fin(); }, 8000);
      setTimeout(() => { if (!done && !segs.length) fin(); }, 25000);
      el.addEventListener('ended', () => setTimeout(fin, 1800)); el.addEventListener('error', fin);
      el.addEventListener('timeupdate', () => onProg && onProg(el.currentTime / m.duration));
      el.addEventListener('canplay', () => {
        if (rec) return;
        const st = el.captureStream ? el.captureStream() : null; tr = st && st.getAudioTracks()[0]; if (!tr) return fin();
        rec = new SR(); rec.lang = 'he-IL'; rec.continuous = true; rec.interimResults = false;
        rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (!r.isFinal) continue; const t = String(r[0].transcript || '').trim(), now = Math.max(0, el.currentTime - 0.5); if (t) segs.push({ a: mark, b: Math.max(now, mark + 0.4), text: t }); mark = now; } };
        rec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') fin(); };
        rec.onend = () => { if (done || el.ended) return fin(); try { rec.start(tr); } catch (e) { fin(); } };
        try { rec.start(tr); const p = el.play(); if (p) p.catch(fin); } catch (e) { fin(); }
      }, { once: true });
    } catch (e) { fin(); }
  });
}
// source seconds of a file -> seconds on the timeline, after cuts; null when that moment was cut out
function srcToTl(mediaId, ts) {
  for (const c of S.p.clips) { if (c.mediaId !== mediaId || c.type !== 'video') continue; const e = c.in + c.dur * c.speed; if (ts >= c.in - 0.02 && ts < e) return c.start + (ts - c.in) / c.speed; }
  return null;
}
function addCaptions(mediaId, segs) {
  const tid = capTrack().id, out = [];
  segs.forEach(sg => {
    let A = srcToTl(mediaId, sg.a), B = srcToTl(mediaId, Math.max(sg.a, sg.b - 0.05)); if (A == null && B == null) return;
    if (A == null) A = Math.max(0, B - (sg.b - sg.a)); if (B == null || B <= A) B = A + Math.max(0.8, sg.b - sg.a);
    const ch = chunkText(sg.text, 4), tot = ch.reduce((n, x) => n + x.length + 2, 0); let pos = A;
    ch.forEach(x => { const d = (B - A) * (x.length + 2) / tot; out.push(mkClip({ type: 'caption', trackId: tid, start: +pos.toFixed(3), dur: +d.toFixed(3), text: x, auto: true })); pos += d; });
  });
  out.sort((a, b) => a.start - b.start); out.forEach((c, i) => { const n = out[i + 1]; if (n && c.start + c.dur > n.start) c.dur = Math.max(0.2, n.start - c.start); c.dur = Math.max(c.dur, 0.35); });
  S.p.clips.push(...out); return out.length;
}
// Open a gap at T for a chapter card. Prefers an existing cut near T; otherwise cuts the footage there.
function insertCard(T, d, card) {
  const vids = S.p.clips.filter(c => c.type === 'video'); if (!vids.length) return false; let best = null;
  vids.forEach(c => [c.start, c.start + c.dur].forEach(b => { if (b > 1 && Math.abs(b - T) < 2.5 && (best === null || Math.abs(b - T) < Math.abs(best - T))) best = b; }));
  if (best === null) {
    S.p.clips.filter(c => isTimed(c) && T - c.start > 0.3 && c.start + c.dur - T > 0.3).forEach(c => { const cut = T - c.start, r = clone(c); r.id = uid(); r.start = T; r.dur = c.dur - cut; r.in = c.in + cut * c.speed; r.kf = []; r.fadeIn = 0; r.tin = 'none'; c.dur = cut; c.fadeOut = 0; c.tout = 'none'; S.p.clips.push(r); });
    best = T;
  }
  T = best;
  S.p.clips.forEach(c => { if (c.start >= T - 1e-3) c.start = +(c.start + d).toFixed(3); else if (c.start + c.dur > T + 1e-3 && (c.type === 'caption' || c.type === 'text')) c.dur = Math.max(0.2, T - c.start); });
  const tall = S.p.h > S.p.w, tx = firstTrack('text').id; let t2 = S.p.tracks.find(t => t.type === 'text' && t.id !== tx);
  if (!t2) { t2 = { id: uid(), type: 'text', name: 'טקסט 2' }; S.p.tracks.splice(S.p.tracks.findIndex(t => t.id === tx), 0, t2); }
  const body = String(card.body || '').trim();
  S.p.clips.push(mkClip({ brand: 'ins', type: 'solid', trackId: vids[0].trackId, start: T, dur: d, color: BRAND.deep, grad: true, tin: 'fade' }));
  S.p.clips.push(mkText({ brand: 'ins', trackId: tx, start: T + 0.1, dur: d - 0.1, text: String(card.heading).trim(), size: tall ? 96 : 88, color: BRAND.gold, y: body ? (tall ? -0.1 : -0.1) : -0.02 }));
  if (body) S.p.clips.push(mkText({ brand: 'ins', trackId: t2.id, start: T + 0.4, dur: d - 0.4, text: body, size: 52, weight: 500, y: tall ? 0.06 : 0.12, anim: 'slide' }));
  return true;
}
// Numbered contact sheets of the whole video, so Claude sees it from start to end and can read
// captions or on-screen text that are already part of the footage.
async function contactSheets(lim, onProg) {
  pause(); const was = S.t, sel = S.sel, D = projDur(), tall = S.p.h > S.p.w, cols = tall ? 4 : 3, rows = tall ? 3 : 4, per = cols * rows;
  const N = Math.min(lim.maxCount * per, Math.max(per, Math.ceil(D / 1.0))), cw = tall ? 320 : 440, ch = Math.round(cw * S.p.h / S.p.w), times = [], sheets = [];
  S.sel = null; let sc = null, x = null;
  const flush = async () => { if (!sc) return; let q = 0.82, b = null; for (let i = 0; i < 4; i++) { b = await new Promise(r => sc.toBlob(r, 'image/jpeg', q)); if (!b || !lim.maxBytes || b.size <= lim.maxBytes) break; q -= 0.18; } if (b) sheets.push(b); sc = null; };
  for (let i = 0; i < N; i++) {
    if (i % per === 0) { await flush(); sc = document.createElement('canvas'); sc.width = cols * cw; sc.height = rows * ch; x = sc.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, sc.width, sc.height); }
    const t = D * (i + 0.5) / N; times.push(+t.toFixed(1));
    S.t = t; syncMedia(); await waitMedia(); S.exporting = true; draw(); S.exporting = false;
    const k = i % per, px = (k % cols) * cw, py = Math.floor(k / cols) * ch; x.drawImage(cv, px, py, cw, ch);
    x.fillStyle = '#000'; x.fillRect(px, py, 46, 26); x.fillStyle = '#FFD23F'; x.font = '700 18px sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(String(i + 1), px + 23, py + 14);
    if (onProg) onProg((i + 1) / N);
  }
  await flush(); S.sel = sel; seek(was); return { sheets, times };
}
function askBrief() {
  return new Promise(res => {
    modal(`<h3>על מה הסרטון?</h3><p class="hint">במכשיר הזה אי אפשר לשמוע את הדיבור, ובסרטון עצמו לא מצאתי כתוביות או טקסט שמסבירים את הנושא. משפט אחד מספיק, ואת כל השאר העורך עושה לבד.</p>
    <textarea id="autoBrief" rows="2" placeholder="למשל: איך לבדוק התאמת בנקים עם בינה מלאכותית בעשר דקות"></textarea>
    <div class="rowf" style="margin-top:10px"><button type="button" class="btn primary" data-a="autoGo">המשך</button><button type="button" class="btn" data-a="autoSkip">בלי נושא, רק חיתוך ומיתוג</button></div>`);
    let over = false; const end = v => { if (over) return; over = true; clearInterval(iv); ACT.autoGo = ACT.autoSkip = () => { }; res(v); };
    const iv = setInterval(() => { if ($('#modal').hidden || !$('#autoBrief')) end(''); }, 300);
    ACT.autoGo = () => { const v = ($('#autoBrief').value || '').trim(); if (!v) return toast('כתבי משפט אחד על הנושא'); end(v); };
    ACT.autoSkip = () => end('');
  });
}
const autoProgress = t => modal(`<h3>בונה סרטון שיווקי...</h3><div class="bar"><i id="autoBar" style="width:4%"></i></div><p class="hint busy" id="autoStep">${esc(t)}</p><p class="hint">לא לסגור את המסך. בסוף יופיע סיכום.</p><button type="button" class="btn sm" data-a="autoNoListen" id="autoNoListen">לדלג על ההקשבה</button>`);
async function planEdit(lines, brief, vis) {
  const d = projDur(), has = lines.length > 0;
  return AI.json(`You are the senior video editor and marketing director of ${brandCtx()}. A member uploaded a raw video. Dress it as a short marketing video that its audience will stop scrolling for. The footage itself stays exactly as it is: you only add an opening title, a few key points, and the closing call to action. Write everything in HEBREW.

The cut footage is ${d.toFixed(1)} seconds long, format ${S.p.fmt}.
${has ? 'Transcript of what is said, with the second on the timeline where each line starts:\n' + lines.map(l => '[' + l.t.toFixed(1) + '] ' + l.text).join('\n') : 'There is no transcript: the speech could not be heard.'}
${brief ? 'The creator describes the video as: ' + brief : ''}
${vis ? 'Attached: ' + vis.sheets.length + ' contact sheet(s) holding ' + vis.times.length + ' numbered frames of the video in time order. Frame number -> second on the timeline: ' + vis.times.map((t, i) => (i + 1) + '=' + t).join(', ') + '.\nLook at every frame. If the footage already carries burned-in captions or other on-screen text, read it frame by frame: those captions are the transcript of what is said, and the frame number tells you when. Set "burned" to true in that case.' : ''}

Plan these elements:
- "hook": the opening title for the first 3 seconds. Up to 6 words. It names the viewer's real pain or the concrete gain, never a greeting.
- "points": up to 3 key points shown at the top of the screen at the moment each is said. Choose only the strongest ideas; fewer is better than weak ones. Each: "at" (second on the timeline, between 4 and ${Math.max(4, d - 3).toFixed(0)}, at least 8 seconds apart) and "text" (up to 5 words).
- "cta": the single call to action on the closing card, up to 4 words.
- "title": a short project name.
- "post": a LinkedIn post that accompanies the video: sharp first line, 900 to 1300 characters, short paragraphs, one call to action, then 5 hashtags in English only.

Hard rules: ${has ? 'every text must come from what is actually said in the transcript' : 'you did not hear the video. If you can read captions in the frames, every text must come from what those captions say. Otherwise every text may only frame the topic (a question, a promise, a section name) and must not claim what is said in it'}. Never invent facts, names, numbers or statistics. No emojis, no long dashes, no English words inside Hebrew sentences (the brand name ${S.brand.name} is allowed). Concrete and practical, no hype.
${has || brief ? '' : 'If there are no readable captions and the frames do not clearly show what the video is about (for example only a person talking, with no text), set "understood" to false and leave the rest empty. Do not guess.'}
Reply with only JSON: {"understood": boolean, "burned": boolean, "title": string, "hook": string, "points": [{"at": number, "text": string}], "cta": string, "post": string}`, vis && vis.sheets.length ? { images: vis.sheets, cache: false } : { cache: false });
}
// the top band: above a speaker's face, and far from captions near the bottom
const TOPY = () => S.p.fmt === '9:16' ? -0.33 : S.p.h > S.p.w ? -0.36 : S.p.h === S.p.w ? -0.36 : -0.34;
async function autoEdit(mediaIds) {
  if (autoBusy) return;
  // always rebuild from the raw footage, so a second pass replaces the first instead of stacking on it
  const ids = mediaIds || [...new Set(S.p.clips.filter(isTimed).sort((a, b) => a.start - b.start).map(c => c.mediaId))];
  const srcs = ids.map(id => S.media.get(id)).filter(m => m && m.kind !== 'image'), vids = srcs.filter(m => m.kind === 'video');
  if (!vids.length) return toast('קודם מעלים סרטון');
  autoBusy = true; pause(); const done = [], skipped = [];
  try {
    const name = mediaIds ? vids[0].name.replace(/\.[^.]+$/, '').slice(0, 60) : S.p.name;
    S.p = newProject(); S.p.name = name || 'סרטון חדש'; S.sel = null; setCanvas(); srcs.forEach(m => addMedia(m)); setTab('media');
    // 1. listen
    autoProgress('מקשיב לסרטון. זה לוקח בערך כאורך הסרטון');
    const heard = new Map(); let n = 0;
    for (const m of vids) { const segs = await transcribe(m, u => autoBar(4 + 40 * (n + u) / vids.length)); if (segs) heard.set(m.id, segs); n++; }
    if (!$('#autoBar')) autoProgress('קלוד צופה בסרטון');
    autoBar(46); { const sk = $('#autoNoListen'); if (sk) sk.remove(); }
    // The footage itself is never cut or re-framed here. Trimming a finished clip by its sound level
    // chops words and makes playback stutter; silence removal stays a manual tool on the timeline.
    // 3. captions from what was heard
    let caps = 0; heard.forEach((segs, id) => { caps += addCaptions(id, segs); });
    if (caps) { S.p.cap.style = 'karaoke'; S.p.cap.size = S.p.fmt === '16:9' ? 54 : 62; done.push('כתוביות צרובות לפי הדיבור (' + caps + ')'); }
    S.sel = null; refresh(); autoBar(55);
    // 4. understand and plan
    const lines = []; heard.forEach((segs, id) => segs.forEach(sg => { const t = srcToTl(id, sg.a); lines.push({ t: t == null ? (srcToTl(id, sg.b - 0.05) || 0) : t, text: sg.text }); })); lines.sort((a, b) => a.t - b.t);
    let plan = null, brief = '';
    if (AI) {
      autoStep('קלוד צופה בסרטון ומתכנן את העריכה');
      let frames = null; try { const lim = await AI.limits(); if (lim && lim.images && lim.images.maxCount) { const hold = S.p.clips; S.p.clips = hold.filter(c => c.type !== 'caption'); try { frames = await contactSheets({ maxCount: Math.min(4, lim.images.maxCount), maxBytes: lim.images.maxBytes }, u => autoBar(55 + 10 * u)); } finally { S.p.clips = hold; } } } catch (e) { frames = null; }
      autoBar(65); autoStep('קלוד מתכנן את העריכה');
      try {
        plan = await planEdit(lines, '', frames);
        if (!lines.length && !(plan && plan.understood && String(plan.hook || '').trim())) {
          brief = await askBrief(); autoProgress('קלוד מתכנן את העריכה'); autoBar(70);
          plan = brief ? await planEdit(lines, brief, frames) : null;
        }
      } catch (e) { if (e && e.code === 'not_granted') AI = null; plan = null; }
    }
    autoBar(85); autoStep('מרכיב את הסרטון');
    // 5. build
    const burned = !!(plan && plan.burned);
    if (burned) { if (caps) { S.p.clips = S.p.clips.filter(c => !(c.type === 'caption' && c.auto)); const i = done.findIndex(t => t.startsWith('כתוביות צרובות')); if (i >= 0) done.splice(i, 1); } done.push('קראתי את הכתוביות שכבר נמצאות בסרטון, והעריכה נבנתה לפיהן'); }
    if (plan) {
      const D = projDur(), tall = S.p.h > S.p.w, hook = String(plan.hook || '').trim().slice(0, 80);
      if (hook) { S.p.clips.push(mkText({ brand: 'hook', trackId: firstTrack('text').id, start: 0, dur: Math.min(3, D), text: hook, size: tall ? 80 : 84, color: BRAND.gold, stroke: true, y: TOPY(), anim: 'pop' })); done.push('כותרת פתיחה: ' + hook); }
      let last = -9, np = 0;
      (Array.isArray(plan.points) ? plan.points : []).map(p => ({ at: +p.at, text: String(p.text || '').trim() })).filter(p => p.text && p.at >= 3.6 && p.at < D - 2).sort((a, b) => a.at - b.at).slice(0, 3).forEach(p => {
        if (p.at - last < 6) return; last = p.at; np++;
        S.p.clips.push(mkText({ brand: 'point', trackId: firstTrack('text').id, start: +p.at.toFixed(2), dur: Math.min(3.2, D - p.at), text: p.text.slice(0, 60), size: 54, weight: 700, bgOn: true, bg: S.brand.color !== BRAND.deep ? S.brand.color : BRAND.blue, shadow: false, y: TOPY(), anim: 'fade' }));
      });
      if (np) done.push(np + ' נקודות מפתח בראש המסך, בזמן שהן נאמרות');
      if (String(plan.title || '').trim()) S.p.name = String(plan.title).trim().slice(0, 60);
      if (String(plan.post || '').trim()) { aiPost = String(plan.post); done.push('פוסט נלווה ללינקדאין, מחכה בלשונית במאי'); }
    }
    addOutro(); addBug();
    { const bug = S.p.clips.find(c => c.brand === 'bug'), hk = S.p.clips.find(c => c.brand === 'hook'); if (bug && hk && bug.dur > hk.dur + 1) { bug.start = hk.dur; bug.dur -= hk.dur; bug.tin = 'fade'; } }
    const cta = plan && String(plan.cta || '').trim().slice(0, 30), cc = S.p.clips.find(c => c.brand === 'cta'); if (cta && cc) { cc.text = cta; cc.autoCta = false; }
    done.push('תג לוגו בפינה'); done.push('סיומת עם הלוגו, הסלוגן וקריאה לפעולה');
    const lastV = S.p.clips.filter(c => c.type === 'video').sort((a, b) => b.start - a.start)[0]; if (lastV) { lastV.tout = 'fade'; lastV.fadeOut = Math.min(0.4, lastV.dur / 2); }
    // what could not be done, said plainly
    if (!caps && !burned) skipped.push(vids.some(m => m.duration > LISTEN_MAX) ? 'כתוביות: הסרטון ארוך מארבע דקות, ולכן לא הקשבתי לו' : 'כתוביות: במכשיר הזה אי אפשר לשמוע את הדיבור, ובסרטון אין כתוביות לקרוא');
    if (!plan) skipped.push(AI ? (brief || lines.length ? 'תכנון העריכה לא הצליח הפעם. אפשר להריץ שוב' : 'כותרת, נקודות מפתח ושקפי ביניים: לא נוספו, כי הנושא לא ידוע ולא רציתי לנחש') : 'כותרת, נקודות מפתח ושקפי ביניים: נכתבים רק כשהעורך פתוח בתוך קלוד');
    else if (!lines.length && !burned) skipped.push('הטקסטים נכתבו לפי ' + (brief ? 'המשפט שכתבת' : 'התמונות') + ' ולא לפי הדיבור, כי לא הצלחתי לשמוע אותו. כדאי לעבור עליהם');
    autoBar(100); S.sel = null; commit(); seek(0); renderPanel();
    modal(`<h3>הסרטון מוכן</h3><p class="hint">${esc(S.p.name)} · אורך ${fmtT(projDur())} · ${S.p.fmt}</p>
    <h4>מה נעשה</h4><div class="col">${done.map(t => `<div class="crit"><p>${esc(t)}</p></div>`).join('')}</div>
    ${skipped.length ? `<h4>מה לא נעשה</h4><div class="col">${skipped.map(t => `<div class="crit"><p class="fx">${esc(t)}</p></div>`).join('')}</div>` : ''}
    <div class="rowf" style="margin-top:12px"><button type="button" class="btn primary" data-a="autoPlay">ניגון</button><button type="button" class="btn gold" data-a="export">ייצוא</button><button type="button" class="btn" data-a="closeModal">סגירה</button></div>`);
  } catch (e) { closeModal(); commit(); toast('העריכה האוטומטית נעצרה באמצע. אפשר לחזור אחורה עם בטל.'); }
  autoBusy = false;
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
  autoEdit() { autoEdit(); },
  autoNoListen() { if (transcribe.cancel) transcribe.cancel(); },
  autoPlay() { closeModal(); seek(0); play(); },
  aiSec(v) { aiSec = v; renderPanel(); },
  aiMake() { aiMake(); },
  aiEditGo(v) { aiEdit(v); },
  aiEditFree() { const t = ($('#aiInstr').value || '').trim(); t ? aiEdit(t) : toast('כתבי הוראת עריכה'); },
  aiCrit() { aiCritique(); },
  aiApply() { applyFixes(); },
  aiUseTpl(v) { aiTpl = v; aiSec = 'make'; renderPanel(); },
  aiCopyPost() { try { navigator.clipboard.writeText(aiPost).then(() => toast('הועתק'), () => toast('אפשר לסמן ולהעתיק ידנית')); } catch (e) { toast('אפשר לסמן ולהעתיק ידנית'); } }
});
