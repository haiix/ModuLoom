import { describe, expect, it } from 'vitest';
import { insertPreset, openPresetAsNew } from '../src/engine/presetApplication';
import { PRESETS } from '../src/nodes/definitions';
import type { CustomTypeDefinition } from '../src/types';
import type { EditorDocument } from '../src/engine/editorHistory';

const emptyDocument = (): EditorDocument => ({
  nodes: [],
  connections: [],
  customDefinitions: [],
  customTypes: [],
});

describe('preset application', () => {
  it('declares learning metadata for all nine bundled presets', () => {
    expect(PRESETS).toHaveLength(9);
    for (const preset of PRESETS) {
      expect(preset.tags.length).toBeGreaterThan(0);
      expect(preset.learningGoals.length).toBeGreaterThan(0);
      expect(preset.expectedResult).not.toBe('');
    }
  });

  it('opens a preset as a self-contained new project and replaces project dependencies', () => {
    const source = {
      ...emptyDocument(),
      nodes: [{ id: 'old', typeId: 'input/number', x: 0, y: 0 }],
      customTypes: [{ id: 'Old', name: 'Old', color: '#000000', fields: [] }],
    };
    const preset = PRESETS.find(({ id }) => id === 'custom-type-pipeline')!;
    const result = openPresetAsNew(source, preset);

    expect(result.nodes).toEqual(preset.nodes);
    expect(result.nodes).not.toBe(preset.nodes);
    expect(result.customTypes.map(({ id }) => id)).toEqual(['User']);
    expect(result.customDefinitions).toEqual([]);
  });

  it('inserts with remapped IDs and imports a missing dependency once', () => {
    const preset = PRESETS.find(({ id }) => id === 'custom-type-pipeline')!;
    const first = insertPreset(emptyDocument(), preset, { idPrefix: 'first', x: 100, y: 200 });
    const second = insertPreset(first, preset, { idPrefix: 'second', x: 500, y: 600 });

    expect(second.nodes).toHaveLength(preset.nodes.length * 2);
    expect(new Set(second.nodes.map(({ id }) => id)).size).toBe(second.nodes.length);
    expect(second.customTypes.map(({ id }) => id)).toEqual(['User']);
    expect(Math.min(...first.nodes.map(({ x }) => x))).toBe(100);
    expect(Math.min(...first.nodes.map(({ y }) => y))).toBe(200);
    expect(first.connections[0].fromNodeId.startsWith('first-node-')).toBe(true);
  });

  it('rejects an insert when a same-ID custom type has different content', () => {
    const preset = PRESETS.find(({ id }) => id === 'custom-type-pipeline')!;
    const conflictingUser: CustomTypeDefinition = {
      id: 'User',
      name: 'User',
      color: '#000000',
      fields: [],
    };

    expect(() =>
      insertPreset({ ...emptyDocument(), customTypes: [conflictingUser] }, preset, {
        idPrefix: 'conflict',
        x: 0,
        y: 0,
      }),
    ).toThrow('User');
  });

  it.each([
    ['custom-type-pipeline', 'User'],
    ['composite-vector-length', 'Point2D'],
  ])('reuses and upgrades a legacy %s dependency without catalog metadata', (presetId, typeId) => {
    const preset = PRESETS.find(({ id }) => id === presetId)!;
    const dependency = preset.dependencies!.customTypes!.find(({ id }) => id === typeId)!;
    const { catalogSource: _catalogSource, ...legacyDependency } = dependency;

    const result = insertPreset({ ...emptyDocument(), customTypes: [legacyDependency] }, preset, {
      idPrefix: `legacy-${typeId}`,
      x: 0,
      y: 0,
    });

    expect(result.customTypes).toHaveLength(1);
    expect(result.customTypes[0]).toEqual(dependency);
    expect(result.nodes).toHaveLength(preset.nodes.length);
  });
});
