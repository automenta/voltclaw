import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { WORKSPACE_DIR } from './workspace.js';
import type { Tool } from '../tools/types.js';

export class SkillLoader {
  private skillsDir: string;
  private tools: Tool[] = [];

  constructor(skillsDir: string = join(WORKSPACE_DIR, 'skills')) {
    this.skillsDir = skillsDir;
  }

  async loadSkills(): Promise<Tool[]> {
    this.tools = [];
    try {
      const files = await readdir(this.skillsDir);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          const path = join(this.skillsDir, file);
          try {
            // Dynamic import of skill module
            // This requires the module to export a default Tool or 'tool'
            const module = await import(path);
            const tool = module.default || module.tool;
            if (tool && tool.name && tool.execute) {
              this.tools.push(tool as Tool);
              console.log(`Loaded skill: ${tool.name}`);
            }
          } catch (e) {
            console.warn(`Failed to load skill ${file}:`, e);
          }
        }
      }
    } catch (e) {
      // Skills dir might not exist yet
    }
    return this.tools;
  }

  getTools(): Tool[] {
    return this.tools;
  }
}
