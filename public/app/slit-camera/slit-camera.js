import { createCameraCycle, updateCameraButton, openCamera, stopStream, cameraError } from '../../shared/camera.js';
import { initializeCycleButtons, updateCaptureButton } from '../../shared/controls.js';
import { advanceCaptureTime } from '../frame-stack/capture-timing.js';
import { createFrameStore, captureFrameLimit } from './frames.js';
import { initializeDials } from '../../shared/dials.js';

const editingDefaults = { column: 50, sweep: 50, amplitude: 0, frequency: 1 };
const editingIds = Object.keys(editingDefaults);
const ui = Object.fromEntries([
  'preview', 'image', 'count', 'capture', 'fps', 'duration', 'flip', 'clear', 'status', 'editing',
  ...editingIds.flatMap((id) => [id, `${id}-dial`, `${id}-value`]),
].map((id) => [id, document.getElementById(id)]));
const store = createFrameStore();
const cameras = createCameraCycle();
let stream;
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
  store.render(ui.image, Number(ui.column.value), Number(ui.sweep.value), Number(ui.amplitude.value), Number(ui.frequency.value));
}

function updateEditingOutput(id) {
  const value = ui[id].value;
  ui[`${id}-value`].value = id === 'frequency'
    ? `${value} ${Number(value) === 1 ? 'cycle' : 'cycles'}` : `${value}%`;
}

function resetEditing() {
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
  ui.capture.disabled = busy;
  ui.fps.disabled = ui.duration.disabled = busy || capturing;
  ui.flip.disabled = !stream || busy || capturing;
  ui.clear.disabled = !store.frames.length || busy || capturing;
  ui.count.hidden = !store.frames.length && !capturing;
  ui.count.value = `${store.frames.length} / ${maxFrames} frames`;
  const showingImage = store.frames.length > 0 && (!stream || capturing);
  ui.image.hidden = !showingImage;
  ui.preview.classList.toggle('source-only', showingImage);
  const editing = showingImage && !capturing && !busy;
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
  stopCapture();
  stopStream(stream);
  stream = undefined;
  ui.preview.srcObject = null;
  busy = false;
  updateControls();
}

async function startCamera() {
  if (busy || stream) return;
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

ui.capture.addEventListener('click', async () => {
  if (busy) return;
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
    renderImage();
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) closeCamera(); });
window.addEventListener('pagehide', closeCamera);
updateControls();
