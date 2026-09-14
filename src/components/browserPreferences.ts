export const NODE_LIBRARY_STORAGE_KEY = 'moduloom:node-library-open';
export const NODE_PALETTE_STORAGE_KEY = 'moduloom:node-palette-v1';
export const MAX_RECENT_NODE_TYPES = 8;

export interface NodePalettePreferences {
  pinnedTypeIds: string[];
  recentTypeIds: string[];
}

export const EMPTY_NODE_PALETTE_PREFERENCES: NodePalettePreferences = {
  pinnedTypeIds: [],
  recentTypeIds: [],
};

export function parseNodePalettePreferences(value: string | null): NodePalettePreferences {
  if (!value) return EMPTY_NODE_PALETTE_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Partial<NodePalettePreferences>;
    return {
      pinnedTypeIds: uniqueStrings(parsed.pinnedTypeIds),
      recentTypeIds: uniqueStrings(parsed.recentTypeIds).slice(0, MAX_RECENT_NODE_TYPES),
    };
  } catch {
    return EMPTY_NODE_PALETTE_PREFERENCES;
  }
}

export function recordRecentNode(
  preferences: NodePalettePreferences,
  typeId: string,
): NodePalettePreferences {
  return {
    ...preferences,
    recentTypeIds: [typeId, ...preferences.recentTypeIds.filter((id) => id !== typeId)].slice(
      0,
      MAX_RECENT_NODE_TYPES,
    ),
  };
}

export function togglePinnedNode(
  preferences: NodePalettePreferences,
  typeId: string,
): NodePalettePreferences {
  const pinned = preferences.pinnedTypeIds.includes(typeId);
  return {
    ...preferences,
    pinnedTypeIds: pinned
      ? preferences.pinnedTypeIds.filter((id) => id !== typeId)
      : [...preferences.pinnedTypeIds, typeId],
  };
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

export function getInitialNodeLibraryOpen(
  readSavedState: () => string | null,
  isNarrowViewport: () => boolean,
): boolean {
  let savedState: string | null = null;

  try {
    savedState = readSavedState();
  } catch {
    // Fall back to the viewport-based default when storage is unavailable.
  }

  if (savedState !== null) return savedState === 'true';

  try {
    return !isNarrowViewport();
  } catch {
    return true;
  }
}
