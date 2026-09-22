import { App } from '@slack/bolt';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listPersonas, getPersona, Persona } from './persona.js';
import { personaSayOnce } from './talk.js';
import { appendMessage } from './store.js';
import { planTasks } from './planner.js';
import { runSquad } from './scheduler.js';
import { newRunDir } from './paths.js';
import { writeReport } from './report.js';
import { converse } from './conversation.js';
import { serial, claimSlackEvent, claimProcess } from './coordination.js';
import type { SquadOptions } from './types.js';

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
- \`${botMention} status\` — このチャンネルの run の状態
ambient モードではメンションなしの発言にも関係するペルソナが勝手に反応します`;
}

type SlackRunPhase = 'starting' | 'planning' | 'running' | 'done' | 'failed';
interface SlackRunState {
  goal: string;
  originChannel: string;
  runChannel: string;
  phase: SlackRunPhase;
  startedAt: number;
  updatedAt: number;
  completed: number;
  total?: number;
  runDir?: string;
  error?: string;
}

const phaseLabel: Record<SlackRunPhase, string> = {
  starting: '開始準備中',
  planning: '計画を作成中',
  running: 'タスクを実行中',
  done: '完了',
  failed: '失敗',
};

export function formatSlackRunStatus(state: SlackRunState, now = Date.now()): string {
  const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  const duration = elapsed < 60 ? `${elapsed}秒` : `${Math.floor(elapsed / 60)}分${elapsed % 60}秒`;
  const tasks = state.total === undefined ? '' : ` · ${state.completed}/${state.total}タスク`;
  const error = state.error ? `\n⚠️ ${state.error}` : '';
  return `現在: *${phaseLabel[state.phase]}* · 経過 ${duration}${tasks}${error}`;
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

export async function startSlack(opts: SlackOptions): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!botToken || !appToken) {
    throw new Error(
      'SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-, socket mode) are required',
    );
  }

  const lease = claimProcess(
    `slack:${crypto.createHash('sha256').update(appToken).digest('hex')}`,
    {
      repo: opts.repo,
    },
  );
  const app = new App({ token: botToken, appToken, socketMode: true });
  const runsByChannel = new Map<string, SlackRunState>();
  const startingChannels = new Set<string>();
  app.use(async ({ body, next }) => {
    const ev = (body as { event?: { type?: string; subtype?: string } }).event;
    console.log('[slack]', body.type, ev?.type ?? '', ev?.subtype ?? '');
    await next();
  });
  const personas = () => [...listPersonas(opts.repo).values()];
  /** user id → display name cache (users.info is per-call, so cache it). */
  const userNames = new Map<string, string>();
  const displayName = async (userId: string): Promise<string> => {
    const hit = userNames.get(userId);
    if (hit) return hit;
    try {
      const r = await app.client.users.info({ user: userId });
      const name = r.user?.profile?.display_name || r.user?.real_name || userId;
      userNames.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  };
  /** Recent channel log as "name: text" lines — the personas' shared memory. */
  const channelContext = async (channel: string): Promise<string[]> => {
    const r = await app.client.conversations.history({ channel, limit: 15 }).catch(() => undefined);
    const msgs = (r?.messages ?? []).slice().reverse();
    const lines: string[] = [];
    for (const m of msgs) {
      const who = m.user ? await displayName(m.user) : (m.username ?? 'someone');
      if (m.text?.trim()) lines.push(`${who}: ${m.text}`.slice(0, 300));
    }
    return lines;
  };
  /** Download a text-ish attachment's content (needs files:read). */
  const fetchFileText = async (f: {
    name?: string;
    mimetype?: string;
    size?: number;
    url_private_download?: string;
  }): Promise<string | null> => {
    if (!f.url_private_download || (f.size ?? 0) > 200_000) return null;
    const okType =
      (f.mimetype ?? '').startsWith('text/') ||
      /\.(md|txt|tsx?|jsx?|json|py|rb|go|rs|ya?ml|toml|csv|log|sql|sh)$/i.test(f.name ?? '');
    if (!okType) return null;
    try {
      const res = await fetch(f.url_private_download, {
        headers: { authorization: `Bearer ${botToken}` },
      });
      return res.ok ? (await res.text()).slice(0, 10_000) : null;
    } catch {
      return null;
    }
  };
  /** 👀 on receipt → ✅ when replies are posted (myagent's ack pattern). */
  const react = (channel: string, ts: string, name: string) =>
    app.client.reactions
      .add({ channel, timestamp: ts, name })
      .catch((e) => console.error('reaction failed (needs reactions:write):', e?.data?.error ?? e));
  const unreact = (channel: string, ts: string, name: string) =>
    app.client.reactions.remove({ channel, timestamp: ts, name }).catch(() => {});
  /** Own user id, needed so ambient mode can skip messages that mention the bot
   * (they already fire app_mention; handling both would double-respond). */
  let botUserId: string | undefined;

  /** Create a dedicated channel for a run; falls back to posting in-channel. */
  const makeRunChannel = async (goal: string): Promise<string | undefined> => {
    const slug =
      goal
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
    const runDir = newRunDir(opts.repo);
    const state: SlackRunState = {
      goal,
      originChannel: channel,
      runChannel: channel,
      phase: 'starting',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completed: 0,
      runDir,
    };
    const statePath = path.join(runDir, 'slack-run.json');
    const saveState = () => {
      state.updatedAt = Date.now();
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    };
    runsByChannel.set(channel, state);
    saveState();

    // Dedicated channel per run — progress goes there, fallback to origin channel.
    const runChannel = (await makeRunChannel(goal)) ?? channel;
    state.runChannel = runChannel;
    runsByChannel.set(runChannel, state);
    const sayChan = (t: string) =>
      app.client.chat.postMessage({ channel: runChannel, text: t }).then(() => {});
    let noticeCount = 0;
    let lastNotice = state.startedAt;
    const heartbeat = setInterval(() => {
      if (!['planning', 'running'].includes(state.phase)) return;
      const now = Date.now();
      if ((noticeCount === 0 && now - lastNotice >= 60_000) || now - lastNotice >= 300_000) {
        noticeCount++;
        lastNotice = now;
        void sayChan(`⏳ ${formatSlackRunStatus(state, now)}`).catch((error) =>
          console.error('run heartbeat delivery failed:', error),
        );
      }
    }, 30_000);

    try {
      if (runChannel !== channel) {
        await app.client.chat.postMessage({
          channel,
          text: `🐝 run を <#${runChannel}> で開始しました: ${goal}`,
        });
        await sayChan(`goal: ${goal}`);
      }
      state.phase = 'planning';
      saveState();
      await sayChan('📐 planning…（1分以上かかる場合は途中経過をお知らせします）');
      const tasks = await planTasks(goal, {
        cwd: opts.repo,
        model: opts.model,
        timeoutMs: opts.timeoutMs,
        logPath: path.join(runDir, 'planner.log'),
      });
      state.phase = 'running';
      state.total = tasks.length;
      saveState();
      await sayChan(tasks.map((t) => `• \`${t.id}\` ${t.title}`).join('\n'));
      await sayChan(`🐝 run start (${tasks.length} tasks)`);
      fs.writeFileSync(path.join(runDir, 'tasks.json'), JSON.stringify({ goal, tasks }, null, 2));
      const byTask = new Map(tasks.map((t) => [t.id, t]));
      const squadOpts: SquadOptions = {
        repo: opts.repo,
        concurrency: opts.concurrency,
        permissionMode: opts.permissionMode,
        timeoutMs: opts.timeoutMs,
        model: opts.model,
        keepWorktrees: false,
        extraArgs: opts.extraArgs,
        personas: new Map(personas().map((p) => [p.name, p])),
        onEvent: (ev) => {
          const personaName = 'taskId' in ev ? byTask.get(ev.taskId)?.persona : undefined;
          const persona = personaName ? getPersona(personaName, opts.repo) : undefined;
          const who = persona ? `${persona.emoji} *${persona.name}* ` : '';
          if (ev.type === 'task-done' || ev.type === 'task-skip') state.completed++;
          saveState();
          const line =
            ev.type === 'task-start'
              ? `▶️ ${who}${ev.taskId} started`
              : ev.type === 'task-done'
                ? `${ev.status === 'success' ? '✅' : '❌'} ${who}${ev.taskId} ${ev.status} (${Math.round(ev.durationMs / 1000)}s)${ev.changed ? ' · changes' : ''}`
                : ev.type === 'task-skip'
                  ? `➖ ${ev.taskId} skipped`
                  : null;
          if (line) void sayChan(line).catch((e) => console.error('progress delivery failed:', e));
        },
      };
      const results = await runSquad(tasks, squadOpts, runDir);
      const report = writeReport(runDir, results, goal);
      const ok = results.filter((r) => r.status === 'success');
      const kept = results
        .filter((r) => r.changed)
        .map((r) => `\`${r.branch}\``)
        .join(', ');
      state.phase = 'done';
      state.completed = results.length;
      saveState();
      await sayChan(
        `🏁 done: ${ok.length}/${results.length} succeeded${kept ? `\nbranches: ${kept}` : ''}\nreport: \`${report}\``,
      );

      // Artifacts → files + channel canvas (scopes: files:write, canvases:write)
      const reportMd = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
      if (reportMd) {
        void app.client.conversations.canvases
          .create({
            channel_id: runChannel,
            title: `squad run — ${goal.slice(0, 60)}`,
            document_content: { type: 'markdown', markdown: reportMd },
          })
          .catch((e) => console.error('canvas create failed (needs canvases:write):', e));
        void app.client.files
          .uploadV2({
            channel_id: runChannel,
            filename: 'report.md',
            content: reportMd,
            initial_comment: '📋 run report',
          })
          .catch((e) => console.error('file upload failed (needs files:write):', e));
      }
      for (const r of results.filter((x) => x.changed)) {
        const diffPath = path.join(runDir, r.task.id, 'diff.patch');
        if (!fs.existsSync(diffPath)) continue;
        void app.client.files
          .uploadV2({
            channel_id: runChannel,
            filename: `${r.task.id}.diff.patch`,
            content: fs.readFileSync(diffPath, 'utf8'),
            initial_comment: `diff — ${r.task.title}`,
          })
          .catch(() => {});
      }
    } catch (error) {
      state.phase = 'failed';
      state.error = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      saveState();
      console.error('Slack run failed:', error);
      await sayChan(`❌ run failed\n${formatSlackRunStatus(state)}`).catch(() => {});
      if (runChannel !== channel) {
        await app.client.chat
          .postMessage({
            channel,
            text: `❌ <#${runChannel}> の run が失敗しました: ${state.error}`,
          })
          .catch(() => {});
      }
    } finally {
      clearInterval(heartbeat);
      startingChannels.delete(channel);
    }
  };

  app.event('app_mention', async ({ event, say }) => {
    if (!claimSlackEvent(event.channel, event.ts)) return;
    await serial(`conversation:${event.channel}`, async () => {
      const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
      const sayChan = (t: string) => say({ text: t });
      const [head, ...restWords] = text.split(/\s+/);
      let rest = restWords.join(' ');
      for (const f of (event as unknown as { files?: Parameters<typeof fetchFileText>[0][] })
        .files ?? []) {
        const content = await fetchFileText(f);
        if (content) rest += `\n[添付: ${f.name ?? 'file'}]\n${content}`;
      }
      const help = helpText(botUserId ? `<@${botUserId}>` : 'このボット');
      const runState = runsByChannel.get(event.channel);

      void react(event.channel, event.ts, 'eyes');
      try {
        if (!text || head === 'help') return void (await sayChan(help));
        if (
          head === 'status' ||
          (runState && /(進捗|状況|どうな|どこまで|進めて|動いて|status)/i.test(text))
        ) {
          return void (await sayChan(
            runState ? formatSlackRunStatus(runState) : 'このチャンネルに run の記録はありません',
          ));
        }
        if (head === 'personas') {
          const list = personas()
            .map((p) => `${p.emoji} *${p.name}* — ${p.description}`)
            .join('\n');
          return void (await sayChan(list || 'no personas'));
        }
        if (head === 'plan') {
          if (!rest) return void (await sayChan('goal が必要です'));
          await sayChan('📐 planning…');
          const tasks = await planTasks(rest, {
            cwd: opts.repo,
            model: opts.model,
            timeoutMs: opts.timeoutMs,
          });
          return void (await sayChan(tasks.map((t) => `• \`${t.id}\` ${t.title}`).join('\n')));
        }
        if (head === 'run') {
          if (!rest) return void (await sayChan('goal が必要です'));
          const active = runsByChannel.get(event.channel);
          if (
            startingChannels.has(event.channel) ||
            active?.phase === 'planning' ||
            active?.phase === 'running'
          ) {
            return void (await sayChan(
              active ? formatSlackRunStatus(active) : 'run の開始準備中です',
            ));
          }
          startingChannels.add(event.channel);
          await sayChan('🐝 run を受け付けました。準備を始めます…');
          void runGoal(rest, event.channel).catch(async (error) => {
            startingChannels.delete(event.channel);
            console.error('Slack run failed before initialization:', error);
            await sayChan(
              `❌ run を開始できませんでした: ${error instanceof Error ? error.message : error}`,
            ).catch(() => {});
          });
          return;
        }
        const persona = getPersona(head, opts.repo);
        if (persona && rest) {
          const author = await displayName(event.user ?? 'someone');
          appendMessage(event.channel, {
            author: 'user',
            name: event.user ?? '?',
            display: author,
            text: rest,
          });
          const context = await channelContext(event.channel);
          const reply = await personaSayOnce(persona, `${author}: ${rest}`, context, {
            timeoutMs: opts.timeoutMs,
            model: opts.model,
          });
          appendMessage(event.channel, {
            author: 'persona',
            name: persona.name,
            display: `${persona.emoji} ${persona.name}`,
            text: reply,
          });
          return void (await app.client.chat.postMessage({
            channel: event.channel,
            text: reply,
            ...slackIdentity(persona),
          }));
        }
        await sayChan(help);
      } catch (err) {
        await sayChan(`⚠️ error: ${err instanceof Error ? err.message : err}`);
      } finally {
        await unreact(event.channel, event.ts, 'eyes');
      }
    });
  });

  if (opts.ambient) {
    app.event('message', async ({ event }) => {
      const e = event as {
        bot_id?: string;
        subtype?: string;
        text?: string;
        user?: string;
        ts: string;
        channel?: string;
        files?: Parameters<typeof fetchFileText>[0][];
      };
      if (
        e.bot_id ||
        (e.subtype && e.subtype !== 'file_share') ||
        !e.channel ||
        !e.user ||
        (!e.text?.trim() && !e.files?.length) ||
        (botUserId && e.text?.includes(`<@${botUserId}>`))
      )
        return;
      if (!claimSlackEvent(e.channel, e.ts)) return;
      const channel = e.channel,
        user = e.user;
      await serial(`conversation:${channel}`, async () => {
        await react(channel, e.ts, 'eyes');
        try {
          const author = await displayName(user);
          let message = e.text ?? '';
          for (const f of e.files ?? []) {
            const content = await fetchFileText(f);
            if (content) message += `\n[添付: ${f.name ?? 'file'}]\n${content}`;
          }
          const context = await channelContext(channel);
          appendMessage(channel, {
            author: 'user',
            name: user,
            display: author,
            text: message,
          });
          await converse({
            personas: personas(),
            author,
            message,
            context,
            timeoutMs: opts.timeoutMs,
            model: opts.model,
            routerModel: opts.routerModel,
            onReply: async (persona, reply) => {
              await app.client.chat.postMessage({
                channel,
                text: reply,
                ...slackIdentity(persona),
              });
              appendMessage(channel, {
                author: 'persona',
                name: persona.name,
                display: `${persona.emoji} ${persona.name}`,
                text: reply,
              });
            },
          });
          await react(channel, e.ts, 'white_check_mark');
        } catch (err) {
          console.error('ambient conversation error:', err);
        } finally {
          await unreact(channel, e.ts, 'eyes');
        }
      });
    });
  }

  try {
    try {
      botUserId = (await app.client.auth.test()).user_id as string | undefined;
    } catch {
      // ambient dedup degrades gracefully without it
    }
    await app.start();
  } catch (error) {
    lease.release();
    throw error;
  }

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await app.stop();
    } finally {
      lease.release();
      process.exit(0);
    }
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  console.log(`devin-squad slack bot connected (repo: ${opts.repo}, ambient: ${opts.ambient})`);
}
