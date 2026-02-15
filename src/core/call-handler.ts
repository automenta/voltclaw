import type {
    Session,
    ToolCallResult,
    Channel,
    LLMProvider,
    ChatMessage
} from './types.js';
import { SessionManager } from './session-manager.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { Retrier } from './retry.js';
import { MaxDepthExceededError, BudgetExceededError } from './errors.js';

export interface CallHandlerConfig {
    sessionManager: SessionManager;
    channel: Channel;
    llm: LLMProvider;
    getCircuitBreaker: (name: string) => CircuitBreaker;
    retrier: Retrier;
    maxDepth: number;
    maxCalls: number;
    budgetUSD: number;
}

export class CallHandler {
    private readonly config: CallHandlerConfig;

    constructor(config: CallHandlerConfig) {
        this.config = config;
    }

    async executeCall(
        args: Record<string, unknown>,
        session: Session,
        from: string
    ): Promise<ToolCallResult> {
        const task = args.task as string;
        const summary = args.summary as string | undefined;
        const depth = session.depth + 1;

        if (depth > this.config.maxDepth) {
            throw new MaxDepthExceededError(this.config.maxDepth, depth);
        }

        if (session.callCount >= this.config.maxCalls) {
            return { error: 'Max calls exceeded' };
        }

        const baseEst = ((task.length + (summary?.length ?? 0)) / 4000) * 0.0005;
        const estNewCost = baseEst * 3;

        if (session.estCostUSD + estNewCost > this.config.budgetUSD * 0.8) {
            throw new BudgetExceededError(this.config.budgetUSD, session.estCostUSD);
        }

        session.callCount++;
        session.estCostUSD += estNewCost;

        const { subId, payload } = this.config.sessionManager.createSubtask(session, task, depth, from);

        await this.config.channel.send(
            this.config.channel.identity.publicKey,
            JSON.stringify(payload)
        );
        await this.config.sessionManager.save();

        try {
            const result = await this.config.sessionManager.waitForSubtask(session, subId);
            return { status: 'completed', result, subId, depth };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
                subId
            };
        }
    }

    async executeCallParallel(
        args: Record<string, unknown>,
        session: Session,
        from: string
    ): Promise<ToolCallResult> {
        const tasks = args.tasks as Array<{ task: string; summary?: string }>;

        if (!Array.isArray(tasks) || tasks.length === 0) {
            return { error: 'Invalid tasks argument' };
        }

        const depth = session.depth + 1;
        if (depth > this.config.maxDepth) {
            throw new MaxDepthExceededError(this.config.maxDepth, depth);
        }

        // Check budget for all tasks
        let totalEstCost = 0;
        for (const t of tasks) {
            const baseEst = ((t.task.length + (t.summary?.length ?? 0)) / 4000) * 0.0005;
            totalEstCost += baseEst * 3;
        }

        if (session.estCostUSD + totalEstCost > this.config.budgetUSD * 0.8) {
            throw new BudgetExceededError(this.config.budgetUSD, session.estCostUSD);
        }

        if (session.callCount + tasks.length > this.config.maxCalls) {
            return { error: `Max calls exceeded. Can only call ${this.config.maxCalls - session.callCount} more tasks.` };
        }

        // Execute in parallel
        const promises = tasks.map(async (t) => {
            session.callCount++;
            const baseEst = ((t.task.length + (t.summary?.length ?? 0)) / 4000) * 0.0005;
            session.estCostUSD += baseEst * 3;

            const { subId, payload } = this.config.sessionManager.createSubtask(session, t.task, depth, from);

            await this.config.channel.send(
                this.config.channel.identity.publicKey,
                JSON.stringify(payload)
            );

            try {
                const result = await this.config.sessionManager.waitForSubtask(session, subId);
                return { status: 'completed', result, subId, task: t.task };
            } catch (error) {
                return {
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                    subId,
                    task: t.task
                };
            }
        });

        await this.config.sessionManager.save();

        const results = await Promise.all(promises);
        return { status: 'completed', results: results as unknown as Record<string, unknown> };
    }

    async synthesize(session: Session): Promise<string> {
        const results = Object.entries(session.subTasks)
            .map(([id, info]) => {
                const status = info.arrived ? info.result : (info.error ?? '[timeout/failed]');
                return `- ${id.slice(-8)}: ${status}`;
            })
            .join('\n');

        const prompt = `Synthesize sub-task results (or note failures/timeouts):\n${results}\n\nProduce coherent final answer.`;
        const messages: ChatMessage[] = [
            { role: 'system', content: 'You are VoltClaw – combine sub-results.' },
            { role: 'user', content: prompt }
        ];

        const cb = this.config.getCircuitBreaker('llm');
        const response = await cb.execute(() =>
            this.config.retrier.execute(() => this.config.llm.chat(messages))
        ).catch(() => ({
            content: 'Synthesis failed. Raw results:\n' + results
        }));

        return response.content;
    }
}
