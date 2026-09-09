import type { FlowProjectExport } from '../types';

export function projectRequiresCodeTrust(project: FlowProjectExport | null): boolean {
  return Boolean(project?.customDefinitions?.some((definition) => definition.customCode));
}

export function canApplyProject(
  project: FlowProjectExport | null,
  trustConfirmed: boolean,
): boolean {
  return Boolean(project && (!projectRequiresCodeTrust(project) || trustConfirmed));
}
