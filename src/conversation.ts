import { findSecretary, type Persona } from './persona.js';
import { pickResponders, judgeConversation } from './router.js';
import { personaSayOnce } from './talk.js';

interface ConversationOptions {
  personas: Persona[];
  author: string;
  message: string;
  context: string[];
  timeoutMs: number;
  model?: string;
  routerModel?: string;
  onReply: (persona: Persona, reply: string) => Promise<void>;
}

/** Transport-independent, bounded discussion. The original input includes attachments. */
export async function converse(opts: ConversationOptions): Promise<void> {
  const ctx = [...opts.context];
  const routerOpts = { timeoutMs: opts.timeoutMs, model: opts.routerModel ?? opts.model };
  const sayOpts = { timeoutMs: opts.timeoutMs, model: opts.model };
  let previous = new Set<string>();
  for (let round = 0; round < 8; round++) {
    const selected = await pickResponders(
      opts.personas,
      round ? 'conversation' : opts.author,
      round ? (ctx.at(-1) ?? '') : opts.message,
      ctx,
      routerOpts,
    );
    const responders = selected.filter((p) => !previous.has(p.name));
    if (!responders.length) return;
    for (const p of responders) {
      const reply = await personaSayOnce(
        p,
        round ? (ctx.at(-1) ?? opts.message) : `${opts.author}: ${opts.message}`,
        ctx.slice(-20),
        sayOpts,
      );
      await opts.onReply(p, reply);
      ctx.push(`${p.name}: ${reply}`);
    }
    previous = new Set(responders.map((p) => p.name));
    const verdict = await judgeConversation(opts.message, ctx, routerOpts);
    if (verdict.state === 'done') return;
    if (verdict.state === 'ask_human') {
      const secretary = findSecretary(opts.personas);
      const reply = await personaSayOnce(
        secretary,
        `チームからユーザーへの確認事項です。簡潔に質問してください: ${verdict.question ?? ''}`,
        ctx.slice(-20),
        sayOpts,
      );
      await opts.onReply(secretary, reply);
      return;
    }
  }
}
