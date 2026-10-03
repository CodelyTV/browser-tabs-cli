import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Opt in explicitly. The script never launches or restarts a browser.
if (!process.env.BROWSER_TABS_CDP && !process.env.BROWSER_TABS_VIVALDI_DATA_DIR)
  throw new Error(
    "Set BROWSER_TABS_CDP or BROWSER_TABS_VIVALDI_DATA_DIR to the test browser first.",
  );
const exec = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const run = async (...args) => {
  const { stdout } = await exec(process.execPath, [binary, ...args], {
    timeout: 90_000,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  return result;
};
const requestedWindow = process.argv[2];
const target = requestedWindow ? ["--window", requestedWindow] : [];
const before = (await run("tab", "list", ...target)).data;
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(`<title>Local test page</title><h1>${request.url}</h1>`);
});
const sockets = new Set();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const directory = await mkdtemp(join(tmpdir(), "browser-tabs-smoke-"));
const batchId = `smoke-${randomUUID()}`;
const extraIds = [];
const plan = {
  version: 1,
  batchId,
  ...(requestedWindow ? { windowId: Number(requestedWindow) } : {}),
  tabs: Array.from({ length: 8 }, (_, index) => ({
    key: `tab-${index}`,
    url: `${base}/${index}`,
    name: `Test page ${index}`,
    groupKey: `group-${Math.floor(index / 2)}`,
  })),
  groups: ["yellow", "blue", "green", "purple"].map((color, index) => ({
    key: `group-${index}`,
    title: `Test group ${index}`,
    color,
  })),
};
let cleanupTarget = target;
const stable = (tabs) =>
  tabs
    .map(({ id, url, name, group, pinned, ownership }) => ({
      id,
      url,
      name,
      group,
      pinned,
      ownership,
    }))
    .sort((a, b) => a.id - b.id);
try {
  const file = join(directory, "plan.json");
  await writeFile(file, JSON.stringify(plan));
  const first = await run("batch", "apply", file, "--wait", "15");
  plan.windowId = first.data.windowId;
  cleanupTarget = ["--window", String(plan.windowId)];
  await writeFile(file, JSON.stringify(plan));
  assert.equal(first.data.created, 8);
  assert.equal(first.data.ready, true);
  assert.equal(first.data.groups.length, 4);
  const retry = await run("batch", "apply", file, "--wait", "15");
  assert.equal(retry.data.created, 0);
  assert.equal(retry.data.reused, 8);
  const opened = await run(
    "tab",
    "open",
    `${base}/unit`,
    "--name",
    "Unit tab",
    ...cleanupTarget,
  );
  extraIds.push(opened.data.id);
  const second = await run("tab", "open", `${base}/second`, ...cleanupTarget);
  extraIds.push(second.data.id);
  await run(
    "tab",
    "rename",
    String(second.data.id),
    "Second tab",
    ...cleanupTarget,
  );
  const group = await run(
    "group",
    "create",
    "Unit group",
    "--tabs",
    extraIds.join(","),
    "--color",
    "yellow",
    ...cleanupTarget,
  );
  await run(
    "group",
    "rename",
    group.data.id,
    "Updated group",
    ...cleanupTarget,
  );
  await run("group", "color", group.data.id, "blue", ...cleanupTarget);
  await run(
    "group",
    "move",
    group.data.id,
    "--tabs",
    String(first.data.tabIds[0]),
    ...cleanupTarget,
  );
  const groups = (await run("group", "list", ...cleanupTarget)).data;
  assert.equal(
    groups.find((item) => item.id === group.data.id).tabIds.length,
    3,
  );
  await run("batch", "apply", file, "--wait", "15").then(
    () => {
      throw new Error("Expected foreign-member conflict");
    },
    (error) => {
      assert.match(error.stdout ?? String(error), /unrelated/);
    },
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        batchTabs: 8,
        batchGroups: 4,
        applyMs: first.elapsedMs,
        replayMs: retry.elapsedMs,
        unitOperations: "open, rename, create, rename group, color, move, list",
      },
      null,
      2,
    ),
  );
} finally {
  // Close only IDs created here; preserve everything that existed before the run.
  try {
    if (extraIds.length)
      await run("tab", "close", "--tabs", extraIds.join(","), ...cleanupTarget);
    await run("batch", "close", batchId, ...cleanupTarget);
    const after = (await run("tab", "list", ...target)).data;
    assert.deepEqual(stable(after), stable(before));
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true });
  }
}
