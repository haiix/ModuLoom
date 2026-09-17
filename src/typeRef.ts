export interface TypeRef {
  name: string;
  arguments: TypeRef[];
}

export type TypeLike = string | TypeRef;

const GENERIC_CONTAINERS = new Set(['array', 'promise', 'stream']);
const BUILTIN_NAMES = [
  'number',
  'string',
  'boolean',
  'array',
  'object',
  'promise',
  'stream',
  'any',
  'unknown',
] as const;
const CANONICAL_BUILTINS = new Map<string, string>(BUILTIN_NAMES.map((name) => [name, name]));

function canonicalName(name: string): string {
  return CANONICAL_BUILTINS.get(name.toLowerCase()) ?? name;
}

export function tryParseTypeRef(source: string): TypeRef | null {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? '')) index += 1;
  };
  const parse = (): TypeRef | null => {
    skipWhitespace();
    const start = index;
    while (index < source.length && !/[<>,\s]/.test(source[index])) index += 1;
    if (index === start) return null;
    const name = canonicalName(source.slice(start, index));
    skipWhitespace();
    const args: TypeRef[] = [];
    if (source[index] === '<') {
      index += 1;
      while (true) {
        const argument = parse();
        if (!argument) return null;
        args.push(argument);
        skipWhitespace();
        if (source[index] === '>') {
          index += 1;
          break;
        }
        if (source[index] !== ',') return null;
        index += 1;
      }
    }
    return { name, arguments: args };
  };

  const result = parse();
  skipWhitespace();
  return result && index === source.length ? result : null;
}

export function normalizeTypeRef(type: TypeLike): TypeRef {
  const parsed = typeof type === 'string' ? tryParseTypeRef(type.trim()) : type;
  const normalized = parsed ?? {
    name: typeof type === 'string' && type.trim() ? type.trim() : 'unknown',
    arguments: [],
  };
  const name = canonicalName(normalized.name);
  const args = normalized.arguments.map(normalizeTypeRef);
  return {
    name,
    arguments: GENERIC_CONTAINERS.has(name) && args.length === 0 ? [normalizeTypeRef('any')] : args,
  };
}

export function serializeTypeRef(type: TypeLike): string {
  const normalized = normalizeTypeRef(type);
  return normalized.arguments.length === 0
    ? normalized.name
    : `${normalized.name}<${normalized.arguments.map(serializeTypeRef).join(', ')}>`;
}

export function formatTypeRef(type: TypeLike): string {
  const normalized = normalizeTypeRef(type);
  const displayName =
    normalized.name === 'array'
      ? 'Array'
      : normalized.name === 'promise'
        ? 'Promise'
        : normalized.name === 'stream'
          ? 'Stream'
          : normalized.name;
  return normalized.arguments.length === 0
    ? displayName
    : `${displayName}<${normalized.arguments.map(formatTypeRef).join(', ')}>`;
}

export function getTypeRefBaseName(type: TypeLike): string {
  return normalizeTypeRef(type).name;
}

export function isWellFormedTypeRef(type: TypeLike): boolean {
  const ref = typeof type === 'string' ? tryParseTypeRef(type) : type;
  if (!ref) return false;
  const name = canonicalName(ref.name);
  if (GENERIC_CONTAINERS.has(name)) {
    return (
      (ref.arguments.length === 0 || ref.arguments.length === 1) &&
      ref.arguments.every(isWellFormedTypeRef)
    );
  }
  return ref.arguments.length === 0;
}

export function collectTypeRefNames(type: TypeLike): Set<string> {
  const names = new Set<string>();
  const visit = (ref: TypeRef) => {
    names.add(ref.name);
    ref.arguments.forEach(visit);
  };
  visit(normalizeTypeRef(type));
  return names;
}

export function isKnownTypeRef(type: TypeLike, customTypeNames: Iterable<string> = []): boolean {
  if (!isWellFormedTypeRef(type)) return false;
  const known = new Set([...BUILTIN_NAMES, ...customTypeNames]);
  return [...collectTypeRefNames(type)].every((name) => known.has(name));
}
