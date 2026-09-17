import type { CustomTypeDefinition, DataType } from '../types';
import {
  collectTypeRefNames,
  getTypeRefBaseName,
  normalizeTypeRef,
  serializeTypeRef,
  type TypeLike,
  type TypeRef,
} from '../typeRef';

function resolveCustomType(
  name: string,
  customTypes: CustomTypeDefinition[],
): CustomTypeDefinition | undefined {
  return customTypes.find((candidate) => candidate.id === name || candidate.name === name);
}

export function getCustomTypeDependencies(
  customType: CustomTypeDefinition,
  customTypes: CustomTypeDefinition[],
): string[] {
  const dependencies = new Set<string>();
  for (const field of customType.fields) {
    for (const name of collectTypeRefNames(field.type)) {
      const referenced = resolveCustomType(name, customTypes);
      if (referenced) dependencies.add(referenced.id);
    }
  }
  return [...dependencies];
}

export function findCustomTypeCycle(customTypes: CustomTypeDefinition[]): string[] | null {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    if (active.has(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (visited.has(id)) return null;
    visited.add(id);
    active.add(id);
    stack.push(id);
    const customType = customTypes.find((candidate) => candidate.id === id);
    for (const dependency of customType ? getCustomTypeDependencies(customType, customTypes) : []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(id);
    return null;
  };

  for (const customType of customTypes) {
    const cycle = visit(customType.id);
    if (cycle) return cycle;
  }
  return null;
}

export function getCustomTypeDependents(
  typeId: string,
  customTypes: CustomTypeDefinition[],
): CustomTypeDefinition[] {
  return customTypes.filter(
    (customType) =>
      customType.id !== typeId &&
      getCustomTypeDependencies(customType, customTypes).includes(typeId),
  );
}

function isRefCompatible(
  from: TypeRef,
  to: TypeRef,
  customTypes?: CustomTypeDefinition[],
): boolean {
  if (from.name === 'any' || to.name === 'any') return true;
  if (to.name === 'unknown') return true;
  if (from.name === 'unknown') return to.name === 'unknown';
  if (
    to.name === 'object' &&
    customTypes?.some((customType) => customType.id === from.name || customType.name === from.name)
  ) {
    return true;
  }
  if (from.name !== to.name || from.arguments.length !== to.arguments.length) return false;
  return from.arguments.every((argument, index) =>
    isRefCompatible(argument, to.arguments[index], customTypes),
  );
}

/** Checks whether a value flowing from one port may be assigned to the destination port. */
export function isTypeCompatible(
  fromType: TypeLike,
  toType: TypeLike,
  customTypes?: CustomTypeDefinition[],
): boolean {
  return isRefCompatible(normalizeTypeRef(fromType), normalizeTypeRef(toType), customTypes);
}

export function areTypesEquivalent(left: TypeLike, right: TypeLike): boolean {
  return serializeTypeRef(left) === serializeTypeRef(right);
}

/** Checks a runtime value recursively against a port or custom-field type contract. */
export function isValueCompatibleWithType(value: unknown, type: TypeLike): boolean {
  const ref = normalizeTypeRef(type);
  if (ref.name === 'any') return value !== undefined;
  if (ref.name === 'unknown') return true;
  if (ref.name === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (ref.name === 'string') return typeof value === 'string';
  if (ref.name === 'boolean') return typeof value === 'boolean';
  if (ref.name === 'array') {
    return (
      Array.isArray(value) &&
      value.every((item) => isValueCompatibleWithType(item, ref.arguments[0] ?? 'any'))
    );
  }
  if (ref.name === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (ref.name === 'promise') {
    return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
  }
  if (ref.name === 'stream') {
    return Boolean(
      value &&
      typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function',
    );
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mapDataTypeToTypeScript(
  type: TypeLike,
  customTypes?: CustomTypeDefinition[],
): string {
  const ref = normalizeTypeRef(type);
  const customType = customTypes?.find(
    (candidate) => candidate.id === ref.name || candidate.name === ref.name,
  );
  if (customType) return sanitizeTypeName(customType.name);
  const argument = () => mapDataTypeToTypeScript(ref.arguments[0] ?? 'any', customTypes);
  switch (ref.name) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'unknown':
      return ref.name;
    case 'array':
      return `Array<${argument()}>`;
    case 'object':
      return 'Record<string, unknown>';
    case 'promise':
      return `Promise<${argument()}>`;
    case 'stream':
      return `AsyncIterable<${argument()}>`;
    case 'any':
    default:
      return 'any';
  }
}

function sanitizeTypeName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^([0-9])/, '_$1');
  return sanitized || 'CustomType';
}

export function isContainerType(type: TypeLike, name: 'array' | 'promise' | 'stream'): boolean {
  return getTypeRefBaseName(type) === name;
}

/** Detects the outer runtime type. Element types cannot be recovered from empty containers. */
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
