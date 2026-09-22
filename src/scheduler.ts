import { runTask } from './worker.js';
import type { SquadOptions, SquadTask, TaskResult } from './types.js';

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
}

export async function runSquad(
  tasks: SquadTask[],
  opts: SquadOptions,
  runDir: string
): Promise<TaskResult[]> {
  const results = new Map<string, TaskResult>();
  const running = new Map<string, { startedAt: number; promise: Promise<void> }>();
  const queue = [...tasks];

  const emit = opts.onEvent ?? (() => {});
  const heartbeat = setInterval(() => {
    if (running.size === 0) return;
    const line = [...running.entries()]
      .map(([id, r]) => `${id} (${fmtDur(Date.now() - r.startedAt)})`)
      .join(', ');
    console.log(`  … running: ${line}`);
    emit({
      type: 'heartbeat',
      running: [...running.entries()].map(([id, r]) => ({ id, elapsedMs: Date.now() - r.startedAt })),
    });
  }, 30_000);

  const depState = (t: SquadTask): 'ready' | 'blocked' | 'dead' => {
    for (const dep of t.dependsOn ?? []) {
      const r = results.get(dep);
      if (!r) return 'blocked';
      if (r.status !== 'success') return 'dead';
    }
    return 'ready';
  };

  try {
    while (queue.length > 0 || running.size > 0) {
      let launched = false;
      for (let i = 0; i < queue.length && running.size < opts.concurrency; ) {
        const task = queue[i];
        const state = depState(task);
        if (state === 'dead') {
          queue.splice(i, 1);
          const r: TaskResult = {
            task,
            status: 'skipped',
            exitCode: null,
            durationMs: 0,
            changed: false,
            error: `dependency failed: ${(task.dependsOn ?? []).join(', ')}`,
          };
          results.set(task.id, r);
          console.log(`[–] ${task.id} skipped (dependency failed)`);
          emit({ type: 'task-skip', taskId: task.id, reason: 'dependency failed' });
          continue;
        }
        if (state === 'blocked') {
          i++;
          continue;
        }
        queue.splice(i, 1);
        launched = true;
        console.log(`[+] ${task.id} started — ${task.title}`);
        emit({ type: 'task-start', taskId: task.id, title: task.title });
        const startedAt = Date.now();
        const promise = runTask(task, opts, runDir).then(r => {
          results.set(task.id, r);
          running.delete(task.id);
          const mark = r.status === 'success' ? '✓' : '✗';
          const extra = r.changed ? ' changes kept' : ' no changes';
          console.log(`[${mark}] ${task.id} ${r.status} in ${fmtDur(r.durationMs)}${extra}${r.error ? ` — ${r.error}` : ''}`);
          emit({ type: 'task-done', taskId: task.id, status: r.status, durationMs: r.durationMs, changed: r.changed, error: r.error });
        });
        running.set(task.id, { startedAt, promise });
      }

      if (running.size === 0) {
        if (queue.length > 0 && !launched) {
          for (const task of queue.splice(0)) {
            const r: TaskResult = {
              task,
              status: 'skipped',
              exitCode: null,
              durationMs: 0,
              changed: false,
              error: 'unresolvable dependencies',
            };
            results.set(task.id, r);
            console.log(`[–] ${task.id} skipped (unresolvable deps)`);
            emit({ type: 'task-skip', taskId: task.id, reason: 'unresolvable dependencies' });
          }
        }
        break;
      }
      await Promise.race([...running.values()].map(r => r.promise));
    }
  } finally {
    clearInterval(heartbeat);
  }

  const ordered = tasks.map(t => results.get(t.id)!);
  emit({ type: 'run-done', results: ordered });
  return ordered;
}
