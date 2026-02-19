import { VoltClawAgent } from './agent.js';
import { VOLTCLAW_DIR } from './bootstrap.js';
import fs from 'fs/promises';
import path from 'path';
import { type Tool } from './types.js';

export class SkillManager {
  private skillsDir: string;

  constructor() {
    this.skillsDir = path.join(VOLTCLAW_DIR, 'skills');
  }

  async ensureExists(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
  }

  async loadSkills(): Promise<Tool[]> {
    await this.ensureExists();
    const files = await fs.readdir(this.skillsDir);
    const tools: Tool[] = [];

    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        try {
          const filePath = path.join(this.skillsDir, file);
          const module = await import(filePath);
          if (module.default && typeof module.default === 'object' && 'name' in module.default && 'execute' in module.default) {
            tools.push(module.default as Tool);
          } else if (module.createTool && typeof module.createTool === 'function') {
             tools.push(module.createTool());
          }
        } catch (error) {
          console.error(`Failed to load skill ${file}:`, error);
        }
      }
    }
    return tools;
  }

  async installSkill(url: string, name?: string): Promise<string> {
    await this.ensureExists();

    // Simple download logic
    // We expect a direct URL to a raw JS/TS file

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch skill: ${response.statusText}`);
    }

    const content = await response.text();
    const filename = name ? (name.endsWith('.js') ? name : `${name}.js`) : path.basename(url);
    const filePath = path.join(this.skillsDir, filename);

    await fs.writeFile(filePath, content);
    return filename;
  }
}
