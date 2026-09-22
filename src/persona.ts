import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Persona {
  name: string;
  emoji: string;
  description: string;
  prompt: string;
  model?: string;
  permissionMode?: string;
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
    source,
    file,
  };
}

export function personasDirs(repo?: string): { dir: string; source: Persona['source'] }[] {
  const dirs: { dir: string; source: Persona['source'] }[] = [
    { dir: path.join(os.homedir(), '.devin-squad', 'personas'), source: 'global' },
  ];
  if (repo) dirs.push({ dir: path.join(repo, '.devin-squad', 'personas'), source: 'project' });
  return dirs;
}

export function listPersonas(repo?: string): Persona[] {
  const byName = new Map<string, Persona>();
  for (const { dir, source } of personasDirs(repo)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const p = parsePersonaFile(path.join(dir, f), source);
      if (p) byName.set(p.name, p);
    }
  }
  return [...byName.values()];
}

export function getPersona(name: string, repo?: string): Persona | null {
  return listPersonas(repo).find(p => p.name === name) ?? null;
}

export function scaffoldPersona(name: string, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  if (fs.existsSync(file)) throw new Error(`persona already exists: ${file}`);
  fs.writeFileSync(
    file,
    `---
name: ${name}
emoji: 🎭
description: 説明をここに
# model: opus
# permissionMode: bypass
---

あなたは「${name}」というペルソナの Devin ワーカーです。
ここに役割・口調・得意領域・振る舞いのルールを書いてください。
`
  );
  return file;
}
