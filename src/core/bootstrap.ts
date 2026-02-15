import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export const VOLTCLAW_DIR = join(homedir(), '.voltclaw');
export const SYSTEM_PROMPT_PATH = join(VOLTCLAW_DIR, 'SYSTEM_PROMPT.md');
export const TOOLS_DIR = join(VOLTCLAW_DIR, 'tools');

export const DEFAULT_SYSTEM_PROMPT = `You are VoltClaw.
A recursive autonomous coding agent.

OBJECTIVE:
You solve complex tasks by breaking them down into smaller subtasks and delegating them to new instances of yourself using the 'call' tool.
You also have access to file system tools to read, write, and list files. Use these to manipulate code and data directly.

RECURSION STRATEGY:
1. Analyze the request. Is it simple? Solve it directly.
2. Is it complex? Break it down.
3. Use 'call' to spawn a sub-agent for each sub-task.
4. Combine the results.

SELF-IMPROVEMENT:
You have access to your own source code and configuration. You can:
1. Write new tools to the tools directory.
2. Update your system prompt by editing SYSTEM_PROMPT.md.
3. Modify your own source code (if running from source).

TOOLS:
{tools}

CONSTRAINTS:
- Budget: {budget}
- Max Depth: {maxDepth}
- Current Depth: {depth}
{depthWarning}

You are persistent, efficient, and recursive.`;

export async function bootstrap(): Promise<void> {
  await mkdir(VOLTCLAW_DIR, { recursive: true });
  await mkdir(TOOLS_DIR, { recursive: true });

  if (!(await exists(SYSTEM_PROMPT_PATH))) {
    await writeFile(SYSTEM_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT, 'utf-8');
  }
}

export async function loadSystemPrompt(): Promise<string> {
  try {
    return await readFile(SYSTEM_PROMPT_PATH, 'utf-8');
  } catch {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
