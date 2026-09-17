import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('moduloom:onboarding-status', 'skipped');
  });
  await page.goto('/');
});

async function openMathPreset(page: Page) {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('menuitem', { name: 'サンプルギャラリー' }).click();
  await page
    .locator('[data-preset-id="math-calc"]')
    .getByRole('button', { name: '新規として開く' })
    .click();
  await page.getByRole('button', { name: 'ノードライブラリを閉じる' }).click();
}

test('タッチでパン・ノード移動・配線を行える', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch injection is a Chromium-only test helper.');
  await openMathPreset(page);
  const client = await context.newCDPSession(page);
  let touchId = 0;
  const dragTouch = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    touchId += 1;
    const point = (position: { x: number; y: number }) => ({
      ...position,
      id: touchId,
      radiusX: 2,
      radiusY: 2,
      force: 1,
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(from)],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(to)],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  const canvas = page.getByLabel('ノードキャンバス');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const initialBackground = await canvas.evaluate(
    (element) => getComputedStyle(element).backgroundPosition,
  );
  await dragTouch(
    { x: canvasBox!.x + canvasBox!.width - 80, y: canvasBox!.y + 100 },
    { x: canvasBox!.x + canvasBox!.width - 130, y: canvasBox!.y + 140 },
  );
  await expect
    .poll(() => canvas.evaluate((element) => getComputedStyle(element).backgroundPosition))
    .not.toBe(initialBackground);

  const slider = page.locator('[data-node-id="n-slider-a"]');
  const initialTransform = await slider.evaluate(
    (element) => (element as HTMLElement).style.transform,
  );
  const handleBox = await slider.locator('.node-drag-handle').boundingBox();
  expect(handleBox).not.toBeNull();
  await dragTouch(
    { x: handleBox!.x + 30, y: handleBox!.y + 12 },
    { x: handleBox!.x + 70, y: handleBox!.y + 32 },
  );
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
  await dragTouch(
    { x: outputBox!.x + outputBox!.width / 2, y: outputBox!.y + outputBox!.height / 2 },
    { x: inputBox!.x + inputBox!.width / 2, y: inputBox!.y + inputBox!.height / 2 },
  );
  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('108');
});
