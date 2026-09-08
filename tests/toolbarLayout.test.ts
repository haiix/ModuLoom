import { describe, expect, it } from 'vitest';
import { getToolbarPresentation } from '../src/components/toolbarLayout';
describe('responsive toolbar', () => {
  it.each([
    [1280, { showBrandLabel: true, showActionLabels: true }],
    [1024, { showBrandLabel: true, showActionLabels: true }],
    [768, { showBrandLabel: false, showActionLabels: false }],
  ])('%dpxの表示密度', (width, expected) =>
    expect(getToolbarPresentation(width)).toEqual(expected),
  );
});
