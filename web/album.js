export const colors = {
  lilac: 'Сирень', pink: 'Жвачка', lime: 'Лайм',
  peach: 'Персик', sky: 'Лазурь', vanilla: 'Ваниль'
};
export const patterns = {
  solid: 'Сплошной', dots: 'В горошек', grid: 'В клетку', stripes: 'Полоски'
};

export const defaults = {
  cards: [],
  paper: { color: 'lilac', pattern: 'dots' },
  cardStyle: { color: 'vanilla', pattern: 'solid' }
};

function validStyle(style) {
  return style && Object.hasOwn(colors, style.color) && Object.hasOwn(patterns, style.pattern);
}

export function decodeBackup(raw) {
  if (!raw || raw.app !== 'Chalanger' || raw.version !== 1) throw new Error('Это не копия Chalanger.');
  const { cards, paper, cardStyle } = raw.album ?? {};
  const ids = new Set();
  if (!Array.isArray(cards) || !validStyle(paper) || !validStyle(cardStyle)) {
    throw new Error('В копии не хватает данных.');
  }
  for (const card of cards) {
    if (!card || typeof card.id !== 'string' || !card.id || ids.has(card.id) ||
        typeof card.text !== 'string' || !card.text.trim() || card.text.length > 240 ||
        typeof card.done !== 'boolean' || (card.style !== null && !validStyle(card.style))) {
      throw new Error('В копии есть повреждённая карточка.');
    }
    ids.add(card.id);
  }
  return { cards, paper, cardStyle };
}

export function reorder(cards, done, ids) {
  const active = cards.filter(card => card.done === done);
  const byId = new Map(active.map(card => [card.id, card]));
  if (ids.length !== active.length || new Set(ids).size !== active.length ||
      ids.some(id => !byId.has(id))) return cards;
  let index = 0;
  return cards.map(card => card.done === done ? byId.get(ids[index++]) : card);
}

export function toggleCard(cards, id) {
  const card = cards.find(item => item.id === id);
  if (!card) return cards;
  return [{ ...card, done: !card.done }, ...cards.filter(item => item.id !== id)];
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
    request.onsuccess = () => resolve(request.result ?? structuredClone(defaults));
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
