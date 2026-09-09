import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('moduloom:onboarding-status', 'skipped');
  });
  await page.goto('/');
});

test('空のキャンバスと主要操作を表示する', async ({ page }) => {
  await expect(page.getByText('キャンバスは空です')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ノードを追加', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'グラフを実行', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'プロジェクトを保存' })).toBeVisible();
});

test('四則演算プリセットを実行して結果を表示する', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');

  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('最終計算結果');
  await page.getByRole('button', { name: 'グラフを実行', exact: true }).click();
  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('111');
});

test('プリセットの適用を元に戻してやり直せる', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await expect(page.locator('[data-node-id="n-slider-a"]')).toBeVisible();

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByText('キャンバスは空です')).toBeVisible();

  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(page.locator('[data-node-id="n-slider-a"]')).toBeVisible();
});
