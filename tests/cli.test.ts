import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "../src/cli/parse.js";
import { run, statusCode } from "../src/cli/run.js";
import { parsePlan } from "../src/domain/validation.js";
import { colors } from "../src/domain/browser.js";
import { plan } from "./support/native.js";
import schema from "../tab-batch-schema/schema.json";

test("published example and runtime schema stay compatible", () => {
  const example = JSON.parse(
    readFileSync(
      new URL("../tab-batch-schema/example.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(parsePlan(example).windowId, undefined);
  assert.deepEqual(schema.$defs.group.properties.color.enum, [...colors]);
});
for (const [label, changed] of [
  ["unknown editorial fields", { ...plan, weekly: true }],
  ["duplicate keys", { ...plan, tabs: [plan.tabs[0], plan.tabs[0]] }],
  [
    "unknown group",
    { ...plan, tabs: [{ ...plan.tabs[0], groupKey: "missing" }] },
  ],
  [
    "empty group",
    { ...plan, tabs: [{ ...plan.tabs[0], groupKey: undefined }] },
  ],
  [
    "script URL",
    { ...plan, tabs: [{ ...plan.tabs[0], url: "javascript:alert(1)" }] },
  ],
  ["empty batch ID", { ...plan, batchId: " " }],
  [
    "invalid color",
    { ...plan, groups: [{ ...plan.groups[0], color: "gold" }] },
  ],
] as const)
  test(`schema and semantic validation reject ${label}`, () =>
    assert.throws(() => parsePlan(changed)));

test("unit commands have optional windows and preserve exact URLs", () => {
  const input = parse([
    "tab",
    "open",
    "https://example.com/?utm_source=chatgpt.com",
    "--name",
    "Example page",
  ]);
  assert.equal(input.kind, "execute");
  if (input.kind !== "execute") return;
  assert.deepEqual(input.command, {
    type: "tab.open",
    url: "https://example.com/?utm_source=chatgpt.com",
    name: "Example page",
  });
  const explicit = parse(["tab", "list", "--window", "12"]);
  if (explicit.kind === "execute")
    assert.deepEqual(explicit.command, { type: "tabs", windowId: 12 });
});
test("group open compiles to the same batch contract", () => {
  const input = parse([
    "group",
    "open",
    "Related pages",
    "https://example.com/a",
    "https://example.com/b",
    "--color",
    "blue",
    "--batch",
    "stable-id",
  ]);
  assert.equal(input.kind, "execute");
  if (input.kind !== "execute" || input.command.type !== "batch.open") return;
  assert.equal(input.command.plan.batchId, "stable-id");
  assert.equal(input.command.plan.tabs.length, 2);
  assert.equal(input.command.verifyAfterMs, undefined);
});
for (const args of [
  ["tab", "close", "--tabs", "1,1"],
  ["tab", "list", "--window", "-1"],
  ["tab", "list", "--color", "blue"],
  ["tab", "rename", "1"],
  ["windows", "extra"],
  ["tab", "open", "data:text/html,hello"],
])
  test(`invalid command fails: ${args.join(" ")}`, () =>
    assert.throws(() => parse(args)));
test("batch validation is local and conflicting window overrides fail", async () => {
  const dir = mkdtempSync(join(tmpdir(), "browser-tabs-test-"));
  const file = join(dir, "plan.json");
  try {
    writeFileSync(file, JSON.stringify({ ...plan, windowId: 1 }));
    const result = await run(["batch", "validate", file], async () => {
      throw new Error("Should not connect");
    });
    assert.equal(result.exitCode, 0);
    assert.throws(
      () => parse(["batch", "open", file, "--window", "2"]),
      /conflicts/,
    );
    assert.throws(
      () => parse(["batch", "open", file, "--verify-after-seconds", "301"]),
      /300/,
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("one command produces one execution and always closes its connection", async () => {
  let executions = 0;
  let closed = false;
  await assert.rejects(
    run(["tab", "list"], async () => ({
      execute: async () => {
        executions++;
        throw new Error("Failure");
      },
      close: () => {
        closed = true;
      },
    })),
    /Failure/,
  );
  assert.equal(executions, 1);
  assert.equal(closed, true);
});
test("exit codes distinguish mismatches and pages still loading", () => {
  assert.equal(statusCode({ verified: null, ready: null }), 0);
  assert.equal(statusCode({ verified: true, ready: true }), 0);
  assert.equal(statusCode({ verified: false, ready: false }), 1);
  assert.equal(statusCode({ verified: true, ready: false }), 2);
});
test("batch open and verify preserve an optional verification delay", () => {
  const file = new URL("../tab-batch-schema/example.json", import.meta.url)
    .pathname;
  for (const action of ["open", "verify"]) {
    for (const [args, expected] of [
      [[], undefined],
      [["--verify-after-seconds", "0"], 0],
      [["--verify-after-seconds", "30"], 30_000],
    ] as const) {
      const input = parse(["batch", action, file, ...args]);
      assert.equal(input.kind, "execute");
      if (input.kind !== "execute") continue;
      assert.ok(
        input.command.type === "batch.open" ||
          input.command.type === "batch.verify",
      );
      assert.equal(input.command.verifyAfterMs, expected);
    }
  }
  for (const value of ["-1", "301", "NaN", "Infinity", " "])
    assert.throws(() =>
      parse(["batch", "open", file, "--verify-after-seconds", value]),
    );
  assert.throws(() => parse(["batch", "open", file, "--verify-after-seconds"]));
  assert.throws(() => parse(["batch", "open", file, "--wait", "30"]));
  assert.throws(() => parse(["batch", "apply", file]));
});
