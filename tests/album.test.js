import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, decodeBackup, encodeBackup, normalizeAlbum, toggleCard, visibleCards, MAX_IDEA_LENGTH } from '../web/album.js';
import { themes, modes, rollIdea, ticketText } from '../web/idea-bank.js';

const legacy = () => ({ app: 'Chalanger', version: 1, album: {
  cards: [{ id: 'old', text: 'Лунный кот', done: false, style: null }],
  paper: defaults.paper, cardStyle: defaults.cardStyle
} });

test('legacy backups preserve text and order without inventing dates', () => {
  const source = legacy();
  const album = decodeBackup(source);
  assert.equal(album.cards[0].text, 'Лунный кот');
  assert.equal(album.cards[0].favorite, false);
  assert.equal(album.cards[0].createdAt, null);
  assert.equal(album.schemaVersion, 2);
  assert.equal(source.album.cards[0].favorite, undefined);
});

test('new backup round-trips long ideas, favorites, dates and appearance', () => {
  const album = decodeBackup(legacy());
  Object.assign(album.cards[0], { favorite: true, text: 'я'.repeat(MAX_IDEA_LENGTH), createdAt: '2026-11-08T12:00:00.000Z' });
  album.cards = toggleCard(album.cards, 'old', '2026-11-09T13:00:00.000Z');
  assert.deepEqual(decodeBackup(JSON.parse(encodeBackup(album))), album);
  assert.equal(toggleCard(album.cards, 'old')[0].completedAt, null);
});

test('damaged, duplicate, oversized and future records are rejected', () => {
  for (const mutate of [
    value => { value.version = 3; },
    value => { value.album.cards.push(value.album.cards[0]); },
    value => { value.album.cards[0].text = 'x'.repeat(MAX_IDEA_LENGTH + 1); },
    value => { value.album.cards[0].favorite = 'true'; },
    value => { value.album.cards[0].createdAt = 'yesterday'; },
    value => { value.album.cards[0].style = { color: '__proto__', pattern: 'dots' }; },
    value => { value.album.schemaVersion = 99; }
  ]) {
    const value = legacy();
    mutate(value);
    assert.throws(() => decodeBackup(value));
  }
});

test('search is case-insensitive and combines status with favorite filter', () => {
  const cards = [
    { text: 'Лунный КОТ', done: false, favorite: true },
    { text: 'Кот в саду', done: false, favorite: false },
    { text: 'Лунный кот', done: true, favorite: true }
  ];
  assert.deepEqual(visibleCards(cards, { query: ' кот ', favorites: true }), [cards[0]]);
  assert.deepEqual(visibleCards(cards, { query: 'КОТ', done: true }), [cards[2]]);
});

test('all generator themes and modes produce importable ideas, including custom topics', () => {
  for (const mode of Object.keys(modes)) {
    for (const theme of Object.keys(themes)) {
      for (const partner of [[], ['custom'], ...Object.keys(themes).filter(key => key !== theme).map(key => [key])]) {
        let current = [];
        for (let index = 0; index < 30; index++) {
          current = rollIdea({ mode, selected: [theme, ...partner], topic: 'я'.repeat(32), current, slots: [0, 1, 2] });
          const text = ticketText(current);
          assert.ok(text.length > 0 && text.length <= MAX_IDEA_LENGTH, mode + ' / ' + theme);
          const album = structuredClone(defaults);
          album.cards = [{ id: 'generated', text, done: false, style: null }];
          assert.equal(normalizeAlbum(album).cards[0].text, text);
        }
      }
    }
  }
});
