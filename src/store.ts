import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { SQUAD_HOME, repoFingerprint } from './paths.js';

export interface ChatMessage {
  id?: string;
  requestId?: string;
  ts: number;
  author: 'user' | 'persona';
  name: string;
  display: string;
  text: string;
}

const DIR = path.join(SQUAD_HOME, 'channels');

export function directChannel(repo: string, persona: string): string {
  return `dm_${repoFingerprint(repo)}_${createHash('sha256').update(persona).digest('hex').slice(0, 20)}`;
}

export function channelFilePath(channel: string): string {
  return path.join(DIR, channel.replace(/[^A-Za-z0-9_-]/g, '_') + '.jsonl');
}

export function appendMessage(channel: string, msg: Omit<ChatMessage, 'ts'>): void {
  fs.mkdirSync(DIR, { recursive: true });
  const rec: ChatMessage = { id: randomUUID(), ts: Date.now(), ...msg };
  fs.appendFileSync(channelFilePath(channel), JSON.stringify(rec) + '\n');
}

export function readMessages(channel: string, limit = 50): ChatMessage[] {
  const f = channelFilePath(channel);
  if (!fs.existsSync(f)) return [];
  const fd = fs.openSync(f, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - 2 * 1024 * 1024);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    if (start) text = text.slice(text.indexOf('\n') + 1);
    // Ignore partial/corrupt lines, including an append observed in progress.
    return text
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ChatMessage];
        } catch {
          return [];
        }
      })
      .slice(-limit);
  } finally {
    fs.closeSync(fd);
  }
}

/** "name: text" lines for prompt context. */
export function contextLines(channel: string, limit = 15): string[] {
  return readMessages(channel, limit).map((m) => `${m.display}: ${m.text}`.slice(0, 300));
}

export function listChannels(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.jsonl') && !f.startsWith('dm_'))
    .map((f) => f.slice(0, -'.jsonl'.length));
}
