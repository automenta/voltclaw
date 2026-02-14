import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export const VOLTCLAW_DIR = join(homedir(), '.voltclaw');
export const WORKSPACE_DIR = join(VOLTCLAW_DIR, 'workspace');

export const DEFAULT_SOUL = `# Agent Soul

## Identity
Name: VoltClaw
Role: Recursive Autonomous Coding Agent
Vibe: Professional, Efficient, Recursive.

## Core Directives
1. Solve problems by breaking them down recursively.
2. Be autonomous and persistent.
3. Use tools effectively.
`;

export const DEFAULT_USER = `# User Profile

## Identity
Name: User
Role: Developer

## Preferences
- prefers concise answers
- likes code examples
`;

export const DEFAULT_AGENTS_MD = `# Agent Instructions

This file contains meta-instructions for the agent.

## Guidelines
1. Be concise.
2. Prefer recursion over long context windows.
3. Write modular code.
`;

export const DEFAULT_TOOLS_MD = `# Tool Notes

Use this file to store notes about tools, scripts, or specific commands that are useful in this environment.
The agent can read this file to understand better how to use available tools.
`;

export const DEFAULT_IDENTITY_MD = `# Identity

Name: VoltClaw
Emoji: 🦞
Vibe: Recursive, Efficient, Autonomous.
`;

export class Workspace {
  private workspaceDir: string;

  constructor(workspaceDir: string = WORKSPACE_DIR) {
    this.workspaceDir = workspaceDir;
  }

  async ensureExists(): Promise<void> {
    await mkdir(this.workspaceDir, { recursive: true });

    await this.ensureFile('SOUL.md', DEFAULT_SOUL);
    await this.ensureFile('USER.md', DEFAULT_USER);
    await this.ensureFile('AGENTS.md', DEFAULT_AGENTS_MD);
    await this.ensureFile('TOOLS.md', DEFAULT_TOOLS_MD);
    await this.ensureFile('IDENTITY.md', DEFAULT_IDENTITY_MD);
  }

  private async ensureFile(filename: string, content: string): Promise<void> {
    const path = join(this.workspaceDir, filename);
    try {
      await stat(path);
    } catch {
      await writeFile(path, content, 'utf-8');
    }
  }

  async loadFile(filename: string): Promise<string> {
    try {
      return await readFile(join(this.workspaceDir, filename), 'utf-8');
    } catch {
      return '';
    }
  }

  async saveFile(filename: string, content: string): Promise<void> {
    await this.ensureExists();
    await writeFile(join(this.workspaceDir, filename), content, 'utf-8');
  }

  async loadContext(): Promise<string> {
    const soul = await this.loadFile('SOUL.md');
    const user = await this.loadFile('USER.md');
    const agents = await this.loadFile('AGENTS.md');
    const tools = await this.loadFile('TOOLS.md');

    return [
      soul ? `\n\n--- AGENT SOUL ---\n${soul}` : '',
      user ? `\n\n--- USER PROFILE ---\n${user}` : '',
      agents ? `\n\n--- AGENT INSTRUCTIONS ---\n${agents}` : '',
      tools ? `\n\n--- TOOL NOTES ---\n${tools}` : ''
    ].join('');
  }

  getPath(filename: string): string {
      return join(this.workspaceDir, filename);
  }
}
