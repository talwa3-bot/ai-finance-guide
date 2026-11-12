'use strict';
/* ===== history + save ===== */
const H = { stack: [], i: -1 };
const snap = () => JSON.stringify(S.p);
let saveTimer = 0;
function saveSoon() {
  $('#saveState').textContent = 'שומר...'; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => DB.saveProject().then(() => $('#saveState').textContent = 'נשמר').catch(() => $('#saveState').textContent = 'לא נשמר במכשיר'), 600);
}
function commit() { H.stack.length = H.i + 1; H.stack.push(snap()); if (H.stack.length > 80) H.stack.shift(); H.i = H.stack.length - 1; saveSoon(); refresh(); }
function restore(d) { const ni = H.i + d; if (ni < 0 || ni >= H.stack.length) return; H.i = ni; S.p = JSON.parse(H.stack[ni]); if (!selClip()) S.sel = null; setCanvas(); saveSoon(); refresh(); if (document.body.dataset.tab === 'cap') renderPanel(); }
function refresh() {
  pruneEls(); renderTimeline(); renderInspector();
  $('#projName').value = S.p.name; $('#fmt').value = S.p.fmt;
  $('#tinfo').textContent = `${S.p.w}×${S.p.h} · ${S.p.fps}fps`;
  $('[data-a=undo]').disabled = H.i <= 0; $('[data-a=redo]').disabled = H.i >= H.stack.length - 1;
  requestDraw();
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
const fmtT = s => { const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); };
const fmtTC = s => { const f = Math.floor((s % 1) * S.p.fps); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0') + ':' + String(f).padStart(2, '0'); };
const isMobile = () => matchMedia('(max-width: 860px)').matches;

/* ===== transport ===== */
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  toStart: '<svg viewBox="0 0 24 24"><path d="M5 5h2v14H5zM20 5v14L9 12z"/></svg>', toEnd: '<svg viewBox="0 0 24 24"><path d="M17 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M16 6v12l-9-6z"/></svg>', fwd: '<svg viewBox="0 0 24 24"><path d="M8 6v12l9-6z"/></svg>'
};
$$('.tbtns .ib').forEach(b => b.innerHTML = ICON[b.dataset.a]);
function uiPlay() { $('#btnPlay').innerHTML = S.playing ? ICON.pause : ICON.play; }
const scroller = $('#scroller'), rowsEl = $('#rows');
function uiTime() {
  $('#tc').textContent = fmtTC(S.t);
  const x = S.t * S.pps; $('#playhead').style.transform = `translateX(${x}px)`;
  if (S.playing) { const l = scroller.scrollLeft, w = scroller.clientWidth; if (x > l + w - 30 || x < l) scroller.scrollLeft = Math.max(0, x - 40); }
  if (S.exporting) { const b = $('#expBar'); if (b) b.style.width = (100 * S.t / projDur()).toFixed(1) + '%'; }
}

/* ===== timeline ===== */
function clipLabel(c) {
  if (c.type === 'text' || c.type === 'caption') return c.text.replace(/\n/g, ' ');
  if (c.type === 'solid') return 'רקע צבע';
  const m = S.media.get(c.mediaId); return m ? m.name : 'קובץ חסר';
}
function renderTimeline() {
  const p = S.p, dur = projDur(), W = Math.max((dur + 8) * S.pps, scroller.clientWidth || 600);
  $('#heads').innerHTML = p.tracks.map(t => {
    const sm = t.type === 'text' || t.type === 'caption' ? ' small' : '';
    return `<div class="th${sm}" data-t="${t.id}"><span class="tn">${esc(t.name)}</span>` +
      (t.type !== 'text' && t.type !== 'caption' ? `<button type="button" data-a="trkMute" class="${t.muted ? 'off' : ''}" title="השתקת ערוץ">${t.muted ? 'מושתק' : 'קול'}</button>` : '') +
      (t.type !== 'audio' ? `<button type="button" data-a="trkHide" class="${t.hidden ? 'off' : ''}" title="הסתרת ערוץ">${t.hidden ? 'מוסתר' : 'גלוי'}</button>` : '') +
      `<button type="button" data-a="trkDel" title="מחיקת ערוץ">✕</button></div>`;
  }).join('');
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]; const st = steps.find(s => s * S.pps >= 64) || 600; let tk = '';
  for (let t = 0; t * S.pps < W; t += st) tk += `<span class="tick" style="left:${t * S.pps}px">${fmtT(t)}</span>`;
  const ruler = $('#ruler'); ruler.style.width = W + 'px'; ruler.innerHTML = tk;
  rowsEl.style.width = W + 'px';
  rowsEl.innerHTML = p.tracks.map(t => {
    const sm = t.type === 'text' || t.type === 'caption' ? ' small' : '';
    const cl = p.clips.filter(c => c.trackId === t.id).map(c => {
      const m = S.media.get(c.mediaId), bg = m && m.thumb && c.type !== 'audio' ? `background-image:linear-gradient(#0006,#0006),url('${m.thumb}');` : '';
      const kf = (c.kf || []).map((k, i) => `<b class="kfd" data-k="${i}" style="left:${k.t * S.pps}px"></b>`).join('');
      const wave = m && m.peaks ? '<canvas></canvas>' : '';
      return `<div class="clip k-${c.type}${c.id === S.sel ? ' sel' : ''}" data-id="${c.id}" style="left:${c.start * S.pps}px;width:${c.dur * S.pps}px;${bg}"><i class="hd l"></i><span class="cl">${esc(clipLabel(c))}</span>${wave}${kf}<i class="hd r"></i></div>`;
    }).join('');
    return `<div class="row${sm}" data-t="${t.id}">${cl}</div>`;
  }).join('');
  $$('#rows canvas').forEach(cn => {
    const c = S.p.clips.find(x => x.id === cn.parentNode.dataset.id), m = c && S.media.get(c.mediaId); if (!m || !m.peaks) return;
    const w = clamp(Math.round(c.dur * S.pps), 20, 1600), h = 40; cn.width = w; cn.height = h; const g = cn.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.8)';
    const a = c.in * PEAK_RATE, span = c.dur * c.speed * PEAK_RATE;
    for (let x = 0; x < w; x += 2) { const v = m.peaks[Math.floor(a + span * x / w)] || 0, bh = Math.max(1, v * h); g.fillRect(x, (h - bh) / 2, 1.3, bh); }
  });
  uiTime();
}
function select(id) {
  S.sel = id; renderTimeline(); renderInspector(); requestDraw();
  if (id && isMobile()) setTab('edit');
  if (document.body.dataset.tab === 'cap') renderPanel();
}
function snapT(t, c) {
  let best = null, bd = 8 / S.pps; const cand = [0, S.t];
  for (const o of S.p.clips) if (o !== c) cand.push(o.start, o.start + o.dur);
  for (const x of cand) { const d = Math.abs(x - t); if (d < bd) { bd = d; best = x; } }
  return best;
}
const xToT = x => Math.max(0, (x - rowsEl.getBoundingClientRect().left) / S.pps);
let drag = null;
scroller.addEventListener('pointerdown', e => {
  const tg = e.target;
  if (tg.closest('.ruler')) { drag = { mode: 'scrub' }; seek(xToT(e.clientX)); scroller.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  const cel = tg.closest('.clip');
  if (!cel) { if (S.sel) select(null); return; }
  const c = S.p.clips.find(x => x.id === cel.dataset.id); if (!c) return;
  if (tg.classList.contains('kfd')) { const k = c.kf[+tg.dataset.k]; S.sel = c.id; seek(c.start + (k ? k.t : 0)); select(c.id); return; }
  if (S.sel !== c.id) {
    S.sel = c.id; $$('.clip.sel').forEach(x => x.classList.remove('sel')); cel.classList.add('sel'); renderInspector(); requestDraw();
    if (document.body.dataset.tab === 'cap') renderPanel();
    if (e.pointerType === 'touch') { if (isMobile()) setTab('edit'); return; }
  }
  drag = { mode: tg.classList.contains('hd') ? (tg.classList.contains('l') ? 'tl' : 'tr') : 'move', c, cel, x0: e.clientX, s0: c.start, d0: c.dur, in0: c.in, kf0: clone(c.kf || []), moved: false };
  scroller.setPointerCapture(e.pointerId); e.preventDefault();
});
scroller.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.mode === 'scrub') { seek(xToT(e.clientX)); return; }
  const dx = e.clientX - drag.x0; if (!drag.moved && Math.abs(dx) < 4) return; drag.moved = true;
  const c = drag.c, dt = dx / S.pps, m = S.media.get(c.mediaId), timed = c.type === 'video' || c.type === 'audio';
  if (drag.mode === 'move') {
    let ns = Math.max(0, drag.s0 + dt); const s1 = snapT(ns, c), s2 = snapT(ns + c.dur, c);
    if (s1 !== null) ns = s1; else if (s2 !== null) ns = s2 - c.dur; c.start = Math.max(0, ns);
    const r = document.elementFromPoint(e.clientX, e.clientY), row = r && r.closest('.row');
    if (row && row.dataset.t !== c.trackId) { const tr = trackById(row.dataset.t); if (tr && ACCEPT[tr.type].includes(c.type)) { c.trackId = tr.id; row.appendChild(drag.cel); } }
  } else if (drag.mode === 'tl') {
    let ns = drag.s0 + dt; const sn = snapT(ns, c); if (sn !== null) ns = sn; const end = drag.s0 + drag.d0;
    ns = clamp(ns, timed ? Math.max(0, drag.s0 - drag.in0 / c.speed) : 0, end - 0.1);
    const d = ns - drag.s0; c.start = ns; c.dur = end - ns; if (timed) c.in = Math.max(0, drag.in0 + d * c.speed);
    c.kf = drag.kf0.map(k => Object.assign({}, k, { t: +(k.t - d).toFixed(3) })).filter(k => k.t >= 0);
  } else {
    let ne = drag.s0 + drag.d0 + dt; const sn = snapT(ne, c); if (sn !== null) ne = sn;
    c.dur = clamp(ne - c.start, 0.1, timed && m ? (m.duration - c.in) / c.speed : 36000);
  }
  drag.cel.style.left = c.start * S.pps + 'px'; drag.cel.style.width = c.dur * S.pps + 'px'; requestDraw();
});
const endDrag = () => {
  if (!drag) return; const d = drag; drag = null;
  if (d.mode === 'scrub') return;
  if (d.moved) { if (d.mode === 'move') placeFree(d.c); commit(); }
  else if (isMobile()) setTab('edit');
};
scroller.addEventListener('pointerup', endDrag); scroller.addEventListener('pointercancel', endDrag);

/* ===== canvas direct manipulation ===== */
let cdrag = null;
cv.addEventListener('pointerdown', e => {
  let c = selClip(); const vis = c => c && c.type !== 'audio' && c.type !== 'caption' && S.t >= c.start && S.t < c.start + c.dur;
  if (!vis(c)) {
    c = null;
    for (const tr of S.p.tracks) { if (tr.type === 'audio' || tr.type === 'caption' || tr.hidden) continue; c = S.p.clips.find(x => x.trackId === tr.id && vis(x)); if (c) break; }
    if (!c) return; S.sel = c.id; renderTimeline(); renderInspector(); requestDraw();
  }
  const p = propsAt(c, S.t - c.start); cdrag = { c, x0: e.clientX, y0: e.clientY, px: p.x, py: p.y, moved: false }; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (!cdrag) return; const r = cv.getBoundingClientRect(), dx = (e.clientX - cdrag.x0) / r.width, dy = (e.clientY - cdrag.y0) / r.height;
  if (!cdrag.moved && Math.abs(dx) + Math.abs(dy) < 0.008) return; cdrag.moved = true;
  let nx = cdrag.px + dx, ny = cdrag.py + dy; if (Math.abs(nx) < 0.012) nx = 0; if (Math.abs(ny) < 0.012) ny = 0;
  setProp(cdrag.c, 'x', +nx.toFixed(4)); setProp(cdrag.c, 'y', +ny.toFixed(4)); requestDraw();
});
const endC = () => { if (cdrag && cdrag.moved) commit(); cdrag = null; };
cv.addEventListener('pointerup', endC); cv.addEventListener('pointercancel', endC);

/* ===== inspector ===== */
const F = {
  rng: (label, p, min, max, step, val, mul = 1, unit = '') => `<label class="f"><span>${label}</span><input type="range" data-p="${p}" data-mul="${mul}" data-u="${unit}" min="${min}" max="${max}" step="${step}" value="${+(val * mul).toFixed(3)}"><output>${+(val * mul).toFixed(2)}${unit}</output></label>`,
  sel: (label, p, opts, val) => `<label class="f two"><span>${label}</span><select data-p="${p}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`,
  chk: (label, p, val) => `<label class="f two"><span>${label}</span><input type="checkbox" data-p="${p}"${val ? ' checked' : ''}></label>`,
  col: (label, p, val) => `<label class="f two"><span>${label}</span><input type="color" data-p="${p}" value="${val}"></label>`
};
const TRANS = [['none', 'ללא'], ['fade', 'דעיכה'], ['slide', 'החלקה'], ['zoom', 'זום']];
const FONTS = ['Rubik', 'Heebo', 'Assistant', 'Secular One', 'Frank Ruhl Libre', 'Cinzel'].map(f => [f, f]);
function motionHTML(c) {
  const p = propsAt(c, clamp(S.t - c.start, 0, c.dur)), has = c.kf && c.kf.length;
  return `<h4>תנועה וקי-פריימים</h4>
  <div class="chips"><button type="button" class="chip" data-a="kfZoomIn">זום פנימה איטי</button><button type="button" class="chip" data-a="kfZoomOut">זום החוצה איטי</button><button type="button" class="chip" data-a="kfPunch">זום קצר בסמן</button></div>
  ${F.rng('מיקום אופקי', 'x', -100, 100, 1, p.x, 100, '%')}${F.rng('מיקום אנכי', 'y', -100, 100, 1, p.y, 100, '%')}
  ${F.rng('גודל', 'scale', 10, 400, 1, p.scale, 100, '%')}${F.rng('סיבוב', 'rot', -180, 180, 1, p.rot, 1, '°')}${F.rng('אטימות', 'opacity', 0, 100, 1, p.opacity, 100, '%')}
  <div class="rowf"><button type="button" class="btn sm" data-a="kfAdd">קי-פריים בסמן</button><button type="button" class="btn sm" data-a="kfDel"${has ? '' : ' disabled'}>מחיקת קי-פריים</button><button type="button" class="btn sm" data-a="kfReset">איפוס</button></div>
  <p class="hint">${has ? 'יש בקליפ ' + c.kf.length + ' קי-פריימים. כל שינוי במיקום, בגודל, בסיבוב או באטימות נשמר כקי-פריים בסמן.' : 'בלי קי-פריימים הערכים קבועים לכל אורך הקליפ. אפשר גם לגרור את הקליפ ישירות על המסך.'}</p>`;
}
function renderInspector() {
  const c = selClip(), el = $('#insp'); let h = '';
  if (!c) {
    h = `<h4>הפרויקט</h4><div class="chips">${Object.keys(FORMATS).map(f => `<button type="button" class="chip${S.p.fmt === f ? ' on' : ''}" data-a="setFmt" data-v="${f}">${f}</button>`).join('')}</div>
    <p class="hint">16:9 ליוטיוב ולינקדאין רוחבי. 9:16 לרילס, טיקטוק ושורטס. 1:1 ו-4:5 לפיד.</p>
    ${`<label class="f two"><span>אזור בטוח</span><input type="checkbox" id="safeChk"${S.safe ? ' checked' : ''}></label>`}
    <div class="col"><button type="button" class="btn sm" data-a="frame">שמירת הפריים הנוכחי כתמונה</button><button type="button" class="btn sm" data-a="newProj">פרויקט חדש</button></div>
    <h4>קיצורי מקלדת</h4><div class="keys"><span>ניגון ועצירה</span><kbd>רווח</kbd><span>פיצול בסמן</span><kbd>S</kbd><span>מחיקה</span><kbd>Delete</kbd><span>שכפול</span><kbd>Ctrl+D</kbd><span>ביטול ושחזור</span><kbd>Ctrl+Z / Y</kbd><span>פריים אחורה וקדימה</span><kbd>← →</kbd></div>
    <p class="hint">בחרי קליפ בציר הזמן כדי לערוך אותו כאן.</p>`;
  } else if (c.type === 'caption') {
    h = `<h4>כתובית</h4><textarea data-p="text" rows="3">${esc(c.text)}</textarea>
    <p class="hint">מתחילה ב-${fmtTC(c.start)} ונמשכת ${c.dur.toFixed(2)} שניות. גוררים את הקצוות בציר הזמן כדי לדייק תזמון. העיצוב נקבע בלשונית כתוביות.</p>`;
  } else if (c.type === 'text') {
    h = `<h4>טקסט</h4><textarea data-p="text" rows="3">${esc(c.text)}</textarea>
    ${F.sel('גופן', 'font', FONTS, c.font)}${F.rng('גודל', 'size', 20, 320, 1, c.size)}
    ${F.sel('משקל', 'weight', [[400, 'רגיל'], [500, 'בינוני'], [700, 'מודגש'], [800, 'כבד']], c.weight)}
    ${F.sel('יישור', 'align', [['center', 'מרכז'], ['right', 'ימין'], ['left', 'שמאל']], c.align)}
    ${F.col('צבע', 'color', c.color)}
    <div class="sw">${Object.values(BRAND).map(v => `<button type="button" data-a="swatch" data-v="${v}" style="background:${v}" aria-label="צבע מותג ${v}"></button>`).join('')}</div>
    ${F.chk('רקע', 'bgOn', c.bgOn)}${c.bgOn ? F.col('צבע רקע', 'bg', c.bg) : ''}${F.chk('קו מתאר', 'stroke', c.stroke)}${F.chk('צל', 'shadow', c.shadow)}
    ${F.sel('אנימציה', 'anim', [['none', 'ללא'], ['fade', 'דעיכה'], ['pop', 'קפיצה'], ['slide', 'עלייה'], ['type', 'הקלדה']], c.anim)}
    ${motionHTML(c)}`;
  } else if (c.type === 'audio') {
    h = `<h4>אודיו</h4>${F.rng('עוצמה', 'volume', 0, 200, 1, c.volume, 100, '%')}${F.chk('השתקה', 'mute', c.mute)}
    ${F.rng('כניסה הדרגתית', 'fadeIn', 0, 5, 0.1, c.fadeIn, 1, 's')}${F.rng('יציאה הדרגתית', 'fadeOut', 0, 5, 0.1, c.fadeOut, 1, 's')}${F.rng('מהירות', 'speed', 0.25, 3, 0.05, c.speed, 1, '×')}`;
  } else {
    const vid = c.type === 'video';
    h = `<h4>${esc(clipLabel(c))}</h4>` + (c.type === 'solid' ? F.col('צבע', 'color', c.color) + F.chk('מעבר צבע', 'grad', c.grad) : '') + motionHTML(c) +
      (c.type !== 'solid' ? `<h4>התאמה למסך</h4>${F.sel('אופן', 'fit', [['cover', 'מילוי המסך'], ['contain', 'כל התמונה']], c.fit)}${c.fit === 'contain' ? F.chk('רקע מטושטש', 'blurBg', c.blurBg) : ''}` : '') +
      (vid ? `<h4>אודיו ומהירות</h4>${F.rng('עוצמה', 'volume', 0, 200, 1, c.volume, 100, '%')}${F.chk('השתקה', 'mute', c.mute)}${F.rng('כניסה הדרגתית', 'fadeIn', 0, 5, 0.1, c.fadeIn, 1, 's')}${F.rng('יציאה הדרגתית', 'fadeOut', 0, 5, 0.1, c.fadeOut, 1, 's')}${F.rng('מהירות', 'speed', 0.25, 3, 0.05, c.speed, 1, '×')}` : '') +
      (c.type !== 'solid' ? `<h4>מראה</h4><div class="chips">${Object.entries(LOOKS).map(([k, v]) => `<button type="button" class="chip${c.look === k ? ' on' : ''}" data-a="look" data-v="${k}">${v[0]}</button>`).join('')}</div>
      ${F.rng('בהירות', 'bri', 50, 150, 1, c.bri, 1, '%')}${F.rng('ניגודיות', 'con', 50, 150, 1, c.con, 1, '%')}${F.rng('רוויה', 'sat', 0, 200, 1, c.sat, 1, '%')}` : '') +
      `<h4>מעברים</h4>${F.sel('כניסה', 'tin', TRANS, c.tin)}${F.sel('יציאה', 'tout', TRANS, c.tout)}`;
  }
  el.innerHTML = h;
}
$('#insp').addEventListener('input', e => {
  const el = e.target; if (el.id === 'safeChk') { S.safe = el.checked; requestDraw(); return; }
  const p = el.dataset.p, c = selClip(); if (!p || !c) return;
  let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value / (+el.dataset.mul || 1) : el.value;
  if (p === 'weight') v = +v;
  if (el.type === 'range') el.parentNode.querySelector('output').textContent = el.value + (el.dataset.u || '');
  if (p === 'speed') { c.dur = c.dur * c.speed / v; c.speed = v; } else setProp(c, p, v);
  requestDraw();
});
$('#insp').addEventListener('change', e => { if (e.target.dataset.p && selClip()) commit(); });

/* ===== library panels ===== */
function setTab(t) { document.body.dataset.tab = t; renderPanel(); }
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
let AI = null, DL = null, aiOut = '', aiBusy = false, aiHooks = [];
const TEXT_PRESETS = {
  title: ['כותרת ראשית', { text: 'כותרת ראשית', size: 110, y: -0.04 }],
  sub: ['כותרת משנה', { text: 'כותרת משנה שמסבירה את הרעיון', size: 58, weight: 500, y: 0.12, anim: 'fade' }],
  hook: ['הוק פתיחה', { text: 'הטעות שעולה לכם כסף', size: 124, color: BRAND.gold, stroke: true, y: -0.18 }],
  lower: ['שליש תחתון', { text: 'שם מלא\nתפקיד', size: 50, weight: 700, bgOn: true, bg: BRAND.blue, align: 'right', x: 0.24, y: 0.33, anim: 'slide' }],
  cta: ['קריאה לפעולה', { text: 'הצטרפו לקהילה', size: 66, bgOn: true, bg: BRAND.gold, color: '#1B1400', y: 0.3, shadow: false }],
  num: ['מספר גדול', { text: '+2,000', size: 230, font: 'Secular One', color: BRAND.gold, y: -0.02 }]
};
const CAP_STYLES = [['box', 'קופסה כהה'], ['clean', 'נקי עם קו מתאר'], ['brand', 'כחול מותג'], ['karaoke', 'הדגשת מילה'], ['pop', 'מילה אחת גדולה']];
const PANELS = {
  media() {
    const items = [...S.media.values()].map(m => `<div class="mi"><div class="th" style="${m.thumb ? `background-image:url('${m.thumb}')` : ''}">${m.thumb ? '' : 'שמע'}</div>
      <div class="nm"><b>${esc(m.name)}</b><small>${m.kind === 'image' ? 'תמונה' : fmtT(m.duration)}${m.w ? ' · ' + m.w + '×' + m.h : ''}</small></div>
      <button type="button" class="btn sm" data-a="addMedia" data-v="${m.id}">הוספה</button>${m.builtin ? '' : `<button type="button" class="x" data-a="delMedia" data-v="${m.id}" aria-label="מחיקה">✕</button>`}</div>`).join('');
    return `<label class="drop" for="fileIn" data-a="autoUp"><b>העלאת סרטון</b><span class="hint">מעלים סרטון, והעורך מלביש עליו סרטון שיווקי לבד: כותרת פתיחה, נקודות מפתח, לוגו וסיומת. הצילום עצמו לא נחתך. הקובץ נשאר במכשיר. כדי להבין את התוכן, הקול עובר לזיהוי הדיבור של הדפדפן ותמונות עצירה נשלחות לקלוד.</span></label><label class="btn sm wide" for="fileIn" data-a="addOnly" style="display:block;text-align:center;cursor:pointer;margin-top:8px">הוספת קובץ לסרטון הנוכחי, בלי עריכה</label><button type="button" class="btn wide gold" data-a="autoEdit" style="margin-top:8px"${S.p.clips.some(c => c.type === 'video') ? '' : ' disabled'}>עריכה אוטומטית מחדש</button><div class="col" style="margin-top:10px">${items}</div>`;
  },
  text() {
    return `<h4>הוספת טקסט בסמן</h4><div class="col">${Object.entries(TEXT_PRESETS).map(([k, v]) => `<button type="button" class="btn" data-a="addPreset" data-v="${k}">${v[0]}</button>`).join('')}</div>
    <p class="hint">אחרי ההוספה עורכים את התוכן, הגופן, הצבע והאנימציה בחלונית העריכה.</p>`;
  },
  cap() {
    const cs = S.p.cap, cues = S.p.clips.filter(c => c.type === 'caption').sort((a, b) => a.start - b.start);
    return `<h4>סגנון</h4><div class="chips">${CAP_STYLES.map(([k, t]) => `<button type="button" class="chip${cs.style === k ? ' on' : ''}" data-a="capStyle" data-v="${k}">${t}</button>`).join('')}</div>
    <label class="f"><span>גודל</span><input type="range" id="capSize" min="30" max="120" value="${cs.size}"><output>${cs.size}</output></label>
    <label class="f two"><span>מיקום</span><select id="capPos"><option value="bottom"${cs.pos === 'bottom' ? ' selected' : ''}>למטה</option><option value="mid"${cs.pos === 'mid' ? ' selected' : ''}>באמצע</option><option value="top"${cs.pos === 'top' ? ' selected' : ''}>למעלה</option></select></label>
    <label class="f two"><span>גופן</span><select id="capFont">${FONTS.map(([f]) => `<option${cs.font === f ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
    <h4>מתסריט לכתוביות</h4><textarea id="capScript" rows="4" placeholder="הדביקי כאן את הטקסט שנאמר בסרטון"></textarea>
    <label class="f"><span>מילים בכתובית</span><input type="range" id="capWords" min="1" max="10" value="4"><output>4</output></label>
    <button type="button" class="btn wide gold" data-a="capSpread">פיזור הכתוביות על הסרטון</button>
    <p class="hint">הפיזור מחלק את הטקסט לפי אורך המילים על פני הקליפ הנבחר או הסרטון כולו. זה תזמון משוער, ומדייקים אותו בגרירה בציר הזמן.</p>
    <div class="rowf"><button type="button" class="btn sm" data-a="capAdd">כתובית בסמן</button><button type="button" class="btn sm" data-a="srtIn">ייבוא SRT</button><button type="button" class="btn sm" data-a="srtOut"${cues.length ? '' : ' disabled'}>ייצוא SRT</button></div>
    <h4>כתוביות בסרטון (${cues.length})</h4><div class="col">${cues.map(c => `<button type="button" class="cue${c.id === S.sel ? ' on' : ''}" data-a="cue" data-v="${c.id}"><small>${fmtT(c.start)}</small><span>${esc(c.text)}</span></button>`).join('') || '<p class="hint">עדיין אין כתוביות.</p>'}</div>`;
  },
  brand() {
    const b = S.brand, lg = S.media.get('logoMark') || S.media.get('logo') || {};
    return `<h4>ערכת המותג</h4>
    <div class="mi"><div class="th" style="background-image:url('${lg.thumb || ''}');background-size:contain;background-color:${esc(b.color)}"></div><div class="nm"><b>${b.custom ? 'הלוגו שלך' : 'לוגו AI Finance'}</b><small>מופיע בתג הפינה, בפתיח ובסיומת</small></div></div>
    <div class="rowf" style="margin-top:6px"><label class="btn sm" for="logoIn" style="text-align:center;cursor:pointer">החלפת לוגו</label>${b.custom ? '<button type="button" class="btn sm" data-a="brReset">חזרה ל-AI Finance</button>' : ''}</div>
    <p class="hint">הכי טוב קובץ PNG עם רקע שקוף. הלוגו נשמר במכשיר הזה.</p>
    <label class="f two"><span>שם המותג</span><input class="in" id="brName" maxlength="40" value="${esc(b.name)}"></label>
    <label class="f two"><span>סלוגן</span><textarea id="brTag" rows="2" maxlength="90">${esc(b.tagline)}</textarea></label>
    <label class="f two"><span>קריאה לפעולה</span><input class="in" id="brCta" maxlength="30" value="${esc(b.cta)}"></label>
    <label class="f two"><span>צבע רקע</span><input type="color" id="brColor" value="${esc(b.color)}"></label>
    <label class="f two"><span>על המותג</span><textarea id="brAbout" rows="2" maxlength="300" placeholder="למי פונים ומה המסר. קלוד משתמש בזה כשהוא כותב">${esc(b.about)}</textarea></label>
    <h4>הוספה לסרטון</h4><div class="col">
      <button type="button" class="btn" data-a="brIntro">פתיח עם הלוגו</button>
      <button type="button" class="btn" data-a="brOutro">סיומת עם הלוגו וקריאה לפעולה</button>
      <button type="button" class="btn" data-a="brBug">תג לוגו בפינה לכל אורך הסרטון</button></div>
    <h4>רכיבים ממותגים</h4><div class="col">
      <button type="button" class="btn" data-a="brCard">שקף רקע כחול מותג</button>
      <button type="button" class="btn" data-a="addPreset" data-v="lower">שליש תחתון כחול</button>
      <button type="button" class="btn" data-a="addPreset" data-v="cta">כפתור קריאה לפעולה</button></div>
    <h4>צבעי המותג</h4><div class="sw">${Object.values(BRAND).map(v => `<button type="button" data-a="swatch" data-v="${v}" style="background:${v}" aria-label="${v}"></button>`).join('')}</div>
    <p class="hint">לחיצה על צבע צובעת את הטקסט הנבחר.</p>`;
  }
};
var renderPanel = function () {
  const tab = document.body.dataset.tab; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const keep = $('#capScript') ? $('#capScript').value : '', keepAi = $('#aiTopic') ? $('#aiTopic').value : '';
  $('#panel').innerHTML = (PANELS[tab] || PANELS.media)();
  if ($('#capScript')) $('#capScript').value = keep; if ($('#aiTopic')) $('#aiTopic').value = keepAi;
};
$('#panel').addEventListener('input', e => {
  const el = e.target;
  if (el.type === 'range') el.parentNode.querySelector('output').textContent = el.value;
  if (el.id === 'capSize') { S.p.cap.size = +el.value; requestDraw(); }
  if (el.id === 'capPos') { S.p.cap.pos = el.value; requestDraw(); }
  if (el.id === 'capFont') { S.p.cap.font = el.value; document.fonts && document.fonts.load('800 40px "' + el.value + '"').then(requestDraw); requestDraw(); }
});
$('#panel').addEventListener('change', e => { if (['capSize', 'capPos', 'capFont'].includes(e.target.id)) commit(); });
// brand kit fields
const BR_FIELDS = { brName: 'name', brTag: 'tagline', brCta: 'cta', brColor: 'color', brAbout: 'about' };
$('#panel').addEventListener('input', e => { const k = BR_FIELDS[e.target.id]; if (!k) return; S.brand[k] = e.target.value; relayBrand(); requestDraw(); });
$('#panel').addEventListener('change', e => { if (!BR_FIELDS[e.target.id]) return; if (!String(S.brand.name).trim()) S.brand.name = BRAND0.name; saveBrand(); commit(); });
$('#logoIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp|svg)$/i.test(f.name)) return toast('צריך קובץ תמונה: PNG, JPG או SVG');
  if (!(await applyCustomLogo(f))) return toast('לא הצלחתי לקרוא את התמונה');
  DB.putKV('brandLogo', f); saveBrand(); commit(); renderPanel(); toast('הלוגו הוחלף בכל הסרטון');
});

/* ===== clip creation ===== */
function addClip(c, at) {
  if (at === 'end') c.start = trackEnd(c.trackId); else if (at != null) c.start = at;
  S.p.clips.push(c); placeFree(c); S.sel = c.id; return c;
}
function addMedia(m) {
  const audio = m.kind === 'audio', tr = firstTrack(audio ? 'audio' : 'video', !audio);
  if (m.kind === 'video' && !S.p.clips.some(c => c.type === 'video')) {
    const f = m.h > m.w * 1.2 ? '9:16' : m.w > m.h * 1.2 ? '16:9' : null;
    if (f && f !== S.p.fmt) { setFmt(f, true); toast('הפורמט הותאם לסרטון: ' + f); }
  }
  const cut = m.id === 'logoMark' || m.id === 'logoFull';
  const c = addClip(mkClip(Object.assign({ type: m.kind, mediaId: m.id, trackId: tr.id, dur: m.kind === 'image' ? 4 : m.duration }, cut ? { fit: 'contain', scale: 0.8 } : {})), 'end');
  commit(); seek(c.start); if (isMobile()) setTab('edit');
}
function addText(o) { const tr = firstTrack('text'); const c = addClip(mkText(Object.assign({ trackId: tr.id }, o)), S.t); commit(); return c; }
function setFmt(f, silent) {
  S.p.fmt = f; S.p.w = FORMATS[f][0]; S.p.h = FORMATS[f][1];
  // brand cards and the corner tag are laid out per format, so they follow a format change
  relayBrand();
  setCanvas(); if (!silent) commit();
}
function demoProject() {
  const p = newProject(); S.p = p;
  p.name = 'סרטון פתיחה AI Finance';
  p.clips.push(mkClip({ type: 'image', mediaId: 'logo', trackId: 'v1', start: 0, dur: 4, kf: [{ t: 0, x: 0, y: 0, scale: 1, rot: 0, opacity: 1 }, { t: 4, x: 0, y: 0, scale: 1.12, rot: 0, opacity: 1 }], tout: 'fade' }));
  p.clips.push(mkClip({ type: 'solid', trackId: 'v1', start: 4, dur: 5, color: BRAND.deep, grad: true, tin: 'fade' }));
  p.clips.push(mkText({ trackId: 'txt', start: 4.3, dur: 4.5, text: 'מגשרים בין עולם הכספים\nלעולם הבינה המלאכותית', size: 88, y: -0.06 }));
  [[0.3, 1.8, 'ברוכים הבאים לסטודיו'], [2.1, 1.8, 'כאן עורכים סרטונים ורילסים'], [4.4, 2.1, 'חיתוך, כתוביות ומיתוג'], [6.5, 2.3, 'הכול במקום אחד']].forEach(([s, d, t]) => p.clips.push(mkClip({ type: 'caption', trackId: 'cap', start: s, dur: d, text: t })));
  return p;
}

/* ===== captions / srt ===== */
function capTrack() { return firstTrack('caption'); }
function spreadCaptions() {
  const txt = ($('#capScript').value || '').trim(); if (!txt) return toast('קודם מדביקים טקסט בתיבה');
  const n = clamp(+$('#capWords').value || 4, 1, 10), sel = selClip(); let a = 0, b = projDur();
  if (sel && (sel.type === 'video' || sel.type === 'audio')) { a = sel.start; b = sel.start + sel.dur; }
  const chunks = chunkText(txt, n);
  if (!chunks.length) return;
  const tid = capTrack().id, total = chunks.reduce((s, c) => s + c.length + 2, 0);
  S.p.clips = S.p.clips.filter(c => !(c.type === 'caption' && c.start < b && c.start + c.dur > a));
  let pos = a; chunks.forEach(ch => { const d = (b - a) * (ch.length + 2) / total; S.p.clips.push(mkClip({ type: 'caption', trackId: tid, start: +pos.toFixed(3), dur: +d.toFixed(3), text: ch })); pos += d; });
  S.sel = null; commit(); renderPanel(); toast('נוספו ' + chunks.length + ' כתוביות. מדייקים תזמון בגרירה.');
}
function parseSrt(s) {
  const out = [], re = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;
  s.replace(/\r/g, '').split(/\n\n+/).forEach(b => {
    const lines = b.split('\n'), i = lines.findIndex(l => re.test(l)); if (i < 0) return; const m = lines[i].match(re);
    const a = +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]), e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +('0.' + m[8]);
    const text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim(); if (text && e > a) out.push({ a, e, text });
  });
  return out;
}
const srtTime = t => { const ms = Math.round(t * 1000), p = (n, l = 2) => String(n).padStart(l, '0'); return p(Math.floor(ms / 3600000)) + ':' + p(Math.floor(ms / 60000) % 60) + ':' + p(Math.floor(ms / 1000) % 60) + ',' + p(ms % 1000, 3); };
$('#srtIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const cues = parseSrt(await f.text()); if (!cues.length) return toast('לא נמצאו כתוביות בקובץ');
  const tid = capTrack().id; S.p.clips = S.p.clips.filter(c => c.type !== 'caption');
  cues.forEach(q => S.p.clips.push(mkClip({ type: 'caption', trackId: tid, start: q.a, dur: q.e - q.a, text: q.text })));
  commit(); renderPanel(); toast('יובאו ' + cues.length + ' כתוביות');
});

/* ===== saving files ===== */
async function saveBlob(data, filename) {
  if (DL) {
    try { await DL.save({ filename, data }); toast('הקובץ נשמר'); }
    catch (e) { if (e && e.code === 'declined') return; toast(e && e.code === 'too_large' ? 'הקובץ גדול מדי לשמירה כאן. נסי איכות 720.' : 'השמירה לא הצליחה. נסי שוב.'); }
    return;
  }
  try { const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  catch (e) { toast('השמירה לא זמינה בתצוגה הזאת'); }
}
const safeName = () => (S.p.name || 'video').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'video';

/* ===== modal + export ===== */
function modal(html) { $('#mbox').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { const v = $('#mbox video'); if (v) { v.pause(); URL.revokeObjectURL(v.src); } $('#modal').hidden = true; $('#mbox').innerHTML = ''; }
let expQ = '1080';
function openExport() {
  pause(); const mime = pickMime(), d = projDur();
  modal(`<h3>ייצוא הסרטון</h3><p class="hint">אורך ${fmtT(d)} · ${S.p.fmt} · קובץ ${mime.includes('mp4') ? 'MP4' : mime ? 'WebM' : 'לא נתמך'}</p>
  <div class="chips" id="qChips"><button type="button" class="chip${expQ === '1080' ? ' on' : ''}" data-a="expQ" data-v="1080">איכות מלאה 1080</button><button type="button" class="chip${expQ === '720' ? ' on' : ''}" data-a="expQ" data-v="720">קל יותר 720</button></div>
  <p class="hint">הייצוא רץ בזמן אמת, כלומר דקה של סרטון לוקחת בערך דקה. חשוב להשאיר את המסך הזה פתוח וגלוי עד הסוף.</p>
  <div class="rowf"><button type="button" class="btn primary" data-a="expGo"${mime ? '' : ' disabled'}>התחלת ייצוא</button><button type="button" class="btn" data-a="closeModal">ביטול</button></div>`);
}
function exportDone() {
  const b = EXP.blob, ext = EXP.mime.includes('mp4') ? 'mp4' : 'webm';
  if (!b || !b.size) { modal(`<h3>הייצוא לא הצליח</h3><p class="hint">לא נוצר קובץ. כדאי לנסות שוב בכרום במחשב.</p><button type="button" class="btn" data-a="closeModal">סגירה</button>`); return; }
  modal(`<h3>הסרטון מוכן</h3><video controls playsinline src="${URL.createObjectURL(b)}"></video><p class="hint">${(b.size / 1048576).toFixed(1)} MB · ${ext.toUpperCase()}</p>
  <div class="rowf"><button type="button" class="btn primary" data-a="expSave" data-v="${ext}">שמירת הקובץ</button><button type="button" class="btn" data-a="closeModal">סגירה</button></div>`);
  seek(0);
}

/* ===== AI helper ===== */
function aiContext() {
  const t = ($('#aiTopic') ? $('#aiTopic').value : '').trim(); if (t) return t;
  return S.p.clips.filter(c => c.type === 'caption' || c.type === 'text').sort((a, b) => a.start - b.start).map(c => c.text).join(' ');
}
async function aiRun(prompt, onDone) {
  if (!AI || aiBusy) return; aiBusy = true; renderPanel();
  try { const r = await AI(prompt, { modelTier: 'default' }); onDone((r && r.text || '').trim()); }
  catch (e) { toast(e && e.code === 'rate_limited' ? 'יותר מדי בקשות. נסי שוב בעוד רגע.' : 'העוזר לא זמין כרגע'); if (e && e.code === 'not_granted') AI = null; }
  aiBusy = false; renderPanel();
}

function addBug() {
  let tr = S.p.tracks.find(t => t.type === 'video' && t.name === 'לוגו');
  if (!tr) { tr = { id: uid(), type: 'video', name: 'לוגו' }; const i = S.p.tracks.findIndex(t => t.type === 'video'); S.p.tracks.splice(i < 0 ? 0 : i, 0, tr); }
  S.p.clips = S.p.clips.filter(c => c.trackId !== tr.id);
  S.p.clips.push(logoBug(tr.id, projDur()));
}
function addOutro() {
  const tid = firstTrack('video', true).id, at = Math.max(trackEnd(tid), S.p.clips.length ? projDur() : 0), d = 4, tx = firstTrack('text').id;
  S.p.clips.push(brandCard({ trackId: tid, start: at, dur: d, tin: 'fade' }));
  pushTag({ trackId: tx, start: at + 0.4, dur: d - 0.4 });
  let t2 = S.p.tracks.find(t => t.type === 'text' && t.id !== tx);
  if (!t2) { t2 = { id: uid(), type: 'text', name: 'טקסט 2' }; S.p.tracks.splice(S.p.tracks.findIndex(t => t.id === tx), 0, t2); }
  S.p.clips.push(mkText({ brand: 'cta', autoCta: true, trackId: t2.id, start: at + 0.8, dur: d - 0.8, text: S.brand.cta || BRAND0.cta, size: isWide() ? 50 : 60, bgOn: true, bg: BRAND.gold, color: '#1B1400', y: isWide() ? 0.41 : S.p.fmt === '1:1' ? 0.34 : 0.3, shadow: false, anim: 'slide' }));
  return at;
}

/* ===== actions ===== */
const ACT = {
  play() { S.playing ? pause() : play(); }, toStart() { seek(0); }, toEnd() { seek(projDur()); },
  back() { pause(); seek(S.t - 1 / S.p.fps); }, fwd() { pause(); seek(S.t + 1 / S.p.fps); },
  undo() { restore(-1); }, redo() { restore(1); },
  upload() { $('#fileIn').click(); },
  addOnly() { addOnly = true; },
  autoUp() { addOnly = false; },
  addMedia(v) { const m = S.media.get(v); if (m) addMedia(m); },
  delMedia(v) { const m = S.media.get(v); if (!m) return; S.p.clips = S.p.clips.filter(c => c.mediaId !== v); S.media.delete(v); DB.delMedia(v); try { URL.revokeObjectURL(m.url); } catch (e) { } commit(); renderPanel(); },
  split() {
    const t = S.t; let n = 0;
    for (const c of [...S.p.clips]) {
      const cut = t - c.start; if (cut < 0.05 || cut > c.dur - 0.05) continue; n++;
      const r = clone(c), od = c.dur; r.id = uid(); r.start = t; r.dur = c.dur - cut;
      if (c.type === 'video' || c.type === 'audio') r.in = c.in + cut * c.speed;
      if (c.kf && c.kf.length) { const v = Object.assign({}, propsAt(c, cut)); r.kf = [Object.assign({}, v, { t: 0 })].concat(c.kf.filter(k => k.t > cut).map(k => Object.assign({}, k, { t: +(k.t - cut).toFixed(3) }))); c.kf = c.kf.filter(k => k.t < cut).concat([Object.assign({}, v, { t: +cut.toFixed(3) })]); }
      if (c.type === 'caption') { const w = c.text.trim().split(/\s+/); if (w.length > 1) { const k = clamp(Math.round(w.length * cut / od), 1, w.length - 1); c.text = w.slice(0, k).join(' '); r.text = w.slice(k).join(' '); } }
      c.dur = cut; c.fadeOut = 0; r.fadeIn = 0; c.tout = 'none'; r.tin = 'none'; S.p.clips.push(r);
    }
    n ? commit() : toast('הסמן לא נמצא על קליפ');
  },
  del() { if (!S.sel) return toast('בחרי קליפ למחיקה'); S.p.clips = S.p.clips.filter(c => c.id !== S.sel); S.sel = null; commit(); if (document.body.dataset.tab === 'cap') renderPanel(); },
  dup() { const c = selClip(); if (!c) return toast('בחרי קליפ לשכפול'); const d = clone(c); d.id = uid(); d.start = c.start + c.dur; S.p.clips.push(d); placeFree(d); S.sel = d.id; commit(); },
  gaps() {
    const c = selClip(), tid = c ? c.trackId : firstTrack('video', true).id; let pos = 0;
    S.p.clips.filter(x => x.trackId === tid).sort((a, b) => a.start - b.start).forEach(x => { x.start = +pos.toFixed(3); pos += x.dur; });
    commit(); toast('הרווחים בערוץ נסגרו');
  },
  addText() { addText({}); if (isMobile()) setTab('edit'); },
  addPreset(v) { const pr = TEXT_PRESETS[v]; if (pr) { addText(clone(pr[1])); if (isMobile()) setTab('edit'); } },
  trkVideo() { const n = S.p.tracks.filter(t => t.type === 'video').length + 1, i = S.p.tracks.findIndex(t => t.type === 'video'); S.p.tracks.splice(i < 0 ? 0 : i, 0, { id: uid(), type: 'video', name: 'וידאו ' + n }); commit(); },
  trkAudio() { const n = S.p.tracks.filter(t => t.type === 'audio').length + 1; S.p.tracks.push({ id: uid(), type: 'audio', name: 'אודיו ' + n }); commit(); },
  trkMute(v, el) { const t = trackById(el.closest('.th').dataset.t); t.muted = !t.muted; commit(); },
  trkHide(v, el) { const t = trackById(el.closest('.th').dataset.t); t.hidden = !t.hidden; commit(); },
  trkDel(v, el) { const id = el.closest('.th').dataset.t; S.p.tracks = S.p.tracks.filter(t => t.id !== id); S.p.clips = S.p.clips.filter(c => c.trackId !== id); if (!selClip()) S.sel = null; commit(); },
  fit() { setZoom((scroller.clientWidth - 40) / projDur(), 0, 0); },
  setFmt(v) { setFmt(v); },
  look(v) { const c = selClip(); if (c) { c.look = v; commit(); } },
  swatch(v) { const c = selClip(); if (c && c.type === 'text') { c.color = v; commit(); } else if (c && c.type === 'solid') { c.color = v; commit(); } else toast('בחרי טקסט כדי לצבוע אותו'); },
  kfAdd() { const c = selClip(); if (!c) return; kfAt(c, clamp(S.t - c.start, 0, c.dur), true); commit(); },
  kfDel() { const c = selClip(); if (!c || !c.kf.length) return; const l = S.t - c.start; let bi = 0; c.kf.forEach((k, i) => { if (Math.abs(k.t - l) < Math.abs(c.kf[bi].t - l)) bi = i; }); c.kf.splice(bi, 1); commit(); },
  kfReset() { const c = selClip(); if (!c) return; c.kf = []; c.x = c.y = c.rot = 0; c.scale = c.opacity = 1; commit(); },
  kfZoomIn() { const c = selClip(); if (!c) return; const b = { x: c.x, y: c.y, rot: c.rot, opacity: 1 }; c.kf = [Object.assign({ t: 0, scale: 1 }, b), Object.assign({ t: +c.dur.toFixed(3), scale: 1.18 }, b)]; commit(); },
  kfZoomOut() { const c = selClip(); if (!c) return; const b = { x: c.x, y: c.y, rot: c.rot, opacity: 1 }; c.kf = [Object.assign({ t: 0, scale: 1.18 }, b), Object.assign({ t: +c.dur.toFixed(3), scale: 1 }, b)]; commit(); },
  kfPunch() {
    const c = selClip(); if (!c) return; const l = clamp(S.t - c.start, 0, Math.max(0, c.dur - 0.3)), base = Object.assign({}, propsAt(c, l));
    const mk = (t, s) => { const k = kfAt(c, Math.min(c.dur, t), true); k.scale = s; };
    mk(l, base.scale); mk(l + 0.25, base.scale * 1.25); mk(l + 1.2, base.scale * 1.25); mk(l + 1.45, base.scale); commit();
  },
  capStyle(v) { S.p.cap.style = v; commit(); renderPanel(); },
  capSpread() { spreadCaptions(); },
  capAdd() { const c = addClip(mkClip({ type: 'caption', trackId: capTrack().id, dur: 2, text: 'כתובית חדשה' }), S.t); commit(); renderPanel(); if (isMobile()) setTab('edit'); return c; },
  srtIn() { $('#srtIn').click(); },
  srtOut() { const cues = S.p.clips.filter(c => c.type === 'caption').sort((a, b) => a.start - b.start); saveBlob(cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.start + c.dur)}\n${c.text}\n`).join('\n'), safeName() + '.txt'); },
  cue(v) { const c = S.p.clips.find(x => x.id === v); if (c) { seek(c.start + 0.01); S.sel = v; renderTimeline(); renderInspector(); renderPanel(); } },
  brIntro() {
    const tid = firstTrack('video', true).id, d = 3; S.p.clips.forEach(c => { c.start += d; });
    S.p.clips.push(brandCard({ trackId: tid, start: 0, dur: d, tin: 'fade', tout: 'fade' }));
    pushTag({ trackId: firstTrack('text').id, start: 0.5, dur: d - 0.5 });
    commit(); seek(1.5); toast('נוסף פתיח של 3 שניות עם הלוגו והסלוגן. שאר הקליפים זזו קדימה.');
  },
  brOutro() { const at = addOutro(); commit(); seek(at + 2); },
  brBug() { addBug(); commit(); toast('תג הלוגו נוסף בפינה. אפשר לגרור אותו על המסך.'); },
  brReset() { resetLogo(); const keep = S.brand.custom; S.brand = Object.assign({}, BRAND0); DB.putKV('brandLogo', null); saveBrand(); relayBrand(); commit(); renderPanel(); toast('חזרנו למותג AI Finance'); },
  brCard() { const c = addClip(mkClip({ type: 'solid', trackId: firstTrack('video', true).id, dur: 4, color: BRAND.deep, grad: true }), 'end'); commit(); seek(c.start); },
  frame() { pause(); S.exporting = true; draw(); S.exporting = false; cv.toBlob(b => { requestDraw(); if (b) saveBlob(b, safeName() + '.png'); }, 'image/png'); },
  newProj() { modal(`<h3>פרויקט חדש</h3><p class="hint">ציר הזמן הנוכחי יימחק. הקבצים שהעלית נשארים בלשונית מדיה.</p><div class="rowf"><button type="button" class="btn primary" data-a="newProjGo">פתיחת פרויקט ריק</button><button type="button" class="btn" data-a="closeModal">ביטול</button></div>`); },
  newProjGo() { closeModal(); S.p = newProject(); S.sel = null; setCanvas(); seek(0); commit(); renderPanel(); },
  export() { openExport(); }, closeModal() { closeModal(); },
  expQ(v) { expQ = v; $$('#qChips .chip').forEach(b => b.classList.toggle('on', b.dataset.v === v)); },
  async expGo() {
    S.sel = null; renderTimeline(); renderInspector();
    modal(`<h3>מייצא...</h3><div class="bar"><i id="expBar"></i></div><p class="hint">הסרטון מתנגן ומוקלט עכשיו. לא לסגור ולא לעבור לשונית.</p><button type="button" class="btn" data-a="expCancel">עצירה</button>`);
    try { await startExport(expQ); } catch (e) { S.exporting = false; setCanvas(); modal(`<h3>הייצוא לא התחיל</h3><p class="hint">${esc(e.message || 'שגיאה')}</p><button type="button" class="btn" data-a="closeModal">סגירה</button>`); }
  },
  expCancel() { cancelExport(); closeModal(); },
  expSave(v) { if (EXP.blob) saveBlob(EXP.blob, safeName() + '.' + v); },
  aiHook() {
    const ctxt = aiContext(); if (!ctxt) return toast('כתבי על מה הסרטון, או הוסיפי כתוביות');
    aiRun('את/ה כותב/ת הוקים לסרטוני רשתות חברתיות לקהל של אנשי כספים בישראל (סמנכ"לי כספים, חשבים, רואי חשבון). כתוב/י שלוש הצעות להוק פתיחה בעברית לסרטון שתוכנו מופיע למטה. כל הוק עד 7 מילים, בלי אימוג\'י, בלי מירכאות, בלי מספור. החזר/י שלוש שורות בלבד, הוק אחד בכל שורה.\n\nתוכן הסרטון:\n' + ctxt,
      t => { aiHooks = t.split('\n').map(s => s.replace(/^[\s\d.\-*)]+/, '').trim()).filter(Boolean).slice(0, 3); aiOut = ''; });
  },
  aiUseHook(v) { const t = aiHooks[+v]; if (!t) return; seek(0); addText(Object.assign(clone(TEXT_PRESETS.hook[1]), { text: t, dur: 2.5 })); toast('ההוק נוסף בתחילת הסרטון'); },
  aiPost() {
    const ctxt = aiContext(); if (!ctxt) return toast('כתבי על מה הסרטון, או הוסיפי כתוביות');
    aiRun('כתוב/י פוסט לינקדאין בעברית שמלווה סרטון קצר של קהילת AI Finance, לקהל של סמנכ"לי כספים, חשבים, אנשי תכנון פיננסי ורואי חשבון. מבנה: שורת פתיחה חדה עם תובנה, בעיה, שלוש עד חמש נקודות קצרות, שורה תחתונה, וקריאה אחת לפעולה. 900 עד 1300 תווים, פסקאות של משפט עד שלושה, בלי מקפים ארוכים, לכל היותר אימוג\'י אחד, בלי מילים באנגלית בתוך משפט עברי. בסוף 5 תגיות באנגלית בלבד. החזר/י רק את הפוסט.\n\nתוכן הסרטון:\n' + ctxt,
      t => { aiOut = t; aiHooks = []; });
  },
  aiTrans() {
    const cues = S.p.clips.filter(c => c.type === 'caption').sort((a, b) => a.start - b.start); if (!cues.length) return toast('אין כתוביות לתרגם');
    aiRun('Translate each Hebrew subtitle line to natural, concise English. Return ONLY a JSON array of strings with exactly ' + cues.length + ' items, same order, no commentary.\n\n' + JSON.stringify(cues.map(c => c.text)),
      t => { try { const arr = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1)); if (!Array.isArray(arr) || arr.length !== cues.length) throw 0; cues.forEach((c, i) => c.text = String(arr[i])); commit(); toast('הכתוביות תורגמו. אפשר לבטל עם בטל.'); } catch (e) { toast('התרגום חזר בפורמט לא צפוי. נסי שוב.'); } });
  },
  aiCopy() { try { navigator.clipboard.writeText(aiOut).then(() => toast('הועתק'), () => toast('ההעתקה נחסמה. אפשר לסמן ולהעתיק ידנית.')); } catch (e) { toast('אפשר לסמן ולהעתיק ידנית'); } }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const fn = ACT[el.dataset.a]; if (fn) fn(el.dataset.v, el);
});
$('#btnExport').addEventListener('click', openExport);
$('#projName').addEventListener('change', e => { S.p.name = e.target.value.trim() || 'סרטון חדש'; commit(); });
$('#fmt').addEventListener('change', e => setFmt(e.target.value));
function setZoom(pps, anchorT, anchorX) { S.pps = clamp(pps, 8, 240); $('#zoom').value = S.pps; renderTimeline(); scroller.scrollLeft = Math.max(0, anchorT * S.pps - anchorX); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value, S.t, S.t * S.pps - scroller.scrollLeft));
scroller.addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
  const x = e.clientX - scroller.getBoundingClientRect().left; setZoom(S.pps * Math.exp(-e.deltaY * 0.002), (scroller.scrollLeft + x) / S.pps, x);
}, { passive: false });
let wheelT = 0;
cv.addEventListener('wheel', e => {
  const c = selClip(); if (!c || c.type === 'audio' || c.type === 'caption') return; e.preventDefault();
  const p = propsAt(c, clamp(S.t - c.start, 0, c.dur)); setProp(c, 'scale', +clamp(p.scale * Math.exp(-e.deltaY * 0.0015), 0.1, 4).toFixed(3)); requestDraw();
  clearTimeout(wheelT); wheelT = setTimeout(commit, 350);
}, { passive: false });

/* ===== files ===== */
// The main upload always starts a fresh automatic edit of what was uploaded, replacing whatever is on the
// timeline (undo brings it back). "Add to this video" only adds the file to the current timeline.
let addOnly = false;
async function handleFiles(files) {
  const add = addOnly; addOnly = false; const got = [];
  for (const f of files) { try { toast('טוען את ' + f.name + '...'); got.push(await importFile(f)); } catch (e) { toast(e.message === 'load' ? 'לא הצלחתי לקרוא את ' + f.name : e.message); } }
  if (!add && got.some(m => m.kind === 'video') && typeof autoEdit === 'function') return autoEdit(got.filter(m => m.kind !== 'image').map(m => m.id));
  if (got.length === 1) addMedia(got[0]); else if (got.length) toast(got.length + ' קבצים נוספו לספרייה');
  setTab(isMobile() && got.length === 1 ? 'edit' : 'media');
}
$('#fileIn').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) handleFiles(fs); });
document.addEventListener('dragover', e => { e.preventDefault(); });
document.addEventListener('drop', e => { e.preventDefault(); const fs = [...(e.dataTransfer ? e.dataTransfer.files : [])]; if (fs.length) handleFiles(fs); });

/* ===== keyboard ===== */
document.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (!$('#modal').hidden) { if (e.key === 'Escape' && !S.exporting) closeModal(); return; }
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === ' ') { e.preventDefault(); ACT.play(); }
  else if (mod && k === 'z') { e.preventDefault(); restore(e.shiftKey ? 1 : -1); }
  else if (mod && k === 'y') { e.preventDefault(); restore(1); }
  else if (mod && k === 'd') { e.preventDefault(); ACT.dup(); }
  else if (k === 's' && !mod) ACT.split();
  else if (k === 'delete' || k === 'backspace') { if (S.sel) { e.preventDefault(); ACT.del(); } }
  else if (k === 'arrowleft') { e.preventDefault(); ACT.back(); }
  else if (k === 'arrowright') { e.preventDefault(); ACT.fwd(); }
});
window.addEventListener('resize', () => { if (!S.exporting) { const rs = isMobile() ? 0.5 : 1; if (rs !== RS) setCanvas(); else fitCanvas(); renderTimeline(); } });

/* ===== logo cut-outs =====
   The supplied logo is a photo on a blue backdrop. For a corner tag and for tall formats we lift the
   wordmark off that backdrop (brightness becomes transparency), so it sits cleanly on any scene. */
function logoCut(img, y0, y1) {
  const k = img.naturalWidth / 1600, sx = Math.round(120 * k), sy = Math.round(y0 * k), w = Math.round(1400 * k), h = Math.round((y1 - y0) * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), a = d.data, fe = Math.round(26 * k);
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; let u = clamp((lum - 78) / 92, 0, 1); u = u * u * (3 - 2 * u);
    const px = p % w, py = (p / w) | 0, edge = Math.min(px, py, w - 1 - px, h - 1 - py); if (edge < fe) u *= edge / fe;
    a[i + 3] = Math.round(255 * u);
  }
  x.putImageData(d, 0, 0); return c;
}
function buildLogoCuts(img) {
  try {
    [['logoMark', 'לוגו שקוף', 385, 712], ['logoFull', 'לוגו שקוף עם סלוגן', 385, 792]].forEach(([id, name, y0, y1]) => {
      const c = logoCut(img, y0, y1);
      S.media.set(id, { id, name, kind: 'image', builtin: true, img: c, url: '', thumb: c.toDataURL('image/png'), w: c.width, h: c.height, duration: 4, blob: { size: 0 } });
    });
  } catch (e) { }
}
// One branded card for openers and closers. Wide formats use the full logo artwork; tall and square
// formats use the clear wordmark on the brand backdrop, because the artwork would be cropped there.
const isWide = () => S.p.w / S.p.h >= 1.5;
// size a logo by the room it may take, whatever its proportions: a share of the width, capped by height
function logoScale(id, wFrac, hFrac) {
  const m = S.media.get(id); if (!m || !m.w || !m.h) return { s: wFrac, wf: wFrac, hf: 0.1 };
  const W = S.p.w, H = S.p.h, k = Math.min(wFrac * W / m.w, hFrac * H / m.h), contain = Math.min(W / m.w, H / m.h);
  return { s: k / contain, wf: k * m.w / W, hf: k * m.h / H };
}
function brandCard(o) {
  const b = { x: 0, y: 0, rot: 0, opacity: 1 }, d = o.dur, kf = [Object.assign({ t: 0, scale: 1 }, b), Object.assign({ t: +d.toFixed(3), scale: 1.06 }, b)];
  if (isWide() && !S.brand.custom) return mkClip(Object.assign({ type: 'image', mediaId: 'logo', brand: 'card', fit: 'cover', card: false, scale: 1, x: 0, y: 0, kf }, o));
  const s = logoScale('logoFull', isWide() ? 0.5 : S.p.w === S.p.h ? 0.84 : 0.9, 0.3).s, y = -0.07;
  return mkClip(Object.assign({ type: 'image', mediaId: 'logoFull', brand: 'card', fit: 'contain', card: true, scale: s, x: 0, y, kf: kf.map(k => Object.assign(k, { y, scale: k.scale * s })) }, o));
}
function taglineClip(o) {
  const base = isWide() ? (S.brand.custom ? 0.2 : 0.25) : S.p.fmt === '1:1' ? 0.17 : S.p.fmt === '4:5' ? 0.14 : 0.1;
  // a tall replacement logo pushes the tagline down, so the two never touch
  const under = S.brand.custom ? -0.07 + logoScale('logoFull', isWide() ? 0.5 : S.p.w === S.p.h ? 0.84 : 0.9, 0.3).hf / 2 + 0.075 : 0;
  return mkText(Object.assign({ brand: 'tag', text: S.brand.tagline, size: isWide() ? 40 : 54, weight: 500, color: '#FFFFFF', y: +Math.max(base, under).toFixed(3), anim: 'fade', shadow: true }, o));
}
// a brand with no tagline simply has none on its cards
function pushTag(o) { if (String(S.brand.tagline || '').trim()) S.p.clips.push(taglineClip(o)); }
function logoBug(trackId, dur) {
  const v = S.p.h > S.p.w, sq = S.p.h === S.p.w, k = logoScale('logoMark', v ? 0.34 : sq ? 0.3 : 0.2, 0.085);
  return mkClip({ type: 'image', mediaId: 'logoMark', brand: 'bug', trackId, start: 0, dur, fit: 'contain', scale: k.s, x: +(0.46 - k.wf / 2).toFixed(3), y: S.p.fmt === '9:16' ? -0.4 : v ? -0.43 : sq ? -0.42 : -0.4, opacity: 0.95 });
}
// re-lay every brand element: after a format change, or when the brand kit itself changes
function relayBrand() {
  S.p.clips.forEach(c => {
    if (c.brand === 'card') { const n = brandCard({ dur: c.dur }); ['mediaId', 'fit', 'card', 'scale', 'x', 'y', 'kf'].forEach(k => c[k] = n[k]); }
    else if (c.brand === 'bug') { const n = logoBug(c.trackId, c.dur); ['scale', 'x', 'y'].forEach(k => c[k] = n[k]); c.kf = []; }
    else if (c.brand === 'tag') { const n = taglineClip({}); c.size = n.size; c.y = n.y; c.text = n.text; c.kf = []; }
    else if (c.brand === 'cta' && c.autoCta) c.text = S.brand.cta || BRAND0.cta;
  });
  S.p.clips = S.p.clips.filter(c => !(c.brand === 'tag' && !String(c.text || '').trim()));
}
let LOGO0 = null;
function setLogoMedia(img, custom) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  ['logo', 'logoMark', 'logoFull'].forEach(id => S.media.set(id, { id, name: id === 'logo' ? 'הלוגו שלך' : id === 'logoMark' ? 'הלוגו שלך, תג' : 'הלוגו שלך, כרטיס', kind: 'image', builtin: true, custom, img, url: img.src, thumb: img.src, w, h, duration: 4, blob: { size: 0 } }));
}
function applyCustomLogo(blob) {
  return new Promise(res => { const img = new Image(); img.onload = () => { setLogoMedia(img, true); S.brand.custom = true; relayBrand(); requestDraw(); res(true); }; img.onerror = () => res(false); img.src = URL.createObjectURL(blob); });
}
function resetLogo() {
  S.brand.custom = false; if (!LOGO0) return;
  S.media.set('logo', { id: 'logo', name: 'לוגו AI Finance', kind: 'image', builtin: true, img: LOGO0, url: 'assets/logo.jpg', thumb: 'assets/logo.jpg', w: LOGO0.naturalWidth, h: LOGO0.naturalHeight, duration: 4, blob: { size: 0 } });
  buildLogoCuts(LOGO0);
}
function saveBrand() { const b = Object.assign({}, S.brand); DB.putKV('brand', JSON.stringify(b)); }
// Split a script into caption cues: never across a sentence end, and never a lone trailing word.
function chunkText(s, n) {
  const out = [];
  String(s || '').replace(/([.!?…])\s+/g, '$1\n').split(/\n+/).forEach(sen => {
    const w = nb(sen).trim().split(/[ \t]+/).filter(Boolean), parts = [];
    for (let i = 0; i < w.length; i += n) parts.push(w.slice(i, i + n));
    const L = parts.length; if (L > 1 && parts[L - 1].length === 1 && parts[L - 2].length > 2) parts[L - 1].unshift(parts[L - 2].pop());
    parts.forEach(p => out.push(p.join(' ')));
  });
  return out;
}

/* ===== boot ===== */
async function boot() {
  const img = new Image(); img.src = 'assets/logo.jpg';
  const logo = { id: 'logo', name: 'לוגו AI Finance', kind: 'image', builtin: true, img, url: 'assets/logo.jpg', thumb: 'assets/logo.jpg', w: 1600, h: 1247, duration: 4, blob: { size: 0 } };
  LOGO0 = img;
  img.onload = () => { logo.w = img.naturalWidth; logo.h = img.naturalHeight; if (!S.brand.custom) buildLogoCuts(img); requestDraw(); if (typeof renderPanel === 'function') renderPanel(); };
  S.media.set('logo', logo);
  S.p = demoProject(); let restored = false;
  try {
    await DB.open(); const { pj, rows } = await DB.load();
    try { const bj = await DB.getKV('brand'); if (bj) S.brand = Object.assign({}, BRAND0, JSON.parse(bj), { custom: false }); const lb = await DB.getKV('brandLogo'); if (lb) await applyCustomLogo(lb); } catch (e) { }
    for (const r of rows) { try { const m = await buildMedia(r); S.media.set(m.id, m); } catch (e) { } }
    if (pj && Array.isArray(pj.clips) && Array.isArray(pj.tracks)) { S.p = normalizeProject(pj); restored = true; }
  } catch (e) { }
  setCanvas(); H.stack = [snap()]; H.i = 0; refresh(); renderPanel(); uiPlay(); seek(restored ? 0 : 1.2);
  if (document.fonts) { document.fonts.ready.then(() => requestDraw()); ['800 40px Rubik', '500 40px Rubik', '400 40px "Secular One"', '700 40px Heebo'].forEach(f => document.fonts.load(f).then(requestDraw, () => { })); }
  requestAnimationFrame(loop);
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(d => { DL = d; }, () => { });
    window.claude.use('sample').then(s => { AI = s; if (document.body.dataset.tab === 'ai') renderPanel(); }, () => { });
  }
}
window.addEventListener('DOMContentLoaded', boot);
