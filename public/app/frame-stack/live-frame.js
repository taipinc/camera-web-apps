export function frameSize(width, height) {
  const scale = Math.min(1, 480 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Only change the live card. Recorded frames keep their original aspect ratios.
export function resizeLiveCard(THREE, video, canvas, card) {
  if (!video.videoWidth || !video.videoHeight) return false;
  const { width, height } = frameSize(video.videoWidth, video.videoHeight);
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  card.geometry.dispose();
  card.geometry = new THREE.PlaneGeometry(3.8, 3.8 * height / width);
  // GPU textures must be replaced when their source dimensions change.
  const previous = card.material.map;
  card.material.map = previous.clone();
  card.material.map.image = canvas;
  card.material.map.needsUpdate = true;
  previous.dispose();
  return true;
}
