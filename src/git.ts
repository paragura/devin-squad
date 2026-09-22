import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { worktreesRoot } from './paths.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function assertGitRepo(repo: string): void {
  git(repo, ['rev-parse', '--git-dir']);
}

export function currentBranch(repo: string): string {
  return git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'HEAD';
}

export interface SquadWorktree {
  id: string;
  path: string;
  branch: string;
  baseRef: string;
}

export function createWorktree(repo: string, id: string): SquadWorktree {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const wtPath = path.join(worktreesRoot(repo), safe);
  const branch = `squad/${safe}`;
  const baseRef = currentBranch(repo);
  fs.mkdirSync(worktreesRoot(repo), { recursive: true });
  if (fs.existsSync(wtPath)) fs.rmSync(wtPath, { recursive: true, force: true });
  try {
    git(repo, ['branch', '-D', branch]);
  } catch {}
  git(repo, ['worktree', 'add', '-b', branch, wtPath, baseRef]);
  return { id: safe, path: wtPath, branch, baseRef };
}

export function hasChanges(wtPath: string): boolean {
  return git(wtPath, ['status', '--porcelain']).length > 0;
}

export function commitAll(wtPath: string, message: string): boolean {
  if (!hasChanges(wtPath)) return false;
  git(wtPath, ['add', '-A']);
  git(wtPath, ['commit', '-m', message, '--no-verify']);
  return true;
}

export function diffFromBase(repo: string, wtPath: string, baseRef: string): string {
  try {
    commitAll(wtPath, 'squad: wip');
  } catch {}
  try {
    return git(wtPath, ['diff', `${baseRef}...HEAD`]);
  } catch {
    return git(wtPath, ['diff', 'HEAD']);
  }
}

export function removeWorktree(repo: string, wt: SquadWorktree): void {
  try {
    git(repo, ['worktree', 'remove', '--force', wt.path]);
  } catch {
    fs.rmSync(wt.path, { recursive: true, force: true });
  }
  try {
    git(repo, ['branch', '-D', wt.branch]);
  } catch {}
}

export function mergeBranch(repo: string, branch: string): { ok: boolean; output: string } {
  try {
    const out = git(repo, ['merge', '--no-edit', branch]);
    return { ok: true, output: out };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: [e.stdout, e.stderr, e.message].filter(Boolean).join('\n') };
  }
}
