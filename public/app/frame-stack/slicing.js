export const frameSpacing = 0.055;
export const frontDepth = 2;

export function frameDepth(index, count) {
  return frontDepth - (count - 1 - index) * frameSpacing;
}

export function planeNormal(tiltX, tiltY, tiltZ = 0) {
  const x = tiltX * Math.PI / 180;
  const y = tiltY * Math.PI / 180;
  const z = tiltZ * Math.PI / 180;
  const nx = Math.sin(y) * Math.cos(x);
  const ny = -Math.sin(x);
  // World-axis Z rotation follows X/Y tilt, rotating the direction of the cut.
  return [nx * Math.cos(z) - ny * Math.sin(z), nx * Math.sin(z) + ny * Math.cos(z), Math.cos(y) * Math.cos(x)];
}

export function cutDepth(percent, count) {
  return frontDepth - percent / 100 * Math.max(0, count - 1) * frameSpacing;
}

export function visibleFrame(index, count, hiddenRecent) {
  return index < count - hiddenRecent;
}

function hash(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
  const b = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
}

// RGBA byte height map works without floating-point texture extensions on phones.
export function terrainMap(size, scale, seed) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / (size - 1) * scale + seed;
      const ny = y / (size - 1) * scale + seed * 0.73;
      const height = (noise(nx, ny) + 0.5 * noise(nx * 2, ny * 2) + 0.25 * noise(nx * 4, ny * 4)) / 1.75;
      const offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = Math.round(height * 255);
      data[offset + 3] = 255;
    }
  }
  return data;
}
