import { readdir, stat } from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { WORKSPACE_DIR } from './workspace.js';
import type { Tool } from '../tools/types.js';

export class SkillLoader extends EventEmitter {
  private skillsDir: string;
  private tools: Map<string, Tool> = new Map();
  private watcher: FSWatcher | null = null;

  constructor(skillsDir: string = join(WORKSPACE_DIR, 'skills')) {
    super();
    this.skillsDir = skillsDir;
  }

  async startWatching(): Promise<void> {
    if (this.watcher) return;

    try {
        await stat(this.skillsDir);
        this.watcher = watch(this.skillsDir, async (eventType, filename) => {
            if (filename && (filename.endsWith('.js') || filename.endsWith('.ts'))) {
                console.log(`Skill file change detected: ${filename} (${eventType})`);
                await this.reloadSkill(filename);
            }
        });
        console.log(`Watching skills directory: ${this.skillsDir}`);
    } catch (e) {
        // Directory doesn't exist, ignore
    }
  }

  stopWatching(): void {
    if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
    }
  }

  async loadSkills(): Promise<Tool[]> {
    this.tools.clear();
    try {
      const files = await readdir(this.skillsDir);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          await this.reloadSkill(file, false); // initial load
        }
      }
    } catch (e) {
      // Skills dir might not exist yet
    }
    return Array.from(this.tools.values());
  }

  private async reloadSkill(filename: string, emitEvent: boolean = true): Promise<void> {
    const path = join(this.skillsDir, filename);
    const cacheBuster = `?t=${Date.now()}`;

    try {
        // Use cache busting for reload
        const module = await import(path + cacheBuster);
        const tool = module.default || module.tool;

        if (tool && tool.name && tool.execute) {
            this.tools.set(tool.name, tool as Tool);
            console.log(`Loaded skill: ${tool.name}`);
            if (emitEvent) {
                this.emit('skillLoaded', tool as Tool);
            }
        }
    } catch (e) {
        console.warn(`Failed to load skill ${filename}:`, e);
    }
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }
}
