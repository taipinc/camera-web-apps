// Pace decoded frames by their presentation timestamps, including variable FPS.
export async function presentVideoFrames(samples, onFrame, signal, {
  limit = 360,
  now = () => performance.now(),
  wait = waitForFrame,
} = {}) {
  let firstTimestamp;
  let started;
  let count = 0;
  for await (const sample of samples) {
    signal.throwIfAborted();
    if (firstTimestamp === undefined) {
      firstTimestamp = sample.timestamp;
      started = now();
    }
    const timestamp = sample.timestamp - firstTimestamp;
    await wait(Math.max(0, started + timestamp * 1000 - now()), signal);
    signal.throwIfAborted();
    onFrame(sample.canvas, timestamp);
    if (++count >= limit) break;
  }
  return count;
}

function waitForFrame(delay, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function importVideo(file, onFrame, signal) {
  if (typeof VideoDecoder === 'undefined') {
    throw new Error('Video loading requires a browser with WebCodecs support. Try a newer Safari or Chrome.');
  }
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('https://cdn.jsdelivr.net/npm/mediabunny@1.66.0/dist/bundles/mediabunny.mjs');
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const abort = () => input.dispose();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no video track.');
    if (!await track.canDecode()) throw new Error('This browser cannot decode this video. Try an H.264 MP4 file.');
    const [width, height] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
    const longest = Math.max(width, height);
    const size = Math.min(480, longest);
    const sink = new CanvasSink(track, {
      ...(width >= height ? { width: size } : { height: size }),
      poolSize: 1,
    });
    return await presentVideoFrames(sink.canvases(), onFrame, signal);
  } finally {
    signal.removeEventListener('abort', abort);
    input.dispose();
  }
}
