export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function openCamera(facingMode) {
  if (!window.isSecureContext) {
    throw new Error('Camera access requires HTTPS.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is unavailable in this browser.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
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
