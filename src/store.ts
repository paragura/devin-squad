import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ChatMessage {
  ts: number;
  author: 'user' | 'persona';
  name: string;
  display: string;
  text: string;
}

const DIR = path.join(os.homedir(), '.devin-squad', 'channels');

export function channelFilePath(channel: string): string {
  return path.join(DIR, channel.replace(/[^A-Za-z0-9_-]/g, '_') + '.jsonl');
}

export function appendMessage(channel: string, msg: Omit<ChatMessage, 'ts'>): void {
  fs.mkdirSync(DIR, { recursive: true });
  const rec: ChatMessage = { ts: Date.now(), ...msg };
  fs.appendFileSync(channelFilePath(channel), JSON.stringify(rec) + '\n');
}

export function readMessages(channel: string, limit = 50): ChatMessage[] {
  const f = channelFilePath(channel);
  if (!fs.existsSync(f)) return [];
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map(l => JSON.parse(l) as ChatMessage);
}

/** "name: text" lines for prompt context. */
export function contextLines(channel: string, limit = 15): string[] {
  return readMessages(channel, limit).map(m => `${m.display}: ${m.text}`.slice(0, 300));
}

export function listChannels(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.slice(0, -'.jsonl'.length));
}
