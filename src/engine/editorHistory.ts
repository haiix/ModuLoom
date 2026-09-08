import type { Connection, CustomTypeDefinition, NodeDefinition, NodeInstance } from '../types';

export interface EditorDocument {
  nodes: NodeInstance[];
  connections: Connection[];
  customDefinitions: NodeDefinition[];
  customTypes: CustomTypeDefinition[];
}

export interface EditorHistory {
  past: EditorDocument[];
  present: EditorDocument;
  future: EditorDocument[];
  savedFingerprint: string;
  groupKey?: string;
}

function serializableDefinition(definition: NodeDefinition) {
  const { evaluate: _evaluate, codegen: _codegen, ...serializable } = definition;
  return serializable;
}

export function documentFingerprint(document: EditorDocument): string {
  return JSON.stringify({
    nodes: document.nodes,
    connections: document.connections,
    customDefinitions: document.customDefinitions.map(serializableDefinition),
    customTypes: document.customTypes,
  });
}

export function createEditorHistory(initial: EditorDocument): EditorHistory {
  return {
    past: [],
    present: initial,
    future: [],
    savedFingerprint: documentFingerprint(initial),
  };
}

export function commitEditorDocument(
  history: EditorHistory,
  next: EditorDocument,
  groupKey?: string,
): EditorHistory {
  if (documentFingerprint(next) === documentFingerprint(history.present)) return history;
  return {
    ...history,
    past:
      groupKey && history.groupKey === groupKey ? history.past : [...history.past, history.present],
    present: next,
    future: [],
    groupKey,
  };
}

export function finishEditorHistoryGroup(history: EditorHistory): EditorHistory {
  return history.groupKey ? { ...history, groupKey: undefined } : history;
}

export function undoEditorHistory(history: EditorHistory): EditorHistory {
  if (history.past.length === 0) return history;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
    groupKey: undefined,
  };
}

export function redoEditorHistory(history: EditorHistory): EditorHistory {
  if (history.future.length === 0) return history;
  return {
    ...history,
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    groupKey: undefined,
  };
}

export function markEditorDocumentSaved(history: EditorHistory): EditorHistory {
  return { ...history, savedFingerprint: documentFingerprint(history.present) };
}

export function isEditorDocumentDirty(history: EditorHistory): boolean {
  return documentFingerprint(history.present) !== history.savedFingerprint;
}
