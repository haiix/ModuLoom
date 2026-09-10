import { describe, expect, it } from 'vitest';
import {
  canApplyProject,
  createProjectCodeFingerprint,
  projectRequiresCodeTrust,
  recoverySnapshotHasTrustedCode,
} from '../src/engine/projectTrust';
import type { LoadedFlowProject } from '../src/types';

const baseProject: LoadedFlowProject = {
  version: '1.0.0',
  appName: 'test',
  exportedAt: '2026-09-09T00:00:00.000Z',
  nodes: [],
  connections: [],
};

describe('project code trust', () => {
  it('allows projects without executable custom code', () => {
    expect(projectRequiresCodeTrust(baseProject)).toBe(false);
    expect(canApplyProject(baseProject, false)).toBe(true);
  });

  it('requires explicit trust before applying custom code', () => {
    const project: LoadedFlowProject = {
      ...baseProject,
      customDefinitions: [
        {
          typeId: 'custom/double',
          label: 'Double',
          category: 'Custom',
          kind: 'pure',
          inputs: [],
          outputs: [{ id: 'result', name: 'result', type: 'number' }],
          customCode: '2',
          evaluate: () => ({ result: 2 }),
        },
      ],
    };
    expect(projectRequiresCodeTrust(project)).toBe(true);
    expect(canApplyProject(project, false)).toBe(false);
    expect(canApplyProject(project, true)).toBe(true);
  });

  it('コード内容とtypeIdから安定したSHA-256フィンガープリントを作る', async () => {
    const first = {
      ...baseProject,
      customDefinitions: [
        { typeId: 'custom/b', customCode: '2' },
        { typeId: 'custom/a', customCode: '1' },
      ],
    };
    const reordered = {
      ...baseProject,
      customDefinitions: [...first.customDefinitions].reverse(),
    };

    const fingerprint = await createProjectCodeFingerprint(first);
    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await createProjectCodeFingerprint(reordered)).toBe(fingerprint);
    expect(
      await createProjectCodeFingerprint({
        ...first,
        customDefinitions: [{ typeId: 'custom/a', customCode: 'changed' }],
      }),
    ).not.toBe(fingerprint);
  });

  it('欠落・不正・不一致の信頼情報を拒否し、同一内容だけを許可する', async () => {
    const project = {
      ...baseProject,
      customDefinitions: [{ typeId: 'custom/value', customCode: '42' }],
    };
    const trustedCodeFingerprint = await createProjectCodeFingerprint(project);

    await expect(recoverySnapshotHasTrustedCode({ project })).resolves.toBe(false);
    await expect(
      recoverySnapshotHasTrustedCode({ project, trustedCodeFingerprint: 'invalid' }),
    ).resolves.toBe(false);
    await expect(recoverySnapshotHasTrustedCode({ project, trustedCodeFingerprint })).resolves.toBe(
      true,
    );
    await expect(
      recoverySnapshotHasTrustedCode({
        project: {
          ...project,
          customDefinitions: [{ typeId: 'custom/value', customCode: '43' }],
        },
        trustedCodeFingerprint,
      }),
    ).resolves.toBe(false);
  });
});
