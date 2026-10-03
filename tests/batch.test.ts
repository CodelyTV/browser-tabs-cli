import assert from "node:assert/strict";
import test from "node:test";
import { BatchService } from "../src/application/batch.js";
import { execute } from "../src/application/execute.js";
import { selectWindow } from "../src/application/window.js";
import { fixture, plan } from "./support/native.js";

test("batch opens every URL before names and groups, preserving an existing locked stack", async () => {
  const { api, browser } = fixture();
  api.seed({
    group: "personal",
    fixedTitle: "Personal tab",
    fixedGroupTitle: "Personal stack",
    groupColor: "color2",
    workspaceId: 42,
  });
  api.lockedStack = true;
  const before = await browser.tabs(1);
  const result = await new BatchService(browser).open(plan, 0);
  assert.equal(result.verified, true);
  assert.equal(result.ready, true);
  assert.equal(result.created, 3);
  assert.deepEqual((await browser.tabs(1)).slice(0, 1), before);
  assert.deepEqual(api.mutations.slice(0, 6), [
    "open",
    "ungroup",
    "open",
    "ungroup",
    "open",
    "ungroup",
  ]);
  assert.equal(result.groups[0]?.color, "yellow");
  assert.equal(result.groups[0]?.tabIds.length, 2);
  assert.equal(
    (await browser.tabs(1)).find((tab) => tab.ownership?.key === "three")
      ?.group,
    undefined,
  );
});
test("identical retries reuse only owned tabs, including after a partial failure", async () => {
  const { api, browser } = fixture();
  api.seed();
  api.rows[0]!.url = plan.tabs[0]!.url;
  const service = new BatchService(browser);
  api.failOpenAt = 2;
  await assert.rejects(service.open(plan, 0), /Simulated/);
  api.failOpenAt = 0;
  const resumed = await service.open(plan, 0);
  assert.equal(resumed.created, 2);
  assert.equal(resumed.reused, 1);
  const again = await service.open(plan, 0);
  assert.equal(again.created, 0);
  assert.equal(again.reused, 3);
  assert.equal(api.rows.length, 4);
});
test("ambiguous, missing, and invalid explicit windows fail before changes", async () => {
  const { api, browser } = fixture();
  api.openWindows.push({ id: 2, focused: false });
  await assert.rejects(
    new BatchService(browser).open(plan, 0),
    /multiple|Several|More than|window/i,
  );
  assert.equal(await selectWindow(browser, 2), 2);
  await assert.rejects(selectWindow(browser, 3), /window/i);
  api.openWindows = [];
  await assert.rejects(selectWindow(browser), /window/i);
  assert.deepEqual(api.mutations, []);
});
test("adapter limits are checked before opening anything", async () => {
  const { api, browser } = fixture();
  const service = new BatchService(browser);
  await assert.rejects(
    service.open({ ...plan, tabs: [plan.tabs[0]!] }, 0),
    /at least 2/,
  );
  await assert.rejects(
    service.open(
      {
        ...plan,
        tabs: plan.tabs.map((tab) => ({ ...tab, name: "x".repeat(51) })),
      },
      0,
    ),
    /50/,
  );
  assert.deepEqual(api.mutations, []);
});
test("a changed source URL or ownership collision is rejected before changes", async () => {
  const { api, browser } = fixture();
  const service = new BatchService(browser);
  await service.open(plan, 0);
  const count = api.mutations.length;
  await assert.rejects(
    service.open(
      {
        ...plan,
        tabs: plan.tabs.map((tab) => ({
          ...tab,
          url: "https://changed.example/",
        })),
      },
      0,
    ),
    /does not match/,
  );
  api.rows.push({ ...api.rows[0]!, id: 99 });
  await assert.rejects(service.open(plan, 0), /Duplicate/);
  assert.equal(api.mutations.length, count);
});
test("foreign stack members prevent retries from modifying personal tabs", async () => {
  const { api, browser } = fixture();
  const service = new BatchService(browser);
  await service.open(plan, 0);
  const id = api.seed();
  const group = (await browser.tabs(1))[0]!.group!.id;
  api.patch(id, { group });
  const count = api.mutations.length;
  await assert.rejects(service.open(plan, 0), /unrelated/);
  assert.equal(api.mutations.length, count);
  const verification = await service.verify(plan, 0);
  assert.equal(verification.verified, false);
});
test("verification detects incorrect names, split groups and colors", async () => {
  const { api, browser } = fixture();
  const service = new BatchService(browser);
  await service.open(plan, 0);
  api.patch(api.rows[0]!.id, {
    fixedTitle: "Wrong name",
    groupColor: "color2",
  });
  api.patch(api.rows[1]!.id, { group: "different" });
  const result = await service.verify(plan, 0);
  assert.equal(result.verified, false);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.includes("Wrong name")));
  assert.ok(result.issues.some((issue) => issue.includes("Split group")));
});
test("loading is separate from structural correctness and can be polled without mutations", async () => {
  const { api, browser } = fixture();
  api.loading = true;
  const service = new BatchService(browser);
  const result = await service.open(plan, 0);
  assert.equal(result.verified, true);
  assert.equal(result.ready, false);
  const count = api.mutations.length;
  setTimeout(() => {
    for (const tab of api.rows) tab.status = "complete";
  }, 10);
  assert.equal((await service.verify(plan, 500)).ready, true);
  assert.equal(api.mutations.length, count);
});
test("batch close removes only its own tabs", async () => {
  const { api, browser } = fixture();
  const personal = api.seed();
  await new BatchService(browser).open(plan, 0);
  await execute(browser, { type: "batch.close", batchId: plan.batchId });
  assert.deepEqual(
    api.rows.map((tab) => tab.id),
    [personal],
  );
});
test("unit operations name, color and move real adapter tabs; reject cross-window and pinned tabs", async () => {
  const { api, browser } = fixture();
  const one = await browser.open(1, "about:blank");
  const two = await browser.open(1, "about:blank");
  const three = await browser.open(1, "about:blank");
  await browser.rename(1, one.id, "Short name");
  const group = await browser.createGroup(
    1,
    [one.id, two.id],
    "New group",
    "blue",
  );
  await browser.updateGroup(1, group.id, {
    title: "Renamed group",
    color: "yellow",
  });
  await browser.moveToGroup(1, [three.id], group.id);
  assert.equal(
    (await browser.tabs(1)).filter((tab) => tab.group?.id === group.id).length,
    3,
  );
  assert.equal((await browser.tabs(1))[0]!.name, "Short name");
  await assert.rejects(
    browser.rename(2, one.id, "Wrong window"),
    /another window/,
  );
  api.row(three.id).pinned = true;
  await assert.rejects(
    browser.createGroup(1, [one.id, three.id], "Pinned"),
    /unpinned/,
  );
  await assert.rejects(browser.moveToGroup(1, [three.id], group.id), /Unpin/);
});

test("moving a tab between stacks preserves the destination ID and unselected source members", async () => {
  const { browser } = fixture();
  const tabs = await Promise.all(
    Array.from({ length: 5 }, () => browser.open(1, "about:blank")),
  );
  const source = await browser.createGroup(
    1,
    tabs.slice(0, 3).map((tab) => tab.id),
    "Source group",
    "yellow",
  );
  const destination = await browser.createGroup(
    1,
    tabs.slice(3).map((tab) => tab.id),
    "Destination group",
    "blue",
  );
  await browser.moveToGroup(1, [tabs[0]!.id], destination.id);
  const actual = await browser.tabs(1);
  assert.equal(
    actual.find((tab) => tab.id === tabs[0]!.id)?.group?.id,
    destination.id,
  );
  assert.equal(actual.filter((tab) => tab.group?.id === source.id).length, 2);
  assert.equal(
    actual.filter((tab) => tab.group?.id === destination.id).length,
    3,
  );
  await browser.moveToGroup(1, [tabs[0]!.id], destination.id);
  assert.deepEqual(await browser.tabs(1), actual);
});
