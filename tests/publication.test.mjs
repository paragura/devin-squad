import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

test("persona templates have unique identities and valid Slack emoji icons", () => {
  const personaDir = fileURLToPath(new URL("../examples/personas/", import.meta.url));
  const files = fs
    .readdirSync(personaDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  const expected = new Map([
    ["business-strategist", ["事業戦略担当", ":compass:"]],
    ["customer-researcher", ["顧客調査担当", ":busts_in_silhouette:"]],
    ["finance-operator", ["収支・運営担当", ":moneybag:"]],
    ["frontend-dev", ["フロントエンド担当", ":art:"]],
    ["growth-marketer", ["グロース担当", ":mega:"]],
    ["pricing-strategist", ["価格戦略担当", ":label:"]],
    ["research-otaku", ["リサーチ担当", ":microscope:"]],
    ["risk-skeptic", ["リスク担当", ":warning:"]],
    ["secretary", ["秘書", ":ledger:"]],
    ["strict-reviewer", ["厳格レビュアー", ":shield:"]],
  ]);

  assert.equal(files.length, expected.size, "all ten public templates must be present");
  const names = new Set();
  for (const file of files) {
    const source = fs.readFileSync(path.join(personaDir, file), "utf8");
    const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    assert.ok(match, `${file} must contain frontmatter and a prompt`);
    const fields = Object.fromEntries(
      match[1]
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf(":");
          assert.ok(separator > 0, `${file} has malformed frontmatter: ${line}`);
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
        }),
    );

    for (const key of ["name", "emoji", "description", "slackName", "icon"])
      assert.ok(fields[key], `${file} is missing ${key}`);
    assert.match(fields.name, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    assert.match(fields.icon, /^:[a-z0-9_+-]+:$/);
    assert.ok(match[2].trim(), `${file} must have a non-empty prompt`);
    assert.ok(!names.has(fields.name), `${fields.name} is duplicated`);
    names.add(fields.name);

    const identity = expected.get(fields.name);
    assert.ok(identity, `${fields.name} is not an expected public template`);
    assert.deepEqual([fields.slackName, fields.icon], identity);
  }
});
