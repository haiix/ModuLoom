interface ProjectWithCustomCode {
  customDefinitions?: Array<{ customCode?: string }>;
}

export function projectRequiresCodeTrust(project: ProjectWithCustomCode | null): boolean {
  return Boolean(project?.customDefinitions?.some((definition) => definition.customCode));
}

export function canApplyProject(
  project: ProjectWithCustomCode | null,
  trustConfirmed: boolean,
): boolean {
  return Boolean(project && (!projectRequiresCodeTrust(project) || trustConfirmed));
}
