import React, { useState, useEffect } from 'react';
import { BuiltinDataType, CustomTypeDefinition, CustomTypeField } from '../types';
import {
  X,
  Plus,
  Trash2,
  Boxes,
  Check,
  AlertCircle,
  Code2,
  Edit3,
  Copy,
} from 'lucide-react';

interface CustomTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  customTypes: CustomTypeDefinition[];
  onSaveType: (typeDef: CustomTypeDefinition, autoAddNode?: boolean) => void;
  onDeleteType: (typeId: string) => void;
}

const PRESET_COLORS = [
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f43f5e', // rose
  '#14b8a6', // teal
];

const DEFAULT_NEW_FIELDS: CustomTypeField[] = [
  { name: 'id', type: 'number', required: true, defaultValue: 1 },
  { name: 'name', type: 'string', required: true, defaultValue: 'Item A' },
  { name: 'value', type: 'number', required: true, defaultValue: 100 },
  { name: 'active', type: 'boolean', required: false, defaultValue: true },
];

export const CustomTypeModal: React.FC<CustomTypeModalProps> = ({
  isOpen,
  onClose,
  customTypes,
  onSaveType,
  onDeleteType,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  const [typeName, setTypeName] = useState('Product');
  const [description, setDescription] = useState('商品データモデル（ID・商品名・価格・在庫フラグ）');
  const [color, setColor] = useState('#ec4899');
  const [autoAddConstructor, setAutoAddConstructor] = useState(true);
  const [fields, setFields] = useState<CustomTypeField[]>(DEFAULT_NEW_FIELDS);
  const [error, setError] = useState<string | null>(null);

  // When modal opens, if not actively editing, ensure clean new state
  useEffect(() => {
    if (isOpen) {
      if (!editingTypeId) {
        resetFormToNew();
      }
      setError(null);
    }
  }, [isOpen]);

  const resetFormToNew = () => {
    setEditingTypeId(null);
    setTypeName('Product');
    setDescription('商品データモデル（ID・商品名・価格・在庫フラグ）');
    setColor('#ec4899');
    setAutoAddConstructor(true);
    // Deep clone default fields
    setFields([
      { name: 'id', type: 'number', required: true, defaultValue: 101 },
      { name: 'title', type: 'string', required: true, defaultValue: 'Mechanical Keyboard' },
      { name: 'price', type: 'number', required: true, defaultValue: 14800 },
      { name: 'inStock', type: 'boolean', required: false, defaultValue: true },
    ]);
    setError(null);
  };

  const handleStartEdit = (ct: CustomTypeDefinition) => {
    setEditingTypeId(ct.id);
    setTypeName(ct.name);
    setDescription(ct.description || '');
    setColor(ct.color || '#ec4899');
    setAutoAddConstructor(false);
    // Deep copy fields to prevent mutating the original state directly
    setFields(
      ct.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required ?? true,
        defaultValue:
          f.defaultValue !== undefined ? JSON.parse(JSON.stringify(f.defaultValue)) : undefined,
      }))
    );
    setActiveTab('create');
    setError(null);
  };

  const handleDuplicate = (ct: CustomTypeDefinition) => {
    setEditingTypeId(null); // Treat as new type
    setTypeName(`${ct.name}Copy`);
    setDescription(ct.description || '');
    setColor(ct.color || '#ec4899');
    setAutoAddConstructor(true);
    setFields(
      ct.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required ?? true,
        defaultValue:
          f.defaultValue !== undefined ? JSON.parse(JSON.stringify(f.defaultValue)) : undefined,
      }))
    );
    setActiveTab('create');
    setError(null);
  };

  if (!isOpen) return null;

  const handleAddField = () => {
    const nextIdx = fields.length + 1;
    setFields((prev) => [
      ...prev,
      {
        name: `field${nextIdx}`,
        type: 'string',
        required: true,
        defaultValue: '',
      },
    ]);
  };

  const handleRemoveField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, key: keyof CustomTypeField, val: any) => {
    setFields((prev) => {
      const next = prev.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, [key]: val };
        // If type changed, provide a reasonable default value
        if (key === 'type') {
          if (val === 'number') updated.defaultValue = 0;
          else if (val === 'string') updated.defaultValue = '';
          else if (val === 'boolean') updated.defaultValue = true;
          else if (val === 'array') updated.defaultValue = [];
          else if (val === 'object') updated.defaultValue = {};
        }
        return updated;
      });
      return next;
    });
  };

  const handleSave = () => {
    setError(null);
    const cleanName = typeName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!cleanName) {
      setError('有効な型名を入力してください（英数字）');
      return;
    }
    if (fields.length === 0) {
      setError('少なくとも1つのフィールドが必要です');
      return;
    }

    // Check duplicate field names
    const fieldNames = new Set<string>();
    for (const f of fields) {
      const cleanFieldName = f.name.trim().replace(/[^a-zA-Z0-9_]/g, '');
      if (!cleanFieldName) {
        setError('すべてのフィールドに有効な名前を入力してください');
        return;
      }
      if (fieldNames.has(cleanFieldName)) {
        setError(`フィールド名 '${cleanFieldName}' が重複しています`);
        return;
      }
      fieldNames.add(cleanFieldName);
    }

    // Isolated deep copy of fields
    const clonedFields: CustomTypeField[] = fields.map((f) => {
      const cleanFieldName = f.name.trim().replace(/[^a-zA-Z0-9_]/g, '');
      let defVal = f.defaultValue;
      if (defVal === undefined) {
        if (f.type === 'number') defVal = 0;
        else if (f.type === 'string') defVal = '';
        else if (f.type === 'boolean') defVal = false;
        else if (f.type === 'array') defVal = [];
        else if (f.type === 'object') defVal = {};
      }
      return {
        name: cleanFieldName,
        type: f.type,
        required: f.required ?? true,
        defaultValue: defVal !== undefined ? JSON.parse(JSON.stringify(defVal)) : undefined,
      };
    });

    const typeId = editingTypeId || cleanName;

    const newType: CustomTypeDefinition = {
      id: typeId,
      name: cleanName,
      color,
      description: description.trim(),
      fields: clonedFields,
    };

    onSaveType(newType, autoAddConstructor);
    resetFormToNew();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">カスタム型マネージャー (Custom Types)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                独自のデータ構造型を定義し、専用のConstructor / Deconstructor純粋関数ノードを自動生成します
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
            onClick={() => setActiveTab('create')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>{editingTypeId ? 'カスタム型を編集' : '新しいカスタム型を定義'}</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>登録済みカスタム型一覧</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
              {customTypes.length}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-sm">
          {activeTab === 'create' ? (
            <>
              {editingTypeId && (
                <div className="p-2.5 rounded-lg bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800/60 flex items-center justify-between text-xs text-pink-700 dark:text-pink-300">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-pink-500" />
                    <span>既存の型 <strong>{typeName}</strong> を編集中です。保存するとノード定義も更新されます。</span>
                  </div>
                  <button
                    onClick={resetFormToNew}
                    className="text-xs text-pink-600 dark:text-pink-400 hover:underline font-medium"
                  >
                    新規作成に戻す
                  </button>
                </div>
              )}

              {/* Type Name & Color */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    型名 (TypeScript Interface Name)
                  </label>
                  <input
                    type="text"
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    placeholder="例: User, Product, Order..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    ポート識別カラー
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                        style={{
                          backgroundColor: c,
                          borderColor: color === c ? '#ffffff' : 'transparent',
                        }}
                      >
                        {color === c && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  型の概要・説明
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例: 商品情報（ID・品名・価格・在庫フラグ）"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Fields Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    フィールドスキーマ (Fields Schema)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> フィールド追加
                  </button>
                </div>

                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/30">
                  {fields.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs"
                    >
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                        placeholder="フィールド名"
                        className="w-28 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                      />

                      <select
                        value={f.type}
                        onChange={(e) =>
                          handleFieldChange(idx, 'type', e.target.value as BuiltinDataType)
                        }
                        className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                      >
                        <option value="number">number</option>
                        <option value="string">string</option>
                        <option value="boolean">boolean</option>
                        <option value="array">array</option>
                        <option value="object">object</option>
                        <option value="any">any</option>
                      </select>

                      <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={f.required ?? true}
                          onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                          className="rounded text-indigo-600"
                        />
                        <span>必須</span>
                      </label>

                      {/* Default value input field */}
                      <div className="flex items-center gap-1 flex-1 min-w-[120px]">
                        <span className="text-[10px] text-slate-400 shrink-0">初期値:</span>
                        {f.type === 'boolean' ? (
                          <select
                            value={String(f.defaultValue ?? true)}
                            onChange={(e) =>
                              handleFieldChange(idx, 'defaultValue', e.target.value === 'true')
                            }
                            className="w-20 px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : f.type === 'number' ? (
                          <input
                            type="number"
                            value={f.defaultValue ?? 0}
                            onChange={(e) =>
                              handleFieldChange(idx, 'defaultValue', Number(e.target.value))
                            }
                            className="w-20 px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                          />
                        ) : (
                          <input
                            type="text"
                            value={typeof f.defaultValue === 'string' ? f.defaultValue : JSON.stringify(f.defaultValue ?? '')}
                            onChange={(e) =>
                              handleFieldChange(idx, 'defaultValue', e.target.value)
                            }
                            className="w-full px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono truncate"
                            placeholder="初期値"
                          />
                        )}
                      </div>

                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveField(idx)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded transition shrink-0"
                          title="フィールドを削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto add constructor node checkbox */}
              {!editingTypeId && (
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    id="auto-add-node"
                    checked={autoAddConstructor}
                    onChange={(e) => setAutoAddConstructor(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <label htmlFor="auto-add-node" className="text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                    保存時にこの型の「生成ノード (Constructor)」をキャンバスに自動配置する
                  </label>
                </div>
              )}

              {/* Preview TypeScript Interface definition */}
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                  <Code2 className="w-3.5 h-3.5" />
                  <span>生成されるTypeScriptインターフェース:</span>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800">
{`export interface ${typeName || 'CustomType'} {
${fields
  .map(
    (f) =>
      `  ${f.name || 'field'}${f.required ? '' : '?'}: ${
        f.type === 'array' ? 'any[]' : f.type === 'object' ? 'Record<string, any>' : f.type
      };`
  )
  .join('\n')}
}`}
                </pre>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            /* List of existing custom types */
            <div className="space-y-3">
              {customTypes.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs space-y-2">
                  <p>カスタム型はまだ登録されていません。</p>
                  <button
                    onClick={() => {
                      resetFormToNew();
                      setActiveTab('create');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 font-medium text-xs hover:bg-pink-100 transition inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新しいカスタム型を定義</span>
                  </button>
                </div>
              ) : (
                customTypes.map((ct) => (
                  <div
                    key={ct.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: ct.color }}
                        />
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <span>{ct.name}</span>
                            <span className="text-[10px] font-sans font-normal px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {ct.fields.length} フィールド
                            </span>
                          </div>
                          {ct.description && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{ct.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleStartEdit(ct)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                          title="このカスタム型を編集"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(ct)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                          title="複製して新しい型を作成"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteType(ct.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                          title="カスタム型を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Fields summary pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {ct.fields.map((f, fIdx) => (
                        <span
                          key={`${ct.id}-field-${f.name || 'f'}-${fIdx}`}
                          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.8 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        >
                          <span className="font-semibold">{f.name}</span>:
                          <span className="text-indigo-500">{f.type}</span>
                          {f.defaultValue !== undefined && (
                            <span className="text-slate-400 text-[10px]">
                              ={JSON.stringify(f.defaultValue)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        自動生成済みノード: {ct.name} Constructor, {ct.name} Deconstruct, {ct.name} Validate
                      </span>
                    </div>
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
                ? '編集内容を保存すると、この型および関連する生成ノードが更新されます'
                : '保存すると即座にノードパレットでConstructor/Deconstructが利用可能になります'
              : `${customTypes.length} 個のカスタム型が登録されています`}
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
                {editingTypeId ? 'カスタム型を更新' : 'カスタム型を保存 & ノード生成'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
