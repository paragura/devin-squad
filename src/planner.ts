import { runDevin } from './devin.js';
import type { SquadTask } from './types.js';
import { validateTasks } from './validation.js';

const PLANNER_PROMPT = (
  goal: string,
) => `You are the planner for a Devin Squad — a team of parallel Devin CLI workers.

Decompose the following goal into independent tasks that can run in parallel in separate git worktrees of this repository.

${goal}

Rules for the task list:
- 2 to 6 tasks. Each must be self-contained: a worker sees only its own prompt, so include all needed context (file paths, conventions, expected output).
- Prefer tasks touching disjoint files to avoid merge conflicts.
- Use "dependsOn" only when a task truly needs another's output.
- Each task prompt should tell the worker exactly what to build or change and how to verify it.

Output ONLY a JSON array — no prose, no code fences — with this shape:
[{"id":"short-kebab-id","title":"one line","prompt":"full self-contained instructions","dependsOn":[]}]`;

export async function planTasks(
  goal: string,
  opts: { cwd: string; model?: string; timeoutMs: number },
): Promise<SquadTask[]> {
  const r = await runDevin({
    cwd: opts.cwd,
    prompt: PLANNER_PROMPT(goal),
    permissionMode: 'accept-edits',
    timeoutMs: opts.timeoutMs,
    model: opts.model,
  });

  if (r.truncated) throw new Error('planner output exceeded 2 MiB');
  if (r.timedOut || r.exitCode !== 0) {
    throw new Error(`planner devin exited ${r.exitCode}: ${r.stderr.slice(0, 500)}`);
  }

  const text = r.stdout.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  const parsed = JSON.parse(candidate) as SquadTask[];
  return validateTasks(parsed);
}
