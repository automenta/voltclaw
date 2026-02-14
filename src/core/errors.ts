export class VoltClawError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'VoltClawError';
    this.code = code;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends VoltClawError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class LLMError extends VoltClawError {
  public readonly provider?: string;

  constructor(message: string, provider?: string) {
    super(message, 'LLM_ERROR');
    this.name = 'LLMError';
    this.provider = provider;
  }
}

export class LLMRateLimitError extends LLMError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super('LLM rate limit exceeded', 'unknown');
    this.name = 'LLMRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ChannelError extends VoltClawError {
  public readonly channelType?: string;

  constructor(message: string, channelType?: string) {
    super(message, 'CHANNEL_ERROR');
    this.name = 'ChannelError';
    this.channelType = channelType;
  }
}

// Deprecated alias
export class TransportError extends ChannelError {
  constructor(message: string, transportType?: string) {
    super(message, transportType);
    this.name = 'TransportError';
  }
}

export class DecryptionError extends ChannelError {
  constructor(message: string) {
    super(message, 'nostr');
    this.name = 'DecryptionError';
  }
}

export class DelegationError extends VoltClawError {
  public readonly depth?: number;
  public readonly taskId?: string;

  constructor(message: string, code: string, depth?: number, taskId?: string) {
    super(message, code);
    this.name = 'DelegationError';
    this.depth = depth;
    this.taskId = taskId;
  }
}

export class MaxDepthExceededError extends DelegationError {
  public readonly maxDepth: number;

  constructor(maxDepth: number, currentDepth: number) {
    super(
      `Maximum delegation depth exceeded: ${currentDepth} > ${maxDepth}`,
      'MAX_DEPTH_EXCEEDED',
      currentDepth
    );
    this.name = 'MaxDepthExceededError';
    this.maxDepth = maxDepth;
  }
}

export class BudgetExceededError extends DelegationError {
  public readonly budget: number;
  public readonly used: number;

  constructor(budget: number, used: number) {
    super(`Budget exceeded: $${used.toFixed(4)} > $${budget.toFixed(4)}`, 'BUDGET_EXCEEDED');
    this.name = 'BudgetExceededError';
    this.budget = budget;
    this.used = used;
  }
}

export class TimeoutError extends VoltClawError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, operation: string) {
    super(
      `Operation timed out after ${timeoutMs}ms: ${operation}`,
      'TIMEOUT_ERROR'
    );
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class ToolError extends VoltClawError {
  public readonly toolName: string;

  constructor(message: string, toolName: string) {
    super(message, 'TOOL_ERROR');
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, toolName);
    this.name = 'ToolNotFoundError';
  }
}

export class PersistenceError extends VoltClawError {
  constructor(message: string) {
    super(message, 'PERSISTENCE_ERROR');
    this.name = 'PersistenceError';
  }
}

export class CircuitOpenError extends VoltClawError {
  public readonly lastFailureTime: Date;

  constructor() {
    super('Circuit breaker is open', 'CIRCUIT_OPEN');
    this.name = 'CircuitOpenError';
    this.lastFailureTime = new Date();
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof LLMRateLimitError) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof CircuitOpenError) return false;
  if (error instanceof ChannelError) return true;
  if (error instanceof LLMError) return true;
  return false;
}
