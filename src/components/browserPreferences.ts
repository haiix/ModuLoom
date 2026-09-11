export const NODE_LIBRARY_STORAGE_KEY = 'moduloom:node-library-open';

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
