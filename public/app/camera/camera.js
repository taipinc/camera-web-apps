import { updateCameraButton, createCameraCycle, openCamera, stopStream, cameraError, recordingOptions, photoBlob } from '../../shared/camera.js';

const ui = Object.fromEntries([
  'preview', 'start', 'photo', 'record', 'flip', 'stop', 'status',
  'capture', 'image', 'recording', 'save', 'share', 'clear',
].map((id) => [id, document.getElementById(id)]));

let stream;
let microphone;
const cameras = createCameraCycle();
let busy = false;
let recordingPending = false;
let recorder;
let recordTimer;
let file;
let fileUrl;
let cameraRequest = 0;

function status(message = '') {
  ui.status.textContent = message;
  ui.status.hidden = !message;
}

function updateControls() {
  updateCameraButton(ui.flip, cameras.indicator);
  const active = Boolean(stream);
  const recording = Boolean(recorder);
  ui.start.hidden = active;
  ui.start.disabled = busy;
  ui.photo.disabled = !active || busy || recording || recordingPending;
  ui.flip.disabled = !active || busy || recording || recordingPending;
  ui.stop.disabled = !active || busy;
  ui.record.disabled = !active || busy || recordingPending || typeof MediaRecorder === 'undefined';
  ui.record.setAttribute('aria-pressed', String(recording));
  if (!recording) ui.record.textContent = 'Record';
}

function clearCapture() {
  ui.recording.pause();
  ui.recording.removeAttribute('src');
  ui.recording.load();
  ui.image.removeAttribute('src');
  ui.save.removeAttribute('href');
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = undefined;
  file = undefined;
  ui.capture.hidden = true;
}

function showCapture(blob) {
  if (!blob.size) {
    status('Nothing was recorded. Try again.');
    return;
  }
  clearCapture();
  const isImage = blob.type.startsWith('image/');
  const extension = isImage ? 'jpg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  file = new File([blob], `camera-${timestamp}.${extension}`, { type: blob.type });
  fileUrl = URL.createObjectURL(file);
  ui.image.hidden = !isImage;
  ui.recording.hidden = isImage;
  (isImage ? ui.image : ui.recording).src = fileUrl;
  ui.save.href = fileUrl;
  ui.save.download = file.name;
  ui.share.hidden = !navigator.canShare?.({ files: [file] });
  ui.capture.hidden = false;
}

function stopRecording() {
  clearInterval(recordTimer);
  if (recorder?.state === 'recording') {
    ui.record.disabled = true;
    recorder.stop();
  }
}

function closeCamera() {
  cameraRequest += 1;
  stopRecording();
  stopStream(microphone);
  microphone = undefined;
  stopStream(stream);
  stream = undefined;
  ui.preview.srcObject = null;
  busy = false;
  updateControls();
}

async function startCamera() {
  if (busy || stream) return;
  const request = ++cameraRequest;
  busy = true;
  status();
  updateControls();
  let nextStream;
  try {
    nextStream = await openCamera(cameras.facing, undefined, cameras.deviceId);
    if (request !== cameraRequest || document.hidden) {
      stopStream(nextStream);
      return;
    }
    await cameras.sync(nextStream.getVideoTracks()[0]);
    if (request !== cameraRequest || document.hidden) { stopStream(nextStream); return; }
    stream = nextStream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (stream === nextStream) {
        closeCamera();
        status('Camera disconnected.');
      }
    });
    ui.preview.srcObject = stream;
    const actualFacing = stream.getVideoTracks()[0].getSettings().facingMode || cameras.facing;
    ui.preview.classList.toggle('mirrored', actualFacing === 'user');
    await ui.preview.play();
  } catch (error) {
    stopStream(nextStream);
    if (request === cameraRequest) {
      stream = undefined;
      ui.preview.srcObject = null;
      status(cameraError(error));
    }
  } finally {
    if (request === cameraRequest) {
      busy = false;
      updateControls();
    }
  }
}

ui.start.addEventListener('click', startCamera);
ui.stop.addEventListener('click', () => { closeCamera(); status(); });

ui.flip.addEventListener('click', async () => {
  closeCamera();
  cameras.next();
  await startCamera();
});

ui.photo.addEventListener('click', async () => {
  busy = true;
  status();
  updateControls();
  try { showCapture(await photoBlob(ui.preview)); }
  catch (error) { status(error.message); }
  finally { busy = false; updateControls(); }
});

ui.record.addEventListener('click', async () => {
  if (recorder) { stopRecording(); return; }
  const cameraStream = stream;
  recordingPending = true;
  status();
  updateControls();
  try {
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      status('Recording without audio.');
    }
    if (stream !== cameraStream || document.hidden) {
      stopStream(microphone);
      microphone = undefined;
      return;
    }
    const input = new MediaStream([
      ...cameraStream.getVideoTracks(),
      ...(microphone?.getAudioTracks() || []),
    ]);
    const current = new MediaRecorder(input, recordingOptions());
    const chunks = [];
    recorder = current;
    current.addEventListener('dataavailable', ({ data }) => {
      if (data.size) chunks.push(data);
    });
    current.addEventListener('stop', () => {
      clearInterval(recordTimer);
      stopStream(microphone);
      microphone = undefined;
      recorder = undefined;
      const type = current.mimeType || chunks[0]?.type || 'video/mp4';
      showCapture(new Blob(chunks, { type }));
      updateControls();
    }, { once: true });
    current.addEventListener('error', () => {
      status('Recording failed. Try again.');
      stopRecording();
    });
    current.start(1000);
    const started = performance.now();
    const updateTime = () => {
      const seconds = Math.floor((performance.now() - started) / 1000);
      ui.record.textContent = `Stop ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };
    updateTime();
    recordTimer = setInterval(updateTime, 250);
  } catch (error) {
    recorder = undefined;
    stopStream(microphone);
    microphone = undefined;
    status(error.message || 'Could not start recording.');
  } finally {
    recordingPending = false;
    updateControls();
  }
});

ui.clear.addEventListener('click', clearCapture);
ui.share.addEventListener('click', async () => {
  if (!file) return;
  try { await navigator.share({ files: [file] }); }
  catch (error) { if (error.name !== 'AbortError') status('Could not share. Try Save instead.'); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeCamera();
});
window.addEventListener('pagehide', closeCamera);
window.addEventListener('pageshow', updateControls);
updateControls();
