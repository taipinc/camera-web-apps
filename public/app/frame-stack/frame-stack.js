import { updateCameraButton, createCameraCycle, openCamera, stopStream, cameraError } from '../../shared/camera.js';
import { frameDepth } from './slicing.js';
import { createSlicer } from './stack-slicer.js';
import { initializeDials } from '../../shared/dials.js';
import { initializeCycleButtons, initializeChoiceButtons, updateCaptureButton } from '../../shared/controls.js';
import { advanceCaptureTime } from './capture-timing.js';
import { importVideo } from './video-import.js';
import { frameSize, resizeLiveCard } from './live-frame.js';

const ui = Object.fromEntries(['empty-actions', 'new', 'load', 'video-file', 'stage', 'count', 'reset', 'preview', 'capture', 'capture-tools', 'slice-types', 'duration', 'flip', 'clear', 'status', 'fps'].map((id) => [id, document.getElementById(id)]));
let maxFrames = 120;
let captureTimer;
let frameInterval = 1000 / 30;
initializeDials();
initializeCycleButtons();
initializeChoiceButtons();
// Chronological source images and timestamps remain separate from their 3D meshes.
const frames = [];
let stream;
let loading;
const cameras = createCameraCycle();
let busy = false;
let ready = false;
let capturing = false;
let request = 0;
let captureCallback;
let startedAt;
let nextFrameAt = 0;
let view;

function status(message = '') {
  ui.status.textContent = message;
  ui.status.hidden = !message;
}

function updateControls() {
  updateCameraButton(ui.flip, cameras.indicator);
  const dissecting = frames.length > 0 && !capturing && !loading;
  ui['empty-actions'].hidden = Boolean(frames.length || stream || loading);
  ui.new.disabled = ui.load.disabled = !ready || busy || Boolean(loading);
  ui['capture-tools'].hidden = dissecting;
  ui['slice-types'].hidden = !dissecting;
  view?.setSlicing(dissecting);
  updateCaptureButton(ui.capture, capturing ? 'recording' : stream ? (frames.length ? 'stopped' : 'record') : 'start');
  ui.capture.disabled = !ready || busy || Boolean(loading);
  ui.flip.disabled = !stream || busy || capturing;
  ui.clear.disabled = (!frames.length && !loading) || capturing;
  ui.reset.disabled = !ready;
  ui.fps.disabled = capturing || busy || Boolean(loading);
  ui.duration.disabled = capturing || busy || Boolean(loading);
  ui.count.hidden = !capturing && !loading;
  ui.count.value = `${frames.length} / ${maxFrames} frames`;
}

function stopCapture() {
  clearTimeout(captureTimer);
  const wasCapturing = capturing;
  capturing = false;
  if (wasCapturing) {
    view?.stopLive();
    view?.showStack();
  }
  if (ui.preview.cancelVideoFrameCallback && captureCallback !== undefined) {
    ui.preview.cancelVideoFrameCallback(captureCallback);
  } else {
    cancelAnimationFrame(captureCallback);
  }
  captureCallback = undefined;
  updateControls();
}

function closeCamera() {
  request += 1;
  loading?.abort();
  loading = undefined;
  stopCapture();
  view?.stopLive();
  stopStream(stream);
  stream = undefined;
  ui.preview.srcObject = null;
  busy = false;
  updateControls();
}

async function startCamera() {
  if (busy || stream || !ready) return;
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
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      if (stream === next) { closeCamera(); status('Camera disconnected.'); }
    });
    ui.preview.srcObject = stream;
    await ui.preview.play();
    if (current !== request || document.hidden) { stopStream(next); return; }
    view.startLive();
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
    if (now + 0.5 >= nextFrameAt && ui.preview.readyState >= 2) {
      addSourceFrame(ui.preview, (now - startedAt) / 1000);
      nextFrameAt = advanceCaptureTime(now, nextFrameAt, frameInterval);
      updateControls();
      if (frames.length >= maxFrames) {
        closeCamera();
        status();
        return;
      }
    }
    captureCallback = ui.preview.requestVideoFrameCallback
      ? ui.preview.requestVideoFrameCallback(captureFrame)
      : requestAnimationFrame(captureFrame);
  } catch (error) {
    stopCapture();
    status(error.message || 'Could not capture frame.');
  }
}

function addSourceFrame(source, timestamp) {
  const width = source.videoWidth || source.width;
  const height = source.videoHeight || source.height;
  if (!width || !height) throw new Error('Video frame is not ready yet.');
  const image = document.createElement('canvas');
  const size = frameSize(width, height);
  image.width = size.width;
  image.height = size.height;
  image.getContext('2d').drawImage(source, 0, 0, image.width, image.height);
  const frame = { image, timestamp };
  view.add(frame);
  frames.push(frame);
}

ui.new.addEventListener('click', startCamera);
ui.load.addEventListener('click', () => { ui['video-file'].value = ''; ui['video-file'].click(); });
ui['video-file'].addEventListener('change', async () => {
  const file = ui['video-file'].files[0];
  if (!file || !ready || busy || loading || stream || frames.length) return;
  const controller = new AbortController();
  loading = controller;
  maxFrames = 360;
  view.reset();
  status();
  updateControls();
  try {
    const count = await importVideo(file, (canvas, timestamp) => {
      addSourceFrame(canvas, timestamp);
      updateControls();
    }, controller.signal);
    if (!count) throw new Error('No video frames could be loaded.');
  } catch (error) {
    if (!controller.signal.aborted) status(error.message || 'Could not load this video.');
  } finally {
    if (loading === controller) {
      loading = undefined;
      view.showStack();
      updateControls();
    }
    ui['video-file'].value = '';
  }
});

function clearFrames() {
  view.clear();
  frames.forEach(({ image }) => { image.width = image.height = 0; });
  frames.length = 0;
  updateControls();
}

ui.flip.addEventListener('click', () => {
  closeCamera();
  cameras.next();
  startCamera();
});
ui.capture.addEventListener('click', async () => {
  if (!stream) { startCamera(); return; }
  if (capturing) { stopCapture(); return; }
  busy = true;
  updateControls();
  try {
    await stream.getVideoTracks()[0].applyConstraints({ frameRate: { ideal: Number(ui.fps.value) } });
  } catch (error) {
    busy = false;
    updateControls();
    status(cameraError(error));
    return;
  }
  busy = false;
  if (!stream || document.hidden) { updateControls(); return; }
  clearFrames();
  status();
  startedAt = performance.now();
  nextFrameAt = startedAt;
  frameInterval = 1000 / Number(ui.fps.value);
  maxFrames = Number(ui.fps.value) * Number(ui.duration.value);
  capturing = true;
  captureTimer = setTimeout(() => { closeCamera(); status(); }, Number(ui.duration.value) * 1000);
  view.startLive();
  updateControls();
  captureFrame(startedAt);
});
for (const control of [ui.fps, ui.duration]) {
  control.addEventListener('input', () => {
    if (!frames.length) maxFrames = Number(ui.fps.value) * Number(ui.duration.value);
    updateControls();
  });
}
ui.clear.addEventListener('click', () => {
  closeCamera();
  clearFrames();
  status();
});
ui.reset.addEventListener('click', () => view.toggleView());
document.addEventListener('visibilitychange', () => { if (document.hidden) closeCamera(); });
window.addEventListener('pagehide', closeCamera);

async function initializeView() {
  const [THREE, { OrbitControls }] = await Promise.all([
    import('three'), import('three/addons/controls/OrbitControls.js'),
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xf3f3f3);
  ui.stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D frame stack');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.minZoom = 0.2;
  controls.maxZoom = 8;
  const stack = new THREE.Group();
  scene.add(stack);
  const cards = [];
  let liveCard;
  let liveCanvas;
  let liveContext;
  let lastVideoTime = -1;
  let imageHeight = 2.1375;
  let transitionFrame;
  function isFrontView() {
    const direction = camera.position.clone().sub(controls.target).normalize();
    return direction.z > 0 && Math.abs(direction.x) < 0.001 && Math.abs(direction.y) < 0.001;
  }
  function render() {
    const label = isFrontView() ? 'Isometric view' : 'Front view';
    ui.reset.setAttribute('aria-label', label);
    ui.reset.title = label;
    renderer.render(scene, camera);
  }
  const slicer = createSlicer(THREE, scene, render);
  function fitProjection() {
    const aspect = ui.stage.clientWidth / Math.max(1, ui.stage.clientHeight);
    // Fit the frame's actual proportions instead of reserving a fixed height.
    const padding = 1.12;
    const halfHeight = Math.max(imageHeight / 2, 3.8 / (2 * aspect)) * padding;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }
  function cancelTransition() {
    cancelAnimationFrame(transitionFrame);
  }
  function reset() {
    cancelTransition();
    camera.position.set(0, 0, 12);
    controls.target.set(0, 0, 0);
    camera.zoom = 1;
    fitProjection();
    controls.update();
    render();
  }
  function showStack() {
    cancelTransition();
    const viewCards = liveCard ? [...cards, liveCard] : cards;
    if (!viewCards.length) return;
    // Include every recorded card, even when the slicer currently hides it.
    const bounds = new THREE.Box3();
    viewCards.forEach((card) => {
      card.updateWorldMatrix(true, false);
      bounds.union(new THREE.Box3().setFromObject(card));
    });
    const target = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(1, 1, 1).normalize();
    const destination = target.clone().addScaledVector(direction, bounds.getSize(new THREE.Vector3()).length() + 12);
    const rotation = new THREE.Matrix4().lookAt(destination, target, camera.up);
    const inverse = new THREE.Quaternion().setFromRotationMatrix(rotation).invert();
    let halfWidth = 0;
    let halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).sub(target).applyQuaternion(inverse);
          halfWidth = Math.max(halfWidth, Math.abs(point.x));
          halfHeight = Math.max(halfHeight, Math.abs(point.y));
        }
      }
    }
    animateView(destination, target, () => Math.min(controls.maxZoom,
      (camera.right - camera.left) / (2 * halfWidth * 1.15),
      (camera.top - camera.bottom) / (2 * halfHeight * 1.15)));
  }
  function animateView(destination, target, targetZoom) {
    cancelTransition();
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const fromZoom = camera.zoom;
    const started = performance.now();
    function animate(now) {
      const progress = Math.min(1, (now - started) / 650);
      const eased = progress * progress * (3 - 2 * progress);
      const zoom = targetZoom();
      camera.position.lerpVectors(fromPosition, destination, eased);
      controls.target.lerpVectors(fromTarget, target, eased);
      camera.zoom = fromZoom + (zoom - fromZoom) * eased;
      camera.updateProjectionMatrix();
      controls.update();
      render();
      if (progress < 1) transitionFrame = requestAnimationFrame(animate);
    }
    transitionFrame = requestAnimationFrame(animate);
  }
  function createCard(texture, width, height) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const geometry = new THREE.PlaneGeometry(3.8, 3.8 * height / width);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    slicer.attach(material);
    const card = new THREE.Mesh(geometry, material);
    stack.add(card);
    const nextHeight = geometry.parameters.height;
    if (nextHeight !== imageHeight) {
      imageHeight = nextHeight;
      fitProjection();
    }
    return card;
  }
  function disposeCard(card) {
    stack.remove(card);
    card.material.map.dispose();
    card.material.dispose();
    card.geometry.dispose();
  }
  function stopLive() {
    renderer.setAnimationLoop(null);
    if (liveCard) disposeCard(liveCard);
    liveCard = undefined;
    if (liveCanvas) liveCanvas.width = liveCanvas.height = 0;
    liveCanvas = liveContext = undefined;
    slicer.sync(cards);
  }
  function startLive() {
    stopLive();
    reset();
    if (!ui.preview.videoWidth || !ui.preview.videoHeight) return;
    // Reuse one small canvas for live video, at the same resolution as captured cards.
    liveCanvas = document.createElement('canvas');
    const size = frameSize(ui.preview.videoWidth, ui.preview.videoHeight);
    liveCanvas.width = size.width;
    liveCanvas.height = size.height;
    liveContext = liveCanvas.getContext('2d');
    liveContext.drawImage(ui.preview, 0, 0, liveCanvas.width, liveCanvas.height);
    liveCard = createCard(new THREE.CanvasTexture(liveCanvas), liveCanvas.width, liveCanvas.height);
    liveCard.position.z = 2.055;
    lastVideoTime = -1;
    slicer.sync(cards, liveCard);
    renderer.setAnimationLoop(updateLive);
  }
  function updateLive(force = false) {
    if (!liveCard || ui.preview.readyState < 2 || !ui.preview.videoWidth || !ui.preview.videoHeight) return;
    const resized = resizeLiveCard(THREE, ui.preview, liveCanvas, liveCard);
    if (resized) {
      imageHeight = liveCard.geometry.parameters.height;
      fitProjection();
    }
    if (resized || force === true || ui.preview.currentTime !== lastVideoTime) {
      lastVideoTime = ui.preview.currentTime;
      liveContext.drawImage(ui.preview, 0, 0, liveCanvas.width, liveCanvas.height);
      liveCard.material.map.needsUpdate = true;
      if (resized) slicer.sync(cards, liveCard);
      else render();
    }
  }
  // Intrinsic video size can change after viewport orientation has settled.
  ui.preview.addEventListener('resize', () => updateLive(true));
  controls.addEventListener('start', cancelTransition);
  controls.addEventListener('change', render);
  const observer = new ResizeObserver(() => {
    const { width, height } = ui.stage.getBoundingClientRect();
    renderer.setSize(Math.max(1, width - 2), Math.max(1, height - 2), false);
    updateLive(true);
    fitProjection();
    render();
  });
  observer.observe(ui.stage);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    closeCamera();
    ready = false;
    document.querySelectorAll('#dissection input, #dissection select, #dissection button').forEach((control) => { control.disabled = true; });
    updateControls();
    status('3D view interrupted. Reload this page to continue.');
  });
  view = {
    reset,
    setSlicing: slicer.setActive,
    toggleView() {
      if (isFrontView()) showStack();
      else {
        fitProjection();
        animateView(new THREE.Vector3(0, 0, 12), new THREE.Vector3(), () => 1);
      }
    },
    showStack,
    startLive,
    stopLive,
    add(frame) {
      const card = createCard(new THREE.CanvasTexture(frame.image), frame.image.width, frame.image.height);
      // Images stand upright in XY, facing +Z; older frames move straight back.
      cards.push(card);
      cards.forEach((item, index) => {
        item.position.set(0, 0, frameDepth(index, cards.length));
      });
      slicer.sync(cards, liveCard);
    },
    clear() {
      cancelTransition();
      cards.forEach(disposeCard);
      cards.length = 0;
      slicer.sync(cards, liveCard);
    },
  };
  reset();
  ready = true;
  status();
  updateControls();
}
initializeView().catch(() => {
  status('Could not load the 3D view. Check your connection and WebGL support, then reload.');
});
