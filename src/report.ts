import fs from 'node:fs';
import path from 'node:path';
import type { SquadTask, TaskResult } from './types.js';

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
}

export function writeReport(runDir: string, results: TaskResult[], goal?: string): string {
  const ok = results.filter(r => r.status === 'success');
  const lines: string[] = [
    `# Devin Squad Run`,
    ``,
    `- Date: ${new Date().toISOString()}`,
    goal ? `- Goal: ${goal}` : '',
    `- Tasks: ${results.length} — ✅ ${ok.length} succeeded, ${results.length - ok.length} failed/skipped`,
    ``,
    `| Task | Status | Duration | Changes | Branch |`,
    `| --- | --- | --- | --- | --- |`,
    ...results.map(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '➖' : '❌';
      return `| ${r.task.id} | ${icon} ${r.status} | ${fmtDur(r.durationMs)} | ${r.changed ? 'yes' : 'no'} | ${r.branch ?? '-'} |`;
    }),
    ``,
  ];
  for (const r of results) {
    lines.push(`## ${r.task.id} — ${r.task.title}`, ``);
    if (r.error) lines.push(`**Error:** ${r.error}`, ``);
    const outPath = path.join(runDir, r.task.id, 'output.md');
    if (fs.existsSync(outPath)) {
      const out = fs.readFileSync(outPath, 'utf8').trim();
      lines.push(out.length > 2000 ? out.slice(0, 2000) + '\n…(truncated)' : out, ``);
    }
  }
  const reportPath = path.join(runDir, 'report.md');
  fs.writeFileSync(reportPath, lines.filter(l => l !== '').join('\n'));
  return reportPath;
}

export function loadTasksFile(file: string): { goal?: string; tasks: SquadTask[] } {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tasks: SquadTask[] = Array.isArray(raw) ? raw : raw.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('no tasks in file');
  for (const t of tasks) {
    if (!t.id || !t.prompt) throw new Error(`task missing id/prompt: ${JSON.stringify(t)}`);
    t.dependsOn ??= [];
  }
  return { goal: Array.isArray(raw) ? undefined : raw.goal, tasks };
}
