import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-squad-test-'));
process.env.DEVIN_SQUAD_HOME = path.join(temp, 'home');
process.env.FAKE_DEVIN_AUDIT = path.join(temp, 'audit.jsonl');
const bin = path.join(temp, 'bin');
fs.mkdirSync(bin);
fs.copyFileSync(new URL('./fake-devin.mjs', import.meta.url), path.join(bin, 'devin'));
fs.chmodSync(path.join(bin, 'devin'), 0o755);
process.env.PATH = bin + path.delimiter + process.env.PATH;
const { validateTasks, positiveNumber, inside, dependencyOrder } = await import(
  '../dist/validation.js'
);
const { runSquad } = await import('../dist/scheduler.js');
const { newRunDir, worktreesRoot } = await import('../dist/paths.js');
const { headSha, mergeBranch } = await import('../dist/git.js');
const { runDevin, sessionIds } = await import('../dist/devin.js');
const { personaSay } = await import('../dist/talk.js');
const { converse } = await import('../dist/conversation.js');
const { claimSlackEvent, serial, claimProcess } = await import('../dist/coordination.js');
const { readMessages, directChannel } = await import('../dist/store.js');
const { parseArgs } = await import('../dist/args.js');
const { serve } = await import('../dist/server.js');
const { planTasks } = await import('../dist/planner.js');
const { formatSlackRunStatus, slackIdentity } = await import('../dist/slack.js');

after(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});
function git(repo, ...args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function repo() {
  const dir = fs.mkdtempSync(path.join(temp, 'repo-'));
  git(dir, 'init');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Squad Test');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'initial');
  return dir;
}
const task = (id, prompt = 'no changes', dependsOn = []) => ({
  id,
  title: id,
  prompt,
  dependsOn,
});
const options = (repo) => ({
  repo,
  concurrency: 3,
  permissionMode: 'bypass',
  timeoutMs: 5000,
  keepWorktrees: false,
  extraArgs: [],
});
const audit = () =>
  fs.existsSync(process.env.FAKE_DEVIN_AUDIT)
    ? fs
        .readFileSync(process.env.FAKE_DEVIN_AUDIT, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    : [];
const persona = {
  name: 'alpha',
  emoji: '🧪',
  description: 'reviewer',
  prompt: 'PERSONA_ALPHA',
  source: 'global',
  file: '',
};

test('common validation rejects unsafe IDs, bad graphs and invalid settings', () => {
  for (const id of ['../escape', '/root', 'a/b', '', '..', 'a.b'])
    assert.throws(() => validateTasks([task(id)]));
  assert.throws(() => validateTasks([task('a'), task('a')]));
  assert.throws(() => validateTasks([task('a', 'x', ['missing'])]));
  assert.throws(() => validateTasks([task('a', 'x', ['b']), task('b', 'x', ['a'])]));
  assert.throws(() => validateTasks([{ id: 'a', prompt: 'x' }]));
  for (const v of [0, -1, NaN, Infinity, 'bad', 1.5])
    assert.throws(() => positiveNumber(v, 'concurrency', true));
  assert.throws(() => inside(temp, '..', 'escape'));
});

test('dependent workers inherit commits; diffs contain only their own changes; repeated IDs coexist', async () => {
  const dir = repo(),
    base = headSha(dir),
    opts = options(dir);
  const tasks = [
    task('child', '[require parent.txt] [write child.txt child]', ['parent']),
    task('parent', '[write parent.txt parent]'),
  ];
  const run1 = newRunDir(dir);
  const result = await runSquad(tasks, opts, run1);
  assert.deepEqual(
    result.map((r) => r.status),
    ['success', 'success'],
  );
  assert.equal(headSha(dir), base);
  const patch = fs.readFileSync(path.join(run1, 'child', 'diff.patch'), 'utf8');
  assert.match(patch, /child.txt/);
  assert.doesNotMatch(patch, /parent.txt/);
  const run2 = newRunDir(dir);
  const result2 = await runSquad(tasks, opts, run2);
  assert.notEqual(result[0].branch, result2[0].branch);
  assert.ok(fs.existsSync(result[0].worktreePath));
  for (const r of dependencyOrder(result)) assert.ok(mergeBranch(dir, r.headSha).ok);
  assert.equal(fs.readFileSync(path.join(dir, 'child.txt'), 'utf8'), 'child\n');
  assert.match(mergeBranch(dir, result[0].headSha).output, /already integrated/);
});

test('dependency conflict fails only that branch, skips descendants, and preserves independent work', async () => {
  const dir = repo();
  const result = await runSquad(
    [
      task('a', '[write conflict.txt A]'),
      task('b', '[write conflict.txt B]'),
      task('join', 'should not run', ['a', 'b']),
      task('after', 'should not run', ['join']),
      task('other', '[write other.txt OK]'),
    ],
    options(dir),
    newRunDir(dir),
  );
  assert.deepEqual(
    result.map((r) => r.status),
    ['success', 'success', 'failed', 'skipped', 'success'],
  );
  assert.match(result[2].error, /dependency merge failed/);
});

test('a no-change dependency still propagates inherited commits and has no merge branch', async () => {
  const dir = repo();
  const result = await runSquad(
    [
      task('a', '[write inherited.txt yes]'),
      task('b', '[require inherited.txt]', ['a']),
      task('c', '[require inherited.txt] [write c.txt yes]', ['b']),
    ],
    options(dir),
    newRunDir(dir),
  );
  assert.ok(result.every((r) => r.status === 'success'));
  assert.equal(result[1].changed, false);
  assert.equal(result[1].branch, undefined);
  assert.equal(result[1].headSha, result[0].headSha);
});

test('worktree creation failure becomes a result and does not destroy existing files', async () => {
  const dir = repo(),
    run = newRunDir(dir);
  const existing = path.join(worktreesRoot(dir), path.basename(run), 'blocked');
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, 'keep.txt'), 'keep');
  const result = await runSquad([task('blocked'), task('ok')], options(dir), run);
  assert.deepEqual(
    result.map((r) => r.status),
    ['failed', 'success'],
  );
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'keep');
});

test('CLI merge skips no-change tasks and supports old meta files', async () => {
  const dir = repo(),
    run = newRunDir(dir);
  const result = await runSquad(
    [task('empty'), task('edited', '[write edited.txt yes]')],
    options(dir),
    run,
  );
  const meta = path.join(run, 'edited', 'meta.json');
  const legacy = JSON.parse(fs.readFileSync(meta));
  delete legacy.headSha;
  fs.writeFileSync(meta, JSON.stringify(legacy));
  execFileSync(process.execPath, ['dist/cli.js', 'merge', '--repo', dir, '--run', run], {
    cwd: path.resolve('.'),
    stdio: 'pipe',
  });
  assert.ok(fs.existsSync(path.join(dir, 'edited.txt')));
});

test('process output is bounded, full logs remain available, and missing executable rejects', async () => {
  const dir = repo(),
    log = path.join(dir, 'large.log');
  const result = await runDevin({
    cwd: dir,
    prompt: '[large]',
    permissionMode: 'normal',
    timeoutMs: 5000,
    logPath: log,
  });
  assert.equal(result.truncated, true);
  assert.ok(result.stdout.length <= 2 * 1024 * 1024);
  assert.equal(fs.statSync(log).size, 3 * 1024 * 1024);
  const saved = process.env.PATH;
  process.env.PATH = path.join(temp, 'absent');
  try {
    await assert.rejects(
      runDevin({
        cwd: dir,
        prompt: 'x',
        permissionMode: 'normal',
        timeoutMs: 1000,
      }),
      /ENOENT/,
    );
  } finally {
    process.env.PATH = saved;
  }
});

test('timeout terminates the entire process group', async () => {
  const dir = repo();
  const result = await runDevin({
    cwd: dir,
    prompt: '[tree]',
    permissionMode: 'normal',
    timeoutMs: 400,
  });
  assert.equal(result.timedOut, true);
  const pid = Number(fs.readFileSync(path.join(dir, 'child.pid')));
  let alive = true;
  for (let i = 0; i < 30; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
      break;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(alive, false);
});

test('conversation sessions resume in the same isolated environment, serialized and repo-scoped', async () => {
  const dir = repo(),
    start = audit().length;
  await Promise.all([
    personaSay(persona, 'first [delay]', { repo: dir, timeoutMs: 5000 }),
    personaSay(persona, 'second', { repo: dir, timeoutMs: 5000 }),
  ]);
  const calls = audit().slice(start);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].resume, calls[0].id);
  assert.match(calls[0].prompt, /PERSONA_ALPHA/);
  assert.equal(calls[1].prompt, 'second');
  await personaSay(persona, 'new repo', { repo: repo(), timeoutMs: 5000 });
  assert.notEqual(audit().at(-1).cwd, calls[0].cwd);
});

test('shared conversation passes attachments, deduplicates responders, and only cleans disposable sessions', async () => {
  const dir = repo();
  await personaSay(persona, 'persistent', { repo: dir, timeoutMs: 5000 });
  const persistent = audit().at(-1),
    replies = [],
    start = audit().length;
  await converse({
    personas: [persona],
    author: 'you',
    message: '[添付: test.txt]\nUNIQUE_ATTACHMENT',
    context: ['you: short'],
    timeoutMs: 5000,
    onReply: async (p, reply) => replies.push({ p, reply }),
  });
  assert.equal(replies.length, 1);
  const calls = audit().slice(start),
    speaker = calls.find((c) => c.prompt.includes('PERSONA_ALPHA'));
  assert.match(speaker.prompt, /UNIQUE_ATTACHMENT/);
  assert.ok((await sessionIds(persistent.cwd)).includes(persistent.id));
  const list = execFileSync('devin', ['list', '--format', 'json'], {
    cwd: dir,
    env: { ...process.env, XDG_DATA_HOME: persistent.env },
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(list).length, 0);
});

test('Slack duplicate event receipts and serialized conversation work', async () => {
  assert.equal(claimSlackEvent('C123', '1.01'), true);
  assert.equal(claimSlackEvent('C123', '1.01'), false);
  assert.equal(claimSlackEvent('C999', '1.01'), true);
  const calls = [];
  await Promise.all([
    serial('test', async () => {
      calls.push('a');
      await new Promise((r) => setTimeout(r, 100));
      calls.push('b');
    }),
    serial('test', async () => calls.push('c')),
  ]);
  assert.deepEqual(calls, ['a', 'b', 'c']);
});

test('Slack process lease rejects duplicate bots and run status is readable', async () => {
  const first = claimProcess('slack:test-token', { repo: '/first' });
  assert.throws(() => claimProcess('slack:test-token', { repo: '/second' }), /already running/);
  first.release();
  const second = claimProcess('slack:test-token', { repo: '/second' });
  second.release();

  assert.equal(
    formatSlackRunStatus(
      {
        goal: 'test',
        originChannel: 'C1',
        runChannel: 'C2',
        phase: 'running',
        startedAt: 0,
        updatedAt: 0,
        completed: 1,
        total: 3,
      },
      125_000,
    ),
    '現在: *タスクを実行中* · 経過 2分5秒 · 1/3タスク',
  );
});

test('Slack persona identity supports emoji, HTTPS images, and legacy defaults', () => {
  assert.deepEqual(
    slackIdentity({
      name: 'research-otaku',
      emoji: '🔬',
      description: 'researcher',
      prompt: 'research',
      slackName: 'リサーチ担当',
      icon: ':microscope:',
    }),
    { username: 'リサーチ担当', icon_emoji: ':microscope:' },
  );
  assert.deepEqual(
    slackIdentity({
      name: 'brand-designer',
      emoji: '🖌️',
      description: 'designer',
      prompt: 'design',
      slackName: 'Brand Designer',
      icon: 'https://example.com/designer.png',
    }),
    { username: 'Brand Designer', icon_url: 'https://example.com/designer.png' },
  );
  assert.deepEqual(
    slackIdentity({
      name: 'alpha',
      emoji: '🧪',
      description: 'legacy persona',
      prompt: 'test',
    }),
    { username: '🧪 alpha' },
  );
});

test('planner output is retained in a diagnostic log', async () => {
  const dir = repo();
  const log = path.join(dir, 'planner.log');
  const tasks = await planTasks('test goal', {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
  });
  assert.deepEqual(
    tasks.map((entry) => entry.id),
    ['api', 'docs'],
  );
  assert.match(fs.readFileSync(log, 'utf8'), /"id":"api"/);
});

test('CLI parsing preserves spaces, equal signs and positional arguments', () => {
  const args = parseArgs([
    'talk',
    'alpha',
    'hello world',
    '--model=a=b',
    '--repo',
    '/some path',
    '--',
    '--config',
    'a b=c',
  ]);
  assert.deepEqual(args.positionals, ['alpha', 'hello world']);
  assert.equal(args.flags.model, 'a=b');
  assert.deepEqual(args.extra, ['--config', 'a b=c']);
});

test('persona listing does not require the Devin executable', () => {
  const dir = repo();
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'personas', '--repo', dir],
    {
      cwd: dir,
      env: { ...process.env, PATH: path.join(temp, 'missing-bin') },
      encoding: 'utf8',
    },
  );
  assert.match(result, /no personas/);
});

test('shutdown terminates descendant processes', async () => {
  const dir = repo();
  const entry = new URL('../dist/devin.js', import.meta.url).href;
  const script = `import { runDevin } from ${JSON.stringify(entry)}; await runDevin(${JSON.stringify({ cwd: dir, prompt: '[tree]', permissionMode: 'normal', timeoutMs: 10000 })});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: process.env,
    stdio: 'ignore',
  });
  const exit = once(child, 'exit');
  try {
    for (let i = 0; i < 100 && !fs.existsSync(path.join(dir, 'child.pid')); i++)
      await new Promise((r) => setTimeout(r, 30));
    const pid = Number(fs.readFileSync(path.join(dir, 'child.pid')));
    child.kill('SIGTERM');
    assert.equal((await exit)[0], 143);
    let alive = true;
    for (let i = 0; i < 30; i++) {
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(alive, false);
  } finally {
    child.kill('SIGKILL');
  }
});

test('run history restores legacy results and marks interrupted runs explicitly', async () => {
  const dir = repo(),
    oldDir = newRunDir(dir),
    interrupted = newRunDir(dir);
  fs.writeFileSync(path.join(oldDir, 'tasks.json'), JSON.stringify({ tasks: [task('old')] }));
  fs.mkdirSync(path.join(oldDir, 'old'));
  fs.writeFileSync(
    path.join(oldDir, 'old', 'meta.json'),
    JSON.stringify({ task: task('old'), status: 'success', changed: false }),
  );
  fs.writeFileSync(
    path.join(interrupted, 'run.json'),
    JSON.stringify({ status: 'running', tasks: [task('pending')], events: [] }),
  );
  const server = serve({ ...options(dir), port: 0 });
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const old = await (await fetch(base + '/api/run?run=' + path.basename(oldDir))).json();
    assert.equal(old.results[0].task.id, 'old');
    const failed = await (await fetch(base + '/api/run?run=' + path.basename(interrupted))).json();
    assert.equal(failed.status, 'error');
    assert.equal(failed.events.at(-1).type, 'run-error');
    const events = await (
      await fetch(base + '/api/events?run=' + path.basename(interrupted))
    ).text();
    assert.match(events, /run-error/);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test('HTTP safety, chat history, execution state and artifact allowlist', async () => {
  const dir = repo(),
    personaDir = path.join(dir, '.devin-squad', 'personas');
  fs.mkdirSync(personaDir, { recursive: true });
  fs.writeFileSync(path.join(personaDir, 'alpha.md'), '---\nname: alpha\n---\nPERSONA_ALPHA');
  const server = serve({ ...options(dir), port: 0 });
  await once(server, 'listening');
  assert.equal(server.address().address, '127.0.0.1');
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, body, headers = {}) =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    const invalidHost = await new Promise((resolve, reject) => {
      http
        .get(base + '/api/state', { headers: { host: 'evil.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(invalidHost, 403);
    assert.equal((await post('/api/run', {}, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/api/run', { tasks: [task('../escape')] })).status, 400);
    assert.equal((await post('/api/run', { tasks: [task('a')], concurrency: 0 })).status, 400);
    assert.equal(
      (
        await post('/api/chat', {
          persona: 'alpha',
          message: 'x'.repeat(1024 * 1024),
        })
      ).status,
      413,
    );
    assert.equal((await fetch(base + '/api/chat', { method: 'POST', body: '{}' })).status, 415);
    assert.equal(
      (
        await fetch(base + '/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        })
      ).status,
      400,
    );
    const chat = {
      persona: 'alpha',
      message: 'hello',
      requestId: 'same-request',
    };
    assert.equal((await post('/api/chat', chat)).status, 200);
    assert.equal((await post('/api/chat', chat)).status, 200);
    const history = await (await fetch(base + '/api/messages?persona=alpha')).json();
    assert.equal(history.messages.length, 2);
    const submission = {
      tasks: [task('api', '[write api.txt yes]')],
      requestId: 'same-run',
    };
    const run = await (await post('/api/run', submission)).json();
    assert.equal((await (await post('/api/run', submission)).json()).runId, run.runId);
    assert.equal(
      (await post('/api/run', { ...submission, tasks: [task('different')] })).status,
      409,
    );
    let state;
    for (let i = 0; i < 100; i++) {
      state = await (await fetch(base + '/api/run?run=' + run.runId)).json();
      if (state.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(state.status, 'done');
    assert.equal(state.results[0].status, 'success');
    assert.match(
      await (await fetch(base + '/api/artifact?run=' + run.runId + '&file=report.md')).text(),
      /# Devin Squad Run\n\n/,
    );
    assert.equal(
      (await fetch(base + '/api/artifact?run=' + run.runId + '&task=../escape&file=output.md'))
        .status,
      404,
    );
    const artifact = path.join(process.env.DEVIN_SQUAD_HOME, 'runs');
    const runDir = path.join(
      artifact,
      fs.readdirSync(artifact).find((x) => fs.existsSync(path.join(artifact, x, run.runId))),
      run.runId,
    );
    fs.symlinkSync(path.join(dir, 'base.txt'), path.join(runDir, 'api', 'session.atif.json'));
    assert.equal(
      (await fetch(base + '/api/artifact?run=' + run.runId + '&task=api&file=session.atif.json'))
        .status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
