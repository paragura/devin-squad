#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const root = path.join(process.env.XDG_DATA_HOME, 'fake-sessions');
fs.mkdirSync(root, { recursive: true });
const store = path.join(
  root,
  crypto.createHash('sha256').update(process.cwd()).digest('hex') + '.json',
);
const read = () => (fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, 'utf8')) : []);
let sessions = read();
if (args[0] === 'list') {
  console.log(JSON.stringify(sessions));
  process.exit(0);
}
if (args[0] === 'rm') {
  fs.writeFileSync(store, JSON.stringify(sessions.filter((s) => s.id !== args[1])));
  process.exit(0);
}
if (args[0] === 'version') {
  console.log('fake-devin');
  process.exit(0);
}
const prompt = args.at(-1);
const resume = args.includes('-r') ? args[args.indexOf('-r') + 1] : null;
if (resume && !sessions.some((s) => s.id === resume)) {
  console.error('unknown session');
  process.exit(1);
}
const id = resume ?? crypto.randomUUID();
if (!resume) {
  sessions.push({ id });
  fs.writeFileSync(store, JSON.stringify(sessions));
}
if (process.env.FAKE_DEVIN_AUDIT)
  fs.appendFileSync(
    process.env.FAKE_DEVIN_AUDIT,
    JSON.stringify({
      cwd: process.cwd(),
      id,
      resume,
      prompt,
      args,
      env: process.env.XDG_DATA_HOME,
    }) + '\n',
  );
if (prompt.includes('[delay]')) await new Promise((r) => setTimeout(r, 350));
if (prompt.includes('[fail]')) {
  console.error('synthetic failure');
  process.exit(7);
}
if (prompt.includes('[tree]')) {
  const child = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],
    { stdio: 'ignore' },
  );
  fs.writeFileSync(path.join(process.cwd(), 'child.pid'), String(child.pid));
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}
for (const m of prompt.matchAll(/\[require ([\w.-]+)\]/g)) {
  if (!fs.existsSync(m[1])) {
    console.error('missing dependency: ' + m[1]);
    process.exit(3);
  }
}
for (const m of prompt.matchAll(/\[write ([\w.-]+) ([^\]]+)\]/g))
  fs.writeFileSync(m[1], m[2] + '\n');
if (prompt.includes('You are the planner')) {
  console.log(
    JSON.stringify([
      { id: 'api', title: 'APIのテストを追加', prompt: '[write api.txt API]', dependsOn: [] },
      {
        id: 'docs',
        title: '使い方を更新',
        prompt: '[require api.txt] [write docs.txt Docs]',
        dependsOn: ['api'],
      },
    ]),
  );
} else if (prompt.includes('You are a router')) {
  const name = prompt.match(/^- ([^:]+):/m)?.[1] ?? 'alpha';
  console.log(JSON.stringify([name, name, name]));
} else if (prompt.includes('You are the judge')) console.log('{"state":"done"}');
else if (prompt.includes('[large]')) process.stdout.write('x'.repeat(3 * 1024 * 1024));
else
  console.log(
    '## 確認しました\n\n**次の一歩**を一緒に整理しましょう。\n\n- 目的を確認する\n- 小さく試してみる\n\n```js\nconst team = "squad";\n```\n\n<img src=x onerror=alert(1)>',
  );
