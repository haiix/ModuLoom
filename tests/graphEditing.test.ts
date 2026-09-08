import { describe, expect, it } from 'vitest';

import {
  alignSelectedNodes,
  createGraphClipboard,
  deleteSelectedGraph,
  distributeSelectedNodes,
  moveSelectedNodes,
  pasteGraphClipboard,
} from '../src/engine/graphEditing';
import {
  commitEditorDocument,
  createEditorHistory,
  undoEditorHistory,
} from '../src/engine/editorHistory';
import type { Connection, NodeInstance } from '../src/types';

const nodes: NodeInstance[] = [
  { id: 'a', typeId: 'input/number', x: 0, y: 0 },
  { id: 'b', typeId: 'math/add', x: 100, y: 50 },
  { id: 'c', typeId: 'output/inspector', x: 300, y: 150 },
];
const connections: Connection[] = [
  { id: 'ab', fromNodeId: 'a', fromPortId: 'value', toNodeId: 'b', toPortId: 'a' },
  { id: 'bc', fromNodeId: 'b', fromPortId: 'result', toNodeId: 'c', toPortId: 'value' },
];

describe('multi-node graph editing', () => {
  it('選択範囲内の接続だけをコピーして新しいIDへ貼り付ける', () => {
    const clipboard = createGraphClipboard(nodes, connections, new Set(['a', 'b']));
    expect(clipboard.connections.map(({ id }) => id)).toEqual(['ab']);
    let nextId = 0;
    const pasted = pasteGraphClipboard(
      clipboard,
      nodes,
      connections,
      (kind) => `${kind}-${++nextId}`,
    );
    expect(pasted.nodes.slice(-2).map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'node-1', x: 40, y: 40 },
      { id: 'node-2', x: 140, y: 90 },
    ]);
    expect(pasted.connections.at(-1)).toMatchObject({
      id: 'connection-3',
      fromNodeId: 'node-1',
      toNodeId: 'node-2',
    });
    expect(pasted.selectedNodeIds).toEqual(new Set(['node-1', 'node-2']));
  });

  it('選択ノードを接続ごと削除し、一括移動できる', () => {
    const selected = new Set(['a', 'b']);
    expect(deleteSelectedGraph(nodes, connections, selected)).toEqual({
      nodes: [nodes[2]],
      connections: [],
    });
    expect(moveSelectedNodes(nodes, selected, 20, -10).map(({ x, y }) => [x, y])).toEqual([
      [20, -10],
      [120, 40],
      [300, 150],
    ]);
  });

  it('左右・上下へ整列し、水平・垂直に等間隔配置する', () => {
    const selected = new Set(nodes.map(({ id }) => id));
    expect(alignSelectedNodes(nodes, selected, 'left').map(({ x }) => x)).toEqual([0, 0, 0]);
    expect(alignSelectedNodes(nodes, selected, 'bottom').map(({ y }) => y)).toEqual([
      150, 150, 150,
    ]);
    expect(distributeSelectedNodes(nodes, selected, 'horizontal').map(({ x }) => x)).toEqual([
      0, 150, 300,
    ]);
    expect(distributeSelectedNodes(nodes, selected, 'vertical').map(({ y }) => y)).toEqual([
      0, 75, 150,
    ]);
  });

  it('一括操作のノードと接続変更を1履歴単位で戻す', () => {
    const document = { nodes, connections, customDefinitions: [], customTypes: [] };
    const pasted = pasteGraphClipboard(
      createGraphClipboard(nodes, connections, new Set(['a', 'b'])),
      nodes,
      connections,
      (kind, id) => `${kind}-copy-${id}`,
    );
    const history = commitEditorDocument(createEditorHistory(document), {
      ...document,
      nodes: pasted.nodes,
      connections: pasted.connections,
    });

    expect(history.past).toHaveLength(1);
    expect(undoEditorHistory(history).present).toEqual(document);
  });
});
