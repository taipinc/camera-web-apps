import test from 'node:test';
import assert from 'node:assert/strict';
import { cutDepth, frameDepth, frameSpacing, frontDepth, planeNormal, terrainMap, visibleFrame } from '../public/app/frame-stack/slicing.js';

test('new frames push older frames back without moving the front', () => {
  assert.equal(frameDepth(119, 120), frontDepth);
  assert.equal(frameDepth(0, 2), frontDepth - frameSpacing);
  assert.ok(Math.abs(frameDepth(0, 120) - (frameDepth(0, 119) - frameSpacing)) < 1e-12);
});

test('rewind hides only the newest frames and can hide the whole stack', () => {
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => visibleFrame(index, 5, 2)), [true, true, true, false, false]);
  assert.equal(visibleFrame(0, 5, 5), false);
  assert.equal(visibleFrame(4, 5, 0), true);
});

test('cut depth spans the captured stack, including empty and single frames', () => {
  assert.equal(cutDepth(0, 120), frontDepth);
  assert.equal(cutDepth(100, 120), frameDepth(0, 120));
  assert.equal(cutDepth(50, 1), frontDepth);
  assert.equal(cutDepth(50, 0), frontDepth);
});

test('rotated cut planes have a unit normal and can reverse the retained side', () => {
  assert.deepEqual(planeNormal(0, 0), [0, 0, 1]);
  for (const angles of [[45, 35], [90, 90], [-140, 178]]) {
    assert.ok(Math.abs(Math.hypot(...planeNormal(...angles)) - 1) < 1e-12);
  }
  assert.ok(planeNormal(0, 180)[2] < -0.999);
});

test('terrain is repeatable, varies with seed and detail, and has valid opaque heights', () => {
  const a = terrainMap(64, 3, 0);
  assert.equal(a.length, 64 * 64 * 4);
  assert.deepEqual(a, terrainMap(64, 3, 0));
  assert.notDeepEqual(a, terrainMap(64, 3, 1));
  assert.notDeepEqual(a, terrainMap(64, 4, 0));
  const heights = new Set();
  for (let i = 0; i < a.length; i += 4) {
    heights.add(a[i]);
    assert.equal(a[i], a[i + 1]);
    assert.equal(a[i], a[i + 2]);
    assert.equal(a[i + 3], 255);
  }
  assert.ok(heights.size > 100);
});

test('Z rotation turns the tilted cutting plane around the stack depth axis', () => {
  const original = planeNormal(30, 45, 0);
  const rotated = planeNormal(30, 45, 90);
  assert.ok(Math.abs(rotated[0] + original[1]) < 1e-12);
  assert.ok(Math.abs(rotated[1] - original[0]) < 1e-12);
  assert.ok(Math.abs(rotated[2] - original[2]) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...planeNormal(35, -120, 160)) - 1) < 1e-12);
});
