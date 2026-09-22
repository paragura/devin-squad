import http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PAGE_HTML } from './webui.js';
import { listPersonas, getPersona } from './persona.js';
import { personaSay } from './talk.js';
import { converse } from './conversation.js';
import { serial } from './coordination.js';
import { appendMessage, readMessages, contextLines, listChannels, directChannel } from './store.js';
import { planTasks } from './planner.js';
import { runSquad } from './scheduler.js';
import { newRunDir, runsRoot } from './paths.js';
import { writeReport } from './report.js';
import {
  InputError,
  identifier,
  inside,
  positiveNumber,
  requiredText,
  validateTasks,
} from './validation.js';
import type { SquadEvent, SquadTask, TaskResult } from './types.js';

interface RunState {
  id: string;
  requestId?: string;
  goal?: string;
  dir: string;
  status: 'running' | 'done' | 'error';
  tasks: SquadTask[];
  events: SquadEvent[];
  results?: TaskResult[];
  error?: string;
  clients: Set<http.ServerResponse>;
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

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json')
    throw new InputError('Content-Type must be application/json', 415);
  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(new InputError('request body exceeds 1 MiB', 413));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new InputError('request must contain a JSON object');
  }
}

export function serve(opts: ServeOptions): http.Server {
  positiveNumber(opts.concurrency, 'concurrency', true);
  positiveNumber(opts.timeoutMs, 'timeout');
  const runs = new Map<string, RunState>();
  const snapshot = (r: RunState) => ({
    id: r.id,
    requestId: r.requestId,
    goal: r.goal,
    status: r.status,
    tasks: r.tasks,
    events: r.events,
    results: r.results,
    error: r.error,
  });
  const persist = (r: RunState) => {
    const target = path.join(r.dir, 'run.json');
    fs.writeFileSync(target + '.tmp', JSON.stringify(snapshot(r), null, 2));
    fs.renameSync(target + '.tmp', target);
  };
  const root = runsRoot(opts.repo);
  if (fs.existsSync(root))
    for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      try {
        identifier(dir.name);
        const location = inside(root, dir.name);
        const saved = path.join(location, 'run.json');
        let run: RunState;
        if (fs.existsSync(saved)) {
          run = {
            ...JSON.parse(fs.readFileSync(saved, 'utf8')),
            id: dir.name,
            dir: location,
            clients: new Set(),
          };
          if (run.status === 'running') {
            run.status = 'error';
            run.error = 'サーバーが再起動されました。作業結果を確認してください。';
            run.events.push({ type: 'run-error', error: run.error });
          }
        } else {
          const raw = JSON.parse(fs.readFileSync(path.join(location, 'tasks.json'), 'utf8'));
          let results: TaskResult[] = fs
            .readdirSync(location, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .flatMap((d) => {
              try {
                return [
                  JSON.parse(fs.readFileSync(path.join(location, d.name, 'meta.json'), 'utf8')),
                ];
              } catch {
                return [];
              }
            });
          const resultsFile = path.join(location, 'results.json');
          if (fs.existsSync(resultsFile))
            results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
          run = {
            id: dir.name,
            dir: location,
            status: 'done',
            tasks: raw.tasks,
            goal: raw.goal,
            results,
            events: [],
            clients: new Set(),
          };
        }
        runs.set(run.id, run);
      } catch {
        /* ignore unrelated/incomplete legacy directories */
      }
    }
  const json = (res: http.ServerResponse, body: unknown, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const push = (run: RunState, event: SquadEvent) => {
    run.events.push(event);
    // Heartbeats are transient; keep task state events for reconnect/reload.
    if (event.type === 'heartbeat')
      run.events = run.events.filter((e) => e.type !== 'heartbeat' || e === event);
    persist(run);
    for (const client of run.clients) {
      if (!client.write(`data: ${JSON.stringify(event)}\n\n`)) {
        client.end();
        run.clients.delete(client);
      }
    }
  };
  const sse = (res: http.ServerResponse) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
  };
  const channelFor = (url: URL) => {
    const persona = url.searchParams.get('persona');
    if (persona) {
      if (!getPersona(persona, opts.repo)) throw new InputError('persona not found', 404);
      return directChannel(opts.repo, persona);
    }
    return identifier(url.searchParams.get('channel') ?? 'web', 'channel');
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!allowed.has(req.headers.host ?? '')) throw new InputError('invalid Host', 403);
      if (req.headers.origin && ![...allowed].some((h) => req.headers.origin === `http://${h}`))
        throw new InputError('invalid Origin', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new InputError('cross-site request rejected', 403);
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') {
        const nonce = randomUUID();
        res.setHeader(
          'Content-Security-Policy',
          `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
        );
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE_HTML.replace('<script>', `<script nonce="${nonce}">`));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, {
          repo: opts.repo,
          personas: listPersonas(opts.repo).map(({ name, emoji, description, source }) => ({
            name,
            emoji,
            description,
            source,
          })),
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/channels') {
        json(res, { channels: listChannels() });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/messages') {
        json(res, { messages: readMessages(channelFor(url), 100) });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/stream') {
        const channel = channelFor(url);
        sse(res);
        const seen = new Set<string>();
        const flush = () => {
          for (const m of readMessages(channel, 100)) {
            const id = m.id ?? `${m.ts}:${m.name}:${m.text}`;
            if (seen.has(id)) continue;
            seen.add(id);
            if (!res.write(`data: ${JSON.stringify(m)}\n\n`)) {
              res.end();
              return;
            }
          }
          if (seen.size > 1000) {
            const ids = [...seen].slice(-200);
            seen.clear();
            ids.forEach((id) => seen.add(id));
          }
        };
        flush();
        const timer = setInterval(() => {
          try {
            flush();
            res.write(': heartbeat\n\n');
          } catch {
            res.end();
          }
        }, 1500);
        res.on('close', () => clearInterval(timer));
        return;
      }
      if (req.method === 'POST' && ['/api/chat', '/api/ambient'].includes(url.pathname)) {
        const body = await readBody(req);
        const message = requiredText(body.message, 'message');
        const requestId =
          body.requestId === undefined ? randomUUID() : identifier(body.requestId, 'request id');
        const persona =
          url.pathname === '/api/chat'
            ? getPersona(requiredText(body.persona, 'persona'), opts.repo)
            : null;
        if (url.pathname === '/api/chat' && !persona)
          throw new InputError('persona not found', 404);
        const channel = persona
          ? directChannel(opts.repo, persona.name)
          : identifier(body.channel ?? 'web', 'channel');
        const replies = await serial(`conversation:${channel}`, async () => {
          const existing = readMessages(channel, 100).filter((m) => m.requestId === requestId);
          const priorReplies = existing.filter((m) => m.author === 'persona');
          if (priorReplies.length)
            return priorReplies.map((m) => ({ name: m.name, reply: m.text }));
          const context = contextLines(channel);
          if (!existing.length)
            appendMessage(channel, {
              author: 'user',
              name: 'you',
              display: 'you',
              text: message,
              requestId,
            });
          const replies: { name: string; emoji?: string; reply: string }[] = [];
          const onReply = async (p: NonNullable<typeof persona>, reply: string) => {
            appendMessage(channel, {
              author: 'persona',
              name: p.name,
              display: `${p.emoji} ${p.name}`,
              text: reply,
              requestId,
            });
            replies.push({ name: p.name, emoji: p.emoji, reply });
          };
          if (persona)
            await onReply(
              persona,
              await personaSay(persona, message, { timeoutMs: opts.timeoutMs, repo: opts.repo }),
            );
          else
            await converse({
              personas: listPersonas(opts.repo),
              author: 'you',
              message,
              context,
              timeoutMs: opts.timeoutMs,
              model: opts.model,
              onReply,
            });
          return replies;
        });
        json(res, persona ? { reply: replies[0]?.reply ?? '' } : { replies });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/plan') {
        const body = await readBody(req);
        const tasks = await planTasks(requiredText(body.goal, 'goal'), {
          cwd: opts.repo,
          model: opts.model,
          timeoutMs: opts.timeoutMs,
        });
        json(res, { tasks });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/run') {
        const body = await readBody(req),
          tasks = validateTasks(body.tasks);
        const requestId =
          body.requestId === undefined ? undefined : identifier(body.requestId, 'request id');
        const goal = typeof body.goal === 'string' ? body.goal : undefined;
        const existing = requestId && [...runs.values()].find((r) => r.requestId === requestId);
        if (existing) {
          if (JSON.stringify(existing.tasks) !== JSON.stringify(tasks) || existing.goal !== goal)
            throw new InputError('request id already used for a different plan', 409);
          json(res, { runId: existing.id });
          return;
        }
        const concurrency = positiveNumber(
          body.concurrency ?? opts.concurrency,
          'concurrency',
          true,
        );
        const personas = new Map(listPersonas(opts.repo).map((p) => [p.name, p]));
        const defaultPersona =
          body.persona === undefined ? undefined : requiredText(body.persona, 'persona');
        for (const task of tasks) {
          const p = task.persona ?? defaultPersona;
          if (p && !personas.has(p)) throw new InputError(`persona not found: ${p}`);
        }
        const runDir = newRunDir(opts.repo),
          runId = path.basename(runDir);
        const run: RunState = {
          id: runId,
          requestId,
          goal,
          dir: runDir,
          status: 'running',
          tasks,
          events: [],
          clients: new Set(),
        };
        fs.writeFileSync(
          path.join(runDir, 'tasks.json'),
          JSON.stringify({ goal: body.goal, tasks }, null, 2),
        );
        runs.set(runId, run);
        persist(run);
        json(res, { runId });
        void runSquad(
          tasks,
          {
            ...opts,
            concurrency,
            personas,
            defaultPersona,
            keepWorktrees: false,
            onEvent: (event) => {
              if (event.type !== 'run-done') push(run, event);
            },
          },
          runDir,
        )
          .then((results) => {
            writeReport(runDir, results, typeof body.goal === 'string' ? body.goal : undefined);
            run.status = 'done';
            run.results = results;
            push(run, { type: 'run-done', results });
          })
          .catch((err) => {
            run.status = 'error';
            run.error = err instanceof Error ? err.message : String(err);
            push(run, { type: 'run-error', error: run.error });
          });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/runs') {
        json(res, { runs: [...runs.values()].reverse().map(snapshot) });
        return;
      }
      if (
        req.method === 'GET' &&
        ['/api/run', '/api/events', '/api/artifact'].includes(url.pathname)
      ) {
        const run = runs.get(url.searchParams.get('run') ?? '');
        if (!run) throw new InputError('run not found', 404);
        if (url.pathname === '/api/run') {
          json(res, snapshot(run));
          return;
        }
        if (url.pathname === '/api/events') {
          sse(res);
          for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
          if (run.status !== 'running') {
            res.end();
            return;
          }
          run.clients.add(res);
          res.on('close', () => run.clients.delete(res));
          return;
        }
        const file = url.searchParams.get('file'),
          task = url.searchParams.get('task');
        const files = ['output.md', 'diff.patch', 'log.txt', 'meta.json', 'session.atif.json'];
        if (
          task
            ? !run.tasks.some((t) => t.id === task) || !files.includes(file ?? '')
            : file !== 'report.md'
        )
          throw new InputError('artifact not allowed', 404);
        const target = inside(run.dir, ...(task ? [identifier(task), file!] : [file!]));
        if (!fs.existsSync(target)) throw new InputError('artifact not found', 404);
        inside(
          fs.realpathSync(run.dir),
          path.relative(fs.realpathSync(run.dir), fs.realpathSync(target)),
        );
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        const stream = fs.createReadStream(target);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
        return;
      }
      throw new InputError('not found', 404);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      json(
        res,
        { error: err instanceof Error ? err.message : String(err) },
        err instanceof InputError ? err.status : 500,
      );
    }
  });
  server.listen(opts.port, '127.0.0.1', () => {
    const a = server.address();
    console.log(
      `devin-squad ui → http://127.0.0.1:${typeof a === 'object' && a ? a.port : opts.port}`,
    );
  });
  return server;
}
