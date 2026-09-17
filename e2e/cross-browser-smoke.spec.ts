import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('moduloom:onboarding-status', 'skipped');
  });
  await page.goto('/');
});

async function openMathPreset(page: Page) {
  await page.getByRole('button', { name: 'その他の操作' }).click({ force: true });
  await page.getByRole('menuitem', { name: 'サンプルギャラリー' }).click({ force: true });
  await page
    .locator('[data-preset-id="math-calc"]')
    .getByRole('button', { name: '新規として開く' })
    .click({ force: true });
}

test('主要な評価・ノード移動・配線が動作する', async ({ page }) => {
  await openMathPreset(page);
  await page.getByRole('button', { name: 'ノードライブラリを閉じる' }).click({ force: true });
  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('111');

  const slider = page.locator('[data-node-id="n-slider-a"]');
  const initialTransform = await slider.evaluate(
    (element) => (element as HTMLElement).style.transform,
  );
  const handleBox = await slider.locator('.node-drag-handle').boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + 30, handleBox!.y + 12);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + 70, handleBox!.y + 32);
  await page.mouse.up();
  await expect
    .poll(() => slider.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe(initialTransform);

  const outputBox = await slider
    .locator('[data-port-id="value"][data-port-direction="out"]')
    .boundingBox();
  const inputBox = await page
    .locator('[data-node-id="n-add"] [data-port-id="b"][data-port-direction="in"]')
    .boundingBox();
  expect(outputBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  await page.mouse.move(outputBox!.x + outputBox!.width / 2, outputBox!.y + outputBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(inputBox!.x + inputBox!.width / 2, inputBox!.y + inputBox!.height / 2);
  await page.mouse.up();

  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('108');
});
