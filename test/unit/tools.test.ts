import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { grepTool, globTool, editTool, executeTool, writeFileTool, readFileTool } from '../../src/tools/index.js';
import { writeFile, unlink, mkdir, rmdir } from 'fs/promises';
import { join } from 'path';

describe('Tools', () => {
  const TEST_DIR = 'test-tools-dir';
  const TEST_FILE = join(TEST_DIR, 'test.txt');

  beforeEach(async () => {
    try {
      await mkdir(TEST_DIR);
    } catch {}
  });

  afterEach(async () => {
    try {
      await unlink(TEST_FILE);
    } catch {}
    try {
      await rmdir(TEST_DIR);
    } catch {}
  });

  describe('grep', () => {
    it('finds pattern in file', async () => {
      await writeFile(TEST_FILE, 'Hello world\nAnother line\nHello again', 'utf-8');

      const result = await grepTool.execute({
        pattern: 'Hello',
        path: TEST_DIR
      });

      expect(result.error).toBeUndefined();
      expect(result.matches).toHaveLength(2);
      expect((result.matches as any[])[0].content).toContain('Hello world');
    });

    it('respects case insensitivity', async () => {
      await writeFile(TEST_FILE, 'Hello world', 'utf-8');

      const result = await grepTool.execute({
        pattern: 'hello',
        path: TEST_DIR,
        ignoreCase: true
      });

      expect(result.matches).toHaveLength(1);
    });
  });

  describe('glob', () => {
    it('finds matching files', async () => {
        await writeFile(TEST_FILE, 'content', 'utf-8');
        await writeFile(join(TEST_DIR, 'other.md'), 'content', 'utf-8');

        const result = await globTool.execute({
            pattern: '*.txt',
            path: TEST_DIR
        });

        expect(result.files).toContain('test.txt');
        expect(result.files).not.toContain('other.md');

        await unlink(join(TEST_DIR, 'other.md'));
    });
  });

  describe('edit', () => {
    it('replaces text in file', async () => {
        await writeFile(TEST_FILE, 'Hello world', 'utf-8');

        const result = await editTool.execute({
            path: TEST_FILE,
            oldString: 'world',
            newString: 'VoltClaw'
        });

        expect(result.status).toBe('success');

        const content = await readFileTool.execute({ path: TEST_FILE });
        expect(content.content).toBe('Hello VoltClaw');
    });

    it('fails if text not found', async () => {
        await writeFile(TEST_FILE, 'Hello world', 'utf-8');

        const result = await editTool.execute({
            path: TEST_FILE,
            oldString: 'Universe',
            newString: 'VoltClaw'
        });

        expect(result.error).toContain('Text not found');
    });
  });

  describe('execute', () => {
    it('executes shell command', async () => {
        const result = await executeTool.execute({
            command: 'echo "hello"'
        });

        expect(result.stdout).toContain('hello');
    });

    it('blocks dangerous commands', async () => {
        const result = await executeTool.execute({
            command: 'rm -rf /'
        });

        expect(result.error).toContain('blocked for safety');
    });
  });
});
