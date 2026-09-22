import path from 'node:path';
import type { SquadTask } from './types.js';

export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function identifier(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new InputError(
      `${label}: use 1–64 letters, digits, hyphens or underscores, starting with a letter or digit`,
    );
  }
  return value;
}

export function positiveNumber(value: unknown, label: string, integer = false): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n)))
    throw new InputError(`${label} must be a positive ${integer ? 'integer' : 'number'}`);
  return n;
}

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${label} is required`);
  return value;
}

export function inside(root: string, ...parts: string[]): string {
  const base = path.resolve(root);
  const target = path.resolve(base, ...parts);
  if (target === base || !target.startsWith(base + path.sep))
    throw new InputError('path must stay inside its directory');
  return target;
}

export function validateTasks(value: unknown): SquadTask[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new InputError('provide 1–100 tasks');
  const tasks = value.map((raw): SquadTask => {
    if (!raw || typeof raw !== 'object') throw new InputError('invalid task');
    const id = identifier(raw.id, 'task id');
    if (raw.dependsOn !== undefined && !Array.isArray(raw.dependsOn))
      throw new InputError(`${id}: dependsOn must be an array`);
    return {
      id,
      title: requiredText(raw.title, `${id}: title`),
      prompt: requiredText(raw.prompt, `${id}: prompt`),
      dependsOn: [
        ...new Set<string>((raw.dependsOn ?? []).map((d: unknown) => identifier(d, 'dependency'))),
      ],
      ...(raw.persona === undefined ? {} : { persona: requiredText(raw.persona, 'persona') }),
    };
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (byId.size !== tasks.length) throw new InputError('duplicate task id');
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new InputError(`cyclic dependency: ${id}`);
    if (visited.has(id)) return;
    const t = byId.get(id);
    if (!t) throw new InputError(`unknown dependency: ${id}`);
    active.add(id);
    t.dependsOn!.forEach(visit);
    active.delete(id);
    visited.add(id);
  };
  tasks.forEach((t) => visit(t.id));
  return tasks;
}

export function dependencyOrder<T extends { task: SquadTask }>(results: T[]): T[] {
  const byId = new Map(results.map((r) => [r.task.id, r]));
  const seen = new Set<string>(),
    ordered: T[] = [];
  const visit = (r: T) => {
    if (seen.has(r.task.id)) return;
    seen.add(r.task.id);
    for (const dep of r.task.dependsOn ?? []) {
      const parent = byId.get(dep);
      if (parent) visit(parent);
    }
    ordered.push(r);
  };
  results.forEach(visit);
  return ordered;
}
