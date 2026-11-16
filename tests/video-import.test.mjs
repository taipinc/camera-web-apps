import test from 'node:test';
import assert from 'node:assert/strict';
import { presentVideoFrames } from '../public/app/frame-stack/video-import.js';
import { createCameraCycle } from '../public/shared/camera.js';

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
