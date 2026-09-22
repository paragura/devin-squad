import fs from 'node:fs';
import path from 'node:path';
import { runDevin } from './devin.js';
import {
  createWorktree,
  diffFromBase,
  commitAll,
  removeWorktree,
  headSha,
  inheritDependencies,
  type SquadWorktree,
} from './git.js';
import { inside } from './validation.js';
import type { Persona } from './persona.js';
import type { SquadOptions, SquadTask, TaskResult } from './types.js';

function buildWorkerPrompt(task: SquadTask, repoName: string, persona?: Persona): string {
  const personaBlock = persona
    ? [
        `# Persona`,
        ``,
        persona.prompt,
        ``,
        `Stay in character (${persona.emoji} ${persona.name}) for your final summary, but prioritize correctness over style.`,
        ``,
      ].join('\n')
    : '';
  return [
    personaBlock,
    `You are a worker on a Devin Squad team executing one task inside the "${repoName}" repository.`,
    `Your working directory is an isolated git worktree for task "${task.id}". Successful dependency changes are already present.`,
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
  runDir: string,
  runBase: string,
  dependencyCommits: string[] = [],
): Promise<TaskResult> {
  const start = Date.now();
  const taskDir = inside(runDir, task.id);
  const personaName = task.persona ?? opts.defaultPersona;
  const persona = personaName ? opts.personas?.get(personaName) : undefined;
  if (personaName && !persona) {
    console.log(`  ! ${task.id}: persona "${personaName}" not found, running without it`);
  }
  const prompt = buildWorkerPrompt(task, path.basename(opts.repo), persona);

  let result: TaskResult;
  let wt: SquadWorktree | undefined;
  let baseSha: string | undefined;
  try {
    fs.mkdirSync(taskDir, { recursive: true });
    wt = createWorktree(opts.repo, task.id, path.basename(runDir), runBase);
    inheritDependencies(wt.path, dependencyCommits);
    baseSha = headSha(wt.path);
    const r = await runDevin({
      cwd: wt.path,
      prompt,
      permissionMode: persona?.permissionMode ?? opts.permissionMode,
      timeoutMs: opts.timeoutMs,
      model: persona?.model ?? opts.model,
      exportPath: path.join(taskDir, 'session.atif.json'),
      logPath: path.join(taskDir, 'log.txt'),
      extraArgs: opts.extraArgs,
    });

    fs.writeFileSync(
      path.join(taskDir, 'output.md'),
      (r.truncated ? '> Output was truncated; see log.txt for the full transcript.\n\n' : '') +
        r.stdout,
    );

    commitAll(wt.path, `squad(${task.id}): ${task.title}`);
    const diff = diffFromBase(opts.repo, wt.path, baseSha);
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
      baseSha,
      headSha: headSha(wt.path),
      error: r.timedOut ? 'timed out' : r.exitCode !== 0 ? `exit code ${r.exitCode}` : undefined,
    };
  } catch (err) {
    result = {
      task,
      status: 'failed',
      exitCode: null,
      durationMs: Date.now() - start,
      branch: wt?.branch,
      worktreePath: wt?.path,
      // Keep failed worktrees even if status/diff inspection itself failed.
      changed: !!wt,
      baseSha,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (wt && !result.changed && !opts.keepWorktrees) {
    removeWorktree(opts.repo, wt);
    result.worktreePath = undefined;
    result.branch = undefined;
  }

  fs.writeFileSync(path.join(taskDir, 'meta.json'), JSON.stringify(result, null, 2));
  return result;
}
