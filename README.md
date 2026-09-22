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

## Personas

Drop markdown files into `~/.devin-squad/personas/` (global) or
`<repo>/.devin-squad/personas/` (project) to add team members:

```markdown
---
name: strict-reviewer
emoji: 🛡️
description: 厳しい関西弁レビュアー
# model: opus
# permissionMode: bypass
---

あなたは厳しいコードレビュアーです。関西弁で話します。…
```

Then use them per task (`"persona": "strict-reviewer"` in tasks.json) or for the
whole run (`--persona strict-reviewer`). You can also just chat with one —
the persona keeps memory across turns via Devin session resume:

```bash
devin-squad personas                    # list
devin-squad persona new my-role         # scaffold
devin-squad talk strict-reviewer        # REPL chat
devin-squad talk strict-reviewer "main.py をレビューして"  --repo .
```

Examples live in [`examples/personas/`](examples/personas/).

## Web UI

```bash
devin-squad serve --port 3333 --repo .
```

Opens a local chat-room UI: pick a persona on the left to talk to it, or use
the right panel to turn a goal into a planned task list and launch a squad run
with live per-task status.

## Slack bot (socket mode)

```bash
export SLACK_BOT_TOKEN=xoxb-...   # scopes: app_mentions:read, chat:write, chat:write.customize,
                                #         channels:history, reactions:write, users:read,
                                #         files:read (read attachments), files:write + canvases:write
                                #         + channels:manage (run channels: report file + canvas)
export SLACK_APP_TOKEN=xapp-...   # app-level token, connections:write
devin-squad slack --repo .
```

Two ways personas join the conversation:

- **Ambient (default)** — the bot listens to channel `message` events; a
  lightweight router call decides which 0–2 personas fit the message, and those
  personas reply to the channel under their own name and avatar (`username` +
  `icon_emoji`/`icon_url` per message). Disable with `--no-ambient`.
- **Explicit mention** — `@squad <persona> <msg>` talks to that persona
  directly, `plan`/`run` work as below.

Commands via mention:

- `@squad personas` — list personas
- `@squad <persona> <msg>` — chat as that persona
- `@squad plan <goal>` — decompose only
- `@squad run <goal>` — plan → parallel run → progress + report in channel

Persona avatar/name: set `slackName:` and `icon:` (`:emoji_code:` or image URL)
in the persona frontmatter.

Setup: create a Slack app at api.slack.com, enable Socket Mode, add an
app-level token with `connections:write`, add the bot scopes above, subscribe
to the `app_mention` and `message.channels` bot events, install to your
workspace. For private channels also add `groups:history` + `message.groups`.

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
