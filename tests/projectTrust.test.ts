import { describe, expect, it } from 'vitest';
import { canApplyProject, projectRequiresCodeTrust } from '../src/engine/projectTrust';
import type { FlowProjectExport } from '../src/types';

const baseProject: FlowProjectExport = {
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
    const project: FlowProjectExport = {
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
});
