import type { Session, Store, SubTaskInfo } from './types.js';
import { TimeoutError } from './errors.js';

export interface SessionManagerConfig {
    store: Store;
    maxHistory: number;
    timeoutMs: number;
}

export class SessionManager {
    private readonly store: Store;
    private readonly maxHistory: number;
    private readonly timeoutMs: number;

    constructor(config: SessionManagerConfig) {
        this.store = config.store;
        this.maxHistory = config.maxHistory;
        this.timeoutMs = config.timeoutMs;
    }

    getSession(key: string, isSelf: boolean): Session {
        return this.store.get(key, isSelf);
    }

    pruneHistory(session: Session): void {
        if (session.history.length > this.maxHistory) {
            session.history = session.history.slice(-this.maxHistory);
        }
    }

    async pruneAllSessions(): Promise<void> {
        const sessions = this.store.getAll?.() ?? {};
        for (const session of Object.values(sessions)) {
            this.pruneHistory(session);
        }
        await this.store.save?.();
    }

    createSubtask(session: Session, task: string, depth: number, from: string): {
        subId: string;
        payload: { type: string; parentPubkey: string; subId: string; task: string; contextSummary: string; depth: number };
    } {
        const subId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        session.subTasks[subId] = {
            createdAt: Date.now(),
            task,
            arrived: false,
            resolve: undefined,
            reject: undefined
        };

        const payload = {
            type: 'subtask',
            parentPubkey: from,
            subId,
            task,
            contextSummary: '',
            depth
        };

        return { subId, payload };
    }

    resolveSubtask(session: Session, subId: string, result?: string, error?: string): void {
        const sub = session.subTasks[subId];
        if (!sub) return;

        if (sub.timer) {
            clearTimeout(sub.timer);
        }

        sub.arrived = true;
        if (error) {
            sub.error = error;
            sub.reject?.(new Error(error));
        } else {
            sub.result = result;
            sub.resolve?.(result ?? '');
        }
    }

    waitForSubtask(session: Session, subId: string, timeoutMs?: number): Promise<string> {
        const timeout = timeoutMs ?? this.timeoutMs;

        return new Promise((resolve, reject) => {
            const sub = session.subTasks[subId];
            if (!sub) {
                reject(new Error(`Subtask ${subId} not found`));
                return;
            }

            sub.resolve = resolve;
            sub.reject = reject;

            const timer = setTimeout(() => {
                sub.arrived = true;
                sub.error = `Timeout after ${timeout}ms`;
                reject(new TimeoutError(timeout, `Subtask ${subId} timed out`));
            }, timeout);

            sub.timer = timer;
        });
    }

    isAllSubtasksDone(session: Session): boolean {
        return Object.values(session.subTasks).every(
            (s: SubTaskInfo) => s.arrived || !!s.error
        );
    }

    async save(): Promise<void> {
        await this.store.save?.();
    }
}
