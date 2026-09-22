import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SQUAD_HOME } from './paths.js';

/** Cross-process lock: CLI and web can share the same conversation. */
export async function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const root = path.join(SQUAD_HOME, 'locks');
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, crypto.createHash('sha256').update(key).digest('hex'));
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        const pid = Number(fs.readFileSync(file, 'utf8'));
        if (pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ESRCH') fs.unlinkSync(file);
          }
        }
      } catch {
        /* lock changed */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await work();
  } finally {
    fs.unlinkSync(file);
  }
}

export function claimSlackEvent(channel: string, ts: string): boolean {
  const dir = path.join(SQUAD_HOME, 'slack-events');
  fs.mkdirSync(dir, { recursive: true });
  const key = crypto.createHash('sha256').update(`${channel}:${ts}`).digest('hex');
  try {
    const fd = fs.openSync(path.join(dir, key), 'wx');
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}

export interface ProcessLease {
  file: string;
  release: () => void;
}

/** Fail fast when a long-running integration is already active. */
export function claimProcess(key: string, detail: Record<string, string> = {}): ProcessLease {
  const root = path.join(SQUAD_HOME, 'locks', 'processes');
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, crypto.createHash('sha256').update(key).digest('hex') + '.json');

  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeFileSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          ...detail,
        }),
      );
      fs.closeSync(fd);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let owner: { pid?: number; repo?: string } = {};
      try {
        owner = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof owner;
      } catch {
        // A crashed writer left an unreadable lock. It is safe to replace.
      }
      if (owner.pid && owner.pid > 0) {
        try {
          process.kill(owner.pid, 0);
          throw new Error(
            `already running (pid ${owner.pid}${owner.repo ? `, repo ${owner.repo}` : ''})`,
          );
        } catch (check) {
          if ((check as NodeJS.ErrnoException).code !== 'ESRCH') throw check;
        }
      }
      try {
        fs.unlinkSync(file);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError;
      }
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const owner = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        pid?: number;
      };
      if (owner.pid === process.pid) fs.unlinkSync(file);
    } catch {
      // Another process may already have cleaned a stale lease.
    }
  };
  process.once('exit', release);
  return { file, release };
}
