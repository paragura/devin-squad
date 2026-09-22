export interface SquadTask {
  id: string;
  title: string;
  prompt: string;
  dependsOn?: string[];
  /** Persona name to run this task as (see personas/ dirs). */
  persona?: string;
}

export interface TasksFile {
  goal?: string;
  tasks: SquadTask[];
}

export type TaskStatus = 'success' | 'failed' | 'skipped' | 'timeout';

export interface TaskResult {
  task: SquadTask;
  status: TaskStatus;
  exitCode: number | null;
  durationMs: number;
  branch?: string;
  worktreePath?: string;
  changed: boolean;
  error?: string;
  /** Immutable result and task-specific diff base, including inherited dependencies. */
  headSha?: string;
  baseSha?: string;
}

import type { Persona } from './persona.js';

export interface SquadOptions {
  repo: string;
  concurrency: number;
  permissionMode: string;
  timeoutMs: number;
  model?: string;
  keepWorktrees: boolean;
  extraArgs: string[];
  /** Loaded personas keyed by name (global + project dirs). */
  personas?: Map<string, Persona>;
  /** Default persona for tasks without one. */
  defaultPersona?: string;
  /** Optional progress sink (web UI / integrations). */
  onEvent?: (e: SquadEvent) => void;
}

export type SquadEvent =
  | { type: 'task-start'; taskId: string; title: string }
  | {
      type: 'task-done';
      taskId: string;
      status: TaskStatus;
      durationMs: number;
      changed: boolean;
      error?: string;
    }
  | { type: 'task-skip'; taskId: string; reason: string }
  | { type: 'heartbeat'; running: { id: string; elapsedMs: number }[] }
  | { type: 'run-error'; error: string }
  | { type: 'run-done'; results: TaskResult[] };
