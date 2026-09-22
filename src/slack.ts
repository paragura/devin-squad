import { App } from '@slack/bolt';
import fs from 'node:fs';
import path from 'node:path';
import { listPersonas, getPersona, Persona } from './persona.js';
import { personaSay } from './talk.js';
import { planTasks } from './planner.js';
import { runSquad } from './scheduler.js';
import { newRunDir } from './paths.js';
import { writeReport } from './report.js';
import { pickResponders } from './router.js';
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

function helpText(botMention: string): string {
  return `使い方:
- \`${botMention} personas\` — ペルソナ一覧
- \`${botMention} <persona> <msg>\` — そのペルソナと会話
- \`${botMention} plan <goal>\` — タスク分解だけする
- \`${botMention} run <goal>\` — 分解→並列実行→レポートまで全部
ambient モードではメンションなしの発言にも関係するペルソナが勝手に反応します`;
}

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

export function startSlack(opts: SlackOptions): void {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!botToken || !appToken) {
    throw new Error('SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-, socket mode) are required');
  }

  const app = new App({ token: botToken, appToken, socketMode: true });
  app.use(async ({ body, next }) => {
    const ev = (body as { event?: { type?: string; subtype?: string } }).event;
    console.log('[slack]', body.type, ev?.type ?? '', ev?.subtype ?? '');
    await next();
  });
  const personas = () => [...listPersonas(opts.repo).values()];
  /** channel → last persona that spoke (router hint for conversation continuity). */
  const lastSpeaker = new Map<string, string>();
  /** Own user id, needed so ambient mode can skip messages that mention the bot
   * (they already fire app_mention; handling both would double-respond). */
  let botUserId: string | undefined;

  /** Create a dedicated channel for a run; falls back to posting in-channel. */
  const makeRunChannel = async (goal: string): Promise<string | undefined> => {
    const slug = goal
      .toLowerCase()
      .replace(/[^a-z0-9一-龯ぁ-んァ-ヶ]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'run';
    try {
      const res = await app.client.conversations.create({
        name: `squad-${slug}`.slice(0, 80),
      });
      return res.channel?.id;
    } catch (err) {
      console.error('channel create failed (needs channels:manage):', err);
      return undefined;
    }
  };

  const runGoal = async (goal: string, channel: string) => {
    // Dedicated channel per run — progress goes there, fallback to origin channel.
    const runChannel = (await makeRunChannel(goal)) ?? channel;
    const sayChan = (t: string) =>
      app.client.chat.postMessage({ channel: runChannel, text: t }).then(() => {});
    if (runChannel !== channel) {
      await app.client.chat.postMessage({
        channel,
        text: `🐝 run を <#${runChannel}> で開始しました: ${goal}`,
      });
      await sayChan(`goal: ${goal}`);
    }
    await sayChan('📐 planning…');
    const tasks = await planTasks(goal, { cwd: opts.repo, model: opts.model, timeoutMs: opts.timeoutMs });
    await sayChan(tasks.map(t => `• \`${t.id}\` ${t.title}`).join('\n'));
    await sayChan(`🐝 run start (${tasks.length} tasks)`);
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
        if (line) void sayChan(line);
      },
    };
    const results = await runSquad(tasks, squadOpts, runDir);
    const report = writeReport(runDir, results, goal);
    const ok = results.filter(r => r.status === 'success');
    const kept = results.filter(r => r.changed).map(r => `\`${r.branch}\``).join(', ');
    await sayChan(`🏁 done: ${ok.length}/${results.length} succeeded${kept ? `\nbranches: ${kept}` : ''}\nreport: \`${report}\``);
  };

  app.event('app_mention', async ({ event, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    const sayChan = (t: string) => say({ text: t });
    const [head, ...restWords] = text.split(/\s+/);
    const rest = restWords.join(' ');
    const help = helpText(botUserId ? `<@${botUserId}>` : 'このボット');

    try {
      if (!text || head === 'help') return void (await sayChan(help));
      if (head === 'personas') {
        const list = personas().map(p => `${p.emoji} *${p.name}* — ${p.description}`).join('\n');
        return void (await sayChan(list || 'no personas'));
      }
      if (head === 'plan') {
        if (!rest) return void (await sayChan('goal が必要です'));
        await sayChan('📐 planning…');
        const tasks = await planTasks(rest, { cwd: opts.repo, model: opts.model, timeoutMs: opts.timeoutMs });
        return void (await sayChan(tasks.map(t => `• \`${t.id}\` ${t.title}`).join('\n')));
      }
      if (head === 'run') {
        if (!rest) return void (await sayChan('goal が必要です'));
        return void (await runGoal(rest, event.channel));
      }
      const persona = getPersona(head, opts.repo);
      if (persona && rest) {
        const reply = await personaSay(persona, rest, { timeoutMs: opts.timeoutMs });
        lastSpeaker.set(event.channel, persona.name);
        return void (await app.client.chat.postMessage({
          channel: event.channel,
          text: reply,
          ...slackIdentity(persona),
        }));
      }
      await sayChan(help);
    } catch (err) {
      await sayChan(`⚠️ error: ${err instanceof Error ? err.message : err}`);
    }
  });

  if (opts.ambient) {
    app.event('message', async ({ event, say }) => {
      const e = event as {
        bot_id?: string; subtype?: string; text?: string; user?: string;
        thread_ts?: string; ts: string; channel?: string;
      };
      const skip = e.bot_id ? 'bot' : e.subtype ? `subtype:${e.subtype}` :
        !e.text?.trim() ? 'empty' : !e.user ? 'no-user' : !e.channel ? 'no-channel' :
        botUserId && e.text.includes(`<@${botUserId}>`) ? 'self-mention' : null;
      if (skip) {
        console.log('[ambient] skip:', skip, JSON.stringify(e.text ?? '').slice(0, 80));
        return;
      }
      const channel = e.channel!;
      const text = e.text!;
      const user = e.user!;
      try {
        const selected = await pickResponders(
          personas(),
          user,
          text,
          lastSpeaker.get(channel),
          { model: opts.routerModel, timeoutMs: opts.timeoutMs }
        );
        for (const persona of selected) {
          const reply = await personaSay(
            persona,
            `<@${user}> said: ${text}`,
            { timeoutMs: opts.timeoutMs }
          );
          lastSpeaker.set(channel, persona.name);
          await app.client.chat.postMessage({
            channel,
            text: reply,
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
