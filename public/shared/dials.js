export function dragValue(start, delta, min, max, step, fine = false) {
  const raw = start + delta * (max - min) / (fine ? 1800 : 180);
  const rounded = min + Math.round((raw - min) / step) * step;
  return Number(Math.min(max, Math.max(min, rounded)).toFixed(6));
}

// Listen outside the dial too: a missed release or interrupted touch must not lock it.
export function bindDialDrag(dial, input, root, host) {
  let drag;
  function finish() {
    const previous = drag;
    drag = undefined;
    dial.classList.remove('is-dragging');
    if (previous && dial.hasPointerCapture(previous.id)) dial.releasePointerCapture(previous.id);
  }
  dial.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.isPrimary === false || input.matches(':disabled')) return;
    // A fresh primary press always recovers from a missing pointerup/cancel.
    finish();
    event.preventDefault();
    input.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: Number(input.value) };
    dial.classList.add('is-dragging');
    try { dial.setPointerCapture(event.pointerId); }
    catch { /* Document listeners still handle the drag if capture is unavailable. */ }
  });
  root.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { finish(); return; }
    input.value = dragValue(drag.value, (event.clientX - drag.x) + (drag.y - event.clientY), Number(input.min), Number(input.max), Number(input.step) || 1, event.shiftKey);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const end = (event) => { if (drag?.id === event.pointerId) finish(); };
  root.addEventListener('pointerup', end, true);
  root.addEventListener('pointercancel', end, true);
  dial.addEventListener('lostpointercapture', end);
  host.addEventListener('blur', finish);
  host.addEventListener('pagehide', finish);
  root.addEventListener('visibilitychange', finish);
  root.addEventListener('dialsupdate', () => {
    if (input.matches(':disabled') || dial.hidden) finish();
  });
}

export function initializeDials(root = document) {
  root.querySelectorAll('.dial').forEach((dial) => {
    const input = dial.querySelector('input');
    const svg = root.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    for (const className of ['dial-track', 'dial-fill']) {
      const path = root.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', 'M 24.544 75.456 A 36 36 0 1 1 75.456 75.456');
      path.setAttribute('pathLength', '100');
      path.setAttribute('class', className);
      svg.append(path);
    }
    dial.insertBefore(svg, input);
    const fill = svg.querySelector('.dial-fill');
    const paint = () => {
      const span = Number(input.max) - Number(input.min);
      const amount = span > 0 ? (Number(input.value) - Number(input.min)) / span : 0;
      fill.setAttribute('stroke-dasharray', `${amount * 100} 100`);
      const output = root.getElementById(`${input.id}-value`);
      input.setAttribute('aria-valuetext', output?.value || input.value);
    };
    dial.title = 'Drag left/right or up/down. Arrow keys adjust; Shift-drag for fine control.';
    bindDialDrag(dial, input, root, root.defaultView);
    // Slicer updates can also change range bounds and reset values programmatically.
    root.addEventListener('dialsupdate', paint);
    input.addEventListener('input', () => queueMicrotask(paint));
    paint();
  });
}
