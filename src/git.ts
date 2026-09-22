import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { worktreesRoot } from './paths.js';
import { identifier, inside } from './validation.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function assertGitRepo(repo: string): void {
  git(repo, ['rev-parse', '--git-dir']);
}

export function currentBranch(repo: string): string {
  return git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'HEAD';
}

export function headSha(repo: string): string {
  return git(repo, ['rev-parse', 'HEAD']);
}

export interface SquadWorktree {
  id: string;
  path: string;
  branch: string;
  baseRef: string;
}

export function createWorktree(
  repo: string,
  id: string,
  runId: string,
  baseRef: string,
): SquadWorktree {
  identifier(id);
  identifier(runId, 'run id');
  const wtPath = inside(worktreesRoot(repo), runId, id);
  const branch = `squad/${runId}/${id}`;
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  if (fs.existsSync(wtPath)) throw new Error(`worktree already exists: ${wtPath}`);
  git(repo, ['worktree', 'add', '-b', branch, wtPath, baseRef]);
  return { id, path: wtPath, branch, baseRef };
}

export function inheritDependencies(wtPath: string, commits: string[]): void {
  for (const commit of [...new Set(commits)]) {
    const result = mergeBranch(wtPath, commit);
    if (!result.ok) {
      try {
        git(wtPath, ['merge', '--abort']);
      } catch {
        /* leave evidence if abort fails */
      }
      throw new Error(`dependency merge failed (${commit.slice(0, 8)}): ${result.output}`);
    }
  }
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
  return execFileSync('git', ['diff', '--binary', baseRef, 'HEAD'], {
    cwd: wtPath,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function removeWorktree(repo: string, wt: SquadWorktree): void {
  try {
    git(repo, ['worktree', 'remove', '--force', wt.path]);
  } catch {
    return; // Do not delete a directory behind Git's back.
  }
  try {
    git(repo, ['branch', '-D', wt.branch]);
  } catch {}
}

export function mergeBranch(repo: string, branch: string): { ok: boolean; output: string } {
  try {
    const commit = git(repo, ['rev-parse', '--verify', '--end-of-options', `${branch}^{commit}`]);
    try {
      git(repo, ['merge-base', '--is-ancestor', commit, 'HEAD']);
      return { ok: true, output: 'already integrated' };
    } catch {
      /* merge below */
    }
    const out = git(repo, ['merge', '--no-edit', commit]);
    return { ok: true, output: out };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: [e.stdout, e.stderr, e.message].filter(Boolean).join('\n') };
  }
}
