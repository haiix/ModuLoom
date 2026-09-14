import { DataType, CustomTypeDefinition } from '../types';

/**
 * Checks if output type can be legally connected to input type.
 * Rule from specification:
 * OutputPort.type === InputPort.type または InputPort.type === 'any' または OutputPort.type === 'any'
 * さらに、カスタムオブジェクト型から汎用 'object' 型への接続も許可します。
 */
export function isTypeCompatible(
  fromType: DataType,
  toType: DataType,
  customTypes?: CustomTypeDefinition[],
): boolean {
  if (fromType === 'any' || toType === 'any') {
    return true;
  }
  // If destination is generic object and source is a custom structured type
  if (
    toType === 'object' &&
    customTypes?.some((ct) => ct.id === fromType || ct.name === fromType)
  ) {
    return true;
  }
  return fromType === toType;
}

/** Checks a runtime value against the flat type contract used by ports and custom fields. */
export function isValueCompatibleWithType(value: unknown, type: DataType): boolean {
  if (type === 'any') return value !== undefined;
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'promise') {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
  }
  if (type === 'stream') {
    return Boolean(
      value &&
      typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function',
    );
  }
  // Custom types are nominal for wiring but represented by plain objects at runtime.
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Detect runtime type of a value
 */
export function detectValueType(value: any): DataType {
  if (value === null || value === undefined) return 'any';
  if (typeof value === 'object' && typeof value.then === 'function') return 'promise';
  if (
    typeof value === 'object' &&
    (value.isStream || typeof value[Symbol.asyncIterator] === 'function')
  )
    return 'stream';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'any';
}

/**
 * Formats a value nicely for display in inspection badges and output nodes
 */
export function formatValue(value: any, maxLen: number = 60): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object' && typeof value.then === 'function') {
    return '[Promise <pending>]';
  }
  if (
    typeof value === 'object' &&
    (value.isStream || typeof value[Symbol.asyncIterator] === 'function')
  ) {
    return value.streamName ? `[${value.streamName}]` : '[AsyncIterator (Stream)]';
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    const json = JSON.stringify(value);
    return json.length > maxLen ? `${json.slice(0, maxLen - 3)}...` : json;
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > maxLen ? `${json.slice(0, maxLen - 3)}...` : json;
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}
