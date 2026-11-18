import test from 'node:test';
import assert from 'node:assert/strict';
import { presentVideoFrames } from '../public/app/frame-stack/video-import.js';
import { cameraChoices, cameraIndicator, createCameraCycle } from '../public/shared/camera.js';

test('video import preserves variable frame timing and normalizes the first timestamp', async () => {
  let clock = 100;
  const waits = [];
  const frames = [];
  const timestamps = [5, 5.04, 5.1, 5.12];
  const count = await presentVideoFrames(timestamps.map((timestamp) => ({ canvas: timestamp, timestamp })),
    (canvas, timestamp) => { frames.push({ canvas, timestamp }); clock += 10; },
    new AbortController().signal, {
      now: () => clock,
      wait: async (delay) => { waits.push(Math.round(delay)); clock += delay; },
    });
  assert.equal(count, 4);
  assert.deepEqual(waits, [0, 30, 50, 10]);
  assert.deepEqual(frames.map(({ canvas }) => canvas), timestamps);
  assert.equal(frames[0].timestamp, 0);
});

test('video import stops after the first 360 frames and closes its iterator', async () => {
  let closed = false;
  let read = 0;
  async function* samples() {
    try {
      for (let i = 0; i < 500; i += 1) { read += 1; yield { timestamp: i / 30 }; }
    } finally { closed = true; }
  }
  const count = await presentVideoFrames(samples(), () => {}, new AbortController().signal, {
    now: () => 0, wait: async () => {},
  });
  assert.equal(count, 360);
  assert.equal(read, 360);
  assert.ok(closed);
});

test('video import supports a 420-frame override without changing the default limit', async () => {
  let closed = false;
  let added = 0;
  async function* samples() {
    try {
      for (let index = 0; index < 500; index += 1) yield { canvas: index, timestamp: index / 30 };
    } finally { closed = true; }
  }
  const count = await presentVideoFrames(samples(), () => { added += 1; }, new AbortController().signal, {
    limit: 420, now: () => 0, wait: async () => {},
  });
  assert.equal(count, 420);
  assert.equal(added, 420);
  assert.equal(closed, true);
});

test('cancelling during a frame wait prevents that frame being added and closes the iterator', async () => {
  const controller = new AbortController();
  let closed = false;
  let added = 0;
  async function* samples() {
    try { yield { timestamp: 0 }; yield { timestamp: 1 }; }
    finally { closed = true; }
  }
  await assert.rejects(presentVideoFrames(samples(), () => { added += 1; }, controller.signal, {
    wait: async () => { controller.abort(); },
  }), { name: 'AbortError' });
  assert.equal(added, 0);
  assert.ok(closed);
});

test('camera cycle visits every exposed device, wraps, and refreshes after switching', async () => {
  const devices = ['wide', 'ultrawide', 'telephoto', 'front'];
  const mediaDevices = {
    enumerateDevices: async () => [...devices, 'front'].map((deviceId) => ({ kind: 'videoinput', deviceId })),
  };
  const cycle = createCameraCycle(mediaDevices);
  await cycle.sync({ getSettings: () => ({ deviceId: 'wide', facingMode: 'environment' }) });
  for (const expected of ['ultrawide', 'telephoto', 'front', 'wide']) {
    cycle.next();
    assert.equal(cycle.deviceId, expected);
    await cycle.sync({ getSettings: () => ({ deviceId: expected }) });
  }
});

test('camera cycle falls back to facing modes when enumeration fails', async () => {
  const mediaDevices = {
    enumerateDevices: async () => { throw new Error('Unavailable'); },
  };
  const cycle = createCameraCycle(mediaDevices);
  await cycle.sync({ getSettings: () => ({ facingMode: 'environment' }) });
  cycle.next();
  assert.equal(cycle.facing, 'user');
  assert.equal(cycle.deviceId, undefined);
});

test('physical cameras replace duplicate generic and composite rear devices', async () => {
  const labels = ['Back Camera', 'Back Triple Camera', 'Back Dual Wide Camera', 'Back Ultra Wide Camera', 'Back Wide Camera', 'Back Telephoto Camera', 'Front Camera'];
  const available = labels.map((label, index) => ({ kind: 'videoinput', label, deviceId: String(index) }));
  assert.deepEqual(cameraChoices(available).map(({ label }) => label), labels.slice(3));
  const cycle = createCameraCycle({ enumerateDevices: async () => available });
  await cycle.sync({ label: 'Back Triple Camera', getSettings: () => ({ deviceId: '1', facingMode: 'environment' }) });
  assert.equal(cycle.deviceId, '4');
  // A stale default ID must not reset the cursor after each explicit selection.
  for (const expected of ['5', '6', '3', '4']) {
    cycle.next();
    await cycle.sync({ getSettings: () => ({ deviceId: '1', facingMode: 'environment' }) });
    assert.equal(cycle.deviceId, expected);
  }
});

test('composite cameras remain available if no physical wide lens is exposed', () => {
  const devices = ['Back Triple Camera', 'Front Camera'].map((label) => ({ kind: 'videoinput', label, deviceId: label }));
  assert.deepEqual(cameraChoices(devices), devices);
});

test('generic Back Camera remains the wide lens when only the other physical lenses are named', () => {
  const labels = ['Back Camera', 'Back Dual Camera', 'Back Triple Camera', 'Back Ultra Wide Camera', 'Back Telephoto Camera', 'Front Camera'];
  const devices = labels.map((label) => ({ kind: 'videoinput', label, deviceId: label }));
  assert.deepEqual(cameraChoices(devices).map(({ label }) => label), [labels[0], ...labels.slice(3)]);
});

test('camera indicators use available lens information without inventing telephoto ratios', () => {
  assert.equal(cameraIndicator('Back Wide Camera').text, 'x1');
  assert.equal(cameraIndicator('Back Ultra Wide Camera').text, 'x.5');
  assert.equal(cameraIndicator('Back Telephoto Camera').text, 'Tele');
  assert.equal(cameraIndicator('Back Telephoto Camera (5x)').text, 'x5');
  assert.equal(cameraIndicator('Rear x2').text, 'x2');
  assert.equal(cameraIndicator('Front Camera').front, true);
});
