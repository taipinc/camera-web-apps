import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createFrameStore, captureFrameLimit, SOURCE_MAX_EDGE, IMPORT_FRAME_LIMIT } from '../public/app/slit-camera/frames.js';

// Exercise the app's UI lifecycle with fake media/import boundaries. Real video
// decoding and browser rendering still require device testing.
const source = readFileSync(new URL('../public/app/slit-camera/slit-camera.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(importVideo = async () => 0) {
  const elements = new Map();
  const document = new EventTarget();
  const window = new EventTarget();
  document.hidden = false;
  document.getElementById = (id) => {
    if (!elements.has(id)) {
      const element = new EventTarget();
      Object.assign(element, {
        value: ({ fps: '30', duration: '4', column: '50', sweep: '50', amplitude: '0', frequency: '1', scroll: '50', pxw: '1' })[id] || '',
        classList: { toggle() {} },
        style: {}, clientWidth: 300, clientHeight: 400,
        setAttribute(name, value) { this[name] = value; },
        querySelector: () => ({}),
        getContext: () => ({ drawImage() {} }),
        play: async () => {},
        focus() {},
        clicks: 0,
        click() { this.clicks += 1; this.dispatchEvent(new Event('click')); },
      });
      elements.set(id, element);
    }
    return elements.get(id);
  };
  const store = createFrameStore(() => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }));
  let stopped = 0;
  const track = new EventTarget();
  const stream = { getVideoTracks: () => [track], getTracks: () => [{ stop() { stopped += 1; } }] };
  runInNewContext(source, {
    document, window, Event, AbortController, console,
    createFrameStore: () => store, captureFrameLimit, SOURCE_MAX_EDGE, IMPORT_FRAME_LIMIT,
    createCameraCycle: () => ({ sync: async () => {}, next() {} }),
    updateCameraButton() {}, updateCaptureButton() {},
    initializeCycleButtons() {}, initializeDials() {},
    openCamera: async () => stream,
    stopStream: (current) => current?.getTracks().forEach((item) => item.stop()),
    cameraError: (error) => error.message,
    importVideo, clearTimeout, setTimeout,
  });
  return {
    ui: Object.fromEntries(elements), document, window, store,
    get stopped() { return stopped; },
    selectFile(file = {}) {
      document.getElementById('video-file').files = [file];
      document.getElementById('video-file').dispatchEvent(new Event('change'));
    },
    load(file = {}) {
      this.selectFile(file);
      document.getElementById('load-start').click();
    },
  };
}

test('New opens a camera preview and leaving returns to the empty start screen', async () => {
  const app = setup();
  assert.equal(app.ui['empty-actions'].hidden, false);
  assert.equal(app.ui.editing.hidden, true);
  app.ui.new.click();
  assert.equal(app.ui.new.disabled, true);
  await flush();
  assert.equal(app.ui['empty-actions'].hidden, true);
  assert.ok(app.ui.preview.srcObject);
  app.window.dispatchEvent(new Event('pagehide'));
  assert.equal(app.stopped, 1);
  assert.equal(app.ui.preview.srcObject, null);
  assert.equal(app.ui['empty-actions'].hidden, false);
});

test('Load picks a video, keeps complete imported frames, and enables all editing dials on completion', async () => {
  let finish;
  const app = setup(async (file, onFrame, signal, options) => {
    assert.equal(options.limit, 480);
    assert.equal(options.maxEdge, 576);
    onFrame({ width: 1280, height: 720 }, 0);
    onFrame({ width: 720, height: 1280 }, 0.25);
    await new Promise((resolve) => { finish = resolve; });
    return 2;
  });
  app.ui.load.click();
  assert.equal(app.ui['video-file'].clicks, 1);
  app.load();
  assert.equal(app.ui['empty-actions'].hidden, true);
  assert.equal(app.ui.capture.disabled, true);
  assert.equal(app.ui.clear.disabled, false);
  assert.equal(app.ui.editing.hidden, true);
  assert.equal(app.ui.image.hidden, false);
  assert.equal(app.ui.count.value, '2 / 480 frames');
  assert.equal(app.store.frames[0].image.width, 576);
  assert.equal(app.store.frames[1].image.height, 576);
  assert.equal(app.store.frames[1].timestamp, 0.25);
  finish();
  await flush();
  assert.equal(app.ui.editing.hidden, false);
  for (const id of ['column', 'sweep', 'amplitude', 'frequency']) assert.equal(app.ui[id].disabled, false);
  assert.equal(app.ui.capture.disabled, false);
  app.ui.clear.click();
  assert.equal(app.store.frames.length, 0);
  assert.equal(app.ui['empty-actions'].hidden, false);
});

test('completed scans replace capture controls and support pixel width, fit, zoom, and scroll', async () => {
  const app = setup(async (_file, onFrame) => {
    for (let i = 0; i < 3; i += 1) onFrame({ width: 10, height: 1 }, i);
    return 3;
  });
  app.load();
  await flush();
  for (const id of ['capture', 'fps', 'duration', 'flip']) assert.equal(app.ui[id].hidden, true);
  for (const id of ['pxw', 'fit', 'zoom', 'scroll-dial']) assert.equal(app.ui[id].hidden, false);
  assert.equal(app.ui.image.style.width, '100%');
  app.ui.pxw.value = '2';
  app.ui.pxw.dispatchEvent(new Event('input'));
  assert.equal(app.ui.image.width, 6);
  app.ui.zoom.click();
  assert.equal(app.ui.image.style.width, '2400px');
  assert.equal(app.ui.image.style.left, '-1050px');
  app.ui.scroll.value = '100';
  app.ui.scroll.dispatchEvent(new Event('input'));
  assert.equal(app.ui.image.style.left, '-2100px');
  app.ui.scroll.value = '0';
  app.ui.scroll.dispatchEvent(new Event('input'));
  assert.equal(app.ui.image.style.left, '0px');
  app.ui.fit.click();
  assert.equal(app.ui.image.style.width, '100%');
  assert.equal(app.ui.image.style.left, '0');
  app.ui.clear.click();
  assert.equal(app.ui.pxw.value, '1');
  assert.equal(app.ui.scroll.value, '50');
  assert.equal(app.ui.pxw.hidden, true);
  assert.equal(app.ui.capture.hidden, false);
});

test('file selection asks for a frame count, validates 1–2400, and imports from the start', async () => {
  const limits = [];
  const app = setup(async (_file, onFrame, _signal, options) => {
    limits.push(options.limit);
    onFrame({ width: 10, height: 10 }, 0);
    return 1;
  });
  app.selectFile();
  assert.equal(app.ui['load-options'].hidden, false);
  assert.equal(app.ui['load-frames'].value, '480');
  app.ui['frames-more'].click();
  assert.equal(app.ui['load-frames'].value, '600');
  app.ui['frames-less'].click();
  assert.equal(app.ui['load-frames'].value, '480');
  app.ui['frames-less'].click();
  assert.equal(app.ui['load-frames'].value, '360');
  assert.equal(app.ui.capture.disabled, true);
  assert.equal(limits.length, 0);
  for (const value of ['', '0', '2401', '2.5']) {
    app.ui['load-frames'].value = value;
    app.ui['load-start'].click();
    assert.equal(limits.length, 0);
    assert.equal(app.ui['load-options'].hidden, false);
  }
  app.ui['load-frames'].value = '2400';
  app.ui['frames-more'].click();
  assert.equal(app.ui['load-frames'].value, '2400');
  app.ui['load-start'].click();
  await flush();
  assert.deepEqual(limits, [2400]);
  assert.equal(app.ui.count.value, '1 / 2400 frames');
  assert.equal(app.store.frames[0].timestamp, 0);
  assert.equal(app.ui['load-options'].hidden, true);
});

test('cancelling or interrupting file options releases the file without importing', () => {
  const app = setup(() => { throw new Error('Must not import'); });
  app.selectFile();
  app.ui['load-frames'].value = '1';
  app.ui['frames-less'].click();
  assert.equal(app.ui['load-frames'].value, '1');
  app.ui['load-cancel'].click();
  assert.equal(app.ui['load-options'].hidden, true);
  assert.equal(app.ui['empty-actions'].hidden, false);
  assert.equal(app.ui.capture.disabled, false);
  app.selectFile();
  assert.equal(app.ui['load-frames'].value, '480');
  app.window.dispatchEvent(new Event('pagehide'));
  assert.equal(app.ui['load-options'].hidden, true);
  app.ui['load-start'].click();
  assert.equal(app.store.frames.length, 0);
});

test('Clear aborts loading and stale frames or completion cannot change a newer import', async () => {
  const pending = [];
  const app = setup((file, onFrame, signal) => new Promise((resolve) => pending.push({ onFrame, signal, resolve })));
  app.load();
  assert.equal(app.ui.clear.disabled, false);
  app.ui.clear.click();
  assert.equal(pending[0].signal.aborted, true);
  app.load();
  pending[0].onFrame({ width: 480, height: 270 }, 0);
  pending[0].resolve(1);
  await flush();
  assert.equal(app.store.frames.length, 0);
  assert.equal(app.ui.capture.disabled, true);
  pending[1].onFrame({ width: 480, height: 270 }, 0);
  pending[1].resolve(1);
  await flush();
  assert.equal(app.store.frames.length, 1);
  assert.equal(app.ui.editing.hidden, false);
});

test('empty and failed imports show errors and allow another load', async () => {
  for (const importer of [async () => 0, async () => { throw new Error('Unsupported video.'); }]) {
    const app = setup(importer);
    app.load();
    await flush();
    assert.equal(app.ui.status.hidden, false);
    assert.ok(app.ui.status.textContent);
    assert.equal(app.ui['empty-actions'].hidden, false);
    assert.equal(app.ui.load.disabled, false);
    assert.equal(app.ui.clear.disabled, true);
  }
});

test('page interruption aborts an import while retaining frames already decoded for editing', async () => {
  let signal;
  let finish;
  const app = setup((file, onFrame, currentSignal) => {
    signal = currentSignal;
    onFrame({ width: 480, height: 270 }, 0);
    return new Promise((resolve) => { finish = resolve; });
  });
  app.load();
  app.document.hidden = true;
  app.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(signal.aborted, true);
  assert.equal(app.store.frames.length, 1);
  assert.equal(app.ui.capture.disabled, false);
  finish(1);
  await flush();
  assert.equal(app.ui.status.hidden, true);
});
