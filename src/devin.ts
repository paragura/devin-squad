import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface DevinRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
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
}

export function runDevin(opts: DevinRunOptions): Promise<DevinRunResult> {
  const args: string[] = [
    '--permission-mode',
    opts.permissionMode,
    '--respect-workspace-trust',
    'false',
  ];
  if (opts.model) args.push('--model', opts.model);
  if (opts.exportPath) args.push('--export', opts.exportPath);
  args.push(...(opts.extraArgs ?? []));
  args.push('-p', '--', opts.prompt);

  return new Promise((resolve, reject) => {
    const child = spawn('devin', args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const log = opts.logPath ? fs.createWriteStream(opts.logPath, { flags: 'a' }) : null;
    log?.write(`$ devin ${args.map(a => (a.length > 200 ? a.slice(0, 200) + '…' : a)).join(' ')}\n\n`);

    child.stdout.on('data', (d: Buffer) => {
      stdoutChunks.push(d);
      log?.write(d);
    });
    child.stderr.on('data', (d: Buffer) => {
      stderrChunks.push(d);
      log?.write(d);
    });
    child.on('error', err => {
      log?.end();
      reject(err);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
    }, opts.timeoutMs);
    let timedOut = false;

    child.on('close', code => {
      clearTimeout(timer);
      log?.end();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code,
        timedOut,
      });
    });
  });
}
