export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const running = new WeakMap();
const spring = 'cubic-bezier(.2,.76,.3,1.22)';

export function animate(node, frames, options) {
  running.get(node)?.cancel();
  if (reducedMotion.matches || !node.animate) return;
  const animation = node.animate(frames, options);
  running.set(node, animation);
  animation.finished.catch(() => {}).then(() => {
    if (running.get(node) === animation) running.delete(node);
  });
  return animation;
}

reducedMotion.addEventListener?.('change', event => {
  if (!event.matches) return;
  for (const animation of document.getAnimations()) {
    if (running.get(animation.effect?.target) === animation) animation.cancel();
  }
});

export function bindButtonMotion() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const sticker = button.matches('.tab, .theme-chip, .mode-chip');
    animate(button, [
      { scale: '.94', rotate: sticker ? '-2deg' : 'none' },
      { scale: '1.06', rotate: sticker ? '1deg' : 'none', offset: .55 },
      { scale: 'none', rotate: 'none' }
    ], { duration: 220, easing: 'ease-out' });
    if (button.matches('.pin')) {
      animate(button.querySelector('svg'), [
        { rotate: '-32deg', translate: '0 -5px' },
        { rotate: '12deg', translate: '0 1px', offset: .65 },
        { rotate: 'none', translate: 'none' }
      ], { duration: 230, easing: spring });
    }
  }, true);
}

export function cardPositions(list) {
  return new Map([...list.children].map(row => [row.dataset.id, row.getBoundingClientRect().top]));
}

export function slideCards(list, positions) {
  if (reducedMotion.matches) return;
  for (const row of list.children) {
    if (row.classList.contains('placeholder')) continue;
    const from = positions.get(row.dataset.id);
    if (from === undefined) continue;
    const delta = from - row.getBoundingClientRect().top;
    if (!delta) continue;
    const face = row.querySelector('.card-face');
    const offset = parseFloat((getComputedStyle(face).translate || '').split(' ')[1]) || 0;
    animate(face, [{ translate: '0 ' + (delta + offset) + 'px' }, { translate: 'none' }],
      { duration: 185, easing: 'cubic-bezier(.2,.74,.32,1)' });
  }
}

export function bounce(node, delay = 0) {
  return animate(node, [
    { translate: '0 10px', scale: '.96', opacity: .4 },
    { translate: '0 -3px', scale: '1.015', opacity: 1, offset: .72 },
    { translate: 'none', scale: 'none', opacity: 1 }
  ], { duration: 250, delay, fill: 'backwards', easing: 'ease-out' });
}

export function snapshot(node) {
  if (reducedMotion.matches || !node?.animate) return;
  const box = node.getBoundingClientRect();
  if (!box.width || box.bottom <= 0 || box.top >= innerHeight) return;
  const copy = node.cloneNode(true);
  if (node.classList.contains('card-face')) {
    copy.style.gridTemplateColumns = getComputedStyle(node).gridTemplateColumns;
    const actions = node.querySelector('.card-actions');
    if (actions) copy.querySelector('.card-actions').style.gridColumn = getComputedStyle(actions).gridColumn;
  }
  for (const child of [copy, ...copy.querySelectorAll('[id], [aria-live]')]) {
    child.removeAttribute('id');
    child.removeAttribute('aria-live');
  }
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  copy.classList.add('motion-ghost');
  Object.assign(copy.style, {
    left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px'
  });
  return { copy, box };
}

export function playGhost(ghost, frames, timing, host = document.body) {
  if (!ghost || reducedMotion.matches) return;
  host.append(ghost.copy);
  const animation = animate(ghost.copy, frames, timing);
  if (animation) animation.finished.catch(() => {}).then(() => ghost.copy.remove());
  else ghost.copy.remove();
}

export function flyTo(ghost, target, host, duration = 390) {
  if (!ghost) return;
  const { box } = ghost;
  const destination = target.getBoundingClientRect();
  const x = destination.left + destination.width / 2 - box.left - box.width / 2;
  const y = destination.top + destination.height / 2 - box.top - box.height / 2;
  playGhost(ghost, [
    { transform: 'scale(1) rotate(0)', opacity: 1 },
    { transform: 'translate(' + x * .16 + 'px,' + (y * .12 - 20) + 'px) scale(.86) rotate(-7deg)', offset: .3 },
    { transform: 'translate(' + x + 'px,' + y + 'px) scale(.15) rotate(9deg)', opacity: .08 }
  ], { duration, easing: 'cubic-bezier(.34,.16,.22,1)', fill: 'both' }, host);
}
