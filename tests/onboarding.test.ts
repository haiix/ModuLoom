import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OnboardingGuide } from '../src/components/OnboardingGuide';
import {
  getOnboardingProgress,
  ONBOARDING_STORAGE_KEY,
  shouldShowOnboarding,
} from '../src/components/onboarding';
import type { GraphEvaluation, NodeDefinition, NodeInstance } from '../src/types';

const definitions = new Map<string, NodeDefinition>([
  ['input', definition('input')],
  ['process', definition('pure')],
  ['output', definition('output')],
]);
const input: NodeInstance = { id: 'input', typeId: 'input', x: 0, y: 0 };
const process: NodeInstance = { id: 'process', typeId: 'process', x: 0, y: 0 };
const output: NodeInstance = { id: 'output', typeId: 'output', x: 0, y: 0 };
const links = [
  { id: 'a', fromNodeId: 'input', fromPortId: 'out', toNodeId: 'process', toPortId: 'in' },
  { id: 'b', fromNodeId: 'process', fromPortId: 'out', toNodeId: 'output', toPortId: 'in' },
];

describe('onboarding flow', () => {
  it.each([
    [[], [], {}, 'input'],
    [[input], [], {}, 'process'],
    [[input, process], [], {}, 'output'],
    [[input, process, output], [], {}, 'connect'],
    [[input, process, output], links, {}, 'run'],
  ] as const)('detects the next basic-flow stage', (nodes, connections, evaluation, stage) => {
    expect(getOnboardingProgress([...nodes], [...connections], definitions, evaluation).stage).toBe(
      stage,
    );
  });

  it('shows a successful output value after evaluation', () => {
    const evaluation: GraphEvaluation = {
      output: {
        inputs: { value: 3 },
        outputs: { displayedValue: 3 },
        evaluatedAt: 1,
      },
    };
    expect(getOnboardingProgress([input, process, output], links, definitions, evaluation)).toEqual(
      {
        stage: 'success',
        step: 5,
        result: 3,
      },
    );
  });

  it('does not accept disconnected input and output fragments as a pipeline', () => {
    const otherProcess = { ...process, id: 'other-process' };
    const disconnectedLinks = [
      links[0],
      {
        id: 'b',
        fromNodeId: 'other-process',
        fromPortId: 'out',
        toNodeId: 'output',
        toPortId: 'in',
      },
    ];
    expect(
      getOnboardingProgress(
        [input, process, otherProcess, output],
        disconnectedLinks,
        definitions,
        {},
      ).stage,
    ).toBe('connect');
  });

  it('only opens automatically before a status is stored', () => {
    expect(shouldShowOnboarding({ getItem: () => null })).toBe(true);
    expect(
      shouldShowOnboarding({
        getItem: (key) => (key === ONBOARDING_STORAGE_KEY ? 'skipped' : null),
      }),
    ).toBe(false);
  });

  it('renders the next instruction and the stable starter preset action', () => {
    const markup = renderGuide([], {});
    expect(markup).toContain('入力ノードを置く');
    expect(markup).toContain('完成サンプルを見る');
    expect(markup).toContain('ガイドをスキップ');
  });

  it('renders the first successful evaluation result', () => {
    const markup = renderGuide([input, process, output], {
      output: { inputs: { value: 3 }, outputs: { displayedValue: 3 }, evaluatedAt: 1 },
    });
    expect(markup).toContain('最初のパイプラインが動きました');
    expect(markup).toContain('評価結果: 3');
    expect(markup).toContain('ガイドを完了');
  });
});

function renderGuide(nodes: NodeInstance[], evaluation: GraphEvaluation) {
  return renderToStaticMarkup(
    React.createElement(OnboardingGuide, {
      nodes,
      connections: nodes.length === 3 ? links : [],
      definitions,
      evaluation,
      onOpenLibrary: () => undefined,
      onLoadStarterPreset: () => undefined,
      onSkip: () => undefined,
      onComplete: () => undefined,
    }),
  );
}

function definition(kind: NodeDefinition['kind']): NodeDefinition {
  return {
    typeId: kind,
    label: kind,
    category: kind === 'input' ? 'Input' : kind === 'output' ? 'Output' : 'Math',
    kind,
    inputs: kind === 'input' ? [] : [{ id: 'in', name: 'in', type: 'number' }],
    outputs: kind === 'output' ? [] : [{ id: 'out', name: 'out', type: 'number' }],
    evaluate: () => ({}),
  };
}
