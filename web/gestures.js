import { animate, cardPositions, reducedMotion, slideCards } from './motion.js';

const xOf = point => point.clientX;
const yOf = point => point.clientY;

export function bindGestures(list, actions) {
  let gesture;
  let suppressClick = 0;

  function begin(point, target, source) {
    if (gesture || !actions.allowed() || target.closest('button')) return;
    const row = target.closest('.card');
    if (!row) return;
    actions.closeOthers(row);
    const state = {
      row, source, id: point.identifier ?? point.pointerId,
      x: xOf(point), y: yOf(point), currentY: yOf(point),
      opened: actions.isOpen(row), mode: 'pending'
    };
    gesture = state;
    if (list.children.length > 1) state.timer = setTimeout(() => startDrag(state), 370);
  }

  function startDrag(state) {
    if (gesture !== state || !actions.allowed() || !state.row.isConnected) return;
    actions.reveal(state.row, false);
    const box = state.row.getBoundingClientRect();
    state.mode = 'drag';
    state.offset = state.y - box.top;
    state.proxy = state.row.cloneNode(true);
    state.proxy.classList.add('drag-proxy');
    state.proxy.setAttribute('aria-hidden', 'true');
    state.proxy.inert = true;
    Object.assign(state.proxy.style, {
      left: box.left + 'px', top: box.top + 'px', width: box.width + 'px'
    });
    document.body.append(state.proxy);
    state.row.classList.add('placeholder');
    list.classList.add('dragging');
    state.startOrder = [...list.children];
    state.frame = requestAnimationFrame(() => moveDrag(state));
  }

  function moveDrag(state) {
    if (gesture !== state) return;
    const y = state.currentY;
    const viewport = window.innerHeight;
    if (y < 55) window.scrollBy(0, -Math.min(18, (55 - y) / 2));
    if (y > viewport - 87) window.scrollBy(0, Math.min(18, (y - viewport + 87) / 2));
    state.proxy.style.top = y - state.offset + 'px';
    const center = y - state.offset + state.proxy.offsetHeight / 2;
    const before = [...list.children].find(row => {
      if (row === state.row) return false;
      const box = row.getBoundingClientRect();
      return center < box.top + box.height / 2;
    }) ?? null;
    const next = state.row.nextElementSibling;
    if (next !== before) {
      const box = state.row.getBoundingClientRect();
      // Keep the slot steady while the floating card's center is inside it.
      if (center < box.top || center > box.bottom) {
        const positions = reducedMotion.matches ? null : cardPositions(list);
        list.insertBefore(state.row, before);
        if (positions) slideCards(list, positions);
      }
    }
    state.frame = requestAnimationFrame(() => moveDrag(state));
  }

  function move(point, event) {
    const state = gesture;
    if (!state) return;
    const dx = xOf(point) - state.x;
    const dy = yOf(point) - state.y;
    if (state.mode === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 9) {
      clearTimeout(state.timer);
      if (Math.abs(dx) > Math.abs(dy) * 1.15 && (dx < 0 || state.opened)) {
        state.mode = 'swipe';
        state.row.classList.add('swiping');
      } else {
        end(true);
        return;
      }
    }
    if (state.mode === 'drag' || state.mode === 'swipe') {
      if (event.cancelable) event.preventDefault();
      state.currentY = yOf(point);
    }
    if (state.mode === 'swipe') {
      const limit = state.row.clientWidth * .68;
      state.distance = Math.max(-limit, Math.min(0, dx - (state.opened ? 66 : 0)));
      state.row.style.setProperty('--swipe', state.distance + 'px');
      const progress = -state.distance / limit;
      state.row.style.setProperty('--swipe-tilt', -progress * 5 + 'deg');
      state.row.style.setProperty('--trash-scale', .74 + progress * .5);
      state.row.querySelector('.card-trash').hidden = false;
    }
  }

  function end(cancelled = false) {
    const state = gesture;
    if (!state) return;
    gesture = undefined;
    clearTimeout(state.timer);
    if (state.mode === 'pending') return;
    suppressClick = performance.now() + 370;
    if (state.mode === 'swipe') {
      state.row.classList.remove('swiping');
      if (!cancelled && state.distance < -Math.min(128, state.row.clientWidth * .39)) {
        actions.remove(state.row);
      } else {
        actions.reveal(state.row, cancelled ? state.opened : state.distance < -34);
      }
      return;
    }
    cancelAnimationFrame(state.frame);
    const floatTop = state.proxy.getBoundingClientRect().top;
    state.proxy.remove();
    state.row.classList.remove('placeholder');
    list.classList.remove('dragging');
    if (cancelled) {
      const positions = reducedMotion.matches ? null : cardPositions(list);
      list.append(...state.startOrder);
      if (positions) slideCards(list, positions);
      return;
    }
    const landingOffset = floatTop - state.row.getBoundingClientRect().top;
    animate(state.row.querySelector('.card-face'), [
      { translate: '0 ' + landingOffset + 'px', rotate: '-3deg', scale: '1.025' },
      { translate: 'none', rotate: 'none', scale: 'none' }
    ], { duration: 180, easing: 'cubic-bezier(.2,.76,.3,1.18)' });
    const order = [...list.children];
    if (order.some((row, index) => row !== state.startOrder[index])) {
      actions.reorder(order.map(row => row.dataset.id));
    }
  }

  list.addEventListener('touchstart', event => {
    if (event.touches.length > 1) end(true);
    else begin(event.changedTouches[0], event.target, 'touch');
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    if (gesture?.source !== 'touch') return;
    const point = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
    if (point) move(point, event);
  }, { passive: false });
  for (const type of ['touchend', 'touchcancel']) {
    window.addEventListener(type, event => {
      if (gesture?.source === 'touch' && [...event.changedTouches].some(touch => touch.identifier === gesture.id)) {
        end(type === 'touchcancel');
      }
    });
  }
  list.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.button === 0) begin(event, event.target, 'pointer');
  });
  window.addEventListener('pointermove', event => {
    if (gesture?.source === 'pointer' && gesture.id === event.pointerId) move(event, event);
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, event => {
      if (gesture?.source === 'pointer' && gesture.id === event.pointerId) end(type === 'pointercancel');
    });
  }
  window.addEventListener('blur', () => end(true));
  list.addEventListener('click', event => {
    if (performance.now() < suppressClick && event.detail && !event.target.closest('.card-trash')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  return () => end(true);
}
