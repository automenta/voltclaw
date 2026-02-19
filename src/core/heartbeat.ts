import { readFile } from 'fs/promises';
import { join } from 'path';
import { VoltClawAgent } from './agent.js';
import { WORKSPACE_DIR } from './workspace.js';

export class HeartbeatManager {
  private agent: VoltClawAgent;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(agent: VoltClawAgent, intervalMs: number = 30 * 60 * 1000) { // Default 30 minutes
    this.agent = agent;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.executeHeartbeat(), this.intervalMs);
    console.log(`Heartbeat started with interval ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('Heartbeat stopped');
    }
  }

  private async executeHeartbeat(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const heartbeatFile = join(WORKSPACE_DIR, 'HEARTBEAT.md');
      let content = '';
      try {
        content = await readFile(heartbeatFile, 'utf-8');
      } catch (e) {
        // File might not exist, which is fine
        return;
      }

      if (!content.trim()) return;

      const tasks = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('- [ ]') || line.startsWith('- '))
        .map(line => line.replace(/^- \[[ x]\] /, '').replace(/^- /, ''));

      if (tasks.length === 0) return;

      console.log(`Running heartbeat tasks: ${tasks.join(', ')}`);

      // Execute tasks sequentially or in parallel?
      // For simplicity, execute as a single query to the agent
      const prompt = `System Heartbeat Triggered.
The following periodic tasks are defined in HEARTBEAT.md:
${tasks.map(t => `- ${t}`).join('\n')}

Please review these tasks and execute any that are relevant or due.
If a task requires long-running work, use the 'spawn' tool.
Report the status of each task briefly.`;

      await this.agent.query(prompt, { source: 'heartbeat' });

    } catch (error) {
      console.error('Heartbeat execution failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}
