# devin-squad

> Community project — not affiliated with or endorsed by Cognition / Devin.

Run a **team of parallel Devin CLI workers** on one repo. Each task gets its own
git worktree and a `devin -p` worker; results are collected into a run report and
successful branches can be merged back.

## Why

One `devin` session is one agent. devin-squad fans a goal out to N isolated
workers (planner → builders → your review), so independent subtasks truly run in
parallel without fighting over a working tree.

## Install

```bash
npm install
npm run build          # → dist/cli.js
npm link               # optional: puts `devin-squad` on PATH
```

Requires: Node ≥ 20, git, and an authenticated `devin` CLI (`devin auth status`).

## Usage

```bash
# 1. Write tasks yourself, or let a planner Devin decompose a goal:
devin-squad plan --goal "Add tests for the parser and fix lint warnings" --out tasks.json

# 2. Execute in parallel (isolated worktrees, auto-committed branches):
devin-squad run --tasks tasks.json --concurrency 3

# 3. Review diffs in the run dir, then merge what you like:
devin-squad merge --run latest
```

`tasks.json`:

```json
{
  "goal": "what you're trying to do",
  "tasks": [
    { "id": "api", "title": "Build API", "prompt": "…", "dependsOn": [] },
    { "id": "docs", "title": "Write docs", "prompt": "…", "dependsOn": ["api"] }
  ]
}
```

Options: `--repo`, `--concurrency` (default 3), `--mode` (default `bypass`;
`--sandbox` switches to `autonomous` under the OS sandbox), `--timeout`
(minutes, default 30), `--model`, `--keep-worktrees`, `--dry-run`.

## Where things go

- Worktrees: `~/.devin-squad/worktrees/<repo-hash>/<task-id>` (branch `squad/<task-id>`)
- Runs: `~/.devin-squad/runs/<repo-hash>/<timestamp>/` with `report.md`,
  per-task `output.md` / `diff.patch` / `session.atif.json` / `log.txt` / `meta.json`
- Worktrees are auto-removed when a task changed nothing; kept otherwise.

## Notes

Non-interactive runs need `--respect-workspace-trust false` (worktrees are
untrusted dirs) — devin-squad passes this automatically.

## Roadmap

- [ ] `devin acp` backend for multi-turn steering (currently `-p` single-shot)
- [ ] Reviewer pass: a devin worker reviews diffs before merge
- [ ] Cloud handoff for long tasks (`/handoff`)
- [ ] myagent bridge: expose squad runs as myagent `invoke_worker` backend
