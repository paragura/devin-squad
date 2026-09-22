import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runDevin, DevinRunResult, cleanSessions } from './devin.js';
import type { Persona } from './persona.js';

const execFileAsync = promisify(execFile);

const LOCK_RETRY = /database is locked/i;

async function runDevinRetry(opts: Parameters<typeof runDevin>[0], retries = 3): Promise<DevinRunResult> {
  let last = await runDevin(opts);
  for (let i = 0; i < retries && last.exitCode !== 0; i++) {
    if (!LOCK_RETRY.test(last.stderr + last.stdout)) break;
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    last = await runDevin(opts);
  }
  return last;
}

function chatDir(persona: Persona): string {
  const dir = path.join(os.homedir(), '.devin-squad', 'chat', persona.name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readSessionId(dir: string): string | null {
  const f = path.join(dir, '.session-id');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() || null : null;
}

async function latestSessionId(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('devin', ['list', '--format', 'json'], { cwd: dir });
    const sessions = JSON.parse(stdout) as { id?: string; short_id?: string }[];
    return sessions[0]?.id ?? sessions[0]?.short_id ?? null;
  } catch {
    return null;
  }
}

export async function personaSay(
  persona: Persona,
  message: string,
  opts: { timeoutMs: number }
): Promise<string> {
  const dir = chatDir(persona);
  const sessionId = readSessionId(dir);
  const firstTurn = sessionId === null;
  const prompt = firstTurn ? `${persona.prompt}\n\n---\n\n${message}` : message;

  const args: Parameters<typeof runDevin>[0] = {
    cwd: dir,
    prompt,
    permissionMode: persona.permissionMode ?? 'accept-edits',
    timeoutMs: opts.timeoutMs,
    model: persona.model,
    extraArgs: sessionId ? ['-r', sessionId] : [],
  };
  const r = await runDevinRetry(args);
  if (r.exitCode !== 0) {
    throw new Error(`devin exited ${r.exitCode}: ${(r.stderr || r.stdout).slice(0, 400)}`);
  }
  if (firstTurn) {
    const id = await latestSessionId(dir);
    if (id) fs.writeFileSync(path.join(dir, '.session-id'), id);
  }
  return r.stdout.trim();
}

/**
 * Disposable persona call: persona prompt + recent channel context inline,
 * no session resume. The channel log is the memory — sessions get cleaned
 * up so they don't pile up in Devin Desktop.
 */
export async function personaSayOnce(
  persona: Persona,
  message: string,
  context: string[],
  opts: { timeoutMs: number; model?: string }
): Promise<string> {
  const dir = path.join(os.homedir(), '.devin-squad', 'ambient', persona.name);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = context.length ? `\n\n会話の流れ（直近）:\n${context.join('\n')}` : '';
  const r = await runDevinRetry({
    cwd: dir,
    prompt: `${persona.prompt}${ctx}\n\n---\n\n${message}`,
    permissionMode: persona.permissionMode ?? 'accept-edits',
    timeoutMs: opts.timeoutMs,
    model: persona.model ?? opts.model,
  });
  cleanSessions(dir);
  if (r.exitCode !== 0) {
    throw new Error(`devin exited ${r.exitCode}: ${(r.stderr || r.stdout).slice(0, 400)}`);
  }
  return r.stdout.trim();
}

export async function talkRepl(persona: Persona, opts: { timeoutMs: number }): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => new Promise<string>(res => rl.question('you> ', res));
  console.log(`${persona.emoji} ${persona.name} — chat session (Ctrl+C to exit)`);
  for (;;) {
    const line = (await ask()).trim();
    if (!line || line === 'exit' || line === 'quit') break;
    process.stdout.write(`${persona.emoji} thinking…\r`);
    try {
      const reply = await personaSay(persona, line, opts);
      process.stdout.write(' '.repeat(30) + '\r');
      console.log(`${persona.emoji} ${persona.name}> ${reply}\n`);
    } catch (err) {
      console.log(`✗ error: ${err instanceof Error ? err.message : err}\n`);
    }
  }
  rl.close();
}
