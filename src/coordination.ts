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
