'use strict';
/* ===== helpers ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const isHeb = s => /[֐-׿]/.test(s || '');
const easeOut = u => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const easeInOut = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const easeBack = u => { u = clamp(u, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const clone = o => JSON.parse(JSON.stringify(o));
// The community name never breaks across lines.
const nb = s => String(s == null ? '' : s).replace(/AI Finance/g, 'AI\u00A0Finance');
const TAGLINE = 'מגשרים בין עולם הכספים\nלעולם הבינה המלאכותית';

const FORMATS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const BRAND = { blue: '#0B2BA8', deep: '#061A6E', glow: '#7DB0FF', white: '#FFFFFF', gold: '#E9C46A', ink: '#050A26' };
// The brand kit. The studio ships with AI Finance, and every part of it can be replaced.
const BRAND0 = { custom: false, name: 'AI Finance', about: '', tagline: TAGLINE, cta: 'הצטרפו לקהילה', color: BRAND.deep };
const lighten = (hex, k) => { const n = parseInt(String(hex).replace('#', ''), 16); if (isNaN(n)) return hex; const f = v => Math.round(v + (255 - v) * k); return 'rgb(' + f(n >> 16 & 255) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')'; };
const LOOKS = {
  orig: ['מקור', ''], vivid: ['חי', 'saturate(1.35) contrast(1.08)'], cinema: ['קולנועי', 'contrast(1.15) saturate(0.85) sepia(0.12)'],
  soft: ['רך', 'contrast(0.92) brightness(1.06) saturate(0.95)'], bw: ['שחור-לבן', 'grayscale(1) contrast(1.1)'],
  warm: ['חמים', 'sepia(0.25) saturate(1.2)'], cool: ['קריר', 'hue-rotate(-12deg) saturate(1.1)']
};
const KFP = ['x', 'y', 'scale', 'rot', 'opacity'];
const PEAK_RATE = 50;
const ACCEPT = { video: ['video', 'image', 'solid'], text: ['text'], caption: ['caption'], audio: ['audio'] };

/* ===== state ===== */
const S = { brand: Object.assign({}, BRAND0), p: null, media: new Map(), sel: null, t: 0, playing: false, pps: 70, exporting: false, safe: false };
const cv = $('#cv'), ctx = cv.getContext('2d');
let RS = 1;

function newProject() {
  return {
    name: 'סרטון חדש', fmt: '16:9', w: 1920, h: 1080, fps: 30,
    tracks: [
      { id: 'cap', type: 'caption', name: 'כתוביות' }, { id: 'txt', type: 'text', name: 'טקסט' },
      { id: 'v2', type: 'video', name: 'וידאו 2' }, { id: 'v1', type: 'video', name: 'וידאו 1' },
      { id: 'a1', type: 'audio', name: 'אודיו 1' }
    ],
    clips: [],
    cap: { style: 'box', size: 62, pos: 'bottom', font: 'Rubik', accent: BRAND.gold }
  };
}
function mkClip(o) {
  return Object.assign({
    id: uid(), start: 0, dur: 4, in: 0, speed: 1, volume: 1, mute: false, fadeIn: 0, fadeOut: 0,
    x: 0, y: 0, scale: 1, rot: 0, opacity: 1, kf: [], look: 'orig', bri: 100, con: 100, sat: 100,
    fit: 'cover', blurBg: false, tin: 'none', tout: 'none'
  }, o);
}
function mkText(o) {
  return mkClip(Object.assign({
    type: 'text', dur: 3, text: 'טקסט חדש', font: 'Rubik', size: 96, weight: 800, color: '#FFFFFF',
    bgOn: false, bg: BRAND.blue, stroke: false, strokeColor: '#000000', shadow: true, align: 'center', anim: 'pop'
  }, o));
}
const selClip = () => S.p.clips.find(c => c.id === S.sel) || null;
const trackById = id => S.p.tracks.find(t => t.id === id);
const projDur = () => { let d = 0; for (const c of S.p.clips) d = Math.max(d, c.start + c.dur); return d || 5; };
function firstTrack(type, last) {
  const ts = S.p.tracks.filter(t => t.type === type);
  if (!ts.length) { const t = { id: uid(), type, name: { video: 'וידאו', audio: 'אודיו', text: 'טקסט', caption: 'כתוביות' }[type] }; if (type === 'audio') S.p.tracks.push(t); else S.p.tracks.unshift(t); return t; }
  return last ? ts[ts.length - 1] : ts[0];
}
function trackEnd(tid) { let e = 0; for (const c of S.p.clips) if (c.trackId === tid) e = Math.max(e, c.start + c.dur); return e; }
function placeFree(c) {
  for (let n = 0; n < 60; n++) {
    const o = S.p.clips.find(o => o !== c && o.trackId === c.trackId && c.start < o.start + o.dur - 1e-3 && c.start + c.dur > o.start + 1e-3);
    if (!o) return; c.start = o.start + o.dur;
  }
}

/* ===== keyframes ===== */
function propsAt(c, l) {
  const kf = c.kf;
  if (!kf || !kf.length) return { x: c.x, y: c.y, scale: c.scale, rot: c.rot, opacity: c.opacity };
  if (l <= kf[0].t) return kf[0];
  const last = kf[kf.length - 1];
  if (l >= last.t) return last;
  let i = 0; while (kf[i + 1].t < l) i++;
  const a = kf[i], b = kf[i + 1], e = easeInOut((l - a.t) / Math.max(1e-6, b.t - a.t)), r = {};
  for (const k of KFP) r[k] = a[k] + (b[k] - a[k]) * e;
  return r;
}
function kfAt(c, l, make) {
  let k = c.kf.find(k => Math.abs(k.t - l) < 0.04);
  if (!k && make) { const p = propsAt(c, l); k = { t: +l.toFixed(3) }; for (const n of KFP) k[n] = p[n]; c.kf.push(k); c.kf.sort((a, b) => a.t - b.t); }
  return k;
}
function setProp(c, p, v) {
  if (KFP.includes(p) && c.kf && c.kf.length) { const l = clamp(S.t - c.start, 0, c.dur); kfAt(c, l, true)[p] = v; }
  else c[p] = v;
}

/* ===== media ===== */
let decodeCtx = null;
function loadMeta(el, ev) { return new Promise((res, rej) => { el.addEventListener(ev, () => res(), { once: true }); el.addEventListener('error', () => rej(new Error('load')), { once: true }); }); }
async function computePeaks(blob) {
  try {
    if (blob.size > 150e6) return null;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    decodeCtx = decodeCtx || new AC();
    const buf = await new Promise(async (res, rej) => { try { decodeCtx.decodeAudioData(await blob.arrayBuffer(), res, rej); } catch (e) { rej(e); } });
    const d = buf.getChannelData(0), step = Math.floor(buf.sampleRate / PEAK_RATE), n = Math.floor(d.length / step), out = new Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step, e = j + step; j < e; j += 8) { const v = Math.abs(d[j]); if (v > m) m = v; } out[i] = +m.toFixed(3); }
    return out;
  } catch (e) { return null; }
}
async function buildMedia(rec) {
  // rec: {id,name,kind,blob,duration?,w?,h?,thumb?,peaks?}
  const m = Object.assign({}, rec); m.url = URL.createObjectURL(rec.blob);
  if (m.kind === 'image') {
    m.img = new Image(); m.img.src = m.url; await loadMeta(m.img, 'load');
    m.w = m.img.naturalWidth; m.h = m.img.naturalHeight; m.duration = 4; m.thumb = m.thumb || m.url;
  } else if (!m.duration) {
    const el = document.createElement(m.kind === 'video' ? 'video' : 'audio');
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = m.url;
    await loadMeta(el, 'loadedmetadata');
    if (!isFinite(el.duration)) { el.currentTime = 1e7; await loadMeta(el, 'seeked').catch(() => { }); }
    m.duration = isFinite(el.duration) ? el.duration : 10;
    if (m.kind === 'video') {
      m.w = el.videoWidth; m.h = el.videoHeight;
      try {
        el.currentTime = Math.min(1, m.duration / 3); await loadMeta(el, 'seeked');
        const c = document.createElement('canvas'); c.width = 160; c.height = Math.round(160 * m.h / m.w) || 90;
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); m.thumb = c.toDataURL('image/jpeg', .7);
      } catch (e) { }
    }
    el.removeAttribute('src'); el.load();
  }
  return m;
}
async function importFile(file) {
  const ty = file.type || '', ext = (file.name.split('.').pop() || '').toLowerCase();
  const kind = ty.startsWith('video') || ['mp4', 'mov', 'webm', 'm4v', 'mkv'].includes(ext) ? 'video'
    : ty.startsWith('audio') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext) ? 'audio'
      : ty.startsWith('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image' : null;
  if (!kind) throw new Error('סוג הקובץ ' + file.name + ' לא נתמך');
  const m = await buildMedia({ id: uid(), name: file.name, kind, blob: file });
  S.media.set(m.id, m);
  if (kind !== 'image') m.peaksReady = computePeaks(file).then(p => { if (p) { m.peaks = p; DB.putMedia(m); if (typeof renderTimeline === 'function') renderTimeline(); } });
  DB.putMedia(m);
  return m;
}

/* ===== persistence (this browser only) ===== */
const DB = {
  h: null,
  open() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('aif-studio', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('media', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
        r.onsuccess = () => { DB.h = r.result; res(); }; r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      if (!DB.h) return rej(new Error('nodb'));
      try { const t = DB.h.transaction(store, mode), rq = fn(t.objectStore(store)); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); } catch (e) { rej(e); }
    });
  },
  putKV(k, v) { return DB.tx('kv', 'readwrite', s => v == null ? s.delete(k) : s.put(v, k)).catch(() => { }); },
  getKV(k) { return DB.tx('kv', 'readonly', s => s.get(k)).catch(() => null); },
  putMedia(m) { if (m.builtin || m.blob.size > 400e6) return; DB.tx('media', 'readwrite', s => s.put({ id: m.id, name: m.name, kind: m.kind, blob: m.blob, duration: m.duration, w: m.w, h: m.h, thumb: m.kind === 'image' ? null : m.thumb, peaks: m.peaks || null })).catch(() => { }); },
  delMedia(id) { DB.tx('media', 'readwrite', s => s.delete(id)).catch(() => { }); },
  saveProject() { return DB.tx('kv', 'readwrite', s => s.put(JSON.stringify(S.p), 'project')); },
  async load() {
    const pj = await DB.tx('kv', 'readonly', s => s.get('project'));
    const rows = await DB.tx('media', 'readonly', s => s.getAll());
    return { pj: pj ? JSON.parse(pj) : null, rows: rows || [] };
  }
};

/* ===== media elements + audio graph ===== */
const EL = new Map();
let AC = null, MASTER = null;
function hook(e) { if (e.gain || !AC) return; try { const src = AC.createMediaElementSource(e.el); e.gain = AC.createGain(); src.connect(e.gain); e.gain.connect(MASTER); } catch (err) { } }
function ensureAudio() {
  if (!AC) { try { const A = window.AudioContext || window.webkitAudioContext; AC = new A(); MASTER = AC.createGain(); MASTER.connect(AC.destination); } catch (e) { AC = null; } }
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => { }); EL.forEach(hook); }
}
// Each (file, track) pair gets two elements. A clip that continues its predecessor in the source keeps the
// same one, so a plain split plays through with no seek. A jump cut (silence removed, a trimmed take) moves to
// the other one, which was parked on the new position in advance, so the cut is instant and stays in sync.
const isTimed = c => c.type === 'video' || c.type === 'audio';
const SLOT = new Map();
function assignSlots() {
  SLOT.clear(); const by = new Map();
  for (const c of S.p.clips) { if (!isTimed(c)) continue; const k = c.mediaId + '|' + c.trackId; (by.get(k) || by.set(k, []).get(k)).push(c); }
  by.forEach(list => {
    list.sort((a, b) => a.start - b.start); let slot = 0, prev = null;
    for (const c of list) {
      if (prev && !(Math.abs(c.in - (prev.in + prev.dur * prev.speed)) < 0.05 && Math.abs(c.start - (prev.start + prev.dur)) < 0.05 && c.speed === prev.speed)) slot ^= 1;
      SLOT.set(c.id, slot); prev = c;
    }
  });
}
const elKey = c => c.mediaId + '|' + c.trackId + '|' + (SLOT.get(c.id) || 0);
function getEl(c) {
  const k = elKey(c); let e = EL.get(k);
  if (!e) {
    const m = S.media.get(c.mediaId); if (!m || m.kind === 'image') return null;
    const el = document.createElement(m.kind === 'video' ? 'video' : 'audio');
    el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); el.src = m.url;
    el.addEventListener('seeked', requestDraw); el.addEventListener('loadeddata', requestDraw);
    e = { el, gain: null, unlocked: false }; EL.set(k, e); if (AC) hook(e);
  }
  return e;
}
function pruneEls() {
  assignSlots();
  const keys = new Set(S.p.clips.filter(isTimed).map(elKey));
  EL.forEach((e, k) => { if (!keys.has(k)) { try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); if (e.gain) e.gain.disconnect(); } catch (x) { } EL.delete(k); } });
}
function setGain(e, g) { if (e.gain) { e.gain.gain.value = g; e.el.muted = false; if (e.el.volume !== 1) e.el.volume = 1; } else { try { e.el.volume = clamp(g, 0, 1); } catch (x) { } e.el.muted = g === 0; } }
function syncMedia() {
  assignSlots();
  const t = S.t, act = new Map(), next = new Map();
  for (const c of S.p.clips) {
    if (!isTimed(c)) continue; const k = elKey(c), l = t - c.start;
    if (l >= 0 && l < c.dur) act.set(k, c); else if (l < 0) { const n = next.get(k); if (!n || c.start < n.start) next.set(k, c); }
    if (!EL.has(k)) getEl(c);
  }
  EL.forEach((e, k) => {
    const el = e.el, c = act.get(k);
    if (!c) {
      setGain(e, 0); if (!el.paused) el.pause();
      const n = next.get(k); if (n && n.start - t < 4 && el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - n.in) > 0.05) el.currentTime = n.in;
      return;
    }
    const l = t - c.start, tr = trackById(c.trackId) || {}; let g = 0;
    if (!c.mute && !tr.muted) {
      g = c.volume;
      if (c.fadeIn > 0 && l < c.fadeIn) g *= l / c.fadeIn;
      if (c.fadeOut > 0 && c.dur - l < c.fadeOut) g *= (c.dur - l) / c.fadeOut;
    }
    setGain(e, g);
    const want = c.in + l * c.speed;
    if (el.playbackRate !== c.speed) el.playbackRate = c.speed;
    if (S.playing) {
      if (el.paused) { if (Math.abs(el.currentTime - want) > 0.08) el.currentTime = want; const pr = el.play(); if (pr) pr.catch(() => { }); }
      else if (!el.seeking && Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
    } else {
      if (!el.paused) el.pause();
      if (el.readyState >= 1 && Math.abs(el.currentTime - want) > 0.03 && !el.seeking) el.currentTime = want;
    }
  });
}

/* ===== compositor ===== */
function setCanvas(scale) {
  RS = scale || (matchMedia('(max-width: 860px)').matches ? 0.5 : 1);
  cv.width = Math.round(S.p.w * RS); cv.height = Math.round(S.p.h * RS);
  fitCanvas(); requestDraw();
}
function fitCanvas() {
  const w = $('#cvwrap'), bw = w.clientWidth - 22, bh = w.clientHeight - 22; if (bw <= 0 || bh <= 0) return;
  const ar = S.p.w / S.p.h, cw = Math.min(bw, bh * ar); cv.style.width = Math.floor(cw) + 'px'; cv.style.height = Math.floor(cw / ar) + 'px';
}
function lookFilter(c) {
  let f = (LOOKS[c.look] || LOOKS.orig)[1];
  if (c.bri !== 100) f += ` brightness(${c.bri / 100})`;
  if (c.con !== 100) f += ` contrast(${c.con / 100})`;
  if (c.sat !== 100) f += ` saturate(${c.sat / 100})`;
  return f.trim();
}
function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function wrapLines(text, maxW) {
  const out = [];
  for (const para of nb(text).split('\n')) {
    const words = para.split(/[ \t]+/).filter(Boolean); let cur = '';
    for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(tryL).width > maxW) { out.push(cur); cur = w; } else cur = tryL; }
    out.push(cur);
  }
  return out;
}
function draw() {
  const p = S.p, W = p.w, H = p.h, t = S.t;
  ctx.setTransform(RS, 0, 0, RS, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // the corner logo steps aside while a full brand card is on screen
  const cardOn = p.clips.some(c => c.brand === 'card' && t >= c.start && t < c.start + c.dur);
  for (let i = p.tracks.length - 1; i >= 0; i--) {
    const tr = p.tracks[i]; if (tr.type === 'audio' || tr.hidden) continue;
    for (const c of p.clips) {
      if (c.trackId !== tr.id || (cardOn && c.brand === 'bug')) continue; const l = t - c.start; if (l < 0 || l >= c.dur) continue;
      ctx.save(); try { drawClip(c, l, W, H); } catch (e) { } ctx.restore();
    }
  }
  if (S.safe && !S.exporting) drawSafe(W, H);
}
function drawSafe(W, H) {
  ctx.save(); ctx.strokeStyle = 'rgba(233,196,106,.9)'; ctx.setLineDash([14, 10]); ctx.lineWidth = 3;
  const v = H > W; ctx.strokeRect(W * 0.06, H * (v ? 0.12 : 0.06), W * (v ? 0.76 : 0.88), H * (v ? 0.66 : 0.88)); ctx.restore();
}
function brandGrad(w, h, color) { const g = ctx.createRadialGradient(0, -h * 0.1, 0, 0, 0, Math.max(w, h) * 0.75); const c = color || BRAND.deep; g.addColorStop(0, c === BRAND.deep ? '#1740D8' : lighten(c, 0.22)); g.addColorStop(1, c); return g; }
function drawClip(c, l, W, H) {
  const pr = propsAt(c, l); let alpha = pr.opacity, sc = pr.scale, ox = pr.x * W, oy = pr.y * H;
  const td = Math.min(0.5, c.dur / 2);
  const fx = (type, u) => { const e = easeOut(u); if (type === 'fade') alpha *= u; else if (type === 'slide') { ox += (1 - e) * W * 0.3; alpha *= Math.min(1, u * 2); } else if (type === 'zoom') { sc *= 0.82 + 0.18 * e; alpha *= u; } };
  if (c.tin && c.tin !== 'none' && l < td) fx(c.tin, l / td);
  if (c.tout && c.tout !== 'none' && c.dur - l < td) fx(c.tout, (c.dur - l) / td);
  if (c.type === 'caption') return drawCaption(c, l, W, H);
  if (c.type === 'text') return drawText(c, l, W, H, { alpha, sc, ox, oy, rot: pr.rot });
  let src = null, sw = W, sh = H;
  if (c.type !== 'solid') {
    const m = S.media.get(c.mediaId); if (!m) return;
    if (m.kind === 'image') { src = m.img; sw = m.w; sh = m.h; if (!src || src.complete === false || !sw) return; }
    else { const e = getEl(c); if (!e) return; src = e.el; sw = src.videoWidth; sh = src.videoHeight; if (src.readyState < 2 || !sw) return; }
  }
  const cover = Math.max(W / sw, H / sh), contain = Math.min(W / sw, H / sh), base = c.fit === 'contain' ? contain : cover;
  if (src && c.fit === 'contain' && c.blurBg) {
    ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1); ctx.filter = 'blur(36px) brightness(0.55)';
    ctx.translate(W / 2, H / 2); ctx.scale(cover * 1.12, cover * 1.12); ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh); ctx.restore();
  }
  ctx.globalAlpha = clamp(alpha, 0, 1);
  // A brand card paints the royal-blue backdrop itself, so a logo with a clear background fills any format.
  if (c.card) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.fillStyle = brandGrad(W, H, S.brand.color || BRAND.deep); ctx.fillRect(-W / 2, -H / 2, W, H); ctx.restore(); }
  ctx.translate(W / 2 + ox, H / 2 + oy); ctx.rotate(pr.rot * Math.PI / 180); ctx.scale(base * sc, base * sc);
  const f = lookFilter(c); if (f) ctx.filter = f;
  if (c.type === 'solid') {
    if (c.grad) ctx.fillStyle = brandGrad(sw, sh, c.color);
    else ctx.fillStyle = c.color;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
  } else ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh);
  ctx.filter = 'none';
  if (c.id === S.sel && !S.exporting) { ctx.lineWidth = 5 / (base * sc); ctx.strokeStyle = BRAND.gold; ctx.strokeRect(-sw / 2, -sh / 2, sw, sh); }
}
function drawText(c, l, W, H, f) {
  const ref = Math.min(W, H) / 1080, size = c.size * ref, full = c.text || '';
  let alpha = f.alpha, sc = f.sc, oy = f.oy, chars = Infinity;
  if (c.anim && c.anim !== 'none') {
    const ad = Math.min(0.4, c.dur / 2);
    if (c.anim === 'type') { const tdur = Math.min(c.dur * 0.6, Math.max(0.4, full.length * 0.045)); chars = Math.floor(full.length * Math.min(1, l / tdur)); }
    else if (l < ad) {
      const u = l / ad;
      if (c.anim === 'fade') alpha *= u;
      if (c.anim === 'pop') { sc *= 0.7 + 0.3 * easeBack(u); alpha *= Math.min(1, u * 2.5); }
      if (c.anim === 'slide') { oy += (1 - easeOut(u)) * size * 1.2; alpha *= u; }
    }
    if (c.dur - l < 0.22) alpha *= (c.dur - l) / 0.22;
  }
  ctx.font = `${c.weight} ${size}px "${c.font}", sans-serif`;
  const rtl = isHeb(full); ctx.direction = rtl ? 'rtl' : 'ltr';
  const lines = wrapLines(full, W * 0.86), lh = size * 1.22;
  const bw = Math.max(1, ...lines.map(s => ctx.measureText(s).width)), bh = lines.length * lh, padX = size * 0.5, padY = size * 0.26;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(W / 2 + f.ox, H / 2 + oy); ctx.rotate(f.rot * Math.PI / 180); ctx.scale(sc, sc);
  if (c.bgOn) { ctx.fillStyle = c.bg; rrect(-bw / 2 - padX, -bh / 2 - padY, bw + 2 * padX, bh + 2 * padY, size * 0.2); ctx.fill(); }
  ctx.textBaseline = 'middle'; ctx.textAlign = c.align;
  const ax = c.align === 'center' ? 0 : c.align === 'right' ? bw / 2 : -bw / 2;
  let left = chars;
  lines.forEach((ln, i) => {
    let s = ln; if (left < ln.length) s = ln.slice(0, Math.max(0, left)); left -= ln.length + 1; if (!s) return;
    const y = -bh / 2 + lh * (i + 0.5);
    if (c.shadow && !c.bgOn) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = size * 0.22; ctx.shadowOffsetY = size * 0.05 * RS; }
    if (c.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = c.strokeColor || '#000'; ctx.strokeText(s, ax, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = c.color; ctx.fillText(s, ax, y); ctx.shadowColor = 'transparent';
  });
  if (c.id === S.sel && !S.exporting) { ctx.lineWidth = 4 / sc; ctx.strokeStyle = BRAND.gold; ctx.setLineDash([12, 8]); ctx.strokeRect(-bw / 2 - padX, -bh / 2 - padY, bw + 2 * padX, bh + 2 * padY); }
}
function bidiOrder(ws) { const out = []; let run = []; for (const w of ws) { if (!isHeb(w.w) && /[A-Za-z0-9]/.test(w.w)) run.unshift(w); else { out.push(...run); run = []; out.push(w); } } out.push(...run); return out; }
function drawCaption(c, l, W, H) {
  const cs = S.p.cap, ref = Math.min(W, H) / 1080, size = cs.size * ref;
  const words = nb(c.text).trim().split(/[ \t\n]+/).filter(Boolean); if (!words.length) return;
  const n = words.length, prog = clamp(l / c.dur, 0, 0.9999), ai = Math.floor(prog * n), rtl = isHeb(c.text);
  const cy = cs.pos === 'top' ? H * 0.15 : cs.pos === 'mid' ? H * 0.5 : H * (H > W ? 0.74 : 0.85);
  ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (cs.style === 'pop') {
    const wl = prog * n - ai, s = 1 + 0.22 * (1 - easeOut(Math.min(1, wl * 3.5)));
    ctx.font = `800 ${size * 1.5}px "${cs.font}", sans-serif`; ctx.textAlign = 'center';
    ctx.translate(W / 2, cy); ctx.scale(s, s);
    ctx.lineWidth = size * 0.24; ctx.strokeStyle = '#000'; ctx.strokeText(words[ai], 0, 0);
    ctx.fillStyle = cs.accent; ctx.fillText(words[ai], 0, 0); return;
  }
  ctx.font = `800 ${size}px "${cs.font}", sans-serif`;
  const sp = ctx.measureText(' ').width, maxW = W * 0.84, lines = []; let cur = [], cw = 0;
  words.forEach((w, i) => { const ww = ctx.measureText(w).width; if (cur.length && cw + sp + ww > maxW) { lines.push({ ws: cur, w: cw }); cur = []; cw = 0; } cw += (cur.length ? sp : 0) + ww; cur.push({ w, ww, i }); });
  lines.push({ ws: cur, w: cw });
  const lh = size * 1.28, th = lines.length * lh, bw = Math.max(...lines.map(x => x.w)), px = size * 0.45, py = size * 0.2;
  const boxed = cs.style === 'box' || cs.style === 'brand';
  if (boxed) { ctx.fillStyle = cs.style === 'brand' ? BRAND.blue : 'rgba(0,0,0,.74)'; rrect(W / 2 - bw / 2 - px, cy - th / 2 - py, bw + 2 * px, th + 2 * py, size * 0.22); ctx.fill(); }
  const hl = cs.style === 'karaoke' || cs.style === 'brand';
  ctx.textAlign = 'left';
  lines.forEach((ln, li) => {
    const y = cy - th / 2 + lh * (li + 0.5); let x = rtl ? W / 2 + ln.w / 2 : W / 2 - ln.w / 2;
    for (const wd of (rtl ? bidiOrder(ln.ws) : ln.ws)) {
      const wx = rtl ? x - wd.ww : x;
      if (!boxed) { ctx.lineWidth = size * 0.2; ctx.strokeStyle = '#000'; ctx.strokeText(wd.w, wx, y); }
      ctx.fillStyle = hl && wd.i === ai ? cs.accent : '#fff'; ctx.fillText(wd.w, wx, y);
      x += rtl ? -(wd.ww + sp) : wd.ww + sp;
    }
  });
}

/* ===== clock ===== */
let lastTs = 0, dirty = true, stallT = 0;
function mediaStalled() {
  for (const c of S.p.clips) { if (!isTimed(c)) continue; const l = S.t - c.start; if (l < 0 || l >= c.dur) continue; const e = EL.get(elKey(c)); if (e && (e.el.seeking || e.el.readyState < 2)) return true; }
  return false;
}
function requestDraw() { dirty = true; }
function loop(ts) {
  requestAnimationFrame(loop);
  if (S.playing) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    // hold the clock while footage on screen is still seeking, so picture and sound never drift apart
    if (mediaStalled() && stallT < 1.5) stallT += dt; else { if (!mediaStalled()) stallT = 0; S.t += Math.min(dt, 0.5); }
    const d = projDur();
    if (S.t >= d) { S.t = Math.max(0, d - 0.001); pause(); if (S.exporting) finishExport(); }
    syncMedia(); draw(); uiTime();
  } else if (dirty) { dirty = false; syncMedia(); draw(); uiTime(); }
}
function play() {
  ensureAudio();
  if (S.t >= projDur() - 0.05) S.t = 0;
  assignSlots(); stallT = 0;
  for (const c of S.p.clips) if (isTimed(c)) getEl(c);
  EL.forEach(e => { if (!e.unlocked) { e.unlocked = true; setGain(e, 0); const pr = e.el.play(); if (pr) pr.catch(() => { }); } });
  S.playing = true; lastTs = 0; uiPlay();
}
function pause() { S.playing = false; uiPlay(); requestDraw(); }
function seek(t) { S.t = clamp(t, 0, Math.max(0, projDur() - 0.001)); if (S.playing) lastTs = 0; requestDraw(); }

/* ===== export ===== */
const EXP = { rec: null, chunks: [], mime: '', dest: null, blob: null, cancel: false };
function pickMime() {
  if (!window.MediaRecorder) return '';
  for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { } }
  return '';
}
async function startExport(quality) {
  const mime = pickMime(); if (!mime || !cv.captureStream) throw new Error('הדפדפן הזה לא תומך בייצוא וידאו. כדאי לפתוח בכרום במחשב.');
  pause(); ensureAudio();
  const scale = quality === '720' ? 720 / Math.min(S.p.w, S.p.h) : 1;
  S.exporting = true; EXP.cancel = false; EXP.blob = null; EXP.chunks = []; EXP.mime = mime;
  setCanvas(scale); seek(0); syncMedia(); draw();
  await new Promise(r => setTimeout(r, 700));
  const stream = cv.captureStream(S.p.fps);
  if (AC) { EXP.dest = AC.createMediaStreamDestination(); MASTER.connect(EXP.dest); EXP.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: quality === '720' ? 6e6 : 12e6, audioBitsPerSecond: 192e3 });
  EXP.rec = rec; rec.ondataavailable = e => { if (e.data && e.data.size) EXP.chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    if (EXP.dest) { try { MASTER.disconnect(EXP.dest); } catch (e) { } EXP.dest = null; }
    S.exporting = false; setCanvas();
    if (!EXP.cancel) { EXP.blob = new Blob(EXP.chunks, { type: mime.split(';')[0] }); exportDone(); }
  };
  rec.start(); play();
}
function finishExport() { setTimeout(() => { if (EXP.rec && EXP.rec.state !== 'inactive') EXP.rec.stop(); }, 250); }
function cancelExport() { EXP.cancel = true; pause(); if (EXP.rec && EXP.rec.state !== 'inactive') EXP.rec.stop(); else { S.exporting = false; setCanvas(); } }

document.addEventListener('visibilitychange', () => {
  const r = EXP.rec; if (!S.exporting || !r) return;
  try {
    if (document.hidden && r.state === 'recording') { r.pause(); S.playing = false; syncMedia(); }
    else if (!document.hidden && r.state === 'paused') { r.resume(); S.playing = true; lastTs = 0; }
  } catch (e) { }
});
function normalizeProject(p) {
  const d = newProject(); p.cap = Object.assign(d.cap, p.cap || {});
  if (!FORMATS[p.fmt]) p.fmt = '16:9'; p.w = FORMATS[p.fmt][0]; p.h = FORMATS[p.fmt][1]; p.fps = p.fps || 30; p.name = p.name || 'סרטון חדש';
  const ids = new Set(p.tracks.map(t => t.id));
  p.clips = p.clips.filter(c => c && ids.has(c.trackId) && c.dur > 0).map(c => Object.assign(c.type === 'text' ? mkText({}) : mkClip({}), c));
  return p;
}
