import { describe, expect, it } from 'vitest';

import type { EditorDocument } from '../src/engine/editorHistory';
import {
  createRecoverySnapshot,
  CURRENT_RECOVERY_STORAGE_VERSION,
  parseRecoverySnapshot,
  serializeFlowProject,
} from '../src/engine/projectSerialization';
import type { NodeDefinition } from '../src/types';

const customDefinition: NodeDefinition = {
  typeId: 'custom/double',
  label: 'Double',
  category: 'Custom',
  kind: 'pure',
  inputs: [{ id: 'value', name: 'value', type: 'number' }],
  outputs: [{ id: 'result', name: 'result', type: 'number' }],
  customCode: 'inputs.value * 2',
  evaluate: ({ value }) => ({ result: value * 2 }),
  codegen: { emit: () => 'inputs.value * 2' },
};

function createDocument(): EditorDocument {
  return {
    nodes: [{ id: 'double', typeId: 'custom/double', x: 12, y: 34 }],
    connections: [],
    customTypes: [],
    customDefinitions: [customDefinition],
  };
}

describe('project serialization', () => {
  it('実行時関数を明示的に除外し、既存の検証経路で往復できる', () => {
    const project = serializeFlowProject({
      document: createDocument(),
      viewport: { zoom: 1.25, pan: { x: 20, y: 30 } },
      exportedAt: '2026-09-10T00:00:00.000Z',
    });

    expect(project.customDefinitions?.[0]).not.toHaveProperty('evaluate');
    expect(project.customDefinitions?.[0]).not.toHaveProperty('codegen');
    const serialized = JSON.stringify(project);
    expect(serialized).not.toContain('evaluate');
    expect(serialized).not.toContain('codegen');

    const snapshot = createRecoverySnapshot(project, {
      updatedAt: '2026-09-10T00:01:00.000Z',
      revision: 3,
      writerId: 'tab-a',
      wasDirty: true,
    });
    const restored = parseRecoverySnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect(restored.project.version).toBe('1.1.0');
    expect(restored.project.viewport).toEqual(project.viewport);
    expect(restored.project.customDefinitions?.[0].customCode).toBe('inputs.value * 2');
    expect(restored.project.customDefinitions?.[0].evaluate).toBeTypeOf('function');
  });

  it('プロジェクト外のUI preferenceを直列化結果へ混入させない', () => {
    const documentWithUiState = Object.assign(createDocument(), {
      isLibraryOpen: true,
      onboardingStatus: 'completed',
      evaluation: { double: { outputs: { result: 24 } } },
      editorHistory: { past: [createDocument()], future: [] },
    });
    const project = serializeFlowProject({
      document: documentWithUiState,
      viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      exportedAt: '2026-09-10T00:00:00.000Z',
    });

    expect(project).not.toHaveProperty('isLibraryOpen');
    expect(project).not.toHaveProperty('onboardingStatus');
    expect(project).not.toHaveProperty('evaluation');
    expect(project).not.toHaveProperty('editorHistory');
  });

  it('未対応のstorageVersionをプロジェクト適用前に拒否する', () => {
    const project = serializeFlowProject({
      document: createDocument(),
      viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      exportedAt: '2026-09-10T00:00:00.000Z',
    });
    const snapshot = createRecoverySnapshot(project, {
      updatedAt: '2026-09-10T00:01:00.000Z',
      revision: 0,
      writerId: 'tab-a',
      wasDirty: false,
    });

    expect(CURRENT_RECOVERY_STORAGE_VERSION).toBe(2);
    expect(() => parseRecoverySnapshot({ ...snapshot, storageVersion: 3 })).toThrowError(
      /snapshot\.storageVersion: 未対応のバージョン '3'.*'2'/,
    );
  });

  it('旧storageVersion 1を読み込み専用writerId付きの現行形式へ移行する', () => {
    const project = serializeFlowProject({
      document: createDocument(),
      viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      exportedAt: '2026-09-10T00:00:00.000Z',
    });

    const restored = parseRecoverySnapshot({
      storageVersion: 1,
      project,
      updatedAt: '2026-09-10T00:01:00.000Z',
      revision: 2,
      wasDirty: true,
    });

    expect(restored.storageVersion).toBe(2);
    expect(restored.writerId).toBe('legacy-recovery-snapshot');
  });
});
