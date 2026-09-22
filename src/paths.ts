import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const SQUAD_HOME = path.join(os.homedir(), '.devin-squad');

export function repoFingerprint(repo: string): string {
  return crypto.createHash('sha1').update(repo).digest('hex').slice(0, 12);
}

export function worktreesRoot(repo: string): string {
  return path.join(SQUAD_HOME, 'worktrees', repoFingerprint(repo));
}

export function runsRoot(repo: string): string {
  return path.join(SQUAD_HOME, 'runs', repoFingerprint(repo));
}

export function newRunDir(repo: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(runsRoot(repo), ts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function latestRunDir(repo: string): string | null {
  const root = runsRoot(repo);
  if (!fs.existsSync(root)) return null;
  const dirs = fs
    .readdirSync(root)
    .filter(d => fs.statSync(path.join(root, d)).isDirectory())
    .sort();
  return dirs.length > 0 ? path.join(root, dirs[dirs.length - 1]) : null;
}
