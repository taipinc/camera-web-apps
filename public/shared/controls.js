// Buttons opt into cycling by declaring their available values in markup.
export function initializeCycleButtons(root = document) {
  root.querySelectorAll('[data-cycle-values]').forEach((button) => {
    const values = button.dataset.cycleValues.split(/\s+/);
    button.addEventListener('click', () => {
      button.value = values[(values.indexOf(button.value) + 1) % values.length];
      button.querySelector('[data-cycle-value]').textContent = button.value;
      button.setAttribute('aria-label', `${button.value} ${button.dataset.cycleLabel || ''}. Click to change`);
      button.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

// A single fixed-size button represents the camera/capture lifecycle.
export function updateCaptureButton(button, state) {
  const labels = { start: 'Start camera', record: 'Capture', recording: 'Stop capture', stopped: 'Capture again' };
  button.dataset.state = state;
  button.setAttribute('aria-label', labels[state]);
  button.title = labels[state];
  button.setAttribute('aria-pressed', String(state === 'recording'));
  button.querySelector('img').hidden = state !== 'start';
  button.querySelector('.record-dot').hidden = state === 'start';
}

export function initializeTabs(root = document) {
  root.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    function select(tab) {
      tabs.forEach((item) => {
        item.setAttribute('aria-selected', String(item === tab));
        item.tabIndex = item === tab ? 0 : -1;
      });
      root.getElementById(tab.getAttribute('aria-controls')).setAttribute('aria-labelledby', tab.id);
      tab.dispatchEvent(new Event('input', { bubbles: true }));
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        const offset = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index }[event.key];
        if (offset === undefined) return;
        event.preventDefault();
        const next = tabs[(index + offset + tabs.length) % tabs.length];
        if (next.disabled) return;
        select(next);
        next.focus();
      });
    });
  });
}

// Exclusive, independently focusable buttons for choosing a tool or mode.
export function initializeChoiceButtons(root = document) {
  root.querySelectorAll('[data-choice-buttons]').forEach((group) => {
    const buttons = [...group.querySelectorAll('button')];
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        button.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  });
}
