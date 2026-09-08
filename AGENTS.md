# Repository Guidelines

## Project Structure & Module Organization

ModuLoom is a browser-only React and TypeScript application built with Vite. Code lives in
`src/`: `components/` contains React UI; `engine/` contains DAG evaluation, stream execution,
and type-system logic; `nodes/` defines built-in and custom nodes. Shared types are in
`src/types.ts`, with global styles in `src/index.css`. Vitest suites under `tests/` mirror engine
modules, for example `tests/dagEngine.test.ts`. Documentation belongs in `documents/`. Do not
commit generated `dist/` output or `node_modules/`.

## Build, Test, and Development Commands

- `npm ci`: install the locked dependency set; use Node.js 24+ and npm 11+.
- `npm run dev`: start Vite on `http://localhost:3000`.
- `npm run build`: create the production bundle in `dist/`.
- `npm test` / `npm run test:watch`: run Vitest once or in watch mode.
- `npm run typecheck`: validate TypeScript without emitting files.
- `npm run lint`: run ESLint and React Hooks checks.
- `npm run format:check`: verify Prettier formatting; use `npm run format` to fix it.

Before opening a pull request, run `npm run format:check`, `npm run lint`,
`npm run typecheck`, `npm test`, and `npm run build`; CI runs the same checks.

## Coding Style & Naming Conventions

Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas, LF endings,
and a 100-character line width. Use `PascalCase` for React components and TypeScript types,
`camelCase` for functions and variables, and descriptive file names such as
`TopologicalVisualizer.tsx`. Keep evaluation logic in `engine/`, not UI components. Prefix
intentionally unused parameters with `_` to satisfy ESLint.

## Testing Guidelines

Write Vitest tests with `describe`, `it`, and `expect`. Name files `<module>.test.ts` under
`tests/`, importing implementations from `src/`. Cover success, invalid connections, cycles,
asynchronous behavior, and regressions. No numeric threshold is configured; changed engine
behavior should have meaningful coverage.

## Commit & Pull Request Guidelines

Use Conventional Commit titles: `feat: add node preset`, `fix(engine): reject cycle`, or
`docs: clarify project format`. Add `!` for breaking changes and explain migration steps in the
body. Pull requests should target `main`, describe behavior and verification, link relevant
issues, and include screenshots for visible UI changes. Squash merges are standard, so PR titles
must follow Conventional Commits. Do not edit `CHANGELOG.md`; Release Please manages it.

## Security & Configuration

No environment variables or backend are required. Custom nodes execute JavaScript through
`new Function` without sandboxing; never load untrusted project JSON or expressions, and avoid
adding secrets or privileged browser capabilities to that execution path.
