import type {
    Session,
    MessageMeta,
    ChatMessage,
    LLMProvider,
    Channel,
    MessageContext,
    ReplyContext,
    CallContext,
    ErrorContext
} from './types.js';
import { SessionManager } from './session-manager.js';
import { ToolExecutor } from './tool-executor.js';
import { CallHandler } from './call-handler.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { Retrier } from './retry.js';
import type { AuditLog } from './audit.js';
import type { Logger } from './types.js';

export interface MessageHandlerConfig {
    sessionManager: SessionManager;
    toolExecutor: ToolExecutor;
    callHandler: CallHandler;
    llm: LLMProvider;
    channel: Channel;
    getCircuitBreaker: (name: string) => CircuitBreaker;
    retrier: Retrier;
    auditLog?: AuditLog;
    logger: Logger;
    maxHistory: number;
    buildSystemPrompt: (depth: number) => string;
    onMessage?: (ctx: MessageContext) => Promise<void>;
    onReply?: (ctx: ReplyContext) => Promise<void>;
    onCall?: (ctx: CallContext) => Promise<void>;
    onError?: (ctx: ErrorContext) => Promise<void>;
    emit: (event: string, ...args: unknown[]) => void;
}

export class MessageHandler {
    private readonly config: MessageHandlerConfig;

    constructor(config: MessageHandlerConfig) {
        this.config = config;
    }

    async handleMessage(from: string, content: string, meta: MessageMeta): Promise<void> {
        const isSelf = from === this.config.channel.identity.publicKey;
        const session = this.config.sessionManager.getSession(isSelf ? 'self' : from, isSelf);

        const ctx: MessageContext = {
            from,
            content,
            timestamp: new Date(),
            metadata: meta
        };
        await this.config.auditLog?.log(from, 'message_received', { content });
        await this.config.onMessage?.(ctx);
        this.config.emit('message', ctx);

        try {
            const parsed = this.tryParseJSON(content);

            if (parsed?.type === 'subtask') {
                await this.handleSubtask(session, parsed, from);
            } else if (parsed?.type === 'subtask_result') {
                await this.handleSubtaskResult(session, parsed, from);
            } else {
                await this.handleTopLevel(session, content, from);
            }
        } catch (error) {
            const errCtx: ErrorContext = {
                error: error instanceof Error ? error : new Error(String(error)),
                context: { from, content: content.slice(0, 100) },
                timestamp: new Date()
            };
            await this.config.onError?.(errCtx);
            this.config.emit('error', errCtx);
            this.config.logger.error('Error handling message', { error: String(error), from });
        }
    }

    private tryParseJSON(text: string): Record<string, unknown> | null {
        try {
            return JSON.parse(text) as Record<string, unknown>;
        } catch {
            return null;
        }
    }

    async handleTopLevel(
        session: Session,
        content: string,
        from: string
    ): Promise<void> {
        session.depth = 0;
        session.subTasks = {};
        session.callCount = 0;
        session.estCostUSD = 0;
        session.actualTokensUsed = 0;
        session.topLevelStartedAt = Date.now();

        const systemPrompt = this.config.buildSystemPrompt(session.depth);
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...session.history.slice(-this.config.maxHistory),
            { role: 'user', content }
        ];

        const cb = this.config.getCircuitBreaker('llm');
        let response = await cb.execute(() => this.config.retrier.execute(() => this.config.llm.chat(messages, {
            tools: this.config.toolExecutor.getToolDefinitions(session.depth)
        })));

        while (response.toolCalls && response.toolCalls.length > 0) {
            messages.push({
                role: 'assistant',
                content: response.content,
                toolCalls: response.toolCalls
            });

            for (const call of response.toolCalls) {
                let result;

                // Handle recursive call tools
                if (call.name === 'call') {
                    result = await this.config.callHandler.executeCall(call.arguments, session, from);
                } else if (call.name === 'call_parallel') {
                    result = await this.config.callHandler.executeCallParallel(call.arguments, session, from);
                } else {
                    result = await this.config.toolExecutor.executeTool(call.name, call.arguments, session, from);
                }

                messages.push({
                    role: 'tool',
                    toolCallId: call.id,
                    content: JSON.stringify(result)
                });
            }

            response = await cb.execute(() => this.config.retrier.execute(() => this.config.llm.chat(messages, {
                tools: this.config.toolExecutor.getToolDefinitions(session.depth)
            })));
        }

        const reply = response.content || '[error]';
        session.history.push({ role: 'user', content });
        session.history.push({ role: 'assistant', content: reply });
        this.config.sessionManager.pruneHistory(session);
        await this.config.sessionManager.save();

        await this.config.channel.send(from, reply);

        const replyCtx: ReplyContext = {
            to: from,
            content: reply,
            timestamp: new Date()
        };
        await this.config.onReply?.(replyCtx);
        this.config.emit('reply', replyCtx);
    }

    async handleSubtask(
        session: Session,
        parsed: Record<string, unknown>,
        _from: string
    ): Promise<void> {
        const depth = (parsed.depth as number) ?? session.depth + 1;
        const task = parsed.task as string;
        const contextSummary = (parsed.contextSummary as string) ?? '';
        const subId = parsed.subId as string;
        const parentPubkey = parsed.parentPubkey as string | undefined;

        session.depth = depth;

        const mustFinish = depth >= (this.config.maxHistory - 1)
            ? '\nMUST produce final concise answer NOW. No further calls.'
            : '';

        const systemPrompt = `FOCUSED sub-agent (depth ${depth}).
Task: ${task}
Parent context: ${contextSummary}${mustFinish}`;

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Begin.' }
        ];

        try {
            const cb = this.config.getCircuitBreaker('llm');
            const response = await cb.execute(() => this.config.retrier.execute(() => this.config.llm.chat(messages, {
                tools: this.config.toolExecutor.getToolDefinitions(depth)
            })));

            const result = response.content || '[no content]';
            await this.config.channel.send(
                this.config.channel.identity.publicKey,
                JSON.stringify({ type: 'subtask_result', subId, result })
            );

            const callCtx: CallContext = {
                taskId: subId,
                task,
                depth,
                parentPubkey
            };
            await this.config.onCall?.(callCtx);
            this.config.emit('call', callCtx);
        } catch (error) {
            await this.config.channel.send(
                this.config.channel.identity.publicKey,
                JSON.stringify({ type: 'subtask_result', subId, error: String(error) })
            );
        }
    }

    async handleSubtaskResult(
        session: Session,
        parsed: Record<string, unknown>,
        _from: string
    ): Promise<void> {
        const subId = parsed.subId as string;
        const result = parsed.result as string | undefined;
        const error = parsed.error as string | undefined;

        this.config.sessionManager.resolveSubtask(session, subId, result, error);

        if (result) {
            const addedTokens = Math.ceil(result.length / 4);
            session.actualTokensUsed += addedTokens;
            session.estCostUSD += (addedTokens / 1000) * 0.0005;
        }

        await this.config.sessionManager.save();

        const allDone = this.config.sessionManager.isAllSubtasksDone(session);

        if (allDone && session.topLevelStartedAt > 0) {
            await this.config.callHandler.synthesize(session);
        }
    }
}
