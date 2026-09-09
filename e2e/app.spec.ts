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

test('実行ボタンはホバー時も文字とのコントラストを保つ', async ({ page }) => {
  const runButton = page.getByRole('button', { name: 'グラフを実行', exact: true });
  await runButton.hover();

  const colors = await runButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, foreground: style.color };
  });

  expect(contrastRatio(colors.background, colors.foreground)).toBeGreaterThanOrEqual(4.5);
});

test('その他の操作メニューは外側のクリックで閉じる', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await expect(page.getByRole('menu', { name: 'その他の操作' })).toBeVisible();

  await page.getByRole('main').click({ position: { x: 700, y: 200 } });

  await expect(page.getByRole('menu', { name: 'その他の操作' })).toBeHidden();
});

test('ノードライブラリを開いてもはじめてガイドと重ならない', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('menuitem', { name: 'はじめてガイドを表示' }).click();
  await page.getByRole('button', { name: 'ノードを追加', exact: true }).click();

  const guide = page.getByRole('complementary', { name: 'はじめてガイド' });
  const library = page.getByText('ノードライブラリ', { exact: true }).locator('..').locator('..');
  await expect(guide).toBeVisible();
  await expect(library).toBeVisible();

  const guideBox = await guide.boundingBox();
  const libraryBox = await library.boundingBox();
  expect(guideBox).not.toBeNull();
  expect(libraryBox).not.toBeNull();
  expect(rectanglesOverlap(guideBox!, libraryBox!)).toBe(false);
});

test('選択ノード操作はノードライブラリの開閉状態にかかわらず重ならない', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await page.locator('[data-node-id="n-slider-a"] .node-drag-handle').click();

  const selectionTools = page.getByRole('toolbar', { name: '選択ノード操作' });
  const library = page.getByRole('complementary', { name: 'ノードライブラリ' });
  await expect(selectionTools).toBeVisible();

  const expectNoOverlap = async () =>
    expect
      .poll(async () => {
        const toolsBox = await selectionTools.boundingBox();
        const libraryBox = await library.boundingBox();
        if (!toolsBox || !libraryBox) return true;
        return rectanglesOverlap(toolsBox, libraryBox);
      })
      .toBe(false);
  await expectNoOverlap();

  await page.getByRole('button', { name: 'ノードライブラリを開く' }).click();
  await expect(page.getByRole('button', { name: 'ノードライブラリを閉じる' })).toBeVisible();

  await expectNoOverlap();
});

test('キャンバスは右ドラッグで移動し、中ドラッグでは移動しない', async ({ page }) => {
  const canvas = page.getByLabel('ノードキャンバス');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + box!.width - 160, y: box!.y + 160 };

  const initialPosition = await canvas.evaluate(
    (element) => getComputedStyle(element).backgroundPosition,
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x - 40, start.y + 30);
  await page.mouse.up({ button: 'middle' });
  await expect
    .poll(() => canvas.evaluate((element) => getComputedStyle(element).backgroundPosition))
    .toBe(initialPosition);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x - 40, start.y + 30);
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(() => canvas.evaluate((element) => getComputedStyle(element).backgroundPosition))
    .not.toBe(initialPosition);
});

test('キャンバスは左ドラッグでノードを範囲選択する', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');

  const node = page.locator('[data-node-id="n-slider-a"]');
  const nodeBox = await node.boundingBox();
  expect(nodeBox).not.toBeNull();

  await page.mouse.move(nodeBox!.x - 8, nodeBox!.y - 8);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(nodeBox!.x + nodeBox!.width + 8, nodeBox!.y + nodeBox!.height + 8);
  await page.mouse.up({ button: 'left' });

  await expect(page.getByRole('toolbar', { name: '選択ノード操作' })).toContainText('1件選択');
});

test('四則演算プリセットを実行して結果を表示する', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');

  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('最終計算結果');
  await page.getByRole('button', { name: 'グラフを実行', exact: true }).click();
  await expect(page.locator('[data-node-id="n-out-inspector"]')).toContainText('111');
});

test('自作式のPromise、sleep、拒否、期限超過をQuickJSで処理する', async ({ page }) => {
  const openEditor = async () => {
    if (!(await page.getByRole('button', { name: '自作ノード', exact: true }).isVisible())) {
      await page.getByRole('button', { name: 'ノードを追加', exact: true }).click();
    }
    await page.getByRole('button', { name: '自作ノード', exact: true }).click();
  };
  const runInitialPromise = async () => {
    await page
      .getByPlaceholder('例: inputs.a + inputs.b')
      .fill('Promise.resolve(inputs.a * inputs.b)');
    await page.getByRole('button', { name: '式のテスト実行' }).click();
    await expect(page.getByText('テスト実行成功:')).toContainText('200', { timeout: 3_000 });
  };

  await openEditor();
  try {
    await runInitialPromise();
  } catch (error) {
    if (await page.getByPlaceholder('例: inputs.a + inputs.b').isVisible()) throw error;
    // A reused Vite dev server can reload once when it first optimizes Worker-only dependencies.
    await openEditor();
    await runInitialPromise();
  }

  await page
    .getByPlaceholder('例: inputs.a + inputs.b')
    .fill('(async () => { await sleep(5); return inputs.a + inputs.b; })()');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText('テスト実行成功:')).toContainText('30');

  await page
    .getByPlaceholder('例: inputs.a + inputs.b')
    .fill('Promise.reject(new Error("rejected"))');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText(/実行時エラー:/)).toContainText('rejected');

  await page.getByPlaceholder('例: inputs.a + inputs.b').fill('new Promise(() => {})');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText(/実行時エラー:/)).toContainText('実行時間が1000msを超えたため停止');
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

function contrastRatio(background: string, foreground: string) {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const lighter = Math.max(luminance(background), luminance(foreground));
  const darker = Math.min(luminance(background), luminance(foreground));
  return (lighter + 0.05) / (darker + 0.05);
}

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}
