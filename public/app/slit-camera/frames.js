import { frameSize } from '../frame-stack/live-frame.js';

export const SOURCE_MAX_EDGE = 576;
export const IMPORT_FRAME_LIMIT = 2400;

export function captureFrameLimit(fps, duration) {
  return fps * duration;
}

export function sampledColumn(width, percent = 50) {
  return Math.min(width - 1, Math.max(0, Math.floor(width * percent / 100)));
}

// A monotone cubic through 0, the chosen midpoint, and 1. The shared
// midpoint slope keeps both halves smooth; a 50% midpoint is exactly linear.
function samplingCurve(time, middle) {
  const centerSlope = 4 * middle * (1 - middle);
  const firstHalf = time <= 0.5;
  const t = firstHalf ? time * 2 : (time - 0.5) * 2;
  const start = firstHalf ? 0 : middle;
  const end = firstHalf ? middle : 1;
  const startSlope = firstHalf ? Math.max(0, 4 * middle - 1) : centerSlope;
  const endSlope = firstHalf ? centerSlope : Math.max(0, 3 - 4 * middle);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * start + (t3 - 2 * t2 + t) * startSlope / 2
    + (-2 * t3 + 3 * t2) * end + (t3 - t2) * endSlope / 2;
}

export function samplingPosition(index, count, column = 50, sweep = 50, amplitude = 0, frequency = 1) {
  const middle = Math.min(100, Math.max(0, column)) / 100;
  const strength = Math.min(1, Math.abs(sweep - 50) / 50);
  // A single frame represents the midpoint, regardless of sweep direction.
  const time = count > 1 ? index / (count - 1) : 0.5;
  const curve = samplingCurve(sweep > 50 ? 1 - time : time, middle);
  const cycles = Math.min(10, Math.max(1, Math.round(frequency)));
  const phase = time * cycles * 2;
  // Exact zero crossings keep endpoints and the midpoint stable, including
  // their pixel selection (sin(nπ) otherwise leaves floating-point residue).
  const sine = Math.abs(phase - Math.round(phase)) < 1e-10 ? 0 : Math.sin(Math.PI * phase);
  const wave = sine * Math.min(100, Math.max(0, amplitude)) / 2;
  return Math.min(100, Math.max(0, (middle + (curve - middle) * strength) * 100 + wave));
}

// Source canvases are never cropped or changed when rebuilding the slit image.
export function createFrameStore(createCanvas = () => document.createElement('canvas')) {
  const frames = [];
  return {
    frames,
    add(source, timestamp) {
      const width = source.videoWidth || source.width;
      const height = source.videoHeight || source.height;
      if (!width || !height) throw new Error('Video frame is not ready yet.');
      const image = createCanvas();
      const size = frameSize(width, height, SOURCE_MAX_EDGE);
      image.width = size.width;
      image.height = size.height;
      image.getContext('2d').drawImage(source, 0, 0, image.width, image.height);
      frames.push({ image, timestamp });
      return true;
    },
    render(canvas, percent = 50, sweep = 50, amplitude = 0, frequency = 1, pixelWidth = 1) {
      canvas.width = Math.max(1, frames.length * pixelWidth);
      canvas.height = frames[0]?.image.height || 1;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      frames.forEach(({ image }, column) => {
        // If orientation changes, retain each full source and fit its strip to
        // the first frame's height. Each source still contributes one column.
        const position = samplingPosition(column, frames.length, percent, sweep, amplitude, frequency);
        context.drawImage(image, sampledColumn(image.width, position), 0, 1, image.height,
          column * pixelWidth, 0, pixelWidth, canvas.height);
      });
    },
    clear() {
      frames.forEach(({ image }) => { image.width = image.height = 0; });
      frames.length = 0;
    },
  };
}
