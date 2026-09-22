import fs from 'node:fs';
import path from 'node:path';
import { runDevin } from './devin.js';
import { createWorktree, diffFromBase, commitAll, removeWorktree, hasChanges } from './git.js';
import type { SquadOptions, SquadTask, TaskResult } from './types.js';

function buildWorkerPrompt(task: SquadTask, repoName: string): string {
  return [
    `You are a worker on a Devin Squad team executing one task inside the "${repoName}" repository.`,
    `Your working directory is an isolated git worktree on branch "squad/${task.id}".`,
    ``,
    `# Task: ${task.title}`,
    ``,
    task.prompt,
    ``,
    `# Rules`,
    `- Stay inside the current working directory. Do not touch other branches or push.`,
    `- Do not open pull requests. Just make the changes in this checkout.`,
    `- If the project has a quick verification command (build/test/lint), run it before finishing.`,
    `- End your reply with a short summary of what you changed and any follow-ups needed.`,
  ].join('\n');
}

export async function runTask(
  task: SquadTask,
  opts: SquadOptions,
  runDir: string
): Promise<TaskResult> {
  const start = Date.now();
  const taskDir = path.join(runDir, task.id);
  fs.mkdirSync(taskDir, { recursive: true });

  const wt = createWorktree(opts.repo, task.id);
  const prompt = buildWorkerPrompt(task, path.basename(opts.repo));

  let result: TaskResult;
  try {
    const r = await runDevin({
      cwd: wt.path,
      prompt,
      permissionMode: opts.permissionMode,
      timeoutMs: opts.timeoutMs,
      model: opts.model,
      exportPath: path.join(taskDir, 'session.atif.json'),
      logPath: path.join(taskDir, 'log.txt'),
      extraArgs: opts.extraArgs,
    });

    fs.writeFileSync(path.join(taskDir, 'output.md'), r.stdout);
    if (r.stderr) fs.appendFileSync(path.join(taskDir, 'log.txt'), `\n--- stderr ---\n${r.stderr}`);

    commitAll(wt.path, `squad(${task.id}): ${task.title}`);
    const diff = diffFromBase(opts.repo, wt.path, wt.baseRef);
    if (diff) fs.writeFileSync(path.join(taskDir, 'diff.patch'), diff);
    const changed = diff.length > 0;

    result = {
      task,
      status: r.timedOut ? 'timeout' : r.exitCode === 0 ? 'success' : 'failed',
      exitCode: r.exitCode,
      durationMs: Date.now() - start,
      branch: wt.branch,
      worktreePath: wt.path,
      changed,
      error: r.timedOut ? 'timed out' : r.exitCode !== 0 ? `exit code ${r.exitCode}` : undefined,
    };
  } catch (err) {
    result = {
      task,
      status: 'failed',
      exitCode: null,
      durationMs: Date.now() - start,
      branch: wt.branch,
      worktreePath: wt.path,
      changed: hasChanges(wt.path),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!result.changed && !opts.keepWorktrees) {
    removeWorktree(opts.repo, wt);
    result.worktreePath = undefined;
  }

  fs.writeFileSync(path.join(taskDir, 'meta.json'), JSON.stringify(result, null, 2));
  return result;
}
