import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'src');
const sourceExtensions = ['.ts', '.tsx'];

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? collectSourceFiles(path)
      : sourceExtensions.includes(extname(path))
        ? [path]
        : [];
  });
}

function resolveSourceImport(importer: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(importer), specifier);
  for (const path of [
    candidate,
    ...sourceExtensions.map((extension) => `${candidate}${extension}`),
    ...sourceExtensions.map((extension) => join(candidate, `index${extension}`)),
  ]) {
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

function readRelativeImports(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const imports = source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g);
  return Array.from(imports, (match) => resolveSourceImport(path, match[1])).filter(
    (resolved): resolved is string => resolved !== null,
  );
}

describe('source module boundaries', () => {
  const files = collectSourceFiles(sourceRoot);
  const graph = new Map(files.map((path) => [path, readRelativeImports(path)]));

  it('has no cyclic source dependencies', () => {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const cycles: string[] = [];

    const visit = (path: string) => {
      if (visiting.has(path)) {
        const cycleStart = stack.indexOf(path);
        cycles.push(
          [...stack.slice(cycleStart), path]
            .map((item) => relative(sourceRoot, item).replaceAll('\\', '/'))
            .join(' -> '),
        );
        return;
      }
      if (visited.has(path)) return;
      visiting.add(path);
      stack.push(path);
      for (const dependency of graph.get(path) ?? []) visit(dependency);
      stack.pop();
      visiting.delete(path);
      visited.add(path);
    };

    for (const path of files) visit(path);
    expect(cycles).toEqual([]);
  });

  it('keeps the engine independent from React orchestration and components', () => {
    const violations = files
      .filter((path) => relative(sourceRoot, path).startsWith('engine'))
      .flatMap((path) =>
        (graph.get(path) ?? [])
          .filter((dependency) => {
            const dependencyPath = relative(sourceRoot, dependency).replaceAll('\\', '/');
            return dependencyPath.startsWith('components/') || dependencyPath.startsWith('hooks/');
          })
          .map(
            (dependency) => `${relative(sourceRoot, path)} -> ${relative(sourceRoot, dependency)}`,
          ),
      );

    expect(violations).toEqual([]);
  });
});
