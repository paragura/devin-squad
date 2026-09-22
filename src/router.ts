import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Persona } from './persona.js';
import { runDevin } from './devin.js';

/**
 * Router sessions are disposable (no resume needed) — delete them so they
 * don't pile up in Devin Desktop's session list. Fire-and-forget.
 */
function cleanRouterSessions(routerDir: string): void {
  execFile('devin', ['list', '--format', 'json'], { cwd: routerDir }, (e, out) => {
    if (e) return;
    try {
      const parsed = JSON.parse(out);
      const list: { id?: string; last_activity_at?: number }[] =
        Array.isArray(parsed) ? parsed : parsed.sessions ?? [];
      const cutoff = Date.now() / 1000 - 60;
      for (const s of list) {
        // skip sessions that may still be in flight (concurrent messages)
        if (s.id && (s.last_activity_at ?? 0) < cutoff) {
          execFile('devin', ['rm', s.id, '--force'], { cwd: routerDir }, () => {});
        }
      }
    } catch { /* cleanup is best-effort */ }
  });
}

/**
 * Lightweight router: one devin -p call decides which 0-2 personas should
 * respond to a chat message. Returns [] for noise / messages needing no reply.
 */
export async function pickResponders(
  personas: Persona[],
  author: string,
  text: string,
  lastSpeaker: string | undefined,
  opts: { model?: string; timeoutMs: number }
): Promise<Persona[]> {
  if (personas.length === 0) return [];
  const routerDir = path.join(os.homedir(), '.devin-squad', 'router');
  fs.mkdirSync(routerDir, { recursive: true });
  const roster = personas.map(p => `- ${p.name}: ${p.description}`).join('\n');
  const threadNote = lastSpeaker
    ? `\n直前に「${lastSpeaker}」が応答しています。会話の続きならそのペルソナを優先してください。`
    : '';
  const prompt = `You are a router for a team chat tool. Decide which personas should respond to the following message.

Persona roster:
${roster}
${threadNote}
Rules:
- Pick 0-2 personas whose role genuinely fits the message.
- Return [] for small talk between humans, noise, or messages needing no response.
- Reply with ONLY a JSON array of persona names, e.g. ["strict-reviewer"] or []

Message from ${author}: ${text.slice(0, 2000)}`;

  const r = await runDevin({
    cwd: routerDir,
    prompt,
    permissionMode: 'normal',
    timeoutMs: opts.timeoutMs,
    model: opts.model,
  });
  cleanRouterSessions(routerDir);
  if (r.exitCode !== 0) {
    console.error('[router] devin failed:', r.stderr.slice(0, 200));
    return [];
  }
  const m = r.stdout.match(/\[[\s\S]*?\]/);
  if (!m) {
    console.error('[router] no JSON in output:', r.stdout.slice(0, 200));
    return [];
  }
  let names: string[];
  try {
    names = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(names)) return [];
  return names
    .map(n => personas.find(p => p.name === n))
    .filter((p): p is Persona => p !== undefined);
}
