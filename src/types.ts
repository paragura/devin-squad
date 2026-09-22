export interface SquadTask {
  id: string;
  title: string;
  prompt: string;
  dependsOn?: string[];
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

export interface SquadOptions {
  repo: string;
  concurrency: number;
  permissionMode: string;
  timeoutMs: number;
  model?: string;
  keepWorktrees: boolean;
  extraArgs: string[];
}
