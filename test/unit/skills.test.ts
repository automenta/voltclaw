import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillLoader } from '../../src/core/skills.js';
import { WORKSPACE_DIR } from '../../src/core/workspace.js';
import { join } from 'path';
import { writeFile, unlink, mkdir } from 'fs/promises';

describe('SkillLoader', () => {
  const skillsDir = join(WORKSPACE_DIR, 'skills');
  const skillFile = join(skillsDir, 'test-skill.js');

  beforeEach(async () => {
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await unlink(skillFile);
    } catch {}
  });

  it('should load skills from skills directory', async () => {
    const skillContent = `
      export default {
        name: 'test_skill',
        description: 'A test skill',
        execute: async () => ({ status: 'success' })
      };
    `;
    await writeFile(skillFile, skillContent);

    const loader = new SkillLoader(skillsDir);
    const tools = await loader.loadSkills();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_skill');

    // Cleanup
    await unlink(skillFile);
  });
});
