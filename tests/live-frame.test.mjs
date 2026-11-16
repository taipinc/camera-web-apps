import test from 'node:test';
import assert from 'node:assert/strict';
import { frameSize, resizeLiveCard } from '../public/app/frame-stack/live-frame.js';

test('live frame dimensions preserve aspect ratio with a 480-pixel longest edge', () => {
  assert.deepEqual(frameSize(1920, 1080), { width: 480, height: 270 });
  assert.deepEqual(frameSize(1080, 1920), { width: 270, height: 480 });
  assert.deepEqual(frameSize(320, 240), { width: 320, height: 240 });
});

test('turning the live camera resizes the plane and replaces GPU resources only when needed', () => {
  let disposedGeometry = 0;
  let disposedTexture = 0;
  class PlaneGeometry {
    constructor(width, height) { this.parameters = { width, height }; }
    dispose() { disposedGeometry += 1; }
  }
  const texture = () => ({ clone: texture, dispose: () => { disposedTexture += 1; } });
  const card = { geometry: new PlaneGeometry(3.8, 3.8 * 480 / 270), material: { map: texture() }, position: { z: 2.055 } };
  const canvas = { width: 270, height: 480 };
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const previousMap = card.material.map;
  assert.equal(resizeLiveCard({ PlaneGeometry }, video, canvas, card), true);
  assert.deepEqual(canvas, { width: 480, height: 270 });
  assert.equal(card.geometry.parameters.height, 3.8 * 270 / 480);
  assert.notEqual(card.material.map, previousMap);
  assert.equal(card.material.map.image, canvas);
  assert.equal(card.material.map.needsUpdate, true);
  assert.equal(card.position.z, 2.055);
  assert.equal(disposedTexture, 1);
  assert.equal(disposedGeometry, 1);
  assert.equal(resizeLiveCard({ PlaneGeometry }, video, canvas, card), false);
  assert.equal(disposedTexture, 1);
  video.videoWidth = 1080;
  video.videoHeight = 1920;
  assert.equal(resizeLiveCard({ PlaneGeometry }, video, canvas, card), true);
  assert.deepEqual(canvas, { width: 270, height: 480 });
  assert.equal(card.geometry.parameters.height, 3.8 * 480 / 270);
  assert.equal(disposedTexture, 2);
  assert.equal(resizeLiveCard({ PlaneGeometry }, { videoWidth: 0, videoHeight: 0 }, canvas, card), false);
});
