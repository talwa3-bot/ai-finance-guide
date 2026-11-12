'use strict';
// Dependency-free controller regressions. Rendering and media decoding are stubbed;
// the real engine/UI scripts, actions, import flow, history and event handlers run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app() {
  const elements = new Map(), listeners = new Map();
  let buttons = [], document;
  function element(selector, action) {
    return {
      dataset: action ? { a: action } : {}, tagName: 'BUTTON', hidden: true,
      style: {}, attributes: {}, classList: { add() {}, remove() {}, toggle() {} },
      get innerHTML() { return this.html || ''; },
      set innerHTML(html) {
        this.html = html;
        if (selector === '#mbox') buttons = [...html.matchAll(/<button[^>]*data-a="([^"]+)"/g)].map(m => element('modalButton', m[1]));
      },
      addEventListener(type, fn) { listeners.set(selector + ':' + type, fn); },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      focus() { document.activeElement = this; },
      contains(el) { return selector === '#mbox' && buttons.includes(el); },
      closest(sel) { return sel === '[data-a]' && this.dataset.a ? this : null; },
      getContext() { return {}; }
    };
  }
  function querySelector(selector) {
    if (selector === '#mbox video') return null;
    const modalAction = selector.match(/^#mbox \[data-a=["']?(\w+)["']?\]$/);
    if (modalAction) return buttons.find(b => b.dataset.a === modalAction[1]) || null;
    if (!elements.has(selector)) elements.set(selector, element(selector, selector === '[data-a=silence]' ? 'silence' : null));
    return elements.get(selector);
  }
  document = {
    body: { dataset: { tab: 'media' } }, activeElement: null,
    querySelector,
    querySelectorAll(selector) { return selector === '#mbox button' ? buttons : []; },
    addEventListener(type, fn) { listeners.set('document:' + type, fn); }
  };
  const context = vm.createContext({
    document, window: { addEventListener() {} }, console,
    setTimeout() { return 1; }, clearTimeout() {}, matchMedia() { return { matches: false }; },
    URL: { revokeObjectURL() {} }
  });
  for (const name of ['engine.js', 'ui.js', 'ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context, { filename: name });
  }
  const run = code => vm.runInContext(code, context);
  run(`
    refresh = renderTimeline = renderInspector = renderPanel = setCanvas = () => {};
    DB.putMedia = () => {}; DB.saveProject = async () => {};
    S.p = newProject(); S.p.name = 'Regression project';
    S.media.set('media', { id: 'media', kind: 'video', name: '<sample>.mp4', duration: 10,
      w: 1920, h: 1080, blob: { size: 1 },
      peaks: Array.from({ length: 500 }, (_, i) => (i >= 50 && i < 150) || (i >= 300 && i < 400) ? 0.8 : 0) });
    S.p.clips = [
      mkClip({ id: 'selected', type: 'video', mediaId: 'media', trackId: 'v1', start: 2, dur: 10 }),
      mkClip({ id: 'next', type: 'video', mediaId: 'media', trackId: 'v1', start: 12, dur: 2 }),
      mkClip({ id: 'other', type: 'video', mediaId: 'media', trackId: 'v2', start: 15, dur: 2 })
    ];
    S.sel = 'selected'; H.stack = [snap()]; H.i = 0;
  `);
  function click(action) {
    const el = buttons.find(b => b.dataset.a === action) || element('action', action);
    listeners.get('document:click')({ target: el });
  }
  function key(key, shiftKey = false) {
    let prevented = false;
    listeners.get('document:keydown')({ key, shiftKey, target: document.activeElement || element('body'), preventDefault() { prevented = true; } });
    return prevented;
  }
  return { run, click, key, document, querySelector, listeners, snapshot: () => run('snap()') };
}

test('video import and completed audio analysis preserve the entire clip by default', async () => {
  const a = app();
  a.run(`
    S.p = newProject(); S.sel = null; H.stack = [snap()]; H.i = 0;
    buildMedia = async rec => Object.assign(rec, { duration: 10, w: 1920, h: 1080 });
    computePeaks = async () => S.media.get('media').peaks;
  `);
  await a.run(`handleFiles([{ type: 'video/mp4', name: 'uploaded.mp4', size: 1 }])`);
  await Promise.resolve();
  assert.equal(a.run('S.p.clips.length'), 1);
  assert.equal(a.run('S.p.clips[0].dur'), 10);
  assert.equal(a.run('S.p.clips[0].in'), 0);
  assert.equal(a.run('S.media.get(S.p.clips[0].mediaId).peaks.length'), 500);
  assert.equal(a.run('pendingSilence'), null);
  assert.equal(a.querySelector('#modal').hidden, true);
});

test('preview reports duration without editing or saving, and defaults focus to cancellation', () => {
  const a = app(), before = a.snapshot();
  a.run('S.playing = true');
  a.click('silence');
  assert.equal(a.snapshot(), before);
  assert.equal(a.run('H.i'), 0);
  assert.equal(a.run('saveTimer'), 0);
  assert.equal(a.run('S.playing'), false);
  assert.equal(a.document.activeElement.dataset.a, 'closeModal');
  assert.equal(a.querySelector('#mbox').attributes['aria-labelledby'], 'silenceTitle');
  assert.match(a.querySelector('#mbox').innerHTML, /5\.6 שניות/);
  assert.match(a.querySelector('#mbox').innerHTML, /10\.0 ל־4\.4 שניות/);
  assert.match(a.querySelector('#mbox').innerHTML, /&lt;sample&gt;\.mp4/);
  a.click('silence');
  assert.equal(a.snapshot(), before);
  assert.equal(a.run('H.i'), 0);
});

for (const dismiss of ['cancel', 'escape', 'backdrop']) {
  test(`${dismiss} leaves the project and history unchanged and invalidates approval`, () => {
    const a = app(), before = a.snapshot(); a.click('silence');
    if (dismiss === 'cancel') a.click('closeModal');
    if (dismiss === 'escape') a.key('Escape');
    if (dismiss === 'backdrop') {
      const el = a.querySelector('#modal'); a.listeners.get('#modal:click')({ target: el, currentTarget: el });
    }
    a.click('silenceGo');
    assert.equal(a.snapshot(), before);
    assert.equal(a.run('H.i'), 0);
    assert.equal(a.run('pendingSilence'), null);
    assert.equal(a.querySelector('#modal').hidden, true);
    assert.equal(a.document.activeElement.dataset.a, 'silence');
  });
}

test('Tab and Shift+Tab remain in the confirmation, and clicks inside do not dismiss it', () => {
  const a = app(); a.click('silence');
  assert.equal(a.key('Tab', true), true);
  assert.equal(a.document.activeElement.dataset.a, 'silenceGo');
  assert.equal(a.key('Tab'), true);
  assert.equal(a.document.activeElement.dataset.a, 'closeModal');
  a.listeners.get('#modal:click')({ target: a.querySelector('#mbox'), currentTarget: a.querySelector('#modal') });
  assert.equal(a.querySelector('#modal').hidden, false);
});

test('confirmation without an active preview cannot change the project', () => {
  const a = app(), before = a.snapshot(); a.click('silenceGo');
  assert.equal(a.snapshot(), before); assert.equal(a.run('H.i'), 0);
});

test('approval applies exactly the displayed cut once; undo restores all original clips', () => {
  const a = app(), before = a.snapshot(), source = a.run('JSON.stringify(S.media.get("media"))');
  a.click('silence'); a.click('silenceGo');
  assert.equal(a.run('H.i'), 1);
  assert.equal(a.run('S.p.clips.length'), 4);
  assert.equal(a.run('S.p.clips.some(c => c.id === "selected")'), false);
  assert.ok(Math.abs(a.run('S.p.clips.filter(c => !["next", "other"].includes(c.id)).reduce((t,c) => t+c.dur, 0)') - 4.4) < 1e-9);
  assert.ok(Math.abs(a.run('S.p.clips.find(c => c.id === "next").start') - 6.4) < 1e-9);
  assert.equal(a.run('S.p.clips.find(c => c.id === "other").start'), 15);
  assert.equal(a.run('JSON.stringify(S.media.get("media"))'), source);
  const edited = a.snapshot(); a.click('silenceGo');
  assert.equal(a.snapshot(), edited); assert.equal(a.run('H.i'), 1);
  a.click('undo'); assert.equal(a.snapshot(), before);
  a.click('redo'); assert.equal(a.snapshot(), edited);
});

for (const mutation of ['selClip().dur = 8', 'S.p.clips[1].start = 13', 'S.sel = "other"', 'S.p = newProject()']) {
  test(`stale confirmation is rejected after ${mutation}`, () => {
    const a = app(); a.click('silence'); a.run(mutation); const before = a.snapshot();
    a.click('silenceGo');
    assert.equal(a.snapshot(), before); assert.equal(a.run('H.i'), 0);
    assert.equal(a.run('pendingSilence'), null);
    assert.match(a.querySelector('#toast').textContent, /הפרויקט השתנה/);
  });
}

test('replacing a preview with another dialog invalidates the old approval', () => {
  const a = app(), before = a.snapshot(); a.click('silence'); a.click('newProj'); a.click('closeModal'); a.click('silenceGo');
  assert.equal(a.snapshot(), before); assert.equal(a.run('pendingSilence'), null);
});

test('cancelling and reopening requires fresh explicit approval', () => {
  const a = app(), before = a.snapshot(); a.click('silence'); a.click('closeModal'); a.click('silence');
  assert.equal(a.snapshot(), before); a.click('silenceGo'); assert.notEqual(a.snapshot(), before);
});

test('trimmed, sped-up audio uses timeline seconds for both preview and applied cut', () => {
  const a = app();
  a.run(`Object.assign(selClip(), { type: 'audio', in: 1, dur: 4, speed: 2 }); H.stack = [snap()];`);
  a.click('silence'); const removed = a.run('pendingSilence.removed');
  assert.ok(Math.abs(removed - 1.85) < 1e-9);
  assert.match(a.querySelector('#mbox').innerHTML, new RegExp(removed.toFixed(1).replace('.', '\\.') + ' שניות'));
  a.click('silenceGo');
  const kept = a.run('S.p.clips.filter(c => c.type === "audio").reduce((t,c) => t+c.dur, 0)');
  assert.ok(Math.abs(4 - kept - removed) < 1e-9);
});

for (const setup of ['S.sel = null', 'selClip().type = "image"', 'delete S.media.get("media").peaks', 'S.media.get("media").peaks.fill(0)', 'S.media.get("media").peaks.fill(0.8)']) {
  test(`ineligible selection does not offer or perform a cut: ${setup}`, () => {
    const a = app(); a.run(setup); const before = a.snapshot(); a.click('silence'); a.click('silenceGo');
    assert.equal(a.snapshot(), before); assert.equal(a.run('pendingSilence'), null); assert.equal(a.run('H.i'), 0);
  });
}
