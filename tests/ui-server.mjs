// Offline UI test fixture. Never connects to Devin or Slack.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-squad-ui-'));
process.env.DEVIN_SQUAD_HOME = path.join(dir, 'home');
const bin = path.join(dir, 'bin');
fs.mkdirSync(bin);
fs.copyFileSync(new URL('./fake-devin.mjs', import.meta.url), path.join(bin, 'devin'));
fs.chmodSync(path.join(bin, 'devin'), 0o755);
process.env.PATH = bin + path.delimiter + process.env.PATH;
const repo = path.join(dir, 'workspace');
fs.mkdirSync(repo);
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
git('init');
git('config', 'user.name', 'UI Test');
git('config', 'user.email', 'ui@example.invalid');
fs.writeFileSync(path.join(repo, 'README.md'), '# Offline UI fixture\n');
git('add', '.');
git('commit', '-m', 'initial');
const personaDir = path.join(repo, '.devin-squad', 'personas');
fs.mkdirSync(personaDir, { recursive: true });
for (const [name, emoji, description] of [
  ['strict-reviewer', '🛡️', '品質と設計を、一緒に考える'],
  ['frontend-dev', '🎨', '使いやすい画面づくりを相談'],
  ['secretary', '🗂️', '議論を整理して、次の一歩へ'],
]) {
  fs.writeFileSync(
    path.join(personaDir, name + '.md'),
    '---\nname: ' +
      name +
      '\nemoji: ' +
      emoji +
      '\ndescription: ' +
      description +
      '\n---\nあなたは ' +
      name +
      ' です。',
  );
}
const { serve } = await import('../dist/server.js');
serve({
  repo,
  port: Number(process.env.SQUAD_TEST_PORT || 43337),
  concurrency: 2,
  permissionMode: 'normal',
  timeoutMs: 10000,
  extraArgs: [],
});
