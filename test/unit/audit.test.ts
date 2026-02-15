import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileAuditLog, type AuditEntry } from '../../src/core/audit.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

describe('FileAuditLog', () => {
  const tmpDir = path.join(os.tmpdir(), `voltclaw-audit-test-${Date.now()}`);
  const auditPath = path.join(tmpDir, 'audit.jsonl');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create log file and write entries', async () => {
    const logger = new FileAuditLog(auditPath);
    await logger.log('user1', 'test_action', { foo: 'bar' });

    const content = await fs.readFile(auditPath, 'utf-8');
    const entry = JSON.parse(content.trim()) as AuditEntry;

    expect(entry.actor).toBe('user1');
    expect(entry.action).toBe('test_action');
    expect(entry.details).toEqual({ foo: 'bar' });
    expect(entry.prevHash).toBe('0'.repeat(64));
    expect(entry.hash).toBeDefined();
  });

  it('should chain hashes correctly', async () => {
    const logger = new FileAuditLog(auditPath);
    await logger.log('user1', 'action1', {});
    await logger.log('user1', 'action2', {});

    const content = await fs.readFile(auditPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]) as AuditEntry;
    const entry2 = JSON.parse(lines[1]) as AuditEntry;

    expect(entry2.prevHash).toBe(entry1.hash);
  });

  it('should verify valid chain', async () => {
    const logger = new FileAuditLog(auditPath);
    await logger.log('user1', 'action1', {});
    await logger.log('user1', 'action2', {});

    const isValid = await logger.verify();
    expect(isValid).toBe(true);
  });

  it('should detect tampered chain', async () => {
    const logger = new FileAuditLog(auditPath);
    await logger.log('user1', 'action1', {});
    await logger.log('user1', 'action2', {});

    // Tamper with the first entry
    const content = await fs.readFile(auditPath, 'utf-8');
    const lines = content.trim().split('\n');
    const entry1 = JSON.parse(lines[0]);
    entry1.action = 'tampered'; // Change action, hash remains same -> mismatch

    const tamperedContent = [JSON.stringify(entry1), lines[1]].join('\n');
    await fs.writeFile(auditPath, tamperedContent);

    const isValid = await logger.verify();
    expect(isValid).toBe(false);
  });

  it('should detect broken link', async () => {
    const logger = new FileAuditLog(auditPath);
    await logger.log('user1', 'action1', {});
    await logger.log('user1', 'action2', {});

    // Tamper with the second entry's prevHash
    const content = await fs.readFile(auditPath, 'utf-8');
    const lines = content.trim().split('\n');
    const entry2 = JSON.parse(lines[1]);
    entry2.prevHash = '0'.repeat(64); // Break the link

    const tamperedContent = [lines[0], JSON.stringify(entry2)].join('\n');
    await fs.writeFile(auditPath, tamperedContent);

    const isValid = await logger.verify();
    expect(isValid).toBe(false);
  });
});
