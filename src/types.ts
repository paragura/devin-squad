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
}
