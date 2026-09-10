interface ProjectWithCustomCode {
  customDefinitions?: Array<{ typeId?: string; customCode?: string }>;
}

interface RecoveryTrustCandidate {
  project: ProjectWithCustomCode;
  trustedCodeFingerprint?: string;
}

const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function projectRequiresCodeTrust(project: ProjectWithCustomCode | null): boolean {
  return Boolean(project?.customDefinitions?.some((definition) => definition.customCode));
}

export function canApplyProject(
  project: ProjectWithCustomCode | null,
  trustConfirmed: boolean,
): boolean {
  return Boolean(project && (!projectRequiresCodeTrust(project) || trustConfirmed));
}

export async function createProjectCodeFingerprint(
  project: ProjectWithCustomCode,
): Promise<string | undefined> {
  const entries = (project.customDefinitions ?? [])
    .filter(
      (definition): definition is { typeId?: string; customCode: string } =>
        typeof definition.customCode === 'string' && definition.customCode.length > 0,
    )
    .map((definition) => JSON.stringify([definition.typeId ?? '', definition.customCode]))
    .sort();
  if (entries.length === 0) return undefined;

  const encoded = new TextEncoder().encode(JSON.stringify(entries));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `sha256:${hex}`;
}

export async function recoverySnapshotHasTrustedCode(
  snapshot: RecoveryTrustCandidate,
): Promise<boolean> {
  if (!projectRequiresCodeTrust(snapshot.project)) return true;
  if (
    !snapshot.trustedCodeFingerprint ||
    !SHA256_FINGERPRINT_PATTERN.test(snapshot.trustedCodeFingerprint)
  ) {
    return false;
  }
  return snapshot.trustedCodeFingerprint === (await createProjectCodeFingerprint(snapshot.project));
}
