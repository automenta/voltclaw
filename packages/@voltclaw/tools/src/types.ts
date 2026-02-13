export interface Tool {
  name: string;
  description: string;
  parameters?: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<ToolCallResult> | ToolCallResult;
  maxDepth?: number;
  costMultiplier?: number;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
}

export interface ToolCallResult {
  [key: string]: unknown;
  error?: string;
  status?: string;
  result?: string;
  subId?: string;
  depth?: number;
  estCost?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolParameters;
}
