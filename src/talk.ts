import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { runDevin, DevinRunResult, sessionIds } from './devin.js';
import type { Persona } from './persona.js';
import { SQUAD_HOME, repoFingerprint } from './paths.js';
import { serial } from './coordination.js';
import { createHash } from 'node:crypto';

const LOCK_RETRY = /database is locked/i;

async function runDevinRetry(
  opts: Parameters<typeof runDevin>[0],
  retries = 3,
): Promise<DevinRunResult> {
  let last = await runDevin(opts);
  for (let i = 0; i < retries && last.exitCode !== 0; i++) {
    if (!LOCK_RETRY.test(last.stderr + last.stdout)) break;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    last = await runDevin(opts);
  }
  return last;
}

function chatDir(persona: Persona, repo: string): string {
  const key = createHash('sha256').update(persona.name).digest('hex').slice(0, 20);
  const dir = path.join(SQUAD_HOME, 'chat', repoFingerprint(repo), key);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readSessionId(dir: string): string | null {
  const f = path.join(dir, '.session-id');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() || null : null;
}

export async function personaSay(
  persona: Persona,
  message: string,
  opts: { timeoutMs: number; repo?: string },
): Promise<string> {
  const dir = chatDir(persona, opts.repo ?? process.cwd());
  return serial(`session:${dir}`, async () => {
    const saved = readSessionId(dir);
    const sessionId = saved && (await sessionIds(dir)).includes(saved) ? saved : null;
    const firstTurn = sessionId === null;
    const prompt = firstTurn ? `${persona.prompt}\n\n---\n\n${message}` : message;

    const args: Parameters<typeof runDevin>[0] = {
      cwd: dir,
      prompt,
      permissionMode: persona.permissionMode ?? 'accept-edits',
      timeoutMs: opts.timeoutMs,
      model: persona.model,
      captureSession: firstTurn,
      extraArgs: sessionId ? ['-r', sessionId] : [],
    };
    const r = await runDevinRetry(args);
    if (r.timedOut || r.exitCode !== 0) {
      throw new Error(`devin exited ${r.exitCode}: ${(r.stderr || r.stdout).slice(0, 400)}`);
    }
    if (firstTurn) {
      const id = r.sessionId;
      if (id) fs.writeFileSync(path.join(dir, '.session-id'), id);
    }
    return r.stdout.trim();
  });
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
  opts: { timeoutMs: number; model?: string },
): Promise<string> {
  const dir = path.join(SQUAD_HOME, 'ambient');
  fs.mkdirSync(dir, { recursive: true });
  const ctx = context.length ? `\n\n会話の流れ（直近）:\n${context.join('\n')}` : '';
  const r = await runDevinRetry({
    cwd: dir,
    prompt: `${persona.prompt}${ctx}\n\n---\n\n${message}`,
    permissionMode: persona.permissionMode ?? 'accept-edits',
    timeoutMs: opts.timeoutMs,
    model: persona.model ?? opts.model,
    disposable: true,
  });
  if (r.timedOut || r.exitCode !== 0) {
    throw new Error(`devin exited ${r.exitCode}: ${(r.stderr || r.stdout).slice(0, 400)}`);
  }
  return r.stdout.trim();
}

export async function talkRepl(
  persona: Persona,
  opts: { timeoutMs: number; repo?: string },
): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => new Promise<string>((res) => rl.question('you> ', res));
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
