import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Persona } from './persona.js';
import { runDevin, cleanSessions } from './devin.js';

/**
 * Lightweight router: one devin -p call decides which 0-2 personas should
 * respond to a chat message. Returns [] for noise / messages needing no reply.
 * `context` is the recent "name: text" channel log for continuity.
 */
export async function pickResponders(
  personas: Persona[],
  author: string,
  text: string,
  context: string[],
  opts: { model?: string; timeoutMs: number }
): Promise<Persona[]> {
  if (personas.length === 0) return [];
  const routerDir = path.join(os.homedir(), '.devin-squad', 'router');
  fs.mkdirSync(routerDir, { recursive: true });
  const roster = personas.map(p => `- ${p.name}: ${p.description}`).join('\n');
  const history = context.length
    ? `\nRecent conversation:\n${context.join('\n')}\n`
    : '';
  const prompt = `You are a router for a team chat tool. Decide which personas should respond to the LAST message below.

Persona roster:
${roster}
${history}
Rules:
- Pick 0-2 personas whose role genuinely fits the message.
- Return [] for small talk between humans, noise, or messages needing no response.
- If the message continues a persona's reply in the recent conversation, prefer that persona.
- Reply with ONLY a JSON array of persona names, e.g. ["strict-reviewer"] or []

Message from ${author}: ${text.slice(0, 2000)}`;

  const r = await runDevin({
    cwd: routerDir,
    prompt,
    permissionMode: 'normal',
    timeoutMs: opts.timeoutMs,
    model: opts.model,
  });
  cleanSessions(routerDir);
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
