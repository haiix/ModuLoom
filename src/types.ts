export type BuiltinDataType =
  'number' | 'string' | 'boolean' | 'array' | 'object' | 'promise' | 'stream' | 'any';
export type DataType = BuiltinDataType | string; // Built-in or custom type like 'User', 'Point2D'

export interface CustomTypeField {
  name: string;
  type: BuiltinDataType;
  required?: boolean;
  defaultValue?: any;
}

export interface CustomTypeDefinition {
  id: string; // e.g. "User"
  name: string; // "User"
  color: string; // hex color code e.g. "#ec4899"
  description?: string;
  fields: CustomTypeField[];
  /** Example types ship with the app; omitted values are project-owned. */
  catalogSource?: Extract<NodeCatalogSource, 'example' | 'project'>;
}

export type NodeKind = 'pure' | 'input' | 'output';

export interface Port {
  id: string;
  name: string;
  type: DataType;
  description?: string;
  /** Whether a value must be supplied by an incoming connection. */
  required?: boolean;
  defaultValue?: any;
  /** Documentation-only value; it is never used during evaluation. */
  exampleValue?: any;
  constraints?: {
    integer?: boolean;
    min?: number;
    max?: number;
    nonEmpty?: boolean;
  };
}

export interface NodeExecutionMetadata {
  determinism: 'deterministic' | 'time-dependent' | 'nondeterministic';
  simulated?: boolean;
}

export type NodeCatalogLevel = 'core' | 'advanced';
export type NodeCatalogSource = 'builtin' | 'example' | 'project';

export interface NodeCatalogMetadata {
  level: NodeCatalogLevel;
  source: NodeCatalogSource;
  searchTags: string[];
}

export interface CompositeSubgraph {
  nodes: NodeInstance[];
  connections: Connection[];
  inputNodeIds: string[]; // IDs of composite/input-port nodes
  outputNodeIds: string[]; // IDs of composite/output-port nodes
  inputPortMappings?: CompositePortMapping[];
  outputPortMappings?: CompositePortMapping[];
}

export interface CompositePortMapping {
  externalPortId: string;
  internalNodeId: string;
}

export interface NodeDefinition {
  typeId: string;
  label: string;
  category:
    | 'Math'
    | 'String'
    | 'Logic'
    | 'Array'
    | 'Object'
    | 'Async'
    | 'Stream'
    | 'Input'
    | 'Output'
    | 'Utility'
    | 'Custom'
    | 'Composite';
  kind: NodeKind;
  description?: string;
  shortDescription?: string;
  details?: string;
  inputs: Port[];
  outputs: Port[];
  evaluate: (
    inputs: Record<string, any>,
    state?: any,
    context?: EvaluationContext,
  ) => Promise<Record<string, any>> | Record<string, any>;
  defaultState?: any;
  /** State copied into an instance when it is placed on the canvas. */
  initialState?: any;
  execution?: NodeExecutionMetadata;
  catalog?: NodeCatalogMetadata;
  customCode?: string; // For user-defined custom pure functions
  codegen?: NodeCodegenMetadata;
  isAsync?: boolean;
  isComposite?: boolean; // True for composite node groups
  compositeSubgraph?: CompositeSubgraph; // Internal subgraph definition
}

export interface EvaluationContext {
  signal?: AbortSignal;
}

export interface NodeCodegenContext {
  inputsVar: string;
  state: any;
}

export interface NodeCodegenMetadata {
  emit: (context: NodeCodegenContext) => string;
}

export interface NodeInstance {
  id: string;
  typeId: string;
  x: number;
  y: number;
  state?: any;
  customLabel?: string;
}

export interface Connection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface NodeEvaluationResult {
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  error?: string;
  durationMs?: number;
  isPending?: boolean;
  isStreaming?: boolean;
  streamCount?: number;
  latestStreamValue?: any;
  isCached?: boolean;
  evaluatedAt?: number;
}

export type GraphEvaluation = Record<string, NodeEvaluationResult>;

export interface GraphPreset {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  learningGoals: string[];
  expectedResult: string;
  dependencies?: {
    customTypes?: CustomTypeDefinition[];
    customDefinitions?: NodeDefinition[];
  };
  nodes: NodeInstance[];
  connections: Connection[];
}

export interface FlowProjectExport {
  version: '1.0.0' | '1.1.0';
  appName: string;
  exportedAt: string;
  nodes: NodeInstance[];
  connections: Connection[];
  customTypes?: CustomTypeDefinition[];
  customDefinitions?: SerializedNodeDefinition[];
  viewport?: {
    zoom: number;
    pan: { x: number; y: number };
  };
}

export type SerializedNodeDefinition = Omit<NodeDefinition, 'evaluate' | 'codegen'>;

export type LoadedFlowProject = Omit<FlowProjectExport, 'customDefinitions'> & {
  customDefinitions?: NodeDefinition[];
};

interface TypeStyle {
  label: string;
  color: string; // Tailwind hex color
  bgColor: string;
  borderColor: string;
  textColor: string;
  pillBg: string;
}

const BASE_TYPE_CONFIG: Record<BuiltinDataType, TypeStyle> = {
  number: {
    label: 'number',
    color: '#f59e0b', // amber-500
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    textColor: 'text-amber-600 dark:text-amber-400',
    pillBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  string: {
    label: 'string',
    color: '#10b981', // emerald-500
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    pillBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  boolean: {
    label: 'boolean',
    color: '#8b5cf6', // violet-500
    bgColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8b5cf6',
    textColor: 'text-violet-600 dark:text-violet-400',
    pillBg: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  },
  array: {
    label: 'array',
    color: '#06b6d4', // cyan-500
    bgColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
    textColor: 'text-cyan-600 dark:text-cyan-400',
    pillBg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300',
  },
  object: {
    label: 'object',
    color: '#6366f1', // indigo-500
    bgColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: '#6366f1',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    pillBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
  },
  promise: {
    label: 'Promise<T>',
    color: '#f97316', // orange-500
    bgColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: '#f97316',
    textColor: 'text-orange-600 dark:text-orange-400',
    pillBg: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  },
  stream: {
    label: 'Stream (AsyncIterator)',
    color: '#0284c7', // sky-600
    bgColor: 'rgba(2, 132, 199, 0.15)',
    borderColor: '#0284c7',
    textColor: 'text-sky-600 dark:text-sky-400',
    pillBg: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  },
  any: {
    label: 'any',
    color: '#94a3b8', // slate-400
    bgColor: 'rgba(148, 163, 184, 0.15)',
    borderColor: '#94a3b8',
    textColor: 'text-slate-600 dark:text-slate-300',
    pillBg: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  },
};

export function getTypeStyle(type: DataType, customTypes?: CustomTypeDefinition[]): TypeStyle {
  if (type in BASE_TYPE_CONFIG) {
    return BASE_TYPE_CONFIG[type as BuiltinDataType];
  }

  const custom = customTypes?.find((ct) => ct.id === type || ct.name === type);
  if (custom) {
    return {
      label: custom.name,
      color: custom.color,
      bgColor: `${custom.color}26`,
      borderColor: custom.color,
      textColor: 'text-pink-600 dark:text-pink-400',
      pillBg: 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300',
    };
  }

  return {
    label: type || 'unknown',
    color: '#ec4899', // pink-500 fallback for custom types
    bgColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: '#ec4899',
    textColor: 'text-pink-600 dark:text-pink-400',
    pillBg: 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300',
  };
}
