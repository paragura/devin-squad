import { App } from '@slack/bolt';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listPersonas, getPersona, Persona } from './persona.js';
import { personaSay } from './talk.js';
import { planTasks } from './planner.js';
import { runSquad } from './scheduler.js';
import { newRunDir } from './paths.js';
import { writeReport } from './report.js';
import { runDevin } from './devin.js';
import type { SquadOptions, SquadTask } from './types.js';

export interface SlackOptions {
  repo: string;
  concurrency: number;
  permissionMode: string;
  timeoutMs: number;
  model?: string;
  routerModel?: string;
  extraArgs: string[];
  /** Ambient mode: personas self-select into channel messages (no mention needed). */
  ambient: boolean;
}

const HELP = `使い方:
- \`@squad personas\` — ペルソナ一覧
- \`@squad <persona> <msg>\` — そのペルソナと会話
- \`@squad plan <goal>\` — タスク分解だけする
- \`@squad run <goal>\` — 分解→並列実行→レポートまで全部
ambient モードではメンションなしの発言にも関係するペルソナが勝手に反応します`;

// Slack's Authorship type makes icon_emoji and icon_url mutually exclusive,
// so the identity is a union where exactly one icon key is present.
type SlackIdentity =
  | { username?: string; icon_emoji: string; icon_url?: never }
  | { username?: string; icon_url: string; icon_emoji?: never }
  | { username?: string };

function slackIdentity(persona: Persona): SlackIdentity {
  const username = persona.slackName ?? `${persona.emoji} ${persona.name}`;
  if (persona.icon?.startsWith('http')) return { username, icon_url: persona.icon };
  if (persona.icon?.startsWith(':')) return { username, icon_emoji: persona.icon };
  return { username };
}

async function pickResponders(
  personas: Persona[],
  author: string,
  text: string,
  threadPersona: string | undefined,
  opts: { model?: string; timeoutMs: number }
): Promise<Persona[]> {
  if (personas.length === 0) return [];
  const routerDir = path.join(os.homedir(), '.devin-squad', 'router');
  fs.mkdirSync(routerDir, { recursive: true });
  const roster = personas.map(p => `- ${p.name}: ${p.description}`).join('\n');
  const threadNote = threadPersona
    ? `\nこのメッセージは「${threadPersona}」が応答してきたスレッド内の発言です。`
    : '';
  const prompt = `You are a router for a team chat tool. Decide which personas should respond to the following Slack message.

Persona roster:
${roster}
${threadNote}
Rules:
- Pick 0-2 personas whose role genuinely fits the message.
- Return [] for small talk between humans, noise, or messages needing no response.
- If the message continues a persona's thread, prefer that persona.
- Reply with ONLY a JSON array of persona names, e.g. ["strict-reviewer"] or []

Message from ${author}: ${text.slice(0, 2000)}`;

  const r = await runDevin({
    cwd: routerDir,
    prompt,
    permissionMode: 'normal',
    timeoutMs: opts.timeoutMs,
    model: opts.model,
  });
  if (r.exitCode !== 0) return [];
  const m = r.stdout.match(/\[[\s\S]*?\]/);
  if (!m) return [];
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

export function startSlack(opts: SlackOptions): void {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!botToken || !appToken) {
    throw new Error('SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-, socket mode) are required');
  }

  const app = new App({ token: botToken, appToken, socketMode: true });
  const personas = () => [...listPersonas(opts.repo).values()];
  /** thread_ts → last persona that spoke there (router hint). */
  const threadPersona = new Map<string, string>();
  /** Own user id, needed so ambient mode can skip messages that mention the bot
   * (they already fire app_mention; handling both would double-respond). */
  let botUserId: string | undefined;

  const runGoal = async (goal: string, sayThread: (text: string) => Promise<unknown>) => {
    await sayThread('📐 planning…');
    const tasks = await planTasks(goal, { cwd: opts.repo, model: opts.model, timeoutMs: opts.timeoutMs });
    await sayThread(tasks.map(t => `• \`${t.id}\` ${t.title}`).join('\n'));
    await sayThread(`🐝 run start (${tasks.length} tasks)`);
    const runDir = newRunDir(opts.repo);
    fs.writeFileSync(path.join(runDir, 'tasks.json'), JSON.stringify({ goal, tasks }, null, 2));
    const byTask = new Map(tasks.map(t => [t.id, t]));
    const squadOpts: SquadOptions = {
      repo: opts.repo,
      concurrency: opts.concurrency,
      permissionMode: opts.permissionMode,
      timeoutMs: opts.timeoutMs,
      model: opts.model,
      keepWorktrees: false,
      extraArgs: opts.extraArgs,
      personas: new Map(personas().map(p => [p.name, p])),
      onEvent: ev => {
        const personaName = 'taskId' in ev ? byTask.get(ev.taskId)?.persona : undefined;
        const persona = personaName ? getPersona(personaName, opts.repo) : undefined;
        const who = persona ? `${persona.emoji} *${persona.name}* ` : '';
        const line =
          ev.type === 'task-start' ? `▶️ ${who}${ev.taskId} started` :
          ev.type === 'task-done' ? `${ev.status === 'success' ? '✅' : '❌'} ${who}${ev.taskId} ${ev.status} (${Math.round(ev.durationMs / 1000)}s)${ev.changed ? ' · changes' : ''}` :
          ev.type === 'task-skip' ? `➖ ${ev.taskId} skipped` : null;
        if (line) void sayThread(line);
      },
    };
    const results = await runSquad(tasks, squadOpts, runDir);
    const report = writeReport(runDir, results, goal);
    const ok = results.filter(r => r.status === 'success');
    const kept = results.filter(r => r.changed).map(r => `\`${r.branch}\``).join(', ');
    await sayThread(`🏁 done: ${ok.length}/${results.length} succeeded${kept ? `\nbranches: ${kept}` : ''}\nreport: \`${report}\``);
  };

  app.event('app_mention', async ({ event, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    const threadTs = event.ts;
    const sayThread = (t: string) => say({ text: t, thread_ts: threadTs });
    const [head, ...restWords] = text.split(/\s+/);
    const rest = restWords.join(' ');

    try {
      if (!text || head === 'help') return void (await sayThread(HELP));
      if (head === 'personas') {
        const list = personas().map(p => `${p.emoji} *${p.name}* — ${p.description}`).join('\n');
        return void (await sayThread(list || 'no personas'));
      }
      if (head === 'plan') {
        if (!rest) return void (await sayThread('goal が必要です'));
        await sayThread('📐 planning…');
        const tasks = await planTasks(rest, { cwd: opts.repo, model: opts.model, timeoutMs: opts.timeoutMs });
        return void (await sayThread(tasks.map(t => `• \`${t.id}\` ${t.title}`).join('\n')));
      }
      if (head === 'run') {
        if (!rest) return void (await sayThread('goal が必要です'));
        return void (await runGoal(rest, sayThread));
      }
      const persona = getPersona(head, opts.repo);
      if (persona && rest) {
        const reply = await personaSay(persona, rest, { timeoutMs: opts.timeoutMs });
        threadPersona.set(threadTs, persona.name);
        return void (await app.client.chat.postMessage({
          channel: event.channel,
          text: reply,
          thread_ts: threadTs,
          ...slackIdentity(persona),
        }));
      }
      await sayThread(HELP);
    } catch (err) {
      await sayThread(`⚠️ error: ${err instanceof Error ? err.message : err}`);
    }
  });

  if (opts.ambient) {
    app.event('message', async ({ event, say }) => {
      const e = event as {
        bot_id?: string; subtype?: string; text?: string; user?: string;
        thread_ts?: string; ts: string; channel?: string;
      };
      if (e.bot_id || e.subtype || !e.text?.trim() || !e.user) return;
      if (botUserId && e.text.includes(`<@${botUserId}>`)) return;
      try {
        const selected = await pickResponders(
          personas(),
          e.user,
          e.text,
          e.thread_ts ? threadPersona.get(e.thread_ts) : undefined,
          { model: opts.routerModel, timeoutMs: opts.timeoutMs }
        );
        for (const persona of selected) {
          const reply = await personaSay(
            persona,
            `<@${e.user}> said: ${e.text}`,
            { timeoutMs: opts.timeoutMs }
          );
          const ts = e.thread_ts ?? e.ts;
          threadPersona.set(ts, persona.name);
          await app.client.chat.postMessage({
            channel: e.channel!,
            text: reply,
            thread_ts: ts,
            ...slackIdentity(persona),
          });
        }
      } catch (err) {
        console.error('ambient routing error:', err);
      }
    });
  }

  void (async () => {
    try {
      botUserId = (await app.client.auth.test()).user_id as string | undefined;
    } catch {
      // ambient dedup degrades gracefully without it
    }
    await app.start();
    console.log(`devin-squad slack bot connected (repo: ${opts.repo}, ambient: ${opts.ambient})`);
  })();
}
