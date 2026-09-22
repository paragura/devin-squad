import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

test("publication excludes credentials and runtime data but permits templates and personas", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "devin-squad-publication-"),
  );
  try {
    execFileSync("git", ["init", "--quiet", dir]);
    execFileSync("git", ["config", "core.excludesFile", "/dev/null"], {
      cwd: dir,
    });
    fs.copyFileSync(
      new URL("../.gitignore", import.meta.url),
      path.join(dir, ".gitignore"),
    );
    fs.mkdirSync(path.join(dir, ".devin-squad", "personas"), {
      recursive: true,
    });
    const privatePaths = [
      ".env",
      ".env.local",
      ".env.production",
      ".env.backup",
      "nested/.env",
      "nested/.env.test",
      ".devin-squad/channels/room.jsonl",
      ".devin-squad/runs/run/report.md",
      ".devin-squad/chat/repo/persona/session.json",
      ".devin-squad/devin-home/credentials.json",
      ".devin-squad/worktrees/repo/run/task/private.txt",
      "nested/.devin-squad/channels/room.jsonl",
      "worker.log",
      "run/session.atif.json",
      "sessions.db",
      "sessions.db-wal",
      "sessions.db-shm",
    ];
    const publicPaths = [
      ".env.example",
      "examples/slack-app-manifest.yaml",
      "examples/personas/reviewer.md",
      ".devin-squad/personas/reviewer.md",
      "README.md",
      "README.ja.md",
      "src/server.ts",
    ];
    const result = spawnSync(
      "git",
      ["check-ignore", "--no-index", "--stdin", "-z"],
      {
        cwd: dir,
        input: [...privatePaths, ...publicPaths].join("\0") + "\0",
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const ignored = new Set(result.stdout.split("\0").filter(Boolean));
    for (const name of privatePaths)
      assert.ok(ignored.has(name), `${name} must be ignored`);
    for (const name of publicPaths)
      assert.ok(!ignored.has(name), `${name} must remain shareable`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
