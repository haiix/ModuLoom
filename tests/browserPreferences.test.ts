import { describe, expect, it, vi } from 'vitest';

import {
  EMPTY_NODE_PALETTE_PREFERENCES,
  getInitialNodeLibraryOpen,
  MAX_RECENT_NODE_TYPES,
  NODE_LIBRARY_STORAGE_KEY,
  NODE_PALETTE_STORAGE_KEY,
  parseNodePalettePreferences,
  recordRecentNode,
  togglePinnedNode,
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

describe('node palette preferences', () => {
  it('parses, deduplicates, and bounds browser-only preferences', () => {
    const recentTypeIds = Array.from(
      { length: MAX_RECENT_NODE_TYPES + 3 },
      (_, index) => `n/${index}`,
    );
    const parsed = parseNodePalettePreferences(
      JSON.stringify({ pinnedTypeIds: ['math/add', 'math/add'], recentTypeIds }),
    );

    expect(NODE_PALETTE_STORAGE_KEY).toBe('moduloom:node-palette-v1');
    expect(parsed.pinnedTypeIds).toEqual(['math/add']);
    expect(parsed.recentTypeIds).toEqual(recentTypeIds.slice(0, MAX_RECENT_NODE_TYPES));
  });

  it('falls back for missing, malformed, or legacy settings', () => {
    expect(parseNodePalettePreferences(null)).toEqual(EMPTY_NODE_PALETTE_PREFERENCES);
    expect(parseNodePalettePreferences('{')).toEqual(EMPTY_NODE_PALETTE_PREFERENCES);
    expect(parseNodePalettePreferences(JSON.stringify({ collapsedCategories: {} }))).toEqual(
      EMPTY_NODE_PALETTE_PREFERENCES,
    );
  });

  it('updates pin and recent lists without duplicates', () => {
    const pinned = togglePinnedNode(EMPTY_NODE_PALETTE_PREFERENCES, 'math/add');
    expect(togglePinnedNode(pinned, 'math/add').pinnedTypeIds).toEqual([]);

    const recent = recordRecentNode(recordRecentNode(pinned, 'math/add'), 'string/concat');
    expect(recordRecentNode(recent, 'math/add').recentTypeIds).toEqual([
      'math/add',
      'string/concat',
    ]);
  });
});
