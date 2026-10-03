import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import config, { commitOptions } from "../release.config.mjs";

for (const [messages, expected] of [
  [["fix: preserve existing tabs"], "patch"],
  [["docs: clarify installation"], "patch"],
  [["ci(deps): update GitHub Actions"], "patch"],
  [["build(deps-dev): update TypeScript"], "patch"],
  [["fix: preserve tabs", "feat: add another adapter"], "minor"],
  [["feat: add another adapter", "refactor!: rename a command"], "major"],
  [
    ["fix: update input\n\nBREAKING CHANGE: the input contract changed."],
    "major",
  ],
  [[], null],
]) {
  test(`release calculation returns ${expected} for ${messages.join("; ") || "no new commits"}`, async () => {
    const result = await analyzeCommits(commitOptions, {
      cwd: process.cwd(),
      commits: messages.map((message, index) => ({
        hash: String(index),
        message,
      })),
      logger: { log() {} },
    });
    assert.equal(result, expected);
  });
}

test("release notes render breaking changes and documentation with the installed preset", async () => {
  const [, options] = config.plugins.find(
    (plugin) =>
      Array.isArray(plugin) &&
      plugin[0] === "@semantic-release/release-notes-generator",
  );
  const notes = await generateNotes(options, {
    cwd: process.cwd(),
    options: {
      repositoryUrl: "https://github.com/CodelyTV/browser-tabs-cli.git",
    },
    lastRelease: { gitTag: "v1.0.0" },
    nextRelease: { version: "2.0.0", gitTag: "v2.0.0" },
    commits: [
      {
        hash: "abcdef1",
        message:
          "feat!: rename batch command\n\nBREAKING CHANGE: use batch open.",
      },
      { hash: "abcdef2", message: "docs: explain installation" },
    ],
  });
  assert.match(notes, /BREAKING CHANGES/);
  assert.match(notes, /use batch open/);
  assert.match(notes, /Documentation/);
  assert.match(notes, /explain installation/);
});
