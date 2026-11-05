import { modes, rollIdea, themes, ticketText } from './idea-bank.js';

const favorite = ['sims', 'winx', 'cats', 'horror', 'autumn', 'winter', 'pop'];
const slotNames = ['Герой или предмет', 'Поворот', 'Деталь'];
const twistLabels = { story: 'Поворот', redesign: 'Задача', challenge: 'Приём' };

function icon(id) {
  return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>';
}

function button(label, className) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = label;
  return control;
}

export function setupGenerator(editor, textarea) {
  const get = selector => editor.querySelector(selector);
  const fields = get('#editor-fields');
  const panel = get('#generator-panel');
  const open = get('#open-generator');
  const caption = get('#mix-caption');
  const customInput = get('#custom-topic');
  const ticket = get('#idea-ticket');
  const spinButton = get('#spin-idea');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = 'story';
  let selected = [];
  let topic = '';
  let pieces;
  let pinned = [false, false, false];

  const modeButtons = new Map();
  for (const [key, name] of Object.entries(modes)) {
    const item = button(name, 'mode-chip');
    item.addEventListener('click', () => {
      if (mode === key) return;
      mode = key;
      resetRoll();
    });
    get('#idea-modes').append(item);
    modeButtons.set(key, item);
  }

  const themeButtons = new Map();
  const addTheme = (key, label, host) => {
    const item = button(label, 'theme-chip');
    item.dataset.theme = key;
    item.addEventListener('click', () => {
      if (key === 'surprise') selected = [];
      else if (selected.includes(key)) selected = selected.filter(theme => theme !== key);
      else if (selected.length < 2) selected = [...selected, key];
      else {
        caption.textContent = 'Уже две наклейки. Нажми на одну из выбранных, чтобы снять её.';
        return;
      }
      resetRoll();
    });
    host.append(item);
    themeButtons.set(key, item);
    return item;
  };
  addTheme('surprise', '✷ Сюрприз', get('#favorite-themes'));
  for (const [key, theme] of Object.entries(themes)) {
    const host = get(favorite.includes(key) ? '#favorite-themes' : '#extra-themes');
    addTheme(key, theme.icon + ' ' + theme.name, host);
  }
  const customChip = addTheme('custom', '✎ Моя тема', get('#extra-themes'));
  customChip.hidden = true;

  const reels = slotNames.map((name, index) => {
    const reel = document.createElement('div');
    reel.className = 'reel';
    reel.innerHTML = '<div class="reel-content"><div class="reel-label"></div><div class="reel-value"></div></div>' +
      '<div class="reel-controls"><button type="button" class="pin">' + icon('pin') +
      '</button><button type="button" class="reroll">' + icon('reroll') + '</button></div>';
    get('#idea-reels').append(reel);
    const label = reel.querySelector('.reel-label');
    const value = reel.querySelector('.reel-value');
    const pin = reel.querySelector('.pin');
    const reroll = reel.querySelector('.reroll');
    label.textContent = name;
    pin.addEventListener('click', () => {
      pinned[index] = !pinned[index];
      updateControls();
    });
    reroll.addEventListener('click', () => spin([index]));
    return { reel, label, value, pin, reroll };
  });

  function themeName(key) {
    return key === 'custom' ? topic : themes[key].name;
  }

  function updateControls() {
    for (const [key, item] of modeButtons) item.setAttribute('aria-pressed', String(key === mode));
    for (const [key, item] of themeButtons) {
      item.setAttribute('aria-pressed', String(key === 'surprise' ? !selected.length : selected.includes(key)));
    }
    reels[1].label.textContent = twistLabels[mode];
    reels.forEach(({ reel, label, pin, reroll }, index) => {
      const name = label.textContent;
      pin.setAttribute('aria-pressed', String(pinned[index]));
      pin.setAttribute('aria-label', 'Булавка — ' + name.toLowerCase());
      pin.title = pinned[index] ? 'Открепить' : 'Приколоть';
      reel.classList.toggle('pinned', pinned[index]);
      reroll.disabled = pinned[index];
      reroll.setAttribute('aria-label', 'Перекрутить — ' + name.toLowerCase());
      reroll.title = 'Перекрутить только это окошко';
    });
    spinButton.disabled = pinned.every(Boolean);
  }

  function animate(node, frames, options) {
    if (!node.animate) return;
    for (const animation of node.getAnimations()) animation.cancel();
    if (!reducedMotion.matches) node.animate(frames, options);
  }

  function spin(slots = pinned.flatMap((locked, index) => locked ? [] : [index]), animated = true) {
    if (!slots.length) return;
    pieces = rollIdea({ mode, selected, topic, current: pieces, slots });
    let delay = 0;
    for (const index of slots) {
      const { value } = reels[index];
      value.textContent = pieces[index].label;
      if (animated) {
        animate(value, [
          { transform: 'translateY(-125%) scaleY(.8)', opacity: .08 },
          { transform: 'translateY(12%)' },
          { transform: 'translateY(0)' }
        ], { duration: 245, delay, easing: 'cubic-bezier(.16,.82,.3,1)', fill: 'backwards' });
        delay += 72;
      }
    }
    caption.textContent = selected.length
      ? 'Наклейки: ' + selected.map(themeName).join(' + ')
      : 'Выпало: ' + themeName(pieces[0].theme);
    ticket.textContent = ticketText(pieces);
    if (animated) {
      animate(ticket.parentElement, [
        { transform: 'translateY(-9px) rotate(-1.5deg)', opacity: .35 },
        { transform: 'translateY(3px) rotate(.6deg)' },
        { transform: 'translateY(0)' }
      ], { duration: 260, delay, easing: 'ease-out', fill: 'backwards' });
    }
    updateControls();
  }

  function resetRoll() {
    pinned = [false, false, false];
    spin();
  }

  function setTopic() {
    const next = customInput.value.trim();
    if (!next) {
      customInput.focus();
      return;
    }
    if (!selected.includes('custom') && selected.length === 2) {
      caption.textContent = 'Сними одну наклейку, чтобы добавить свою тему.';
      return;
    }
    topic = next;
    customChip.hidden = false;
    customChip.textContent = '✎ ' + topic;
    if (!selected.includes('custom')) selected = [...selected, 'custom'];
    resetRoll();
  }

  function showEditor(focus) {
    panel.hidden = true;
    fields.hidden = false;
    get('#editor-title').textContent = 'Новая идея';
    editor.scrollTop = 0;
    focus?.focus();
  }

  open.addEventListener('click', () => {
    fields.hidden = true;
    panel.hidden = false;
    get('#editor-title').textContent = 'Генератор';
    if (!pieces) spin(undefined, false);
    editor.scrollTop = 0;
    modeButtons.get(mode).focus({ preventScroll: true });
  });
  get('#leave-generator').addEventListener('click', () => showEditor(open));
  get('#apply-topic').addEventListener('click', setTopic);
  customInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    setTopic();
  });
  spinButton.addEventListener('click', () => spin());
  get('#use-idea').addEventListener('click', () => {
    const text = ticketText(pieces);
    if (textarea.value.trim() && textarea.value !== text &&
        !confirm('Заменить текущий текст идеей из генератора?')) return;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    showEditor(textarea);
  });
  editor.addEventListener('cancel', event => {
    if (panel.hidden) return;
    event.preventDefault();
    showEditor(open);
  });

  return {
    prepare(isNew) {
      panel.hidden = true;
      fields.hidden = false;
      open.hidden = !isNew;
      pieces = undefined;
      pinned = [false, false, false];
    },
    isOpen: () => !panel.hidden
  };
}
