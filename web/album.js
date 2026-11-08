export const colors = {
  lilac: 'Сирень', pink: 'Жвачка', lime: 'Лайм',
  peach: 'Персик', sky: 'Лазурь', vanilla: 'Ваниль'
};
export const patterns = {
  solid: 'Сплошной', dots: 'В горошек', grid: 'В клетку', stripes: 'Полоски'
};

export const defaults = {
  schemaVersion: 2,
  cards: [],
  paper: { color: 'lilac', pattern: 'dots' },
  cardStyle: { color: 'vanilla', pattern: 'solid' }
};

export const MAX_IDEA_LENGTH = 1000;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

function validDate(value) {
  return value === null || (typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
}

export function normalizeAlbum(raw) {
  const { cards, paper, cardStyle } = raw ?? {};
  const ids = new Set();
  if (!Array.isArray(cards) || cards.length > 10000 || !validStyle(paper) || !validStyle(cardStyle)) {
    throw new Error('В альбоме не хватает данных или слишком много карточек.');
  }
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 2) {
    throw new Error('Эта версия альбома пока не поддерживается.');
  }
  const migrated = cards.map(card => {
    if (!card || typeof card.id !== 'string' || !card.id || card.id.length > 128 || ids.has(card.id) ||
        typeof card.text !== 'string' || !card.text.trim() || card.text.length > MAX_IDEA_LENGTH ||
        typeof card.done !== 'boolean' || (card.style != null && !validStyle(card.style)) ||
        (card.favorite !== undefined && typeof card.favorite !== 'boolean')) {
      throw new Error('В альбоме есть повреждённая карточка.');
    }
    ids.add(card.id);
    const createdAt = card.createdAt ?? null;
    const completedAt = card.completedAt ?? null;
    if (!validDate(createdAt) || !validDate(completedAt) || (!card.done && completedAt !== null)) {
      throw new Error('В альбоме есть некорректная дата.');
    }
    return { id: card.id, text: card.text, done: card.done,
      style: card.style ? { color: card.style.color, pattern: card.style.pattern } : null,
      favorite: card.favorite ?? false, createdAt, completedAt };
  });
  return { schemaVersion: 2, cards: migrated,
    paper: { color: paper.color, pattern: paper.pattern },
    cardStyle: { color: cardStyle.color, pattern: cardStyle.pattern } };
}

export function encodeBackup(album) {
  return JSON.stringify({ app: 'Chalanger', version: 2, album: normalizeAlbum(album) }, null, 2);
}

function validStyle(style) {
  return style && Object.hasOwn(colors, style.color) && Object.hasOwn(patterns, style.pattern);
}

export function decodeBackup(raw) {
  if (!raw || raw.app !== 'Chalanger' || ![1, 2].includes(raw.version)) throw new Error('Это не поддерживаемая копия Chalanger.');
  return normalizeAlbum(raw.album);
}

export function visibleCards(cards, { done = false, query = '', favorites = false } = {}) {
  const needle = query.trim().toLocaleLowerCase('ru');
  return cards.filter(card => card.done === done && (!favorites || card.favorite) &&
    (!needle || card.text.toLocaleLowerCase('ru').includes(needle)));
}

export function reorder(cards, done, ids) {
  const active = cards.filter(card => card.done === done);
  const byId = new Map(active.map(card => [card.id, card]));
  if (ids.length !== active.length || new Set(ids).size !== active.length ||
      ids.some(id => !byId.has(id))) return cards;
  let index = 0;
  return cards.map(card => card.done === done ? byId.get(ids[index++]) : card);
}

export function toggleCard(cards, id, now = new Date().toISOString()) {
  const card = cards.find(item => item.id === id);
  if (!card) return cards;
  return [{ ...card, done: !card.done, completedAt: card.done ? null : now }, ...cards.filter(item => item.id !== id)];
}

export function openAlbum() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chalanger-album', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('album');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function loadAlbum(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('album').objectStore('album').get('current');
    request.onsuccess = () => {
      try { resolve(normalizeAlbum(request.result ?? structuredClone(defaults))); }
      catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}

export function saveAlbum(db, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('album', 'readwrite');
    transaction.objectStore('album').put(data, 'current');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}
