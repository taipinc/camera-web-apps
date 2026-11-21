import { createCameraCycle, updateCameraButton, openCamera, stopStream, cameraError } from '../../shared/camera.js';
import { initializeCycleButtons, updateCaptureButton } from '../../shared/controls.js';
import { advanceCaptureTime } from '../frame-stack/capture-timing.js';
import { createFrameStore, captureFrameLimit, SOURCE_MAX_EDGE, IMPORT_FRAME_LIMIT } from './frames.js';
import { initializeDials } from '../../shared/dials.js';
import { importVideo } from '../frame-stack/video-import.js';

const editingDefaults = { column: 50, sweep: 50, amplitude: 0, frequency: 1, scroll: 50 };
const editingIds = Object.keys(editingDefaults);
const ui = Object.fromEntries([
  'preview', 'image', 'count', 'capture', 'fps', 'duration', 'flip', 'clear', 'status', 'editing',
  'empty-actions', 'new', 'load', 'video-file', 'stage', 'pxw', 'fit', 'zoom',
  'load-options', 'load-frames', 'load-start', 'load-cancel', 'frames-less', 'frames-more',
  ...editingIds.flatMap((id) => [id, `${id}-dial`, `${id}-value`]),
].map((id) => [id, document.getElementById(id)]));
const store = createFrameStore();
const cameras = createCameraCycle();
let viewMode = 'fit';
let stream;
let loading;
let pendingFile;
let busy = false;
let capturing = false;
let request = 0;
let callback;
let timer;
let startedAt;
let nextFrameAt;
let interval;
let maxFrames = captureFrameLimit(Number(ui.fps.value), Number(ui.duration.value));
initializeCycleButtons();
initializeDials();

function renderImage() {
  store.render(ui.image, Number(ui.column.value), Number(ui.sweep.value), Number(ui.amplitude.value), Number(ui.frequency.value), Number(ui.pxw.value));
  updateViewport();
}

function updateViewport() {
  const zoomed = viewMode === 'zoom';
  const width = ui.stage.clientHeight * ui.image.width / ui.image.height;
  const overflow = Math.max(0, width - ui.stage.clientWidth);
  Object.assign(ui.image.style, {
    width: zoomed ? `${width}px` : '100%',
    height: '100%',
    left: zoomed ? `${overflow ? -overflow * Number(ui.scroll.value) / 100 : (ui.stage.clientWidth - width) / 2}px` : '0',
  });
  ui.fit.setAttribute('aria-pressed', String(!zoomed));
  ui.zoom.setAttribute('aria-pressed', String(zoomed));
}

function updateEditingOutput(id) {
  const value = ui[id].value;
  ui[`${id}-value`].value = id === 'frequency'
    ? `${value} ${Number(value) === 1 ? 'cycle' : 'cycles'}` : `${value}%`;
}

function resetEditing() {
  viewMode = 'fit';
  ui.pxw.value = '1';
  ui.pxw.querySelector('[data-cycle-value]').textContent = '1';
  ui.pxw.setAttribute('aria-label', '1 pxw. Click to change');
  for (const id of editingIds) {
    ui[id].value = String(editingDefaults[id]);
    updateEditingOutput(id);
  }
}

function status(message = '') {
  ui.status.textContent = message;
  ui.status.hidden = !message;
}

function updateControls() {
  updateCameraButton(ui.flip, cameras.indicator);
  updateCaptureButton(ui.capture, capturing ? 'recording' : stream ? (store.frames.length ? 'stopped' : 'record') : 'start');
  ui['empty-actions'].hidden = Boolean(store.frames.length || stream || loading || pendingFile);
  ui['load-options'].hidden = !pendingFile;
  ui.new.disabled = ui.load.disabled = busy || Boolean(loading || pendingFile);
  ui.capture.disabled = busy || Boolean(loading || pendingFile);
  ui.fps.disabled = ui.duration.disabled = busy || capturing || Boolean(loading || pendingFile);
  ui.flip.disabled = !stream || busy || capturing;
  ui.clear.disabled = (!store.frames.length && !loading) || busy || capturing;
  ui.count.hidden = !store.frames.length && !capturing && !loading;
  ui.count.value = `${store.frames.length} / ${maxFrames} frames`;
  const showingImage = store.frames.length > 0 && (!stream || capturing);
  ui.image.hidden = !showingImage;
  ui.preview.classList.toggle('source-only', showingImage);
  const editing = showingImage && !capturing && !busy && !loading;
  for (const id of ['capture', 'fps', 'duration', 'flip']) ui[id].hidden = editing;
  for (const id of ['pxw', 'fit', 'zoom']) {
    ui[id].hidden = !editing;
    ui[id].disabled = !editing;
  }
  ui.editing.hidden = !editing;
  for (const id of editingIds) {
    ui[`${id}-dial`].hidden = !editing;
    ui[id].disabled = !editing;
  }
  document.dispatchEvent(new Event('dialsupdate'));
}

function stopCapture() {
  capturing = false;
  clearTimeout(timer);
  if (callback !== undefined) {
    if (ui.preview.cancelVideoFrameCallback) ui.preview.cancelVideoFrameCallback(callback);
    else cancelAnimationFrame(callback);
  }
  callback = undefined;
}

function closeCamera() {
  request += 1;
  loading?.abort();
  loading = undefined;
  pendingFile = undefined;
  ui['video-file'].value = '';
  stopCapture();
  stopStream(stream);
  stream = undefined;
  ui.preview.srcObject = null;
  busy = false;
  updateControls();
}

async function startCamera() {
  if (busy || stream || loading || pendingFile) return;
  const current = ++request;
  busy = true;
  status();
  updateControls();
  let next;
  try {
    next = await openCamera(cameras.facing, Number(ui.fps.value), cameras.deviceId);
    if (current !== request || document.hidden) { stopStream(next); return; }
    await cameras.sync(next.getVideoTracks()[0]);
    if (current !== request || document.hidden) { stopStream(next); return; }
    stream = next;
    next.getVideoTracks()[0].addEventListener('ended', () => {
      if (stream === next) { closeCamera(); status('Camera disconnected.'); }
    });
    ui.preview.srcObject = stream;
    await ui.preview.play();
    if (current !== request || document.hidden) { stopStream(next); return; }
  } catch (error) {
    stopStream(next);
    if (current === request) {
      stream = undefined;
      ui.preview.srcObject = null;
      status(cameraError(error));
    }
  } finally {
    if (current === request) { busy = false; updateControls(); }
  }
}

function captureFrame(now) {
  if (!capturing) return;
  try {
    if (now - startedAt >= Number(ui.duration.value) * 1000) { closeCamera(); return; }
    if (now + 0.5 >= nextFrameAt && ui.preview.readyState >= 2) {
      store.add(ui.preview, (now - startedAt) / 1000);
      renderImage();
      nextFrameAt = advanceCaptureTime(now, nextFrameAt, interval);
      updateControls();
      if (store.frames.length >= maxFrames) { closeCamera(); return; }
    }
    callback = ui.preview.requestVideoFrameCallback
      ? ui.preview.requestVideoFrameCallback(captureFrame)
      : requestAnimationFrame(captureFrame);
  } catch (error) {
    closeCamera();
    status(error.message || 'Could not capture frame.');
  }
}

ui.new.addEventListener('click', startCamera);
ui.load.addEventListener('click', () => {
  ui['video-file'].value = '';
  ui['video-file'].click();
});
ui['video-file'].addEventListener('change', () => {
  const file = ui['video-file'].files[0];
  if (!file || busy || loading || pendingFile || stream || store.frames.length) return;
  pendingFile = file;
  ui['load-frames'].value = '480';
  status();
  updateControls();
  ui['load-frames'].focus();
});
ui['load-cancel'].addEventListener('click', () => {
  pendingFile = undefined;
  ui['video-file'].value = '';
  status();
  updateControls();
  ui.load.focus();
});
ui['load-options'].addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter' && event.target === ui['load-frames']) {
    event.preventDefault();
    ui[event.key === 'Escape' ? 'load-cancel' : 'load-start'].click();
  }
});
for (const [id, step] of [['frames-less', -120], ['frames-more', 120]]) {
  ui[id].addEventListener('click', () => {
    const value = Number(ui['load-frames'].value);
    ui['load-frames'].value = String(Math.min(IMPORT_FRAME_LIMIT, Math.max(1, (Number.isFinite(value) ? Math.round(value) : 480) + step)));
  });
}
ui['load-start'].addEventListener('click', async () => {
  if (!pendingFile || busy || loading || stream || store.frames.length) return;
  const limit = Number(ui['load-frames'].value);
  if (!Number.isInteger(limit) || limit < 1 || limit > IMPORT_FRAME_LIMIT) {
    status(`Choose 1–${IMPORT_FRAME_LIMIT} frames.`);
    ui['load-frames'].focus();
    return;
  }
  const file = pendingFile;
  pendingFile = undefined;
  const controller = new AbortController();
  loading = controller;
  maxFrames = limit;
  resetEditing();
  status();
  updateControls();
  try {
    const count = await importVideo(file, (canvas, timestamp) => {
      // A cancelled import must never append to a later capture or import.
      if (loading !== controller || controller.signal.aborted) return;
      store.add(canvas, timestamp);
      renderImage();
      updateControls();
    }, controller.signal, { limit, maxEdge: SOURCE_MAX_EDGE });
    if (!count) throw new Error('No video frames could be loaded.');
  } catch (error) {
    if (loading === controller && !controller.signal.aborted) {
      status(error.message || 'Could not load this video.');
    }
  } finally {
    if (loading === controller) {
      loading = undefined;
      ui['video-file'].value = '';
      updateControls();
    }
  }
});

ui.capture.addEventListener('click', async () => {
  if (busy || loading || pendingFile) return;
  if (!stream) { startCamera(); return; }
  if (capturing) { closeCamera(); return; }
  const current = request;
  const source = stream;
  busy = true;
  updateControls();
  try {
    await source.getVideoTracks()[0].applyConstraints({ frameRate: { ideal: Number(ui.fps.value) } });
    if (current !== request || document.hidden) return;
    store.clear();
    resetEditing();
    status();
    startedAt = performance.now();
    nextFrameAt = startedAt;
    interval = 1000 / Number(ui.fps.value);
    maxFrames = captureFrameLimit(Number(ui.fps.value), Number(ui.duration.value));
    capturing = true;
    timer = setTimeout(closeCamera, Number(ui.duration.value) * 1000);
    captureFrame(startedAt);
  } catch (error) {
    if (current === request) status(cameraError(error));
  } finally {
    if (current === request) { busy = false; updateControls(); }
  }
});
ui.flip.addEventListener('click', () => {
  closeCamera();
  cameras.next();
  startCamera();
});
ui.clear.addEventListener('click', () => {
  closeCamera();
  store.clear();
  resetEditing();
  maxFrames = captureFrameLimit(Number(ui.fps.value), Number(ui.duration.value));
  renderImage();
  status();
  updateControls();
});
for (const control of [ui.fps, ui.duration]) {
  control.addEventListener('input', () => {
    if (!store.frames.length) maxFrames = captureFrameLimit(Number(ui.fps.value), Number(ui.duration.value));
    updateControls();
  });
}
for (const id of editingIds) {
  ui[id].addEventListener('input', () => {
    updateEditingOutput(id);
    if (id === 'scroll') updateViewport();
    else renderImage();
  });
}
ui.pxw.addEventListener('input', renderImage);
for (const mode of ['fit', 'zoom']) {
  ui[mode].addEventListener('click', () => {
    viewMode = mode;
    updateViewport();
  });
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateViewport).observe(ui.stage);
window.addEventListener('resize', updateViewport);
document.addEventListener('visibilitychange', () => { if (document.hidden) closeCamera(); });
window.addEventListener('pagehide', closeCamera);
updateControls();
