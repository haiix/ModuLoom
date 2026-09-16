import { useCallback, useState, type SetStateAction } from 'react';

import {
  commitEditorDocument,
  createEditorHistory,
  finishEditorHistoryGroup,
  isEditorDocumentDirty,
  markEditorDocumentSaved,
  redoEditorHistory,
  undoEditorHistory,
  type EditorDocument,
} from '../engine/editorHistory';
import type { Connection, CustomTypeDefinition, NodeDefinition, NodeInstance } from '../types';

export function useEditorDocument(initialDocument: EditorDocument) {
  const [history, setHistory] = useState(() => createEditorHistory(initialDocument));
  const updateDocument = useCallback(
    (update: (document: EditorDocument) => EditorDocument, groupKey?: string) => {
      setHistory((current) => commitEditorDocument(current, update(current.present), groupKey));
    },
    [],
  );
  const updateField = useCallback(
    <K extends keyof EditorDocument>(key: K, action: SetStateAction<EditorDocument[K]>) => {
      updateDocument((document) => ({
        ...document,
        [key]: typeof action === 'function' ? action(document[key]) : action,
      }));
    },
    [updateDocument],
  );
  const setNodes = useCallback(
    (action: SetStateAction<NodeInstance[]>) => updateField('nodes', action),
    [updateField],
  );
  const setConnections = useCallback(
    (action: SetStateAction<Connection[]>) => updateField('connections', action),
    [updateField],
  );
  const setCustomDefinitions = useCallback(
    (action: SetStateAction<NodeDefinition[]>) => updateField('customDefinitions', action),
    [updateField],
  );
  const setCustomTypes = useCallback(
    (action: SetStateAction<CustomTypeDefinition[]>) => updateField('customTypes', action),
    [updateField],
  );
  const finishHistoryGroup = useCallback(() => setHistory(finishEditorHistoryGroup), []);
  const undo = useCallback(() => setHistory(undoEditorHistory), []);
  const redo = useCallback(() => setHistory(redoEditorHistory), []);
  const markSaved = useCallback(() => setHistory(markEditorDocumentSaved), []);
  const resetDocument = useCallback((document: EditorDocument) => {
    setHistory(createEditorHistory(document));
  }, []);
  const loadDocument = useCallback((document: EditorDocument) => {
    setHistory((current) => markEditorDocumentSaved(commitEditorDocument(current, document)));
  }, []);

  return {
    history,
    document: history.present,
    isDirty: isEditorDocumentDirty(history),
    updateDocument,
    setNodes,
    setConnections,
    setCustomDefinitions,
    setCustomTypes,
    finishHistoryGroup,
    undo,
    redo,
    markSaved,
    resetDocument,
    loadDocument,
  };
}
