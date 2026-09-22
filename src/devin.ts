import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQUAD_HOME } from './paths.js';

const exec = promisify(execFile);
const ISOLATED_DATA_HOME = path.join(SQUAD_HOME, 'devin-home');
const active = new Set<number>();
const MAX_OUTPUT = 2 * 1024 * 1024;
let ready = false;

export function devinEnv(): NodeJS.ProcessEnv {
  if (!ready) {
    const real = path.join(
      process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
      'devin',
    );
    const dir = path.join(ISOLATED_DATA_HOME, 'devin');
    fs.mkdirSync(path.join(dir, 'cli'), { recursive: true });
    for (const relative of ['credentials.toml', 'cli/trusted_workspaces.json']) {
      try {
        fs.symlinkSync(path.join(real, relative), path.join(dir, relative));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    ready = true;
  }
  return { ...process.env, XDG_DATA_HOME: ISOLATED_DATA_HOME };
}

function signalTree(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, signal);
  } catch {
    /* already exited */
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    for (const pid of active) signalTree(pid, 'SIGTERM');
    setTimeout(() => {
      for (const pid of active) signalTree(pid, 'SIGKILL');
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }, 1000);
  });
}

export async function sessionIds(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await exec('devin', ['list', '--format', 'json'], {
      cwd,
      env: devinEnv(),
      timeout: 10_000,
      maxBuffer: MAX_OUTPUT,
    });
    const raw = JSON.parse(stdout);
    return (Array.isArray(raw) ? raw : (raw.sessions ?? []))
      .map((s: { id?: string }) => s.id)
      .filter((id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id));
  } catch {
    return [];
  }
}

export interface DevinRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  sessionId?: string;
  truncated?: boolean;
}

export interface DevinRunOptions {
  cwd: string;
  prompt: string;
  permissionMode: string;
  timeoutMs: number;
  model?: string;
  exportPath?: string;
  logPath?: string;
  extraArgs?: string[];
  disposable?: boolean;
  captureSession?: boolean;
}

export async function runDevin(opts: DevinRunOptions): Promise<DevinRunResult> {
  const cwd = opts.disposable ? fs.mkdtempSync(path.join(opts.cwd, 'call-')) : opts.cwd;
  const capture = opts.captureSession || opts.disposable;
  const before = capture ? new Set(await sessionIds(cwd)) : new Set<string>();
  // Preserve squad's existing option names on the current Devin CLI.
  const aliases: Record<string, string> = {
    bypass: 'dangerous',
    normal: 'auto',
    autonomous: 'smart',
  };
  const args = [
    '--permission-mode',
    aliases[opts.permissionMode] ?? opts.permissionMode,
    '--respect-workspace-trust',
    'false',
  ];
  if (opts.model) args.push('--model', opts.model);
  if (opts.exportPath) args.push('--export', opts.exportPath);
  args.push(...(opts.extraArgs ?? []), '-p', '--', opts.prompt);

  const result = await new Promise<DevinRunResult>((resolve, reject) => {
    const child = spawn('devin', args, {
      cwd,
      env: devinEnv(),
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (child.pid) active.add(child.pid);
    let stdout: Buffer = Buffer.alloc(0),
      stderr: Buffer = Buffer.alloc(0),
      timedOut = false,
      truncated = false;
    let spawnError: Error | undefined, killTimer: NodeJS.Timeout | undefined;
    const log = opts.logPath ? fs.createWriteStream(opts.logPath, { flags: 'a' }) : undefined;
    log?.on('error', (err) => {
      spawnError = err;
      if (child.pid) signalTree(child.pid, 'SIGKILL');
    });
    log?.on('drain', () => {
      child.stdout.resume();
      child.stderr.resume();
    });
    const collect = (old: Buffer, chunk: Buffer): Buffer => {
      if (old.length + chunk.length > MAX_OUTPUT) truncated = true;
      return Buffer.concat([old, chunk]).subarray(-MAX_OUTPUT);
    };
    const write = (chunk: Buffer) => {
      if (log && !log.write(chunk)) {
        child.stdout.pause();
        child.stderr.pause();
      }
    };
    child.stdout.on('data', (d: Buffer) => {
      stdout = collect(stdout, d);
      write(d);
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr = collect(stderr, d);
      write(d);
    });
    child.on('error', (err) => {
      spawnError = err;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) signalTree(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => {
        if (child.pid) signalTree(child.pid, 'SIGKILL');
      }, 1000);
    }, opts.timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (child.pid) {
        signalTree(child.pid, 'SIGKILL');
        active.delete(child.pid);
      }
      const finish = () =>
        spawnError
          ? reject(spawnError)
          : resolve({
              stdout: stdout.toString('utf8'),
              stderr: stderr.toString('utf8'),
              exitCode: code,
              timedOut,
              truncated,
            });
      if (log && !log.destroyed) log.end(finish);
      else finish();
    });
  });

  if (capture) {
    const created = (await sessionIds(cwd)).filter((id) => !before.has(id));
    if (created.length === 1) result.sessionId = created[0];
    if (opts.disposable) {
      for (const id of created) {
        try {
          await exec('devin', ['rm', id, '--force'], { cwd, env: devinEnv(), timeout: 10_000 });
        } catch {
          /* never remove locks or unrelated sessions */
        }
      }
      try {
        fs.rmdirSync(cwd);
      } catch {
        /* retain any files left by the agent */
      }
    }
  }
  return result;
}
