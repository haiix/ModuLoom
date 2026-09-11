import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('moduloom:onboarding-status', 'skipped');
  });
  await page.goto('/');
});

test('空のキャンバスと主要操作を表示する', async ({ page }) => {
  await expect(page.getByText('キャンバスは空です')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ノードライブラリを閉じる' })).toBeVisible();
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

  const guide = page.getByRole('complementary', { name: 'はじめてガイド' });
  const library = page.getByRole('complementary', { name: 'ノードライブラリ' });
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
  await page.getByRole('button', { name: 'ノードライブラリを閉じる' }).click();
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
  await page.getByRole('button', { name: 'ノードライブラリを閉じる' }).click();

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

test('編集内容とviewportを自動保存し、再読み込み時に復元する', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await page.getByRole('button', { name: 'ノードライブラリを閉じる' }).click();

  const canvas = page.getByLabel('ノードキャンバス');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width - 120, box!.y + 140);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box!.x + box!.width - 180, box!.y + 180);
  await page.mouse.up({ button: 'right' });
  const savedPosition = await canvas.evaluate(
    (element) => getComputedStyle(element).backgroundPosition,
  );

  await page.waitForTimeout(600);
  await expect(page.getByRole('status')).toContainText('ブラウザに保存済み');
  await page.reload();

  await expect(page.locator('[data-node-id="n-slider-a"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ノードライブラリを開く' })).toBeVisible();
  await expect(page.getByText('前回の編集状態を復元しました。')).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((element) => getComputedStyle(element).backgroundPosition))
    .toBe(savedPosition);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '破棄して新規作成' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('ブラウザに保存済み');
  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('BroadcastChannelなしでも他タブの保存を上書きせず両方の編集を回収できる', async ({ page }) => {
  const otherPage = await page.context().newPage();
  await otherPage.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', { configurable: true, value: undefined });
  });
  await otherPage.goto('/');

  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await expect(page.getByRole('status')).toContainText('ブラウザに保存済み');

  await otherPage.getByRole('button', { name: 'その他の操作' }).click();
  await otherPage
    .getByRole('combobox', { name: 'プリセットを選択' })
    .selectOption('string-template');
  const conflict = otherPage.getByRole('alert');
  await expect(conflict).toContainText('別のタブで新しい編集が保存されました。');
  await expect(otherPage.locator('[data-node-id="n-txt-name"]')).toBeVisible();

  const downloadPromise = otherPage.waitForEvent('download');
  await otherPage.getByRole('button', { name: '現在の内容をJSON書き出し' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^moduloom-graph-.*\.json$/);

  otherPage.once('dialog', (dialog) => void dialog.accept());
  await otherPage.getByRole('button', { name: '保存済み状態を再読み込み' }).click();
  await expect(otherPage.locator('[data-node-id="n-slider-a"]')).toBeVisible();
  await expect(otherPage.locator('[data-node-id="n-txt-name"]')).toHaveCount(0);
});

test('BroadcastChannelで他タブの更新を編集前に通知する', async ({ page }) => {
  const otherPage = await page.context().newPage();
  await otherPage.goto('/');

  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await expect(page.getByRole('status')).toContainText('ブラウザに保存済み');

  await expect(otherPage.getByRole('alert')).toContainText(
    '別のタブで新しい編集が保存されました。',
  );
});

test('全消去を確定すると古いグラフを次回復元しない', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await expect(page.getByRole('status')).toContainText('ブラウザに保存済み');

  await page.getByRole('button', { name: 'その他の操作' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('menuitem', { name: 'キャンバスを全消去' }).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('ブラウザに保存済み');
  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('不正な復元データを部分適用せず、明示的に破棄できる', async ({ page }) => {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('moduloom-recovery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put({ storageVersion: 999 }, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.getByRole('alert')).toContainText('storageVersion');
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
  await page.getByRole('button', { name: '復元データを破棄' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('復元した自作式は信頼確認前に適用せず、同一内容だけ信頼を継続する', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    (window as typeof window & { customCodeWorkerStarts: number }).customCodeWorkerStarts = 0;
    window.Worker = class extends OriginalWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        (window as typeof window & { customCodeWorkerStarts: number }).customCodeWorkerStarts += 1;
      }
    };
  });

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('moduloom-recovery', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const snapshot = {
      storageVersion: 1,
      project: {
        version: '1.0.0',
        appName: 'Trust test',
        exportedAt: '2026-09-10T00:00:00.000Z',
        nodes: [{ id: 'custom-node', typeId: 'custom/value', x: 10, y: 20 }],
        connections: [],
        customTypes: [],
        customDefinitions: [
          {
            typeId: 'custom/value',
            label: 'Value',
            category: 'Custom',
            kind: 'pure',
            inputs: [],
            outputs: [{ id: 'result', name: 'result', type: 'number' }],
            customCode: '42',
          },
        ],
        viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      },
      updatedAt: '2026-09-10T00:00:00.000Z',
      revision: 1,
      wasDirty: true,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put(snapshot, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.getByRole('button', { name: '信頼して復元' })).toBeVisible();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { customCodeWorkerStarts: number }).customCodeWorkerStarts,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: '信頼して復元' }).click();
  await expect(page.locator('[data-node-id="custom-node"]')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: '信頼して復元' })).toHaveCount(0);
  await expect(page.locator('[data-node-id="custom-node"]')).toBeVisible();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('moduloom-recovery', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      const store = transaction.objectStore('snapshots');
      const request = store.get('current');
      request.onsuccess = () => {
        request.result.project.customDefinitions[0].customCode = '43';
        store.put(request.result, 'current');
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.getByRole('button', { name: '信頼して復元' })).toBeVisible();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('自作式の非同期処理、VM制限、Worker復旧をQuickJSで処理する', async ({ page }) => {
  const openEditor = async () => {
    const customNodeButton = page.getByRole('button', { name: '自作ノード', exact: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await customNodeButton.isVisible()) {
        await customNodeButton.click();
        return;
      }
      await page.getByRole('button', { name: 'ノードを追加', exact: true }).click();
      try {
        await customNodeButton.waitFor({ state: 'visible', timeout: 3_000 });
      } catch {
        // Vite dependency optimization may reload immediately after the first interaction.
        await page.waitForLoadState('domcontentloaded');
        continue;
      }
    }
    await customNodeButton.click();
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
  } catch {
    // Dependency optimization can reload the page, and a busy cold build can consume
    // the first Worker's watchdog. In both cases the recreated Worker must recover.
    if (!(await page.getByPlaceholder('例: inputs.a + inputs.b').isVisible())) await openEditor();
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

  await page.getByPlaceholder('例: inputs.a + inputs.b').fill('(() => { while (true) {} })()');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText(/実行時エラー:/)).toContainText('CPU実行時間が750msを超えたため停止');

  await page
    .getByPlaceholder('例: inputs.a + inputs.b')
    .fill('(() => { const recurse = () => recurse(); return recurse(); })()');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText(/実行時エラー:/)).toContainText(
    'stack上限 524288 bytes を超えました',
  );

  await page
    .getByPlaceholder('例: inputs.a + inputs.b')
    .fill('Array(20_000_000).fill("xxxxxxxxxxxxxxxx")');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText(/実行時エラー:/)).toContainText('out of memory');

  await page.getByPlaceholder('例: inputs.a + inputs.b').fill('new Promise(() => {})');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText(/実行時エラー:/)).toContainText('実行時間が1000msを超えたため停止');

  await page.getByPlaceholder('例: inputs.a + inputs.b').fill('inputs.a + inputs.b');
  await page.getByRole('button', { name: '式のテスト実行' }).click();
  await expect(page.getByText('テスト実行成功:')).toContainText('30');
});

test('プリセットの適用を元に戻してやり直せる', async ({ page }) => {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('combobox', { name: 'プリセットを選択' }).selectOption('math-calc');
  await expect(page.locator('[data-node-id="n-slider-a"]')).toBeVisible();

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
  await expect(page.getByText('キャンバスは空です')).toHaveCount(0);

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
