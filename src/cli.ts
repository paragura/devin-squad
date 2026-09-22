#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertGitRepo, mergeBranch, currentBranch } from './git.js';
import { newRunDir, latestRunDir } from './paths.js';
import { runSquad } from './scheduler.js';
import { planTasks } from './planner.js';
import { loadTasksFile, writeReport } from './report.js';
import type { SquadOptions, TaskResult } from './types.js';

const USAGE = `devin-squad — run a team of parallel Devin CLI workers in git worktrees

Usage:
  devin-squad run   --tasks tasks.json [options]   Execute a task list in parallel
  devin-squad plan  --goal "..."       [options]   Have a planner Devin write tasks.json
  devin-squad merge [--run <dir|latest>]           Merge successful squad/* branches

Options:
  --repo <path>          Target git repo (default: cwd)
  --concurrency <n>      Max parallel workers (default: 3)
  --mode <mode>          devin permission mode (default: bypass; use autonomous with --sandbox)
  --sandbox              Pass --sandbox to devin (forces autonomous mode)
  --timeout <minutes>    Per-worker timeout (default: 30)
  --model <name>         Model for workers (e.g. opus)
  --keep-worktrees       Keep worktrees even when a task made no changes
  --out <file>           (plan) Output file (default: tasks.json)
  --dry-run              Print resolved plan without spawning devin
  --                     Extra args after -- are passed to each devin call

tasks.json shape: {"goal":"…","tasks":[{"id":"a","title":"…","prompt":"…","dependsOn":[]}]}
`;

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string | boolean> } {
  const [cmd = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const extraIdx = rest.indexOf('--');
  const args = extraIdx >= 0 ? rest.slice(0, extraIdx) : rest;
  if (extraIdx >= 0) flags._extra = rest.slice(extraIdx + 1).join(' ');
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) flags[k] = v;
    else if (args[i + 1] && !args[i + 1].startsWith('--')) flags[k] = args[++i];
    else flags[k] = true;
  }
  return { cmd, flags };
}

function resolveOptions(flags: Record<string, string | boolean>): SquadOptions {
  const repo = path.resolve(String(flags.repo ?? process.cwd()));
  assertGitRepo(repo);
  const sandbox = flags.sandbox === true;
  return {
    repo,
    concurrency: Number(flags.concurrency ?? 3),
    permissionMode: sandbox ? 'autonomous' : String(flags.mode ?? 'bypass'),
    timeoutMs: Number(flags.timeout ?? 30) * 60_000,
    model: flags.model ? String(flags.model) : undefined,
    keepWorktrees: flags['keep-worktrees'] === true,
    extraArgs: [
      ...(sandbox ? ['--sandbox'] : []),
      ...(flags._extra ? String(flags._extra).split(' ').filter(Boolean) : []),
    ],
  };
}

function checkDevin(): void {
  try {
    execFileSync('devin', ['version'], { stdio: 'pipe' });
  } catch {
    console.error('error: `devin` CLI not found on PATH');
    process.exit(1);
  }
}

async function cmdRun(flags: Record<string, string | boolean>): Promise<void> {
  const opts = resolveOptions(flags);
  const tasksFile = String(flags.tasks ?? '');
  if (!tasksFile) throw new Error('run requires --tasks <file>');
  const { goal, tasks } = loadTasksFile(path.resolve(tasksFile));

  console.log(`devin-squad: ${tasks.length} task(s), concurrency ${opts.concurrency}, mode ${opts.permissionMode}`);
  console.log(`repo: ${opts.repo} (branch ${currentBranch(opts.repo)})`);
  if (flags['dry-run']) {
    for (const t of tasks) {
      console.log(`  - ${t.id}: ${t.title}${t.dependsOn?.length ? ` (after ${t.dependsOn.join(', ')})` : ''}`);
    }
    return;
  }

  const runDir = newRunDir(opts.repo);
  fs.writeFileSync(path.join(runDir, 'tasks.json'), JSON.stringify({ goal, tasks }, null, 2));
  console.log(`run dir: ${runDir}\n`);

  const results = await runSquad(tasks, opts, runDir);
  const report = writeReport(runDir, results, goal);
  const ok = results.filter((r: TaskResult) => r.status === 'success').length;
  console.log(`\n${ok}/${results.length} succeeded — report: ${report}`);
  const changed = results.filter(r => r.changed);
  if (changed.length > 0) {
    console.log(`branches kept: ${changed.map(r => r.branch).join(', ')}`);
    console.log(`review & integrate: devin-squad merge --run ${runDir}`);
  }
  if (ok < results.length) process.exitCode = 1;
}

async function cmdPlan(flags: Record<string, string | boolean>): Promise<void> {
  const opts = resolveOptions(flags);
  const goal = flags.goal ? String(flags.goal) : flags.file ? fs.readFileSync(String(flags.file), 'utf8') : '';
  if (!goal.trim()) throw new Error('plan requires --goal "..." or --file <file>');
  console.log('planning… (a devin worker is decomposing the goal)');
  const tasks = await planTasks(goal, {
    cwd: opts.repo,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
  });
  const out = path.resolve(String(flags.out ?? 'tasks.json'));
  fs.writeFileSync(out, JSON.stringify({ goal, tasks }, null, 2) + '\n');
  console.log(`wrote ${tasks.length} task(s) → ${out}`);
  for (const t of tasks) console.log(`  - ${t.id}: ${t.title}`);
  console.log(`\nnext: devin-squad run --tasks ${out}`);
}

async function cmdMerge(flags: Record<string, string | boolean>): Promise<void> {
  const opts = resolveOptions(flags);
  const runDir =
    flags.run && flags.run !== 'latest'
      ? path.resolve(String(flags.run))
      : latestRunDir(opts.repo);
  if (!runDir) throw new Error('no runs found');
  const metas = fs
    .readdirSync(runDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      try {
        return JSON.parse(fs.readFileSync(path.join(runDir!, d.name, 'meta.json'), 'utf8')) as TaskResult;
      } catch {
        return null;
      }
    })
    .filter((m): m is TaskResult => m !== null && m.status === 'success' && !!m.branch);
  if (metas.length === 0) {
    console.log('no successful branches to merge');
    return;
  }
  console.log(`merging ${metas.length} branch(es) into ${currentBranch(opts.repo)}:`);
  let failed = 0;
  for (const m of metas) {
    const r = mergeBranch(opts.repo, m.branch!);
    console.log(`  ${r.ok ? '✓' : '✗'} ${m.branch}${r.ok ? '' : ` — CONFLICT/error`}`);
    if (!r.ok) {
      failed++;
      console.log(`    resolve manually, then re-run merge for the rest`);
      break;
    }
  }
  if (failed > 0) process.exitCode = 1;
}

const { cmd, flags } = parseArgs(process.argv.slice(2));
if (cmd === 'help' || flags.help) {
  console.log(USAGE);
  process.exit(0);
}
checkDevin();
try {
  if (cmd === 'run') await cmdRun(flags);
  else if (cmd === 'plan') await cmdPlan(flags);
  else if (cmd === 'merge') await cmdMerge(flags);
  else {
    console.error(`unknown command: ${cmd}\n\n${USAGE}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
