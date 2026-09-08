export function getToolbarPresentation(width: number) {
  return { showBrandLabel: width >= 1024, showActionLabels: width >= 900 };
}
