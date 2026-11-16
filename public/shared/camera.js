export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function openCamera(facingMode, targetFps, deviceId) {
  if (!window.isSecureContext) {
    throw new Error('Camera access requires HTTPS.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is unavailable in this browser.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(targetFps ? { frameRate: { ideal: targetFps } } : {}),
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facingMode } }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

// Composite rear cameras can duplicate the physical wide lens in the device list.
export function cameraChoices(available) {
  const unique = available.filter((device, index) => device.kind === 'videoinput' && device.deviceId
    && available.findIndex((other) => other.deviceId === device.deviceId) === index);
  const namedWide = unique.find((device) => /wide/i.test(device.label || '')
    && !/ultra|dual|triple|front|user/i.test(device.label));
  const genericRear = unique.find((device) => /^(back|rear|environment) camera$/i.test(device.label || ''));
  const physicalWide = namedWide || (genericRear && unique.some((device) => /ultra|tele/i.test(device.label || '')));
  if (!physicalWide) return unique;
  return unique.filter((device) => !/dual|triple/i.test(device.label || '')
    && (!namedWide || !/^(back|rear|environment) camera$/i.test(device.label || '')));
}

export function cameraIndicator(label = '', facing = 'environment') {
  if (/front|user|facetime/i.test(label) || facing === 'user') return { text: '', front: true, name: 'Front camera' };
  const zoom = label.match(/(?:[x×]\s*(\d*\.?\d+)|(\d*\.?\d+)\s*[x×])/i);
  const ratio = zoom && Number(zoom[1] || zoom[2]);
  const text = ratio ? `x${ratio < 1 ? String(ratio).replace(/^0/, '') : ratio}`
    : /ultra[ -]?wide/i.test(label) ? 'x.5'
      : /tele/i.test(label) ? 'Tele'
        : /wide|back|rear|environment/i.test(label) || !label ? 'x1' : 'Cam';
  return { text, front: false, name: label || 'Back camera' };
}

export function updateCameraButton(button, indicator) {
  button.querySelector('img').hidden = !indicator.front;
  const label = button.querySelector('[data-camera-label]');
  label.hidden = indicator.front;
  label.textContent = indicator.text;
  const description = `${indicator.name}${indicator.text ? ` (${indicator.text})` : ''}. Next camera`;
  button.setAttribute('aria-label', description);
  button.title = description;
}

export function createCameraCycle(mediaDevices = navigator.mediaDevices) {
  let devices = [];
  let currentId;
  let facing = 'environment';
  let label = '';
  let selected = false;
  return {
    get facing() { return facing; },
    get deviceId() { return currentId; },
    get indicator() { return cameraIndicator(label, facing); },
    async sync(track) {
      const settings = track.getSettings();
      // Preserve explicit selections: some browsers report the default ID again.
      if (!selected) currentId = settings.deviceId;
      facing = settings.facingMode || facing;
      label = track.label || '';
      try {
        const available = await mediaDevices.enumerateDevices();
        devices = cameraChoices(available);
        let current = devices.find((device) => device.deviceId === currentId);
        if (!current) {
          const actual = available.find((device) => device.deviceId === settings.deviceId);
          const front = cameraIndicator(actual?.label || label, facing).front;
          current = !front && devices.find((device) => /wide/i.test(device.label || '') && !/ultra/i.test(device.label));
          current ||= !front && devices.find((device) => /^(back|rear|environment) camera$/i.test(device.label || ''));
          current ||= devices.find((device) => cameraIndicator(device.label, 'environment').front === front);
        }
        if (current) {
          currentId = current.deviceId;
          label = current.label || label;
          // The chosen device label is more useful than stale facing settings.
          if (/front|user|facetime/i.test(label)) facing = 'user';
          else if (/back|rear|wide|tele/i.test(label)) facing = 'environment';
        }
      } catch { devices = []; }
    },
    next() {
      if (devices.length) {
        const index = devices.findIndex((device) => device.deviceId === currentId);
        const next = devices[(index + 1) % devices.length];
        currentId = next.deviceId;
        label = next.label || '';
        selected = true;
      } else {
        currentId = undefined;
        facing = facing === 'environment' ? 'user' : 'environment';
        label = '';
        selected = false;
      }
    },
  };
}

export function cameraError(error) {
  switch (error.name) {
    case 'NotAllowedError': return 'Camera access was denied. Allow it in your browser settings and try again.';
    case 'NotFoundError': return 'No camera found.';
    case 'NotReadableError': return 'Camera is busy. Close other camera apps and try again.';
    default: return error.message || 'Could not open the camera.';
  }
}

export function recordingOptions() {
  const types = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : {};
}

export function photoBlob(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (!canvas.width || !canvas.height) {
    return Promise.reject(new Error('Camera is not ready yet.'));
  }
  canvas.getContext('2d').drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('Could not capture a photo.'));
    }, 'image/jpeg', 0.92);
  });
}
