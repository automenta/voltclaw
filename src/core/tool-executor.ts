import type {
    Tool,
    ToolCallResult,
    ToolDefinition,
    Session,
    Role,
    ToolParameters
} from './types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { Retrier } from './retry.js';
import { ErrorQueue } from './error-queue.js';
import { AuthorizationError } from './errors.js';
import type { AuditLog } from './audit.js';

export interface ToolExecutorConfig {
    getCircuitBreaker: (name: string) => CircuitBreaker;
    retrier: Retrier;
    errorQueue: ErrorQueue;
    auditLog?: AuditLog;
    fallbacks: Record<string, string>;
    maxDepth: number;
    checkPermission: (tool: Tool, role: Role) => boolean;
    getRole: (pubkey: string) => Role;
    onToolApproval?: (tool: string, args: Record<string, unknown>) => Promise<boolean>;
}

export class ToolExecutor {
    private readonly tools: Map<string, Tool> = new Map();
    private readonly config: ToolExecutorConfig;

    constructor(config: ToolExecutorConfig) {
        this.config = config;
    }

    registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    registerTools(tools: Tool[]): void {
        for (const tool of tools) {
            this.registerTool(tool);
        }
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    async executeTool(
        name: string,
        args: Record<string, unknown>,
        session: Session,
        from: string
    ): Promise<ToolCallResult> {
        try {
            const tool = this.tools.get(name);
            if (!tool) {
                return { error: `Tool not found: ${name}` };
            }

            // Check RBAC
            const role = this.config.getRole(from);
            if (!this.config.checkPermission(tool, role)) {
                await this.config.auditLog?.log(from, 'tool_denied', { tool: name, reason: 'authorization' });
                throw new AuthorizationError(`User ${from.slice(0, 8)} (role: ${role}) not authorized for tool ${name}`);
            }

            // Check user approval hook
            if (this.config.onToolApproval) {
                const approved = await this.config.onToolApproval(name, args);
                if (!approved) {
                    await this.config.auditLog?.log(from, 'tool_denied', { tool: name, reason: 'user_approval' });
                    return { error: 'Tool execution denied by user' };
                }
            }

            await this.config.auditLog?.log(from, 'tool_execute', { tool: name, args });

            const cb = this.config.getCircuitBreaker(name);
            const fallbackName = this.config.fallbacks[name];
            const fallback = fallbackName
                ? () => this.executeTool(fallbackName, args, session, from).then(r => {
                    if (r.error) throw new Error(r.error);
                    return r;
                })
                : undefined;

            const result = await cb.execute(
                () => this.config.retrier.execute(async () => tool.execute(args)),
                fallback
            );

            await this.config.auditLog?.log(from, 'tool_result', { tool: name, result });

            return result as ToolCallResult;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            // Push to error queue
            await this.config.errorQueue.push(name, args, err);

            return { error: err.message };
        }
    }

    getToolDefinitions(depth: number): ToolDefinition[] {
        const definitions: ToolDefinition[] = Array.from(this.tools.entries())
            .filter(([_, tool]) => (tool.maxDepth ?? Infinity) >= depth)
            .map(([name, tool]) => ({
                name,
                description: tool.description,
                parameters: tool.parameters
            }));

        // Add call tools if not at max depth
        if (depth < this.config.maxDepth) {
            definitions.push({
                name: 'call',
                description: 'Call a child agent to handle a sub-task. Use for complex tasks that can be parallelized or decomposed.',
                parameters: {
                    type: 'object',
                    properties: {
                        task: { type: 'string', description: 'The specific task to call the child agent with' },
                        summary: { type: 'string', description: 'Optional context summary for the child agent' }
                    },
                    required: ['task']
                } as ToolParameters
            });
            definitions.push({
                name: 'call_parallel',
                description: 'Call multiple independent tasks in parallel. Use when subtasks do not depend on each other.',
                parameters: {
                    type: 'object',
                    properties: {
                        tasks: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    task: { type: 'string' },
                                    summary: { type: 'string' }
                                },
                                required: ['task']
                            },
                            description: 'List of tasks to call in parallel (max 10)'
                        }
                    },
                    required: ['tasks']
                } as ToolParameters
            });
        }

        return definitions;
    }

    getToolNames(depth: number): string[] {
        const names = Array.from(this.tools.keys())
            .filter(name => {
                const tool = this.tools.get(name);
                return tool && (tool.maxDepth ?? Infinity) >= depth;
            });

        if (depth < this.config.maxDepth) {
            names.push('call');
        }

        return names;
    }
}
