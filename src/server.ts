import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { PAGE_HTML } from './webui.js';
import { listPersonas, getPersona } from './persona.js';
import { personaSay, personaSayOnce } from './talk.js';
import { pickResponders } from './router.js';
import { appendMessage, readMessages, contextLines, listChannels, channelFilePath } from './store.js';
import { planTasks } from './planner.js';
import { runSquad } from './scheduler.js';
import { newRunDir } from './paths.js';
import { writeReport } from './report.js';
import fs from 'node:fs';
import path from 'node:path';
import type { SquadEvent, SquadOptions, SquadTask } from './types.js';

interface RunState {
  id: string;
  dir: string;
  status: 'planning' | 'running' | 'done' | 'error';
  tasks: SquadTask[];
  events: SquadEvent[];
  clients: http.ServerResponse[];
}

export interface ServeOptions {
  repo: string;
  port: number;
  concurrency: number;
  permissionMode: string;
  timeoutMs: number;
  model?: string;
  extraArgs: string[];
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

export function serve(opts: ServeOptions): http.Server {
  const runs = new Map<string, RunState>();
  const personaMap = new Map(listPersonas(opts.repo).map(p => [p.name, p]));

  const json = (res: http.ServerResponse, body: unknown, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const pushEvent = (run: RunState, ev: SquadEvent) => {
    run.events.push(ev);
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const c of run.clients) c.write(line);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE_HTML);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, {
          repo: opts.repo,
          personas: [...personaMap.values()].map(p => ({
            name: p.name, emoji: p.emoji, description: p.description, source: p.source,
          })),
        });
        return;
      }

      // Ambient chat: router picks 0-2 personas who "want" to respond.
      // Everything is stored in the channel log — personas are disposable.
      if (req.method === 'POST' && url.pathname === '/api/ambient') {
        const body = JSON.parse(await readBody(req));
        const channel = String(body.channel ?? 'web');
        const message = String(body.message ?? '');
        if (!message.trim()) return json(res, { replies: [] });
        try {
          appendMessage(channel, { author: 'user', name: 'you', display: 'you', text: message });
          const context = contextLines(channel);
          const selected = await pickResponders(
            [...personaMap.values()],
            'you',
            message,
            context,
            { model: opts.model, timeoutMs: opts.timeoutMs }
          );
          const replies = [];
          // Personas keep talking to each other: after each round the router
          // decides if anyone else wants in. Max 3 rounds, no self-replies.
          let speakers = new Set<string>();
          for (let round = 0; round <= 3; round++) {
            const ctx = round === 0 ? context : contextLines(channel);
            const responders = round === 0
              ? selected
              : (await pickResponders(
                  [...personaMap.values()], 'conversation', ctx.at(-1) ?? '', ctx,
                  { model: opts.model, timeoutMs: opts.timeoutMs }
                )).filter(p => !speakers.has(p.name));
            if (responders.length === 0) break;
            for (const p of responders) {
              const reply = await personaSayOnce(p, ctx.at(-1) ?? '', ctx, {
                timeoutMs: opts.timeoutMs,
                model: opts.model,
              });
              appendMessage(channel, {
                author: 'persona', name: p.name,
                display: `${p.emoji} ${p.name}`, text: reply,
              });
              replies.push({ name: p.name, emoji: p.emoji, reply });
            }
            speakers = new Set(responders.map(p => p.name));
          }
          json(res, { replies });
        } catch (err) {
          json(res, { error: String(err instanceof Error ? err.message : err) }, 500);
        }
        return;
      }

      // Channel log APIs — shared with the Slack bot via ~/.devin-squad/channels/.
      if (req.method === 'GET' && url.pathname === '/api/channels') {
        json(res, { channels: listChannels() });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/messages') {
        const channel = String(url.searchParams.get('channel') ?? 'web');
        json(res, { messages: readMessages(channel, 100) });
        return;
      }

      // SSE tail of the channel JSONL — the slack bot process appends to the
      // same files, so this streams Slack-side activity live into the web UI.
      if (req.method === 'GET' && url.pathname === '/api/stream') {
        const channel = String(url.searchParams.get('channel') ?? 'web');
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('\n');
        const file = channelFilePath(channel);
        let offset = 0;
        for (const m of readMessages(channel, 100)) res.write(`data: ${JSON.stringify(m)}\n\n`);
        try { offset = fs.statSync(file).size; } catch { /* new channel */ }
        const timer = setInterval(() => {
          try {
            const size = fs.statSync(file).size;
            if (size <= offset) return;
            const fd = fs.openSync(file, 'r');
            const buf = Buffer.alloc(size - offset);
            fs.readSync(fd, buf, 0, buf.length, offset);
            fs.closeSync(fd);
            offset = size;
            for (const line of buf.toString('utf8').split('\n').filter(Boolean)) {
              res.write(`data: ${line}\n\n`);
            }
          } catch { /* file may not exist yet */ }
        }, 1500);
        req.on('close', () => clearInterval(timer));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = JSON.parse(await readBody(req));
        const persona = getPersona(String(body.persona), opts.repo);
        if (!persona) return json(res, { error: 'persona not found' }, 404);
        try {
          const reply = await personaSay(persona, String(body.message), { timeoutMs: opts.timeoutMs });
          json(res, { reply });
        } catch (err) {
          json(res, { error: String(err instanceof Error ? err.message : err) }, 500);
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/plan') {
        const body = JSON.parse(await readBody(req));
        try {
          const tasks = await planTasks(String(body.goal), {
            cwd: opts.repo, model: opts.model, timeoutMs: opts.timeoutMs,
          });
          json(res, { tasks });
        } catch (err) {
          json(res, { error: String(err instanceof Error ? err.message : err) }, 500);
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/run') {
        const body = JSON.parse(await readBody(req));
        const tasks = body.tasks as SquadTask[];
        if (!Array.isArray(tasks) || tasks.length === 0) return json(res, { error: 'tasks required' }, 400);
        const runId = randomUUID().slice(0, 8);
        const runDir = newRunDir(opts.repo);
        const run: RunState = { id: runId, dir: runDir, status: 'running', tasks, events: [], clients: [] };
        runs.set(runId, run);
        fs.writeFileSync(path.join(runDir, 'tasks.json'), JSON.stringify({ tasks }, null, 2));
        json(res, { runId });

        const squadOpts: SquadOptions = {
          repo: opts.repo,
          concurrency: Number(body.concurrency ?? opts.concurrency),
          permissionMode: opts.permissionMode,
          timeoutMs: opts.timeoutMs,
          model: opts.model,
          keepWorktrees: false,
          extraArgs: opts.extraArgs,
          personas: personaMap,
          defaultPersona: body.persona ? String(body.persona) : undefined,
          onEvent: ev => pushEvent(run, ev),
        };
        void runSquad(tasks, squadOpts, runDir)
          .then(results => {
            run.status = 'done';
            writeReport(runDir, results);
          })
          .catch(err => {
            run.status = 'error';
            pushEvent(run, { type: 'run-done', results: [] });
            console.error('run error:', err);
          });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/events') {
        const run = runs.get(String(url.searchParams.get('run')));
        if (!run) return json(res, { error: 'run not found' }, 404);
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('\n');
        for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
        run.clients.push(res);
        req.on('close', () => {
          run.clients = run.clients.filter(c => c !== res);
        });
        return;
      }

      json(res, { error: 'not found' }, 404);
    } catch (err) {
      json(res, { error: String(err instanceof Error ? err.message : err) }, 500);
    }
  });

  server.listen(opts.port, () => {
    console.log(`devin-squad ui → http://localhost:${opts.port}  (repo: ${opts.repo})`);
  });
  return server;
}
