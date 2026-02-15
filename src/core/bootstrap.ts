import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export const VOLTCLAW_DIR = join(homedir(), '.voltclaw');
export const SYSTEM_PROMPT_PATH = join(VOLTCLAW_DIR, 'SYSTEM_PROMPT.md');
export const TOOLS_DIR = join(VOLTCLAW_DIR, 'tools');

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools for file operations and task delegation.

RESPONSE GUIDELINES:
- Answer questions naturally and directly without unnecessary technical detail
- Only invoke tools when the user requests an action (read/write files, execute commands, etc.)
- Keep responses focused on the user's question, not your capabilities

TOOL USAGE RULES:
1. Use function calling to invoke tools - never describe or roleplay tool usage
2. When you need to perform an action, invoke the tool immediately
3. Never say "I will use tool X" - just invoke it
4. Only invoke tools for actual tasks (file operations, HTTP requests, etc.)
5. Simple questions (jokes, math, facts) should be answered directly without tools

AVAILABLE TOOLS:
{tools}

Tool definitions and parameters are provided via the function calling interface.

TASK DELEGATION:
For complex multi-step tasks, you can delegate subtasks using the 'call' tool to spawn sub-agents.
Break down complex work into focused subtasks that can be solved independently.

CONSTRAINTS:
- Budget: {budget} USD
- Max Delegation Depth: {maxDepth}
- Current Depth: {depth}
{depthWarning}

Respond naturally to questions. Use tools when actions are needed.`;

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
