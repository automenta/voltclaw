import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: any;
  prevHash: string;
  hash: string;
}

export interface AuditLog {
  log(actor: string, action: string, details: any): Promise<void>;
  verify(): Promise<boolean>;
}

export class FileAuditLog implements AuditLog {
  private readonly path: string;
  private lastHash: string = '0'.repeat(64); // Genesis hash
  private initialized = false;

  constructor(pathStr: string) {
    this.path = pathStr;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.access(this.path);
      // File exists, verify integrity and find last hash
      // For now, we just read the last line to get the hash for performance
      // Full verification should be done via `verify()` method or external tool
      const content = await fs.readFile(this.path, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
            try {
                const entry = JSON.parse(lastLine) as AuditEntry;
                this.lastHash = entry.hash;
            } catch {
                // Corrupted last line?
                // We should probably log this or throw, but for resilience we might just continue or fail
                console.warn('Audit log last line corrupted, using genesis hash might invalidate chain.');
            }
        }
      }
    } catch {
      // File doesn't exist, start fresh with genesis hash
      await fs.mkdir(path.dirname(this.path), { recursive: true });
    }
    this.initialized = true;
  }

  async log(actor: string, action: string, details: any): Promise<void> {
    await this.init();

    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();

    // Calculate hash
    // Hash = SHA256(prevHash + timestamp + actor + action + JSON.stringify(details))
    const payload = this.lastHash + timestamp + actor + action + JSON.stringify(details);
    const hash = crypto.createHash('sha256').update(payload).digest('hex');

    const entry: AuditEntry = {
      id,
      timestamp,
      actor,
      action,
      details,
      prevHash: this.lastHash,
      hash
    };

    this.lastHash = hash;

    await fs.appendFile(this.path, JSON.stringify(entry) + '\n');
  }

  async verify(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.path, 'utf-8');
      const lines = content.trim().split('\n');

      let currentPrevHash = '0'.repeat(64);

      for (const line of lines) {
        if (!line) continue;
        const entry = JSON.parse(line) as AuditEntry;

        if (entry.prevHash !== currentPrevHash) {
          return false;
        }

        const payload = currentPrevHash + entry.timestamp + entry.actor + entry.action + JSON.stringify(entry.details);
        const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');

        if (entry.hash !== expectedHash) {
          return false;
        }

        currentPrevHash = entry.hash;
      }

      return true;
    } catch {
      return false;
    }
  }
}
