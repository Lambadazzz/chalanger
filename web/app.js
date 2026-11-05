import { colors, patterns, decodeBackup, reorder, toggleCard, openAlbum, loadAlbum, saveAlbum } from './album.js';
import { bindGestures } from './gestures.js';
import { setupGenerator } from './generator.js';

const get = selector => document.querySelector(selector);
const list = get('#cards');
const empty = get('#empty');
const editor = get('#editor');
const editorForm = get('#editor-form');
const appearance = get('#appearance');
const toast = get('#toast');
const undoButton = toast.querySelector('button');
const textarea = editorForm.elements.idea;
const generator = setupGenerator(editor, textarea);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const suggestions = ['Луна из клубничного желе', 'Кот в цветочном киоске', 'Медуза в кедах'];
let album;
let db;
let view = 'ideas';
let editingId;
let revealed;
let undo;
let toastTimer;
let saving = false;
let celebrating = false;

function icon(name) {
  return '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
}

function control(className, action, label, html) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = html;
  return button;
}

function makeCard(card, index) {
  const row = document.createElement('article');
  row.className = 'card';
  row.dataset.id = card.id;
  row.dataset.done = card.done;
  row.style.setProperty('--wiggle-delay', (-index % 8) * 27 + 'ms');
  const face = document.createElement('div');
  face.className = 'card-face';
  const style = card.style ?? album.cardStyle;
  face.dataset.color = style.color;
  face.dataset.pattern = style.pattern;
  const check = control('card-check', 'toggle', card.done ? 'Вернуть в идеи' : 'Отметить готовой',
    '<span>' + (card.done ? icon('check') : '') + '</span>');
  const text = document.createElement('p');
  text.textContent = card.text;
  face.append(check, text, control('icon-button', 'edit', 'Редактировать идею', icon('dots')));
  const trash = control('card-trash', 'delete', 'Удалить идею', icon('trash'));
  trash.hidden = true;
  row.append(trash, face);
  return row;
}

function render() {
  revealed = undefined;
  const done = view === 'done';
  const active = album.cards.filter(card => card.done === done);
  const doneCount = album.cards.filter(card => card.done).length;
  document.body.dataset.paper = album.paper.color;
  document.body.dataset.pattern = album.paper.pattern;
  get('#ideas-count').textContent = album.cards.length - doneCount;
  get('#done-count').textContent = doneCount;
  get('#board-title').textContent = done ? 'ПАПКА ГОТОВОГО' : 'НАБРОСКИ';
  get('#board-hint').hidden = active.length < 2;
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
  list.replaceChildren(...active.map(makeCard));
  empty.hidden = active.length > 0;
  if (empty.hidden) return;
  empty.innerHTML = done
    ? '<div class="empty-sticker" aria-hidden="true">✓</div><h2>Здесь будет готовое</h2><p>Поставь галочку рядом с идеей, и она переедет в эту папку.</p>'
    : '<div class="empty-sticker" aria-hidden="true">✿</div><h2>Чистый лист!</h2><p>Запиши свою идею или начни с одной из этих подсказок.</p><div class="suggestions"></div>';
  if (!done) {
    for (const suggestion of suggestions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('click', () => openEditor(null, suggestion));
      empty.querySelector('.suggestions').append(button);
    }
  }
}

function notify(message, undoAction) {
  clearTimeout(toastTimer);
  undo = undoAction;
  toast.querySelector('span').textContent = message;
  undoButton.hidden = !undo;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
    undo = undefined;
  }, undo ? 6500 : 3500);
}

async function commit(next, afterSave) {
  if (saving || !db) return false;
  saving = true;
  try {
    await saveAlbum(db, next);
    album = next;
    afterSave?.();
    render();
    return true;
  } catch {
    const message = 'Не удалось сохранить изменения. Попробуй ещё раз.';
    if (editor.open || appearance.open) alert(message);
    else notify(message);
    return false;
  } finally {
    saving = false;
  }
}

function setView(next) {
  if (!album || saving || celebrating || next === view) return;
  view = next;
  render();
}

function buildStyle(id, title, initial, inherited) {
  const fieldset = get('#' + id);
  fieldset.innerHTML = '<legend></legend><div class="style-preview"></div>' +
    '<div class="style-controls"><label>Цвет<select class="color"></select></label>' +
    '<label>Узор<select class="pattern"></select></label></div>';
  fieldset.querySelector('legend').textContent = title;
  const color = fieldset.querySelector('.color');
  const pattern = fieldset.querySelector('.pattern');
  const preview = fieldset.querySelector('.style-preview');
  if (inherited) color.add(new Option('Как в палитре', 'inherit'));
  for (const [value, name] of Object.entries(colors)) color.add(new Option(name, value));
  for (const [value, name] of Object.entries(patterns)) pattern.add(new Option(name, value));
  color.value = initial?.color ?? 'inherit';
  pattern.value = (initial ?? inherited).pattern;
  function updatePreview() {
    pattern.disabled = color.value === 'inherit';
    const style = pattern.disabled ? inherited : { color: color.value, pattern: pattern.value };
    if (id === 'paper-style') preview.dataset.paper = style.color;
    else preview.dataset.color = style.color;
    preview.dataset.pattern = style.pattern;
  }
  color.addEventListener('change', updatePreview);
  pattern.addEventListener('change', updatePreview);
  updatePreview();
}

function readStyle(id) {
  const fieldset = get('#' + id);
  const color = fieldset.querySelector('.color').value;
  return color === 'inherit' ? null : { color, pattern: fieldset.querySelector('.pattern').value };
}

function openEditor(card, suggestion = '') {
  if (!album || saving || celebrating) return;
  editingId = card?.id;
  get('#editor-title').textContent = card ? 'Редактировать идею' : 'Новая идея';
  get('#delete-card').hidden = !card;
  generator.prepare(!card);
  textarea.value = card?.text ?? suggestion;
  textarea.setCustomValidity('');
  buildStyle('card-style', 'Фон этой карточки', card?.style, album.cardStyle);
  editor.showModal();
  textarea.focus();
}

function reveal(row, opened) {
  if (revealed && revealed !== row) reveal(revealed, false);
  row.style.setProperty('--swipe', opened ? '-66px' : '0px');
  row.querySelector('.card-trash').hidden = !opened;
  revealed = opened ? row : undefined;
}

async function removeCard(id) {
  if (saving || celebrating) return;
  const index = album.cards.findIndex(card => card.id === id);
  if (index < 0) return;
  const card = album.cards[index];
  if (await commit({ ...album, cards: album.cards.filter(item => item.id !== id) },
    () => { if (editor.open) editor.close(); })) {
    notify('Карточка удалена', () => {
      const cards = [...album.cards];
      cards.splice(index, 0, card);
      return commit({ ...album, cards });
    });
  }
}

function scatter(button, card) {
  if (reducedMotion.matches) return;
  const host = get('#confetti');
  const { x, y, width, height } = button.getBoundingClientRect();
  const palette = ['#ff71be', '#8b5af9', '#c5e937', '#f9a543', '#54bbee'];
  const accent = getComputedStyle(button.closest('.card-face')).getPropertyValue('--surface').trim();
  palette.push(accent || '#ffc9e9');
  for (let index = 0; index < 25; index++) {
    const angle = Math.PI * 2 * index / 25;
    const radius = 38 + Math.random() * 92;
    const particle = document.createElement('i');
    particle.className = 'particle';
    particle.textContent = ['✦', '●', '◆'][index % 3];
    for (const [key, value] of Object.entries({
      x: x + width / 2 + 'px', y: y + height / 2 + 'px',
      dx: Math.cos(angle) * radius + 'px', dy: Math.sin(angle) * radius - 25 + 'px',
      angle: Math.round(Math.random() * 400 - 200) + 'deg',
      size: 7 + Math.random() * 11 + 'px', color: palette[index % palette.length]
    })) particle.style.setProperty('--' + key, value);
    host.append(particle);
    setTimeout(() => particle.remove(), 750);
  }
}

async function markCard(card, row, button) {
  if (celebrating || saving) return;
  if (!card.done && !reducedMotion.matches) {
    celebrating = true;
    button.innerHTML = '<span>' + icon('check') + '</span>';
    row.classList.add('celebrating');
    scatter(button, card);
    await new Promise(resolve => setTimeout(resolve, 285));
  }
  const saved = await commit({ ...album, cards: toggleCard(album.cards, card.id) });
  celebrating = false;
  if (saved) notify(card.done ? 'Снова в идеях' : 'В папке «Готово» ✦');
  else render();
}

function saveOrder(ids) {
  const cards = reorder(album.cards, view === 'done', ids);
  return commit({ ...album, cards }).then(saved => {
    if (!saved) render();
    return saved;
  });
}

get('#add').addEventListener('click', () => openEditor());
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
get('#palette').addEventListener('click', () => {
  if (!album || saving || celebrating) return;
  buildStyle('paper-style', 'Фон альбома', album.paper);
  buildStyle('default-style', 'Фон карточек по умолчанию', album.cardStyle);
  appearance.showModal();
});
get('#appearance-form').addEventListener('submit', event => {
  event.preventDefault();
  void commit({ ...album, paper: readStyle('paper-style'), cardStyle: readStyle('default-style') },
    () => appearance.close());
});
textarea.addEventListener('input', () => textarea.setCustomValidity(''));
editorForm.addEventListener('submit', event => {
  event.preventDefault();
  if (generator.isOpen()) return;
  const text = textarea.value.trim();
  if (!text) {
    textarea.setCustomValidity('Добавь текст идеи.');
    textarea.reportValidity();
    return;
  }
  const style = readStyle('card-style');
  const cards = editingId
    ? album.cards.map(card => card.id === editingId ? { ...card, text, style } : card)
    : [{ id: crypto.randomUUID(), text, style, done: false }, ...album.cards];
  void commit({ ...album, cards }, () => {
    if (!editingId) view = 'ideas';
    editor.close();
  });
});
get('#delete-card').addEventListener('click', () => void removeCard(editingId));
undoButton.addEventListener('click', async () => {
  if (saving || celebrating || !undo) return;
  if (await undo()) notify('Карточка возвращена');
});

list.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('.card');
  if (!row || saving || celebrating) return;
  if (!button) {
    if (revealed) reveal(revealed, false);
    return;
  }
  const card = album.cards.find(item => item.id === row.dataset.id);
  if (!card) return;
  if (button.dataset.action === 'toggle') void markCard(card, row, button);
  if (button.dataset.action === 'edit') openEditor(card);
  if (button.dataset.action === 'delete') void removeCard(card.id);
});
list.addEventListener('keydown', async event => {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || saving || celebrating) return;
  const row = event.target.closest('.card');
  if (!row) return;
  event.preventDefault();
  const ids = [...list.children].map(card => card.dataset.id);
  const from = ids.indexOf(row.dataset.id);
  const to = from + (event.key === 'ArrowUp' ? -1 : 1);
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  if (await saveOrder(ids)) list.children[to].querySelector('.card-check').focus();
});

bindGestures(list, {
  allowed: () => !!album && !saving && !celebrating,
  isOpen: row => revealed === row,
  closeOthers: row => { if (revealed && revealed !== row) reveal(revealed, false); },
  reveal,
  remove: row => { reveal(row, false); void removeCard(row.dataset.id); },
  reorder: ids => { void saveOrder(ids); }
});

get('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'Chalanger', version: 1, album }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'chalanger-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
});
const backup = get('#backup-file');
get('#import').addEventListener('click', () => backup.click());
backup.addEventListener('change', async () => {
  const file = backup.files[0];
  backup.value = '';
  if (!file || saving) return;
  let next;
  try {
    next = decodeBackup(JSON.parse(await file.text()));
  } catch (error) {
    alert(error instanceof SyntaxError ? 'Не удалось прочитать файл копии.' : error.message);
    return;
  }
  if (!confirm('Восстановить копию? Она заменит текущие карточки и оформление.')) return;
  if (await commit(next, () => appearance.close())) notify('Альбом восстановлен');
});

async function setupOffline() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  const showUpdate = () => { get('#update').hidden = !registration.waiting; };
  let reloading = false;
  get('#apply-update').addEventListener('click', () => {
    if (saving || celebrating || !registration.waiting) return;
    reloading = true;
    registration.waiting.postMessage('activate-update');
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
  });
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', showUpdate);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) registration.update().catch(() => {});
  });
  showUpdate();
}

try {
  db = await openAlbum();
  album = await loadAlbum(db);
  get('#add').disabled = false;
  render();
} catch {
  notify('Локальное хранилище недоступно. Открой альбом в обычной вкладке браузера.');
}
setupOffline().catch(error => console.warn('Offline setup failed', error));
