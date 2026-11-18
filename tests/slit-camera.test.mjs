import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrameStore, captureFrameLimit, sampledColumn, samplingPosition } from '../public/app/slit-camera/frames.js';

function canvas() {
  const calls = [];
  const context = { calls, drawImage: (...args) => calls.push(args) };
  return { width: 0, height: 0, getContext: () => context };
}

test('retains complete resized frames and timestamps independently of the slit image', () => {
  const store = createFrameStore(canvas);
  const source = { videoWidth: 1280, videoHeight: 720 };
  store.add(source, 0);
  store.add(source, 0.25);
  const [first, second] = store.frames;
  assert.notEqual(first.image, second.image);
  assert.equal(first.image.width, 576);
  assert.equal(first.image.height, 324);
  assert.equal(second.timestamp, 0.25);
  assert.deepEqual(first.image.getContext().calls, [[source, 0, 0, 576, 324]]);
  const output = canvas();
  store.render(output);
  assert.equal(output.width, 2);
  assert.equal(output.height, 324);
  assert.equal(output.getContext().imageSmoothingEnabled, false);
  assert.deepEqual(output.getContext().calls, [
    [first.image, 288, 0, 1, 324, 0, 0, 1, 324],
    [second.image, 288, 0, 1, 324, 1, 0, 1, 324],
  ]);
  store.render(canvas());
  assert.equal(first.image.width, 576);
  assert.equal(first.image.getContext().calls.length, 1);
});

test('576-pixel source limit preserves aspect ratios and does not upscale smaller frames', () => {
  const store = createFrameStore(canvas);
  for (const [width, height] of [[1920, 1080], [1080, 1920], [1000, 1000], [320, 240]]) {
    store.add({ width, height }, 0);
  }
  assert.deepEqual(store.frames.map(({ image }) => [image.width, image.height]),
    [[576, 324], [324, 576], [576, 576], [320, 240]]);
});

test('preserves differently oriented sources and aligns their strips to the first height', () => {
  const store = createFrameStore(canvas);
  store.add({ width: 3, height: 5 }, 0);
  store.add({ width: 5, height: 3 }, 1);
  const output = canvas();
  store.render(output);
  assert.deepEqual(output.getContext().calls[1], [store.frames[1].image, 2, 0, 1, 3, 1, 0, 1, 5]);
  assert.equal(store.frames[1].image.height, 3);
});

test('supports full FPS × duration captures beyond 120 frames and releases sources on clear', () => {
  const store = createFrameStore(canvas);
  assert.equal(captureFrameLimit(30, 4), 120);
  assert.equal(captureFrameLimit(30, 12), 360);
  assert.equal(captureFrameLimit(60, 12), 720);
  assert.equal(captureFrameLimit(1, 12), 12);
  for (let index = 0; index < captureFrameLimit(60, 12); index += 1) {
    assert.equal(store.add({ width: 480, height: 270 }, index / 60), true);
  }
  assert.equal(store.frames.length, 720);
  const result = canvas();
  store.render(result);
  assert.equal(result.width, 720);
  const images = store.frames.map(({ image }) => image);
  store.clear();
  assert.equal(store.frames.length, 0);
  assert.ok(images.every((image) => image.width === 0 && image.height === 0));
  const output = canvas();
  store.render(output);
  assert.equal(output.width, 1);
  assert.equal(output.height, 1);
});

test('column percentage reaches both edges and keeps the default center for odd and even widths', () => {
  for (const width of [1, 3, 270, 480]) {
    assert.equal(sampledColumn(width, 0), 0);
    assert.equal(sampledColumn(width), Math.floor(width / 2));
    assert.equal(sampledColumn(width, 100), width - 1);
    assert.equal(sampledColumn(width, -10), 0);
    assert.equal(sampledColumn(width, 110), width - 1);
  }
  assert.equal(sampledColumn(480, 25), 120);
  assert.equal(sampledColumn(480, 75), 360);
});

test('editing resamples every retained frame without modifying sources or timestamps', () => {
  const store = createFrameStore(canvas);
  store.add({ width: 480, height: 270 }, 0);
  store.add({ width: 270, height: 480 }, 0.5);
  for (const percent of [0, 25, 50, 75, 100, 50]) {
    const result = canvas();
    store.render(result, percent);
    assert.equal(result.width, 2);
    assert.equal(result.height, 270);
    store.frames.forEach(({ image, timestamp }, index) => {
      assert.deepEqual(result.getContext().calls[index],
        [image, sampledColumn(image.width, percent), 0, 1, image.height, index, 0, 1, 270]);
      assert.equal(timestamp, index * 0.5);
      assert.equal(image.getContext().calls.length, 1);
    });
  }
  assert.equal(store.frames[0].image.width, 480);
  assert.equal(store.frames[1].image.height, 480);
});

test('duration control includes longer captures up to 30 seconds', () => {
  const html = readFileSync(new URL('../public/app/slit-camera/index.html', import.meta.url), 'utf8');
  const values = html.match(/id="duration"[^>]*data-cycle-values="([^"]+)"/)[1];
  assert.deepEqual(values.split(' ').map(Number), [4, 6, 8, 10, 12, 16, 20, 30]);
  assert.equal(captureFrameLimit(60, 30), 1800);
});

test('sweep is neutral at 50%, linear at centered full sweep, and reversible', () => {
  for (let index = 0; index < 101; index += 1) {
    for (const column of [0, 25, 50, 75, 100]) {
      assert.equal(samplingPosition(index, 101, column, 50), column);
    }
    assert.ok(Math.abs(samplingPosition(index, 101, 50, 0) - index) < 1e-10);
    assert.ok(Math.abs(samplingPosition(index, 101, 50, 100) - (100 - index)) < 1e-10);
  }
  assert.equal(samplingPosition(0, 5, 50, 25), 25);
  assert.equal(samplingPosition(2, 5, 50, 25), 50);
  assert.equal(samplingPosition(4, 5, 50, 25), 75);
});

test('sweep curves stay monotonic, bounded, smooth at the column anchor, and reach both edges', () => {
  for (const column of [0, 0.1, 10, 25, 50, 75, 90, 99.9, 100]) {
    for (const sweep of [0, 20, 49.9, 50, 50.1, 80, 100]) {
      let previous = samplingPosition(0, 1001, column, sweep);
      for (let index = 1; index < 1001; index += 1) {
        const current = samplingPosition(index, 1001, column, sweep);
        assert.ok(Number.isFinite(current) && current >= 0 && current <= 100);
        assert.ok(sweep <= 50 ? current >= previous - 1e-10 : current <= previous + 1e-10);
        previous = current;
      }
      assert.equal(samplingPosition(500, 1001, column, sweep), column);
      assert.equal(samplingPosition(0, 1, column, sweep), column);
    }
    assert.equal(samplingPosition(0, 5, column, 0), 0);
    assert.equal(samplingPosition(4, 5, column, 0), 100);
    assert.equal(samplingPosition(0, 5, column, 100), 100);
    assert.equal(samplingPosition(4, 5, column, 100), 0);
    const leftSlope = (column - samplingPosition(499999, 1000001, column, 0)) / 0.000001;
    const rightSlope = (samplingPosition(500001, 1000001, column, 0) - column) / 0.000001;
    assert.ok(Math.abs(leftSlope - rightSlope) < 0.01);
  }
});

test('sweep rendering resamples existing frames and handles empty and single-frame captures', () => {
  const store = createFrameStore(canvas);
  store.render(canvas(), 25, 0);
  for (let index = 0; index < 5; index += 1) store.add({ width: 480, height: 270 }, index / 30);
  for (const sweep of [0, 25, 50, 75, 100]) {
    const result = canvas();
    store.render(result, 25, sweep);
    store.frames.forEach(({ image, timestamp }, index) => {
      const position = samplingPosition(index, 5, 25, sweep);
      assert.deepEqual(result.getContext().calls[index],
        [image, sampledColumn(480, position), 0, 1, 270, index, 0, 1, 270]);
      assert.equal(image.getContext().calls.length, 1);
      assert.equal(timestamp, index / 30);
    });
  }
  store.clear();
  store.add({ width: 480, height: 270 }, 0);
  const single = canvas();
  store.render(single, 25, 100);
  assert.equal(single.getContext().calls[0][1], 120);
});

test('sine amplitude scales lateral offsets and frequency counts cycles across the sequence', () => {
  const positions = (amplitude, frequency) => Array.from({ length: 5 }, (_, index) =>
    samplingPosition(index, 5, 50, 50, amplitude, frequency));
  assert.deepEqual(positions(0, 10), [50, 50, 50, 50, 50]);
  assert.deepEqual(positions(50, 1), [50, 75, 50, 25, 50]);
  assert.deepEqual(positions(100, 1), [50, 100, 50, 0, 50]);
  assert.deepEqual(positions(100, 2), [50, 50, 50, 50, 50]);
  assert.equal(samplingPosition(1, 9, 50, 50, 100, 2), 100);
  assert.equal(samplingPosition(3, 9, 50, 50, 100, 2), 0);
});

test('sine offsets add to the sweep and clamp at edges without shifting endpoint or midpoint anchors', () => {
  for (let frequency = 1; frequency <= 10; frequency += 1) {
    for (const column of [0, 25, 50, 75, 100]) {
      for (const sweep of [0, 25, 50, 75, 100]) {
        for (const index of [0, 500, 1000]) {
          assert.equal(samplingPosition(index, 1001, column, sweep, 100, frequency),
            samplingPosition(index, 1001, column, sweep));
        }
        assert.equal(samplingPosition(0, 1, column, sweep, 100, frequency), column);
      }
    }
  }
  assert.equal(samplingPosition(1, 5, 50, 0, 50, 1), 50);
  assert.equal(samplingPosition(3, 5, 50, 0, 50, 1), 50);
  assert.equal(samplingPosition(1, 5, 90, 50, 100, 1), 100);
  assert.equal(samplingPosition(3, 5, 10, 50, 100, 1), 0);
});

test('wave rendering samples full retained images without modifying them', () => {
  const store = createFrameStore(canvas);
  store.render(canvas(), 50, 50, 100, 10);
  for (let index = 0; index < 5; index += 1) store.add({ width: 480, height: 270 }, index / 30);
  const result = canvas();
  store.render(result, 50, 50, 50, 1);
  const columns = [240, 360, 240, 120, 240];
  store.frames.forEach(({ image, timestamp }, index) => {
    assert.deepEqual(result.getContext().calls[index],
      [image, columns[index], 0, 1, 270, index, 0, 1, 270]);
    assert.equal(image.getContext().calls.length, 1);
    assert.equal(image.width, 480);
    assert.equal(image.height, 270);
    assert.equal(timestamp, index / 30);
  });
});

test('wave dials declare a zero-amplitude default and whole-number frequency range', () => {
  const html = readFileSync(new URL('../public/app/slit-camera/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="amplitude"[^>]*min="0" max="100" step="0.1" value="0" disabled/);
  assert.match(html, /id="frequency"[^>]*min="1" max="10" step="1" value="1" disabled/);
});

test('rejects unavailable video frames without retaining a source', () => {
  const store = createFrameStore(canvas);
  assert.throws(() => store.add({ videoWidth: 0, videoHeight: 0 }, 0), /not ready/);
  assert.equal(store.frames.length, 0);
});
