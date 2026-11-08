import { test, expect } from '@playwright/test';

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
}
async function begin(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать рисовать' }).click();
}
async function add(page, text) {
  await page.locator('#add').click();
  await page.locator('textarea').fill(text);
  await page.locator('#editor-form button[type=submit]').click();
  await expect(page.locator('#editor')).not.toBeVisible();
}

test('compact cards adapt to text length and animate the Ideas star on both paths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await add(page, 'Лунный кот');
  await expect(page.locator('[data-view=ideas]')).toHaveClass(/receiving/);
  const short = page.locator('.card').filter({ hasText: 'Лунный кот' });
  await expect(short).not.toHaveClass(/card--long/);
  await settle(page);
  expect((await short.boundingBox()).height).toBeLessThan(80);
  const alignment = await short.evaluate(row => {
    const text = row.querySelector('.card-copy').getBoundingClientRect();
    const actions = row.querySelector('.card-actions').getBoundingClientRect();
    return actions.top < text.bottom && actions.bottom > text.top;
  });
  expect(alignment).toBe(true);
  await add(page, 'Нарисуй маленький город внутри стеклянного чайника. На крышах растёт мята, а по мостам ходят почтальоны с письмами из облаков.');
  const long = page.locator('.card--long');
  await expect(long).toHaveCount(1);
  const spacing = await long.evaluate(row => {
    const copy = row.querySelector('.card-copy').getBoundingClientRect();
    const actions = row.querySelector('.card-actions').getBoundingClientRect();
    return { gap: actions.top - copy.bottom, height: actions.height };
  });
  expect(spacing.gap).toBeLessThan(5);
  expect(spacing.height).toBeLessThanOrEqual(32);
  await short.getByRole('button', { name: 'Отметить готовой' }).click();
  await page.locator('[data-view=done]').click();
  await page.getByRole('button', { name: 'Вернуть в идеи' }).click();
  await expect(page.locator('[data-view=ideas]')).toHaveClass(/receiving/);
  await page.locator('[data-view=ideas]').click();
  await settle(page);
  await page.screenshot({ path: 'artifacts/cards-0.2.png', fullPage: true });
});

test('generator stays below system bars and above navigation with long content', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await begin(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '32px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px');
  });
  await page.locator('#add').click();
  await page.locator('#open-generator').click();
  await settle(page);
  const box = await page.locator('#editor').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(52);
  expect(box.y + box.height).toBeLessThanOrEqual(740 - 44);
  expect(await page.locator('#editor').evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.locator('#use-idea').scrollIntoViewIfNeeded();
  await expect(page.locator('#use-idea')).toBeInViewport();
  await page.locator('#editor').evaluate(e => { e.scrollTop = 0; });
  await page.locator('#editor').screenshot({ path: 'artifacts/generator-0.2.png' });
});

test('welcome uses illustrated steps and keeps legal sections at the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#help-dialog')).toBeVisible();
  await expect(page.locator('.welcome-step svg')).toHaveCount(3);
  await expect(page.getByText('Ну что,')).toBeVisible();
  await expect(page.locator('.welcome-fineprint').getByText('Конфиденциальность', { exact: true })).toBeAttached();
  await settle(page);
  await page.locator('#help-dialog').evaluate(e => { e.scrollTop = 0; });
  await page.locator('#help-dialog').screenshot({ path: 'artifacts/welcome-0.2.png' });
  await page.getByRole('button', { name: 'Начать рисовать' }).click();
  await page.reload();
  await expect(page.locator('#help-dialog')).not.toBeVisible();
});
