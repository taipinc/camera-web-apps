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
        value: ({ fps: '30', duration: '4', column: '50', sweep: '50', amplitude: '0', frequency: '1' })[id] || '',
        classList: { toggle() {} },
        getContext: () => ({ drawImage() {} }),
        play: async () => {},
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
    load(file = {}) {
      document.getElementById('video-file').files = [file];
      document.getElementById('video-file').dispatchEvent(new Event('change'));
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
    assert.equal(options.limit, 420);
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
  assert.equal(app.ui.count.value, '2 / 420 frames');
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
