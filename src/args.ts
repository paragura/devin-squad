const BOOLEAN_FLAGS = new Set([
  'help',
  'sandbox',
  'keep-worktrees',
  'dry-run',
  'global',
  'project',
  'no-ambient',
]);

export function parseArgs(argv: string[]) {
  const [cmd = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let extra: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') {
      extra = rest.slice(i + 1);
      break;
    }
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = a.slice(2, eq < 0 ? undefined : eq);
    if (eq >= 0) flags[key] = a.slice(eq + 1);
    else if (BOOLEAN_FLAGS.has(key)) flags[key] = true;
    else if (rest[i + 1] && !rest[i + 1].startsWith('--')) flags[key] = rest[++i];
    else throw new Error(`--${key} requires a value`);
  }
  return { cmd, flags, positionals, extra };
}
