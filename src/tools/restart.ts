import { Tool } from './types.js';

export const restartTool: Tool = {
  name: 'restart_agent',
  description: 'Restart the agent process to apply code changes or configuration updates.',
  execute: async (): Promise<{ status: string }> => {
    // We'll use a specific exit code (e.g., 42) to signal the wrapper to restart.
    // In a real deployment, a supervisor (like systemd or Docker) would handle this.
    // For local dev/CLI, the wrapper script will catch this.
    process.exit(42);
    return { status: 'restarting' }; // This won't be reached
  }
};
