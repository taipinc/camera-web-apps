import test from 'node:test';
import assert from 'node:assert/strict';
import { dragValue } from '../public/shared/dials.js';
import { advanceCaptureTime } from '../public/app/frame-stack/capture-timing.js';

test('dial drag is relative, bounded, and snaps to integer or fractional steps', () => {
  assert.equal(dragValue(50, 18, 0, 100, 1), 60);
  assert.equal(dragValue(50, -18, 0, 100, 1), 40);
  assert.equal(dragValue(50, 1000, 0, 100, 1), 100);
  assert.equal(dragValue(50, -1000, 0, 100, 1), 0);
  assert.equal(dragValue(0, 1, -180, 180, 1), 2);
  assert.equal(dragValue(1, 2, 1, 10, 0.1), 1.1);
  assert.equal(dragValue(0, 100, 0, 0, 1), 0);
});

test('fine dial dragging reduces sensitivity tenfold', () => {
  assert.equal(dragValue(50, 18, 0, 100, 0.1, true), 51);
});

test('sampling maintains selected FPS despite callback jitter', () => {
  for (const fps of [1, 3, 6, 12, 24, 30, 48, 60]) {
    const interval = 1000 / fps;
    let next = 0;
    let captured = 0;
    for (let i = 0; i < 600; i += 1) {
      const now = i * (1000 / 60) + (i % 2 ? 0.2 : 0);
      if (now + 0.5 >= next) {
        next = advanceCaptureTime(now, next, interval);
        captured += 1;
      }
    }
    assert.ok(Math.abs(captured - fps * 10) <= 1, `${fps} FPS captured ${captured} frames`);
  }
});

test('late callbacks skip missed capture times without queuing a burst', () => {
  assert.equal(advanceCaptureTime(1050, 0, 100), 1100);
});

// Exercise pointer interruptions without needing a browser or camera permission.
function pointer(type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, buttons: 1, clientX: 0, clientY: 0, isPrimary: true, pointerType: 'touch', ...properties });
  return event;
}

async function dialFixture(root = new EventTarget(), host = new EventTarget()) {
  const { bindDialDrag } = await import('../public/shared/dials.js');
  const dial = new EventTarget();
  const classes = new Set();
  const captured = new Set();
  dial.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name) };
  dial.setPointerCapture = (id) => captured.add(id);
  dial.hasPointerCapture = (id) => captured.has(id);
  dial.releasePointerCapture = (id) => {
    captured.delete(id);
    dial.dispatchEvent(pointer('lostpointercapture', { pointerId: id }));
  };
  const input = new EventTarget();
  Object.assign(input, { value: 50, min: 0, max: 100, step: 1, disabled: false });
  input.matches = () => input.disabled;
  input.focus = () => {};
  bindDialDrag(dial, input, root, host);
  return { dial, input, root, host, classes };
}

test('two touch pointers adjust separate dials independently and release independently', async () => {
  const column = await dialFixture();
  const scroll = await dialFixture(column.root, column.host);
  column.dial.dispatchEvent(pointer('pointerdown'));
  scroll.dial.dispatchEvent(pointer('pointerdown', { pointerId: 2, isPrimary: false, clientX: 100 }));
  column.root.dispatchEvent(pointer('pointermove', { clientX: 18 }));
  column.root.dispatchEvent(pointer('pointermove', { pointerId: 2, isPrimary: false, clientX: 82 }));
  assert.equal(column.input.value, 60);
  assert.equal(scroll.input.value, 40);
  assert.equal(column.classes.has('is-dragging'), true);
  assert.equal(scroll.classes.has('is-dragging'), true);
  column.root.dispatchEvent(pointer('pointerup'));
  assert.equal(column.classes.has('is-dragging'), false);
  assert.equal(scroll.classes.has('is-dragging'), true);
  column.root.dispatchEvent(pointer('pointermove', { pointerId: 2, isPrimary: false, clientX: 64 }));
  assert.equal(scroll.input.value, 30);
  column.root.dispatchEvent(pointer('pointercancel', { pointerId: 2, isPrimary: false }));
  assert.equal(scroll.classes.has('is-dragging'), false);
  column.root.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 0 }));
  assert.equal(scroll.input.value, 30);
});

test('a second touch cannot steal an active dial and interruptions release all dials', async () => {
  const first = await dialFixture();
  const second = await dialFixture(first.root, first.host);
  first.dial.dispatchEvent(pointer('pointerdown'));
  first.dial.dispatchEvent(pointer('pointerdown', { pointerId: 2, isPrimary: false }));
  first.root.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 90 }));
  assert.equal(first.input.value, 50);
  first.root.dispatchEvent(pointer('pointermove', { clientX: 18 }));
  assert.equal(first.input.value, 60);
  second.dial.dispatchEvent(pointer('pointerdown', { pointerId: 2, isPrimary: false }));
  first.host.dispatchEvent(new Event('pagehide'));
  for (const fixture of [first, second]) assert.equal(fixture.classes.has('is-dragging'), false);
});

test('a fresh press recovers a dial after a missed pointer release', async () => {
  const { dial, input, root, classes } = await dialFixture();
  dial.dispatchEvent(pointer('pointerdown'));
  root.dispatchEvent(pointer('pointermove', { clientX: 18 }));
  assert.equal(input.value, 60);
  dial.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 100 }));
  root.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 82 }));
  assert.equal(input.value, 50);
  root.dispatchEvent(pointer('pointerup', { pointerId: 2 }));
  assert.equal(classes.has('is-dragging'), false);
});

test('drag highlighting and pointer state clear on release, interruption, hiding, and disabling', async () => {
  for (const interruption of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'visibilitychange', 'hidden', 'disabled']) {
    const { dial, input, root, host, classes } = await dialFixture();
    dial.dispatchEvent(pointer('pointerdown'));
    assert.equal(classes.has('is-dragging'), true);
    if (['pointerup', 'pointercancel'].includes(interruption)) root.dispatchEvent(pointer(interruption));
    else if (interruption === 'lostpointercapture') dial.dispatchEvent(pointer(interruption));
    else if (['blur', 'pagehide'].includes(interruption)) host.dispatchEvent(new Event(interruption));
    else if (interruption === 'visibilitychange') root.dispatchEvent(new Event(interruption));
    else {
      if (interruption === 'hidden') dial.hidden = true;
      else input.disabled = true;
      root.dispatchEvent(new Event('dialsupdate'));
    }
    assert.equal(classes.has('is-dragging'), false, interruption);
    root.dispatchEvent(pointer('pointermove', { clientX: 90 }));
    assert.equal(input.value, 50, interruption);
    dial.hidden = false;
    input.disabled = false;
    dial.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));
    root.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 18 }));
    assert.equal(input.value, 60, interruption);
  }
});

test('dials increase upward and decrease downward as well as horizontally', async () => {
  const { dial, input, root } = await dialFixture();
  dial.dispatchEvent(pointer('pointerdown'));
  root.dispatchEvent(pointer('pointermove', { clientY: -18 }));
  assert.equal(input.value, 60);
  root.dispatchEvent(pointer('pointermove', { clientY: 18 }));
  assert.equal(input.value, 40);
  root.dispatchEvent(pointer('pointermove', { clientX: 18, clientY: -18 }));
  assert.equal(input.value, 70);
});

test('shared capture button keeps one element through camera and recording states', async () => {
  const { updateCaptureButton } = await import('../public/shared/controls.js');
  const attributes = {};
  const image = {};
  const dot = {};
  const button = { dataset: {}, setAttribute: (name, value) => { attributes[name] = value; }, querySelector: (selector) => selector === 'img' ? image : dot };
  for (const state of ['start', 'record', 'recording', 'stopped', 'start']) {
    updateCaptureButton(button, state);
    assert.equal(button.dataset.state, state);
    assert.equal(image.hidden, state !== 'start');
    assert.equal(dot.hidden, state === 'start');
    assert.equal(attributes['aria-pressed'], String(state === 'recording'));
    assert.ok(attributes['aria-label']);
  }
});

test('duration cycles through every supported value and wraps to four seconds', async () => {
  const { initializeCycleButtons } = await import('../public/shared/controls.js');
  const button = new EventTarget();
  const label = {};
  Object.assign(button, { value: '4', dataset: { cycleValues: '4 6 8 10 12', cycleLabel: 'sec' }, querySelector: () => label, setAttribute: () => {} });
  let changes = 0;
  button.addEventListener('input', () => { changes += 1; });
  initializeCycleButtons({ querySelectorAll: () => [button] });
  for (const expected of ['6', '8', '10', '12', '4']) {
    button.dispatchEvent(new Event('click'));
    assert.equal(button.value, expected);
    assert.equal(label.textContent, expected);
  }
  assert.equal(changes, 5);
});
