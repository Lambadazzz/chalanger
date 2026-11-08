import { test, expect } from '@playwright/test';

async function start(page) {
  await page.goto('/');
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Начать рисовать' }).click();
}
async function add(page, text) {
  await page.getByRole('button', { name: 'Новая идея', exact: true }).click();
  await page.getByRole('textbox', { name: 'Что рисуем?' }).fill(text);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#editor')).not.toBeVisible();
}

test('create, favorite, search, complete and persist after reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await add(page, 'Кот на луне');
  await add(page, 'Сад в облаках');
  await page.locator('.card').filter({ hasText: 'Кот на луне' }).getByRole('button', { name: 'Избранное', exact: true }).click();
  await page.locator('#favorites').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Поиск по идеям' }).fill('ЛУНЕ');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Отметить готовой' }).click();
  await page.getByRole('button', { name: /^Готово/ }).click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card small')).toContainText('Готово');
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('Сад в облаках');
  await page.getByRole('button', { name: /^Готово/ }).click();
  await expect(page.locator('.card-favorite')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('legacy import, long generated text and backup export', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Палитра', exact: true }).click();
  const old = { app: 'Chalanger', version: 1, album: {
    cards: [{ id: 'old', text: 'Старая идея', style: null, done: false }],
    paper: { color: 'pink', pattern: 'dots' }, cardStyle: { color: 'lime', pattern: 'grid' }
  } };
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#backup-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await expect(page.locator('.card')).toContainText('Старая идея');
  await expect(page.locator('.card small')).toHaveCount(0);
  await add(page, 'Длинная идея '.repeat(60));
  await page.getByRole('button', { name: 'Палитра', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить копию', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const restored = JSON.parse(Buffer.concat(chunks).toString());
  expect(restored.version).toBe(2);
  expect(restored.album.cards).toHaveLength(2);
  expect(restored.album.cards[0].text.length).toBeGreaterThan(240);
});

test('invalid backup leaves existing album unchanged', async ({ page }) => {
  await start(page);
  await add(page, 'Не потерять');
  await page.getByRole('button', { name: 'Палитра', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#backup-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.locator('#appearance [data-close]').click();
  await expect(page.locator('.card')).toContainText('Не потерять');
});

test('offline reload retains album and generator on a narrow screen', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await start(page);
  await add(page, 'Офлайн-кот');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.card')).toContainText('Офлайн-кот');
  await page.getByRole('button', { name: 'Новая идея', exact: true }).click();
  await page.getByRole('button', { name: 'Генератор', exact: true }).click();
  await expect(page.locator('#idea-ticket')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Забрать идею', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: 'artifacts/album-mobile.png', fullPage: true });
});
