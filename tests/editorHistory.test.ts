import { describe, expect, it } from 'vitest';

import {
  commitEditorDocument,
  createEditorHistory,
  finishEditorHistoryGroup,
  isEditorDocumentDirty,
  markEditorDocumentSaved,
  redoEditorHistory,
  undoEditorHistory,
  type EditorDocument,
} from '../src/engine/editorHistory';

const emptyDocument = (): EditorDocument => ({
  nodes: [],
  connections: [],
  customDefinitions: [],
  customTypes: [],
});

describe('editor history', () => {
  it('編集をUndo／Redoし、新規編集時にRedoを破棄する', () => {
    const initial = createEditorHistory(emptyDocument());
    const first = commitEditorDocument(initial, {
      ...initial.present,
      nodes: [{ id: 'a', typeId: 'input/number', x: 0, y: 0 }],
    });
    const undone = undoEditorHistory(first);
    expect(undone.present.nodes).toEqual([]);
    expect(redoEditorHistory(undone).present.nodes.map(({ id }) => id)).toEqual(['a']);

    const replacement = commitEditorDocument(undone, {
      ...undone.present,
      nodes: [{ id: 'b', typeId: 'input/number', x: 0, y: 0 }],
    });
    expect(replacement.future).toEqual([]);
  });

  it('連続ドラッグを履歴上の1操作にまとめる', () => {
    const document = {
      ...emptyDocument(),
      nodes: [{ id: 'a', typeId: 'input/number', x: 0, y: 0 }],
    };
    let history = createEditorHistory(document);
    history = commitEditorDocument(
      history,
      { ...document, nodes: [{ ...document.nodes[0], x: 10 }] },
      'drag:a',
    );
    history = commitEditorDocument(
      history,
      { ...document, nodes: [{ ...document.nodes[0], x: 20 }] },
      'drag:a',
    );
    history = finishEditorHistoryGroup(history);

    expect(history.past).toHaveLength(1);
    expect(undoEditorHistory(history).present.nodes[0].x).toBe(0);
  });

  it('保存済みスナップショットとの差分だけを未保存として扱う', () => {
    const initial = createEditorHistory(emptyDocument());
    const edited = commitEditorDocument(initial, {
      ...initial.present,
      connections: [{ id: 'c', fromNodeId: 'a', fromPortId: 'x', toNodeId: 'b', toPortId: 'y' }],
    });
    expect(isEditorDocumentDirty(edited)).toBe(true);
    const saved = markEditorDocumentSaved(edited);
    expect(isEditorDocumentDirty(saved)).toBe(false);
    expect(isEditorDocumentDirty(undoEditorHistory(saved))).toBe(true);
  });

  it('プリセット・全消去・読み込み相当の全体置換をそれぞれ1操作で戻す', () => {
    const original = {
      ...emptyDocument(),
      nodes: [{ id: 'original', typeId: 'input/number', x: 0, y: 0 }],
    };
    const replacement = {
      ...emptyDocument(),
      nodes: [{ id: 'replacement', typeId: 'input/text', x: 10, y: 20 }],
      customTypes: [{ id: 'Loaded', name: 'Loaded', color: '#000000', fields: [] }],
    };
    const replaced = commitEditorDocument(createEditorHistory(original), replacement);
    expect(undoEditorHistory(replaced).present).toEqual(original);

    const cleared = commitEditorDocument(replaced, emptyDocument());
    expect(undoEditorHistory(cleared).present).toEqual(replacement);
  });
});
