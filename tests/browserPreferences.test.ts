import { describe, expect, it, vi } from 'vitest';

import {
  getInitialNodeLibraryOpen,
  NODE_LIBRARY_STORAGE_KEY,
} from '../src/components/browserPreferences';

describe('browser preferences', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('保存済みのノードライブラリ設定 %s を優先する', (savedValue, expected) => {
    const readSavedState = vi.fn(() => savedValue);
    const isNarrowViewport = vi.fn(() => true);

    expect(getInitialNodeLibraryOpen(readSavedState, isNarrowViewport)).toBe(expected);
    expect(NODE_LIBRARY_STORAGE_KEY).toBe('moduloom:node-library-open');
    expect(isNarrowViewport).not.toHaveBeenCalled();
  });

  it.each([
    [false, true],
    [true, false],
  ])('設定がない場合は狭いviewport=%sから既定値を決める', (isNarrow, expected) => {
    expect(
      getInitialNodeLibraryOpen(
        () => null,
        () => isNarrow,
      ),
    ).toBe(expected);
  });

  it('Local Storageが利用できない場合もviewportの既定値へフォールバックする', () => {
    const readSavedState = () => {
      throw new DOMException('storage disabled', 'SecurityError');
    };

    expect(getInitialNodeLibraryOpen(readSavedState, () => true)).toBe(false);
  });

  it('viewport判定も利用できない場合は操作可能な開状態にする', () => {
    expect(
      getInitialNodeLibraryOpen(
        () => null,
        () => {
          throw new Error('matchMedia unavailable');
        },
      ),
    ).toBe(true);
  });
});
