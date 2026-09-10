import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebouncedSave } from '../src/engine/debouncedSave';

describe('DebouncedSave', () => {
  afterEach(() => vi.useRealTimers());

  it('最後の変更をデバウンス後に保存する', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_value: number) => {});
    const scheduler = new DebouncedSave(save, {
      delayMs: 400,
      maxWaitMs: 2_000,
      onError: vi.fn(),
    });

    scheduler.schedule(1);
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule(2);
    await vi.advanceTimersByTimeAsync(399);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2);
  });

  it('連続変更中も最大待機時間で最新状態を確定する', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_value: number) => {});
    const scheduler = new DebouncedSave(save, {
      delayMs: 400,
      maxWaitMs: 2_000,
      onError: vi.fn(),
    });

    for (let elapsed = 0; elapsed < 2_000; elapsed += 200) {
      scheduler.schedule(elapsed);
      await vi.advanceTimersByTimeAsync(200);
    }

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(1_800);
  });

  it('保存失敗をonErrorへ渡し、後続保存を継続する', async () => {
    const error = new Error('quota exceeded');
    const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const scheduler = new DebouncedSave<number>(save, {
      delayMs: 400,
      maxWaitMs: 2_000,
      onError,
    });

    scheduler.schedule(1);
    await expect(scheduler.flush()).resolves.toBeUndefined();
    scheduler.schedule(2);
    await expect(scheduler.flush()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith(error);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
