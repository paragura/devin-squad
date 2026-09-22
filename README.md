# 🐝 devin-squad

**Talk with a team of AI personas. Turn a goal into parallel Devin workers. Review the results before merging.**

English · [日本語](README.ja.md)

devin-squad is a local TypeScript application built around the Devin CLI. Chat in
the browser or Slack, then delegate code changes to workers in separate Git
worktrees. Each run keeps its task results, logs, diffs, and a report.

> Community project. Not affiliated with or endorsed by Cognition or Devin.

## What you can do

- **Chat with a team:** Markdown personas define each member's role and style.
  In shared rooms, a router selects up to two relevant responders per round.
- **Keep conversations organized:** switch between rooms or individual personas;
  direct chat history survives page reloads.
- **Run work in parallel:** a planner proposes tasks, workers use isolated
  worktrees, and dependent tasks receive their predecessors' changes.
- **Review before integrating:** inspect task output, diffs, logs, and reports.
  Merging is a separate, explicit CLI command.
- **Use Slack optionally:** mentions, ambient discussions, text attachments,
  progress messages, and optional report uploads/channel canvases.

## Contents

- [Installation](#installation)
- [Start the Web UI](#start-the-web-ui)
- [Create a Slack App](#create-a-slack-app)
- [Personas](#personas)
- [Plan, run, and merge](#plan-run-and-merge)
- [Configuration](#configuration)
- [Current boundaries](#current-boundaries)
- [Troubleshooting](#troubleshooting)
- [Data and development](#data-and-development)

## Installation

### 1. Check the prerequisites

You need:

- **Node.js and npm:** Node 22+ is recommended. The package accepts Node 20+;
  automatic `.env` loading needs Node 20.12 or later.
- **Git:** the target repository must have at least one commit. Workers create
  commits, so configure your Git author name and email for that repository.
- **An installed and authenticated Devin CLI:** follow the
  [official Devin documentation](https://docs.devin.ai/) to install it.
- **macOS or Linux** for the documented process-group shutdown behavior.
  Windows has not been validated.

```bash
node --version
npm --version
git --version
devin version
devin auth login
devin auth status
```

Devin model access and usage are governed by your Devin account. This project
does not guarantee a free model or include a Devin subscription.

### 2. Install devin-squad from source

```bash
git clone https://github.com/paragura/devin-squad.git
cd devin-squad
npm ci
npm run build
npm link
devin-squad help
```

`npm link` makes `devin-squad` available on your PATH. If you prefer not to link it,
replace `devin-squad` in the examples with
`node /absolute/path/to/devin-squad/dist/cli.js`.

### 3. Add a few team members

Run this from the cloned devin-squad directory:

```bash
mkdir -p "$HOME/.devin-squad/personas"
cp -n examples/personas/*.md "$HOME/.devin-squad/personas/"
devin-squad personas
```

The examples include a reviewer, frontend developer, researcher, and secretary.
They use Japanese prompts; edit them to use your preferred language and style.
`cp -n` leaves existing persona files unchanged.

## Start the Web UI

Point the application at the repository you want the workers to use:

```bash
devin-squad serve --repo /absolute/path/to/your-project --port 3333
```

Open [http://127.0.0.1:3333](http://127.0.0.1:3333). Slack is not required.

1. Choose **みんなのルーム** (shared room) or a persona in the left sidebar.
2. Send a message. Enter sends; Shift+Enter adds a line break. Japanese IME
   composition does not accidentally send.
3. Open **実行パネル** (run panel) when you want to delegate implementation.
   Enter a goal, generate a plan, edit the tasks, then start the run.
4. Follow each task's state and open its output, diff, log, or run report.

The UI is currently in Japanese. Side panels collapse on small screens. Failed
messages can be retried; switching conversations does not mix their replies.
Direct history is scoped to the repository and persona. Run history survives
reloads, and runs interrupted by a server restart are marked as interrupted.

The server binds to loopback only and validates Host/Origin. Public or LAN access
is not supported. Worker execution defaults to `bypass`; see
[permissions and model selection](#permissions-and-model-selection) before starting code changes.

## Create a Slack App

Slack integration runs in **Socket Mode**: devin-squad maintains an outbound
connection to Slack. You do not need a public server, an Events Request URL, or
an ngrok tunnel. Keep the local `slack` process running to receive messages.
See Slack's [Socket Mode guide](https://docs.slack.dev/apis/events-api/using-socket-mode/).

### 1. Create the app

Open [Your Apps](https://api.slack.com/apps), select **Create New App → From a manifest**,
and choose your workspace. Paste
[`examples/slack-app-manifest.yaml`](examples/slack-app-manifest.yaml), review it,
and create the app. Workspace policies may require an administrator's approval.

The manifest configures a bot, Socket Mode, public-channel events, and the base
scopes below. It contains no tokens. If you choose **From scratch** instead, name
the app `devin-squad` and apply the same settings in steps 2–4 manually.

### 2. Enable Socket Mode and generate the app token

In the app settings:

1. Open **Socket Mode** and enable it if it is not already enabled.
2. Under **Basic Information → App-Level Tokens**, generate a token, for example
   named `devin-squad-socket`.
3. Give this token the **`connections:write`** scope.
4. Copy the **`xapp-...`** token. It becomes `SLACK_APP_TOKEN`.

This is an **app-level token**, not the bot OAuth token used for posting messages.

### 3. Configure the bot scopes

Under **OAuth & Permissions → Scopes → Bot Token Scopes**, verify the base scopes
from the manifest:

| Bot scope              | Used for                                                      |
| ---------------------- | ------------------------------------------------------------- |
| `app_mentions:read`    | Receive mentions of the app                                   |
| `chat:write`           | Post replies and run progress                                 |
| `chat:write.customize` | Post with a persona's display name and icon                   |
| `channels:history`     | Read recent public-channel context and receive message events |
| `users:read`           | Resolve user display names                                    |
| `reactions:write`      | Add/remove acknowledgement reactions                          |
| `files:read`           | Read supported text/code attachments                          |

Add optional scopes only for the features you want:

| Optional bot scope | Enables                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `groups:history`   | Private-channel context and messages; also add `message.groups` below |
| `channels:manage`  | Create a dedicated public channel for a squad run                     |
| `files:write`      | Upload run reports and patches to Slack                               |
| `canvases:write`   | Create a channel canvas with the run report                           |

**Run-channel visibility:** the current `run` implementation requests a public
channel, even when invoked from a private channel. If creation fails or
`channels:manage` is omitted, progress falls back to the originating channel.
For private conversations, leave this optional scope out unless you intend to
publish run information to a public channel. Upload/canvas failures do not stop
the underlying workers; artifacts are still available locally.

The app only needs bot scopes plus the app-level `connections:write` scope;
user OAuth scopes are not required. Check Slack's method references for
[channel creation](https://docs.slack.dev/reference/methods/conversations.create/),
[message authorship](https://docs.slack.dev/reference/methods/chat.postMessage/), and
[channel canvases](https://docs.slack.dev/reference/methods/conversations.canvases.create/).

### 4. Subscribe to bot events

Under **Event Subscriptions**, enable events and verify **Subscribe to bot events**:

| Event              | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `app_mention`      | Explicit commands and persona mentions                    |
| `message.channels` | Ambient responses to public-channel messages              |
| `message.groups`   | Optional: private-channel messages, with `groups:history` |

The manifest already includes the first two. Save any changes. With Socket Mode
enabled, Slack delivers events over the socket; no Request URL is needed.

### 5. Install the app and copy the bot token

Use **OAuth & Permissions → Install to Workspace** (or **Reinstall to Workspace**)
and approve the permissions. Copy the **Bot User OAuth Token**, which starts with
**`xoxb-...`**. It becomes `SLACK_BOT_TOKEN`.

After adding scopes to an installed app, reinstall it so the grant includes those
scopes. Save event subscription changes too.

### 6. Configure the two tokens locally

Create a `.env` file in the directory from which you will launch devin-squad:

Use [`.env.example`](.env.example) as a template, without overwriting an existing
`.env`. Replace the placeholders only in your local `.env`.

```dotenv
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-level-token
```

**`.env` is read from the process's current directory, not from `--repo`.** If you
start in the cloned devin-squad directory and point `--repo` elsewhere, put `.env`
in the clone. This repository ignores `.env`; if you store it in another project,
make sure that project's ignore rules exclude it. Exported environment variables
are also supported. Do not put real tokens into the manifest or commit them.

### 7. Start the bot and invite it

```bash
# Run from the directory containing .env.
devin-squad slack --repo /absolute/path/to/your-project
```

Wait for `slack bot connected`. In each Slack channel you want to use, invite the
app through the channel's integrations menu or:

```text
/invite @devin-squad
```

Private channels also require an explicit invitation. The app's actual mention
may differ if you renamed it. Start with:

```text
@devin-squad personas
@devin-squad strict-reviewer What should we test for this change?
@devin-squad plan Add parser tests and update the documentation
@devin-squad run Add parser tests and update the documentation
```

`plan` only returns a proposed task list. **`run` plans and immediately starts
workers**; it does not wait for the Web UI's confirmation step.

### 8. Choose ambient or mention-only behavior

Ambient mode is on by default. A router may pick 0–2 personas to respond to a
regular channel message. A judge can continue the discussion, finish it, or ask
the secretary to bring a question to you. Discussions stop after at most eight
rounds. A message that needs no reply can produce no response.

For explicit mentions only:

```bash
devin-squad slack --repo /absolute/path/to/your-project --no-ambient
```

To see logged Slack conversations in the browser, run `serve` in a second
terminal under the same OS user and data directory. Recorded channels appear as
rooms, currently identified by Slack channel ID. **Web messages are local; they
are not posted back to Slack.** This log view is not a complete Slack archive.

## Personas

Personas are Markdown files with a simple frontmatter header:

```markdown
---
name: strict-reviewer
emoji: 🛡️
description: Reviews correctness, security, and missing tests
slackName: Reviewer
icon: :shield:
# model: your-model-id
# permissionMode: accept-edits
---

You are a careful code reviewer. Explain each issue with evidence and a concrete
suggestion. Keep your replies concise and respond in the user's language.
```

The header parser supports single-line `key: value` fields, not full YAML. Leave
values such as `icon: :shield:` unquoted. An HTTPS image URL can also be used for
`icon`. Persona descriptions help the router choose responders.

| Location                            | Applies to                                                   |
| ----------------------------------- | ------------------------------------------------------------ |
| `~/.devin-squad/personas/*.md`      | All repositories                                             |
| `<repo>/.devin-squad/personas/*.md` | That repository; overrides a global persona of the same name |

```bash
devin-squad personas --repo /absolute/path/to/your-project
devin-squad persona new my-reviewer --repo /absolute/path/to/your-project
devin-squad persona new my-reviewer --global
devin-squad talk strict-reviewer --repo /absolute/path/to/your-project
devin-squad talk strict-reviewer "Suggest a review checklist" --repo /absolute/path/to/your-project
```

CLI/Web direct chats resume a persona session scoped to the repository. Slack
and shared-room discussions instead use recent conversation context. Each direct
persona currently has one conversation per repository, not multiple named topics.
Persona chat processes run in their own chat directories; `--repo` scopes the
persona/session rather than making chat run inside the target checkout. Give
absolute file paths when discussing repository files, or use squad tasks for code work.

## Plan, run, and merge

```bash
devin-squad plan --repo /absolute/path/to/your-project \
  --goal "Add parser tests and update the documentation" --out tasks.json

devin-squad run --repo /absolute/path/to/your-project --tasks tasks.json --dry-run
devin-squad run --repo /absolute/path/to/your-project --tasks tasks.json --concurrency 3

# Inspect the report and diffs first, then merge the run's successful changes.
devin-squad merge --repo /absolute/path/to/your-project --run latest
```

You can also write `tasks.json` yourself:

```json
{
  "goal": "Add a health endpoint and document it",
  "tasks": [
    {
      "id": "health-api",
      "title": "Add the health endpoint",
      "prompt": "Add a health endpoint using this repository's conventions. Add tests and run the relevant test suite.",
      "dependsOn": []
    },
    {
      "id": "health-docs",
      "title": "Document the endpoint",
      "prompt": "Read the health endpoint implementation and tests. Document its route, response and a request example.",
      "dependsOn": ["health-api"]
    }
  ]
}
```

- IDs are 1–64 letters, digits, hyphens, or underscores and start with a letter
  or digit. IDs must be unique; unknown dependencies and cycles are rejected.
- Runs start from a fixed committed HEAD. **Uncommitted edits are not copied**
  into worker worktrees. Independent tasks run concurrently; dependent tasks
  receive successful dependency commits before starting.
- Dependency merge conflicts fail that task and skip its descendants. Other
  independent tasks continue. Diffs describe each task's own changes.
- `merge` integrates all eligible successful, changed tasks from the selected
  run into the **currently checked-out branch**. It follows dependency order,
  skips already-integrated commits, and stops at a conflict. It has no per-task
  selection prompt; use Git manually if you want only a subset.
- Run reports retain failures and partial work. A successful Devin exit is not
  an independent guarantee that the generated code passes your tests.

## Configuration

### Common options

| Option                | Behavior / default                                           |
| --------------------- | ------------------------------------------------------------ |
| `--repo <path>`       | Target repository; defaults to current directory             |
| `--concurrency <n>`   | Positive integer; 3 workers **per run**                      |
| `--timeout <minutes>` | Positive number; 30 per Devin call, 10 for `talk`            |
| `--model <id>`        | Worker/planner/shared-room model; defaults to `swe-2-medium` |
| `--router-model <id>` | Slack router/judge override; defaults to `--model`           |
| `--mode <mode>`       | Worker permission mode; defaults to `bypass`                 |
| `--sandbox`           | Worker OS sandbox; selects the `autonomous` alias            |
| `--persona <name>`    | Default persona for CLI `run`; task-level `persona` wins     |
| `--keep-worktrees`    | CLI `run`: retain even no-change worktrees                   |
| `--dry-run`           | CLI `run`: validate/print tasks without starting Devin       |
| `--out <file>`        | `plan` output; defaults to `tasks.json`                      |
| `--port <n>`          | Web server port; defaults to 3333                            |
| `--no-ambient`        | Slack: respond only to explicit mentions                     |
| `-- <args...>`        | Extra worker arguments, with argument boundaries preserved   |

### Permissions and model selection

The default worker mode, `bypass`, maps to Devin's `dangerous` mode and approves
tools automatically. Choose the mode intentionally. Worktrees isolate Git
changes; they are not an OS security boundary. `--sandbox` applies to workers,
not every chat/planner invocation. A persona's `permissionMode` overrides the
worker mode; the sandbox argument is still passed when requested.

| Existing squad alias | Passed to the current Devin CLI |
| -------------------- | ------------------------------- |
| `bypass`             | `dangerous`                     |
| `normal`             | `auto`                          |
| `autonomous`         | `smart`                         |

Other mode names pass through unchanged. Planner calls use `accept-edits`;
persona chats default to `accept-edits`; router/judge calls use `normal`.
The planner runs in the target checkout with edit permissions, so `plan` is not
an enforced read-only sandbox.

Check the models available to your account with `devin models list`. Override
the default with `--model <id>`. A persona's `model` takes precedence for its
worker/shared-room replies. Direct `talk` and Web individual chats use the
persona's `model`, or Devin's own default; the general `--model` option does
not override those direct chats.

## Current boundaries

- Separate Slack channels have separate context and can progress concurrently.
  Each individual channel's handling is serialized. Slack threads are not
  independent topics in this implementation.
- The Web UI can switch existing rooms, but cannot create/rename rooms or choose
  a room-specific roster yet. There is one direct conversation per repo/persona.
- Web replies are not sent to Slack. Slack channel context comes from recent
  Slack history; the local log viewer does not provide bidirectional syncing.
- Only supported text/code attachments up to 200,000 bytes are read, with at most
  10,000 characters included per file. Image/PDF interpretation is not implemented.
- Process restart does not resume interrupted workers automatically. Inspect
  saved worktrees/results before starting a new run.
- Slack commands can execute local workers. The bot currently has no separate
  user allowlist or approval step for `run`.

## Troubleshooting

| Symptom                                    | Check                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `devin-squad` not found                    | Run `npm link`, or use the absolute `dist/cli.js` path with Node                                                                   |
| `devin` not found / authentication failure | Check `devin version` and `devin auth status` in the shell running the app                                                         |
| Model not available                        | Check `devin models list`; set `--model` or the persona's `model` as appropriate                                                   |
| No personas / no ambient replies           | Copy the example personas; verify `devin-squad personas --repo ...`. The router may intentionally choose nobody                    |
| Slack token error                          | `SLACK_BOT_TOKEN` must be `xoxb-...`; `SLACK_APP_TOKEN` must be `xapp-...` with `connections:write`                                |
| `.env` appears ignored                     | Check the startup directory and Node version; `.env` is not loaded relative to `--repo`                                            |
| Slack receives nothing                     | Keep `slack` running; verify Socket Mode, saved bot events, app installation and channel invitation                                |
| Mentions work but ordinary messages do not | Check `message.channels` / `message.groups`, history scopes, and `--no-ambient`                                                    |
| `missing_scope`                            | Add the scope required by the feature and reinstall the app                                                                        |
| Dedicated run channel / canvas fails       | Check optional scopes. Existing names or unsupported channel names can cause channel creation to fall back to the original channel |
| Git commit/worktree fails                  | Verify an initial commit, Git author identity, write permissions, and the reported task error                                      |
| Merge conflict                             | Resolve or abort using Git; after resolving and committing, rerun merge for remaining results                                      |
| Another device cannot open the UI          | Expected: the server is loopback-only                                                                                              |

## Data and development

Default data directory: `~/.devin-squad`. Set `DEVIN_SQUAD_HOME` to an **absolute**
path to override it. Use the same value for the Web UI and Slack processes if
you want them to share logs.

| Path under the data directory               | Contents                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `personas/`                                 | Global persona Markdown files                                                                  |
| `channels/<id>.jsonl`                       | Shared-room/Slack logs; `dm_...` files hold scoped direct chats                                |
| `chat/<repo-hash>/<persona-hash>/`          | Persistent direct-chat session references                                                      |
| `worktrees/<repo-hash>/<run-id>/<task-id>/` | Worker checkouts; branches use `squad/<run-id>/<task-id>`                                      |
| `runs/<repo-hash>/<run-id>/`                | `tasks.json`, `results.json`, `report.md`, and Web-run state when applicable                   |
| `runs/.../<task-id>/`                       | Available `output.md`, `diff.patch`, `log.txt`, `meta.json`, `session.atif.json`               |
| `devin-home/`                               | Isolated Devin session data; credentials/trust are linked from the normal Devin data directory |
| `locks/`, `slack-events/`                   | Conversation coordination and duplicate-event receipts                                         |

New runs do not overwrite old worktrees. No-change worktrees are removed unless
kept explicitly; changed worktrees and diagnostic failures are retained. Legacy
run metadata remains readable. Only exact completed disposable sessions are
cleaned up; persistent chats and active session locks are left alone.

### Keep private data out of Git

This repository ignores `.env` and its variants (except the placeholder-only
`.env.example`), `.devin-squad/` runtime data, logs, and session exports/databases.
Project personas under `.devin-squad/personas/` are intentionally shareable;
check their prompts for private information before committing them. A custom
`DEVIN_SQUAD_HOME` elsewhere needs its own ignore rules. Other repositories do
not inherit this repository's rules.

Reports and diffs can contain source code, prompts, and Slack conversations.
Review staged files before committing; ignore rules do not protect files that
are already tracked or force-added. Use your GitHub-provided `noreply` email
address for public commits if you do not want to publish your personal email.
If a real credential has been published, revoke/rotate it; deleting the file or
rewriting history alone does not make that credential safe again.

### Tests

```bash
npm test
```

This builds the project and runs offline integration tests with temporary Git
repositories and a fake Devin executable. No real Devin or Slack connection is
needed. Tests exercise dependencies, conflicts, session resume, timeouts,
shutdown, validation, HTTP protections, deduplication, and legacy results.

For browser checks, install Python Playwright and Chromium, then use two terminals:

```bash
# One-time browser-test dependencies.
python3 -m pip install playwright
python3 -m playwright install chromium

# Terminal 1, from this repository.
node tests/ui-server.mjs

# Terminal 2, from this repository.
python3 tests/ui_smoke.py
```

The offline fixture runs on `127.0.0.1:43337`. Screenshots are written to
`/tmp/devin-squad-desktop.png` and `/tmp/devin-squad-mobile.png`.

Read-only run APIs include `GET /api/runs`, `GET /api/run?run=<id>`, and
`GET /api/artifact?run=<id>&file=report.md`. Task artifacts require `task=<id>`
and an allowed filename. Chat history endpoints accept `persona=<name>` for
the current repository's direct conversation. POST bodies must be JSON and
at most 1 MiB.

## License

[MIT](LICENSE).
