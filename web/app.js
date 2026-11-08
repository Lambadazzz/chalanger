import { colors, patterns, decodeBackup, encodeBackup, MAX_BACKUP_BYTES, MAX_IDEA_LENGTH, visibleCards, reorder, toggleCard, openAlbum, loadAlbum, saveAlbum } from './album.js';
import { native, exportAlbum, importAlbum, shareIdea, setReminder, reminderTime, handleAndroidBack } from './platform.js';
import { bindGestures } from './gestures.js';
import { setupGenerator } from './generator.js';
import { animate, bindButtonMotion, bounce, cardPositions, flyTo, playGhost, reducedMotion, slideCards, snapshot } from './motion.js';

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
bindButtonMotion();
const suggestions = ['Луна из клубничного желе', 'Кот в цветочном киоске', 'Медуза в кедах'];
let album;
let db;
let view = 'ideas';
let editingId;
let revealed;
let undo;
let toastTimer;
let saving = false;
let query = '';
let favorites = false;
let backupBusy = false;
const helpDialog = get('#help-dialog');
textarea.maxLength = MAX_IDEA_LENGTH;

function canReorder() { return !query.trim() && !favorites; }

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '';
}

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
  const copy = document.createElement('div');
  copy.className = 'card-copy';
  copy.append(text);
  const date = card.done ? card.completedAt : card.createdAt;
  if (date) {
    const caption = document.createElement('small');
    caption.textContent = (card.done ? 'Готово ' : 'Создано ') + formatDate(date);
    copy.append(caption);
  }
  const favorite = control('icon-button card-favorite', 'favorite', 'Избранное', card.favorite ? '★' : '☆');
  favorite.setAttribute('aria-pressed', String(card.favorite));
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(favorite, control('icon-button', 'edit', 'Редактировать идею', icon('dots')));
  face.append(check, copy, actions);
  const trash = control('card-trash', 'delete', 'Удалить идею', icon('trash'));
  trash.hidden = true;
  row.append(trash, face);
  return row;
}

function updateCount(id, count) {
  const counter = get(id);
  if (counter.textContent === String(count)) return;
  counter.textContent = count;
  animate(counter, [{ scale: '.82' }, { scale: '1.27', offset: .55 }, { scale: 'none' }],
    { duration: 275, easing: 'ease-out' });
}

function render({ enterId, all = false, slide = false } = {}) {
  cancelGesture();
  const positions = slide && !reducedMotion.matches ? cardPositions(list) : null;
  revealed = undefined;
  const done = view === 'done';
  const active = visibleCards(album.cards, { done, query, favorites });
  const doneCount = album.cards.filter(card => card.done).length;
  document.body.dataset.paper = album.paper.color;
  document.body.dataset.pattern = album.paper.pattern;
  updateCount('#ideas-count', album.cards.length - doneCount);
  updateCount('#done-count', doneCount);
  get('#board-title').textContent = done ? 'ПАПКА ГОТОВОГО' : 'НАБРОСКИ';
  get('#board-hint').hidden = active.length < 2 || !canReorder();
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
  list.replaceChildren(...active.map(makeCard));
  if (positions) slideCards(list, positions);
  let entrance = 0;
  if (!reducedMotion.matches && (all || enterId)) {
    for (const row of list.children) {
      if (row.dataset.id === enterId || (all && row.getBoundingClientRect().top < innerHeight + 80)) {
        bounce(row, Math.min(entrance++, 5) * 32);
      }
    }
  }
  empty.hidden = active.length > 0;
  if (empty.hidden) return;
  if (query.trim() || favorites) {
    empty.innerHTML = '<h2>Пока ничего не нашлось</h2><p>Попробуй другой запрос или отключи фильтр избранного.</p><button class="primary" type="button">Сбросить фильтры</button>';
    empty.querySelector('button').addEventListener('click', () => {
      query = ''; favorites = false;
      get('#search').value = '';
      get('#favorites').setAttribute('aria-pressed', 'false');
      render();
    });
    return;
  }
  empty.innerHTML = done
    ? '<div class="empty-sticker" aria-hidden="true">✓</div><h2>Здесь будет готовое</h2><p>Поставь галочку рядом с идеей, и она переедет в эту папку.</p>'
    : '<div class="empty-sticker" aria-hidden="true">✿</div><h2>Чистый лист!</h2><p>Запиши свою идею или начни с одной из этих подсказок.</p><div class="suggestions"></div>';
  if (all || slide) bounce(empty);
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

async function commit(next, { onSaved, enterId, slide = false, keepRows = false } = {}) {
  if (saving || !db) return false;
  saving = true;
  try {
    await saveAlbum(db, next);
    album = next;
    onSaved?.();
    if (!keepRows) render({ enterId, slide });
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
  if (!album || saving || next === view) return;
  view = next;
  render({ all: true });
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
  function showPreview() {
    updatePreview();
    animate(preview, [{ scale: '.95', opacity: .6 }, { scale: 'none', opacity: 1 }],
      { duration: 200, easing: 'ease-out' });
  }
  color.addEventListener('change', showPreview);
  pattern.addEventListener('change', showPreview);
  updatePreview();
}

function readStyle(id) {
  const fieldset = get('#' + id);
  const color = fieldset.querySelector('.color').value;
  return color === 'inherit' ? null : { color, pattern: fieldset.querySelector('.pattern').value };
}

function openEditor(card, suggestion = '') {
  if (!album || saving) return;
  editingId = card?.id;
  get('#editor-title').textContent = card ? 'Редактировать идею' : 'Новая идея';
  get('#delete-card').hidden = !card;
  get('#share-card').hidden = !card;
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
  row.style.setProperty('--swipe-tilt', opened ? '-1deg' : '0deg');
  row.querySelector('.card-trash').hidden = !opened;
  revealed = opened ? row : undefined;
}

async function removeCard(id) {
  if (saving) return;
  const index = album.cards.findIndex(card => card.id === id);
  if (index < 0) return;
  const card = album.cards[index];
  const face = [...list.children].find(row => row.dataset.id === id)?.querySelector('.card-face');
  const ghost = snapshot(face);
  if (await commit({ ...album, cards: album.cards.filter(item => item.id !== id) }, {
    onSaved: () => { if (editor.open) editor.close(); },
    slide: true
  })) {
    playGhost(ghost, [
      { transform: 'none', opacity: 1 },
      { transform: 'translateX(-' + Math.min(380, innerWidth * .8) + 'px) rotate(-9deg) scale(.9)', opacity: 0 }
    ], { duration: 260, easing: 'cubic-bezier(.26,.14,.62,1)', fill: 'both' });
    notify('Карточка удалена', () => {
      const cards = [...album.cards];
      cards.splice(index, 0, card);
      return commit({ ...album, cards }, { enterId: id, slide: true });
    });
  } else render();
}

function scatter(button) {
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
  if (saving) return;
  if (!card.done && !reducedMotion.matches) {
    button.innerHTML = '<span>' + icon('check') + '</span>';
    scatter(button);
  }
  const ghost = snapshot(row.querySelector('.card-face'));
  if (!await commit({ ...album, cards: toggleCard(album.cards, card.id) }, { slide: true })) {
    render();
    return;
  }
  const tab = get(card.done ? '[data-view="ideas"]' : '[data-view="done"]');
  const box = tab.getBoundingClientRect();
  if (box.bottom > 0 && box.top < innerHeight) flyTo(ghost, tab);
  else playGhost(ghost, [
    { transform: 'none', opacity: 1 },
    { transform: 'translateY(-10px) scale(.91) rotate(-3deg)', opacity: 0 }
  ], { duration: 220, easing: 'ease-in', fill: 'both' });
  if (!card.done && !reducedMotion.matches) {
    tab.classList.remove('receiving');
    void tab.offsetWidth;
    tab.classList.add('receiving');
  }
  notify(card.done ? 'Снова в идеях' : 'В папке «Готово» ✦');
}

function saveOrder(ids, keepRows = false) {
  if (!canReorder()) return Promise.resolve(false);
  const cards = reorder(album.cards, view === 'done', ids);
  return commit({ ...album, cards }, { keepRows, slide: !keepRows }).then(saved => {
    if (!saved) render();
    return saved;
  });
}

get('#add').addEventListener('click', () => openEditor());
get('#search').addEventListener('input', event => {
  query = event.target.value;
  if (album) render();
});
get('#favorites').addEventListener('click', () => {
  favorites = !favorites;
  get('#favorites').setAttribute('aria-pressed', String(favorites));
  if (album) render();
});
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
get('#palette').addEventListener('click', async () => {
  if (!album || saving) return;
  buildStyle('paper-style', 'Фон альбома', album.paper);
  buildStyle('default-style', 'Фон карточек по умолчанию', album.cardStyle);
  appearance.showModal();
  if (native) {
    try {
      const time = await reminderTime();
      if (time) get('#reminder-time').value = time;
      get('#reminder-status').textContent = time ? 'Ежедневно в ' + time : 'Напоминание выключено.';
    } catch { get('#reminder-status').textContent = 'Не удалось проверить напоминание.'; }
  }
});
get('#appearance-form').addEventListener('submit', event => {
  event.preventDefault();
  void commit({ ...album, paper: readStyle('paper-style'), cardStyle: readStyle('default-style') },
    { onSaved: () => appearance.close() });
});
textarea.addEventListener('input', () => textarea.setCustomValidity(''));
editorForm.addEventListener('submit', event => {
  event.preventDefault();
  if (generator.isOpen()) return;
  const text = textarea.value.trim();
  if (!text || text.length > MAX_IDEA_LENGTH) {
    textarea.setCustomValidity(!text ? 'Добавь текст идеи.' : 'Идея слишком длинная. Максимум — ' + MAX_IDEA_LENGTH + ' символов.');
    textarea.reportValidity();
    return;
  }
  const style = readStyle('card-style');
  const id = editingId ?? crypto.randomUUID();
  const cards = editingId
    ? album.cards.map(card => card.id === editingId ? { ...card, text, style } : card)
    : [{ id, text, style, done: false, favorite: false, createdAt: new Date().toISOString(), completedAt: null }, ...album.cards];
  void commit({ ...album, cards }, {
    onSaved: () => {
      if (!editingId) {
        view = 'ideas'; query = ''; favorites = false;
        get('#search').value = '';
        get('#favorites').setAttribute('aria-pressed', 'false');
      }
      editor.close();
    },
    enterId: id, slide: !editingId
  });
});
get('#delete-card').addEventListener('click', () => void removeCard(editingId));
undoButton.addEventListener('click', async () => {
  if (saving || !undo) return;
  if (await undo()) notify('Карточка возвращена');
});

list.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('.card');
  if (!row || saving) return;
  if (!button) {
    if (revealed) reveal(revealed, false);
    return;
  }
  const card = album.cards.find(item => item.id === row.dataset.id);
  if (!card) return;
  if (button.dataset.action === 'toggle') void markCard(card, row, button);
  if (button.dataset.action === 'edit') openEditor(card);
  if (button.dataset.action === 'delete') void removeCard(card.id);
  if (button.dataset.action === 'favorite') {
    void commit({ ...album, cards: album.cards.map(item => item.id === card.id ? { ...item, favorite: !item.favorite } : item) });
  }
});
list.addEventListener('keydown', async event => {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || saving || !canReorder()) return;
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

const cancelGesture = bindGestures(list, {
  allowed: () => !!album && !saving,
  canReorder,
  isOpen: row => revealed === row,
  closeOthers: row => { if (revealed && revealed !== row) reveal(revealed, false); },
  reveal,
  remove: row => { void removeCard(row.dataset.id); },
  reorder: ids => { void saveOrder(ids, true); }
});

get('#export').addEventListener('click', async () => {
  if (!album || saving || backupBusy) return;
  backupBusy = true;
  try {
    const result = await exportAlbum(encodeBackup(album));
    if (result.saved) notify(native ? 'Копия сохранена' : 'Копия передана браузеру для сохранения');
  } catch { alert('Не удалось сохранить копию. Попробуй ещё раз.'); }
  finally { backupBusy = false; }
});
const backup = get('#backup-file');
async function restoreContents(contents) {
  let next;
  try { next = decodeBackup(JSON.parse(contents)); }
  catch (error) {
    alert(error instanceof SyntaxError ? 'Не удалось прочитать файл копии.' : error.message);
    return;
  }
  if (!confirm('Восстановить копию? Она заменит текущие карточки и оформление.')) return;
  if (await commit(next, { onSaved: () => appearance.close() })) notify('Альбом восстановлен');
}
get('#import').addEventListener('click', async () => {
  if (!album || saving || backupBusy) return;
  if (!native) { backup.click(); return; }
  backupBusy = true;
  try {
    const result = await importAlbum();
    if (!result.cancelled) await restoreContents(result.contents);
  } catch { alert('Не удалось открыть копию. Выбери JSON-файл Chalanger размером до 10 МБ.'); }
  finally { backupBusy = false; }
});
backup.addEventListener('change', async () => {
  const file = backup.files[0];
  backup.value = '';
  if (!file || saving || backupBusy) return;
  if (file.size > MAX_BACKUP_BYTES) { alert('Копия слишком большая. Максимум — 10 МБ.'); return; }
  backupBusy = true;
  try {
    await restoreContents(await file.text());
  } catch { alert('Не удалось прочитать копию.'); }
  finally { backupBusy = false; }
});

get('#share-card').addEventListener('click', async () => {
  try {
    const result = await shareIdea(textarea.value);
    if (result?.copied) notify('Идея скопирована');
  } catch (error) {
    if (error.name !== 'AbortError') alert('Не удалось поделиться идеей.');
  }
});
get('#help').addEventListener('click', () => helpDialog.showModal());
get('#library-licenses').addEventListener('toggle', async event => {
  if (!event.target.open || get('#license-text').dataset.loaded) return;
  try {
    const response = await fetch('./third-party.txt');
    if (!response.ok) throw new Error('Unavailable');
    get('#license-text').textContent = await response.text();
    get('#license-text').dataset.loaded = 'true';
  } catch { get('#license-text').textContent = 'Не удалось открыть лицензии. Обратись в поддержку: nyshev00@gmail.com'; }
});
get('#reminders').hidden = !native;
for (const id of ['save-reminder', 'cancel-reminder']) {
  get('#' + id).addEventListener('click', async () => {
    const time = id === 'save-reminder' ? get('#reminder-time').value : '';
    if (id === 'save-reminder' && !time) { alert('Выбери время.'); return; }
    get('#save-reminder').disabled = get('#cancel-reminder').disabled = true;
    try {
      await setReminder(time);
      get('#reminder-status').textContent = time ? 'Ежедневно в ' + time : 'Напоминание выключено.';
    } catch (error) { alert(error.message); }
    finally { get('#save-reminder').disabled = get('#cancel-reminder').disabled = false; }
  });
}
handleAndroidBack(() => {
  const dialog = [helpDialog, appearance, editor].find(item => item.open);
  if (dialog) {
    const event = new Event('cancel', { cancelable: true });
    if (dialog.dispatchEvent(event)) dialog.close();
    return true;
  }
  if (view !== 'ideas') { setView('ideas'); return true; }
  return false;
})?.catch(() => {});

async function setupOffline() {
  if (native || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  const showUpdate = () => { get('#update').hidden = !registration.waiting; };
  let reloading = false;
  get('#apply-update').addEventListener('click', () => {
    if (saving || !registration.waiting) return;
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
  await saveAlbum(db, album);
  get('#add').disabled = false;
  render({ all: true });
  try {
    if (!localStorage.getItem('chalanger-welcome')) {
      helpDialog.showModal();
      helpDialog.addEventListener('close', () => localStorage.setItem('chalanger-welcome', '1'), { once: true });
    }
  } catch { /* The album remains usable when browser preferences are unavailable. */ }
} catch {
  notify('Не удалось открыть альбом. Не очищай данные приложения: сохрани имеющуюся копию и обратись в поддержку.');
}
setupOffline().catch(error => console.warn('Offline setup failed', error));
