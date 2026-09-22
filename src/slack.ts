import { App } from '@slack/bolt';
import fs from 'node:fs';
import path from 'node:path';
import { listPersonas, getPersona } from './persona.js';
import { personaSay } from './talk.js';
import { planTasks } from './planner.js';
import { runSquad } from './scheduler.js';
import { newRunDir } from './paths.js';
import { writeReport } from './report.js';
import type { SquadOptions, SquadTask } from './types.js';

export interface SlackOptions {
  repo: string;
  concurrency: number;
  permissionMode: string;
  timeoutMs: number;
  model?: string;
  extraArgs: string[];
}

const HELP = `使い方:
- \`@squad personas\` — ペルソナ一覧
- \`@squad <persona> <msg>\` — そのペルソナと会話
- \`@squad plan <goal>\` — タスク分解だけする
- \`@squad run <goal>\` — 分解→並列実行→レポートまで全部`;

export function startSlack(opts: SlackOptions): void {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!botToken || !appToken) {
    throw new Error('SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-, socket mode) are required');
  }

  const app = new App({ token: botToken, appToken, socketMode: true });
  const personas = () => new Map(listPersonas(opts.repo).map(p => [p.name, p]));

  app.event('app_mention', async ({ event, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    const thread = { thread_ts: event.ts };
    const [head, ...restWords] = text.split(/\s+/);
    const rest = restWords.join(' ');

    try {
      if (!text || head === 'help') {
        await say({ ...thread, text: HELP });
        return;
      }
      if (head === 'personas') {
        const list = [...personas().values()]
          .map(p => `${p.emoji} *${p.name}* — ${p.description}`)
          .join('\n');
        await say({ ...thread, text: list || 'no personas' });
        return;
      }
      if (head === 'plan' || head === 'run') {
        if (!rest) return void (await say({ ...thread, text: 'goal が必要です' }));
        await say({ ...thread, text: `📐 planning…` });
        const tasks = await planTasks(rest, {
          cwd: opts.repo, model: opts.model, timeoutMs: opts.timeoutMs,
        });
        await say({
          ...thread,
          text: tasks.map(t => `• \`${t.id}\` ${t.title}`).join('\n'),
        });
        if (head === 'plan') return;

        await say({ ...thread, text: `🐝 run start (${tasks.length} tasks, concurrency ${opts.concurrency})` });
        const runDir = newRunDir(opts.repo);
        fs.writeFileSync(path.join(runDir, 'tasks.json'), JSON.stringify({ goal: rest, tasks }, null, 2));
        const squadOpts: SquadOptions = {
          repo: opts.repo,
          concurrency: opts.concurrency,
          permissionMode: opts.permissionMode,
          timeoutMs: opts.timeoutMs,
          model: opts.model,
          keepWorktrees: false,
          extraArgs: opts.extraArgs,
          personas: personas(),
          onEvent: ev => {
            const line =
              ev.type === 'task-start' ? `▶️ ${ev.taskId} started` :
              ev.type === 'task-done' ? `${ev.status === 'success' ? '✅' : '❌'} ${ev.taskId} ${ev.status} (${Math.round(ev.durationMs / 1000)}s)${ev.changed ? ' · changes' : ''}` :
              ev.type === 'task-skip' ? `➖ ${ev.taskId} skipped` : null;
            if (line) void say({ ...thread, text: line });
          },
        };
        const results = await runSquad(tasks, squadOpts, runDir);
        const report = writeReport(runDir, results, rest);
        const ok = results.filter(r => r.status === 'success');
        const kept = results.filter(r => r.changed).map(r => `\`${r.branch}\``).join(', ');
        await say({
          ...thread,
          text: `🏁 done: ${ok.length}/${results.length} succeeded${kept ? `\nbranches: ${kept}` : ''}\nreport: \`${report}\``,
        });
        return;
      }

      const persona = getPersona(head, opts.repo);
      if (persona && rest) {
        const reply = await personaSay(persona, rest, { timeoutMs: opts.timeoutMs });
        await say({ ...thread, text: `${persona.emoji} ${reply}` });
        return;
      }
      await say({ ...thread, text: HELP });
    } catch (err) {
      await say({ ...thread, text: `⚠️ error: ${err instanceof Error ? err.message : err}` });
    }
  });

  void app.start().then(() => {
    console.log(`devin-squad slack bot connected (repo: ${opts.repo})`);
  });
}
