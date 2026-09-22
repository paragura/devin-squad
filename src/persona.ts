import fs from 'node:fs';
import path from 'node:path';
import { SQUAD_HOME } from './paths.js';
import { identifier, inside } from './validation.js';

export interface Persona {
  name: string;
  emoji: string;
  description: string;
  prompt: string;
  model?: string;
  permissionMode?: string;
  /** Slack display name override (defaults to name). */
  slackName?: string;
  /** Slack avatar: ":emoji_code:" or an image URL. */
  icon?: string;
  source: 'global' | 'project';
  file: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parsePersonaFile(file: string, source: Persona['source']): Persona | null {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(FRONTMATTER);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return {
    name: meta.name ?? path.basename(file, '.md'),
    emoji: meta.emoji ?? '🤖',
    description: meta.description ?? '',
    prompt: m[2].trim(),
    model: meta.model || undefined,
    permissionMode: meta.permissionMode || undefined,
    slackName: meta.slackName || undefined,
    icon: meta.icon || undefined,
    source,
    file,
  };
}

export function personasDirs(repo?: string): { dir: string; source: Persona['source'] }[] {
  const dirs: { dir: string; source: Persona['source'] }[] = [
    { dir: path.join(SQUAD_HOME, 'personas'), source: 'global' },
  ];
  if (repo) dirs.push({ dir: path.join(repo, '.devin-squad', 'personas'), source: 'project' });
  return dirs;
}

export function listPersonas(repo?: string): Persona[] {
  const byName = new Map<string, Persona>();
  for (const { dir, source } of personasDirs(repo)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const p = parsePersonaFile(path.join(dir, f), source);
      if (p) byName.set(p.name, p);
    }
  }
  return [...byName.values()];
}

/** Built-in secretary: relays questions to the boss when personas need a
 * human decision. Overridden by a persona file named secretary/秘書. */
const SECRETARY_FALLBACK: Persona = {
  name: 'secretary',
  emoji: '🗂️',
  description: '社長秘書 — チームが人間の判断を必要とするときだけ発言する',
  slackName: '秘書',
  icon: ':ledger:',
  prompt:
    'あなたは社長秘書です。チームの議論を見守り、社長（ユーザー）への確認や判断が必要なときだけ発言します。' +
    '要点を簡潔にまとめ、結論が出やすい形で質問してください。丁寧だが簡潔に。',
  source: 'global',
  file: '',
};

export function findSecretary(personas: Persona[]): Persona {
  return personas.find((p) => /secretary|秘書|hisho/i.test(p.name)) ?? SECRETARY_FALLBACK;
}

export function getPersona(name: string, repo?: string): Persona | null {
  return listPersonas(repo).find((p) => p.name === name) ?? null;
}

export function scaffoldPersona(name: string, dir: string): string {
  identifier(name, 'persona name');
  fs.mkdirSync(dir, { recursive: true });
  const file = inside(dir, `${name}.md`);
  if (fs.existsSync(file)) throw new Error(`persona already exists: ${file}`);
  fs.writeFileSync(
    file,
    `---
name: ${name}
emoji: 🎭
description: 説明をここに（ルーターが発言者を選ぶときの判断材料になる）
# model: opus
# permissionMode: bypass
# slackName: Slack 上の表示名（省略時は name）
# icon: ":shield:" 形式の Slack 絵文字コードか画像 URL
---

あなたは「${name}」というペルソナの Devin ワーカーです。
ここに役割・口調・得意領域・振る舞いのルールを書いてください。
`,
  );
  return file;
}
