import React, { useState, useEffect } from 'react';
import { DataType, NodeDefinition, Port, CustomTypeDefinition, getTypeStyle } from '../types';
import { X, Plus, Trash2, Check, AlertCircle, Code2, Copy, Edit3, Sparkles } from 'lucide-react';

interface CustomNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeDef: NodeDefinition) => void;
  customTypes?: CustomTypeDefinition[];
  customDefinitions?: NodeDefinition[];
  onDelete?: (typeId: string) => void;
}

const DEFAULT_NEW_INPUTS: Port[] = [
  { id: 'a', name: 'a', type: 'number', defaultValue: 10 },
  { id: 'b', name: 'b', type: 'number', defaultValue: 20 },
];

const DEFAULT_NEW_OUTPUTS: Port[] = [{ id: 'result', name: 'result', type: 'number' }];

export const CustomNodeModal: React.FC<CustomNodeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  customTypes = [],
  customDefinitions = [],
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  const [label, setLabel] = useState('カスタム計算');
  const [description, setDescription] = useState('入力値を計算して結果を出力する純粋関数');
  const [category, setCategory] = useState<NodeDefinition['category']>('Custom');
  const [inputs, setInputs] = useState<Port[]>(DEFAULT_NEW_INPUTS);
  const [outputs, setOutputs] = useState<Port[]>(DEFAULT_NEW_OUTPUTS);
  const [expression, setExpression] = useState('inputs.a + inputs.b');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form whenever modal opens in create mode
  useEffect(() => {
    if (isOpen) {
      if (!editingTypeId) {
        resetFormToNew();
      }
      setError(null);
      setTestResult(null);
      setTestError(null);
    }
  }, [editingTypeId, isOpen]);

  const resetFormToNew = () => {
    setEditingTypeId(null);
    setLabel('カスタム計算');
    setDescription('入力値を計算して結果を出力する純粋関数');
    setCategory('Custom');
    setInputs([
      { id: 'a', name: 'a', type: 'number', defaultValue: 10 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 20 },
    ]);
    setOutputs([{ id: 'result', name: 'result', type: 'number' }]);
    setExpression('inputs.a + inputs.b');
    setTestResult(null);
    setTestError(null);
    setError(null);
  };

  const handleStartEdit = (def: NodeDefinition) => {
    setEditingTypeId(def.typeId);
    setLabel(def.label);
    setDescription(def.description || '');
    setCategory(def.category);
    // Deep copy ports so existing definitions aren't mutated
    setInputs(def.inputs.map((p) => ({ ...p })));
    setOutputs(def.outputs.map((p) => ({ ...p })));
    setExpression(def.customCode || '');
    setActiveTab('create');
    setTestResult(null);
    setTestError(null);
    setError(null);
  };

  const handleDuplicate = (def: NodeDefinition) => {
    setEditingTypeId(null); // Treat as new definition
    setLabel(`${def.label} (コピー)`);
    setDescription(def.description || '');
    setCategory(def.category);
    setInputs(def.inputs.map((p) => ({ ...p })));
    setOutputs(def.outputs.map((p) => ({ ...p })));
    setExpression(def.customCode || '');
    setActiveTab('create');
    setTestResult(null);
    setTestError(null);
    setError(null);
  };

  if (!isOpen) return null;

  const handleAddInput = () => {
    const nextIdx = inputs.length + 1;
    setInputs((prev) => [
      ...prev,
      { id: `arg${nextIdx}`, name: `arg${nextIdx}`, type: 'number', defaultValue: 0 },
    ]);
  };

  const handleRemoveInput = (index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInputTypeChange = (index: number, type: DataType) => {
    setInputs((prev) => {
      const next = prev.map((item, i) => {
        if (i !== index) return item;
        let defVal: any = 0;
        if (type === 'string') defVal = '';
        else if (type === 'boolean') defVal = false;
        else if (type === 'array') defVal = [];
        else if (type === 'object') defVal = {};
        return { ...item, type, defaultValue: defVal };
      });
      return next;
    });
  };

  const handleInputNameChange = (index: number, name: string) => {
    const clean = name.replace(/[^a-zA-Z0-9_]/g, '');
    setInputs((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name: clean, id: clean } : item)),
    );
  };

  const handleTestExpression = () => {
    setTestError(null);
    setTestResult(null);
    try {
      const testInputs: Record<string, any> = {};
      for (const p of inputs) {
        testInputs[p.id] =
          p.defaultValue ??
          (p.type === 'number'
            ? 10
            : p.type === 'string'
              ? 'test'
              : p.type === 'boolean'
                ? true
                : p.type === 'array'
                  ? [1, 2]
                  : {});
      }
      const fn = new Function('inputs', `return (${expression});`);
      const res = fn(testInputs);
      setTestResult(JSON.stringify(res));
    } catch (err: any) {
      setTestError(err?.message || '式を実行できませんでした');
    }
  };

  const handleSave = () => {
    setError(null);
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setError('ノード名を入力してください');
      return;
    }

    if (inputs.length === 0) {
      setError('少なくとも1つの入力ポートを定義してください');
      return;
    }

    // Validate port names
    const portIds = new Set<string>();
    for (const inp of inputs) {
      if (!inp.id.trim()) {
        setError('入力ポート名を入力してください');
        return;
      }
      if (portIds.has(inp.id)) {
        setError(`入力ポート名 '${inp.id}' が重複しています`);
        return;
      }
      portIds.add(inp.id);
    }

    const cleanExpression = expression.trim();
    if (!cleanExpression) {
      setError('実行するJavaScript式を入力してください');
      return;
    }

    // Test run validation
    try {
      const testInputs: Record<string, any> = {};
      for (const p of inputs) {
        testInputs[p.id] = p.defaultValue ?? 0;
      }
      const testFn = new Function('inputs', `return (${cleanExpression});`);
      testFn(testInputs);
    } catch (testErr: any) {
      setError(`式の構文エラー: ${testErr?.message}`);
      return;
    }

    // Isolated deep copies to prevent state bleeding across definitions
    const clonedInputs = inputs.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      defaultValue:
        p.defaultValue !== undefined ? JSON.parse(JSON.stringify(p.defaultValue)) : undefined,
    }));

    const clonedOutputs = outputs.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
    }));

    // Capture explicit immutable local copies for the evaluate closure
    const savedExpression = cleanExpression;
    const primaryOutputId = clonedOutputs[0]?.id || 'result';

    const typeId =
      editingTypeId ||
      `custom/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanLabel
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')}`;

    const customDef: NodeDefinition = {
      typeId,
      label: cleanLabel,
      category,
      kind: 'pure',
      description: description.trim(),
      inputs: clonedInputs,
      outputs: clonedOutputs,
      customCode: savedExpression,
      evaluate: (inputsRecord) => {
        try {
          const fn = new Function('inputs', `return (${savedExpression});`);
          const res = fn(inputsRecord);
          return { [primaryOutputId]: res };
        } catch (err: any) {
          throw new Error(`カスタム関数エラー: ${err?.message}`, { cause: err });
        }
      },
    };

    onSave(customDef);
    resetFormToNew();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">自作ノードマネージャー (Custom Nodes)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                独自のJavaScript純粋関数式と入出力ポートを定義し、ノードとして登録します
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-2 gap-4">
          <button
            onClick={() => {
              setActiveTab('create');
            }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{editingTypeId ? '自作ノードを編集' : '新しい自作ノードを作成'}</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>登録済み自作ノード一覧</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
              {customDefinitions.length}
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
          {activeTab === 'create' ? (
            <>
              {editingTypeId && (
                <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-indigo-500" />
                    <span>
                      既存のノード <strong>{label}</strong> を編集中です。保存すると更新されます。
                    </span>
                  </div>
                  <button
                    onClick={resetFormToNew}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    新規作成に戻す
                  </button>
                </div>
              )}

              {/* Label & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    ノード名 (Label)
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder="例: 税率計算, 文字列整形, 距離計算..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    カテゴリ
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Custom">Custom (独自)</option>
                    <option value="Math">Math (数学)</option>
                    <option value="String">String (文字列)</option>
                    <option value="Logic">Logic (論理)</option>
                    <option value="Array">Array (配列)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  ノード説明
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  placeholder="ノードの役割や引数の意味を簡潔に入力"
                />
              </div>

              {/* Inputs definition */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    入力ポート定義 (Inputs)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddInput}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> ポート追加
                  </button>
                </div>
                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/30">
                  {inputs.map((inp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-2xs"
                    >
                      <input
                        type="text"
                        value={inp.name}
                        onChange={(e) => handleInputNameChange(idx, e.target.value)}
                        className="w-28 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                        placeholder="変数名"
                      />
                      <select
                        value={inp.type}
                        onChange={(e) => handleInputTypeChange(idx, e.target.value as DataType)}
                        className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                      >
                        <optgroup label="基本型">
                          <option value="number">number</option>
                          <option value="string">string</option>
                          <option value="boolean">boolean</option>
                          <option value="array">array</option>
                          <option value="object">object</option>
                          <option value="any">any</option>
                        </optgroup>
                        {customTypes.length > 0 && (
                          <optgroup label="カスタム型">
                            {customTypes.map((ct) => (
                              <option key={ct.id} value={ct.id}>
                                {ct.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getTypeStyle(inp.type, customTypes).color }}
                      />
                      <div className="flex-1 text-xs text-slate-500 dark:text-slate-400">
                        参照:{' '}
                        <code className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold">
                          inputs.{inp.id}
                        </code>
                      </div>
                      {inputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInput(idx)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded transition"
                          title="ポートを削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Outputs definition */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  出力ポート定義 (Output)
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    value={outputs[0]?.name || 'result'}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                      setOutputs([
                        {
                          id: clean || 'result',
                          name: clean || 'result',
                          type: outputs[0]?.type || 'number',
                        },
                      ]);
                    }}
                    className="w-28 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                    placeholder="出力名"
                  />
                  <select
                    value={outputs[0]?.type || 'number'}
                    onChange={(e) => {
                      setOutputs([{ ...outputs[0], type: e.target.value as DataType }]);
                    }}
                    className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                  >
                    <optgroup label="基本型">
                      <option value="number">number</option>
                      <option value="string">string</option>
                      <option value="boolean">boolean</option>
                      <option value="array">array</option>
                      <option value="object">object</option>
                      <option value="any">any</option>
                    </optgroup>
                    {customTypes.length > 0 && (
                      <optgroup label="カスタム型">
                        {customTypes.map((ct) => (
                          <option key={ct.id} value={ct.id}>
                            {ct.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: getTypeStyle(outputs[0]?.type || 'number', customTypes)
                        .color,
                    }}
                  />
                  <div className="flex-1 text-xs text-slate-500 dark:text-slate-400">
                    出力キー:{' '}
                    <code className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      {outputs[0]?.id}
                    </code>
                  </div>
                </div>
              </div>

              {/* Pure Function Expression */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    純粋関数コード式 (JavaScript Expression)
                  </label>
                  <button
                    type="button"
                    onClick={handleTestExpression}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <span>式のテスト実行</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="例: inputs.a + inputs.b"
                  className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-950 text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  副作用のない純粋な式を入力してください。例: <code>inputs.a * 1.1</code> や{' '}
                  <code>inputs.a &gt; 0 ? inputs.a : 0</code>
                </p>

                {/* Test result status */}
                {testResult !== null && (
                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>
                      テスト実行成功: <code className="font-mono font-semibold">{testResult}</code>
                    </span>
                  </div>
                )}
                {testError && (
                  <div className="mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>実行時エラー: {testError}</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            /* List of existing custom node definitions */
            <div className="space-y-3">
              {customDefinitions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs space-y-2">
                  <p>自作ノードはまだ登録されていません。</p>
                  <button
                    onClick={() => {
                      resetFormToNew();
                      setActiveTab('create');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:bg-indigo-100 transition inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新しい自作ノードを作成</span>
                  </button>
                </div>
              ) : (
                customDefinitions.map((def) => (
                  <div
                    key={def.typeId}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <span>{def.label}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-normal">
                            {def.category}
                          </span>
                        </div>
                        {def.description && (
                          <p className="text-xs text-slate-500 truncate">{def.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleStartEdit(def)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                          title="この自作ノードを編集"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(def)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                          title="複製して新しいノードを作成"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => onDelete(def.typeId)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                            title="自作ノードを削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inputs and Output details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/70">
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                          入力ポート ({def.inputs.length})
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {def.inputs.map((p, pIdx) => (
                            <span
                              key={`${def.typeId}-in-${p.id}-${pIdx}`}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                            >
                              {p.name}: <span className="text-indigo-500">{p.type}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/70">
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                          出力ポート
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {def.outputs[0]?.name}:{' '}
                          <span className="text-emerald-500">{def.outputs[0]?.type}</span>
                        </span>
                      </div>
                    </div>

                    {/* Expression preview */}
                    {def.customCode && (
                      <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                        <code>{def.customCode}</code>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {activeTab === 'create'
              ? editingTypeId
                ? '編集内容を保存すると、この定義を使用するノードが更新されます'
                : '登録するとノードライブラリから自由にキャンバスに配置できます'
              : `${customDefinitions.length} 個の自作ノードが登録されています`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition"
            >
              閉じる
            </button>
            {activeTab === 'create' && (
              <button
                onClick={handleSave}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
              >
                {editingTypeId ? '自作ノードを更新' : 'ノードを作成して登録'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
