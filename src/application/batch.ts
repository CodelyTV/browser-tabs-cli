import { groupsFromTabs, type Browser, type Tab } from "../domain/browser.js";
import type { Plan } from "../domain/plan.js";
import { selectWindow } from "./window.js";
import { assertPreserved, waitForBatch } from "./verification.js";
export class BatchService {
  constructor(private readonly browser: Browser) {}
  async open(input: Plan, waitMs: number) {
    this.checkLimits(input);
    const plan = {
      ...input,
      windowId: await selectWindow(this.browser, input.windowId),
    };
    const before = await this.browser.tabs(plan.windowId);
    const existing = this.checkExisting(plan, before);
    const assignments = new Map<string, number>();
    let created = 0;
    for (const wanted of plan.tabs) {
      let tab = existing.get(wanted.key);
      if (!tab) {
        tab = await this.browser.open(plan.windowId, wanted.url, {
          batchId: plan.batchId,
          key: wanted.key,
          sourceUrl: wanted.url,
        });
        created++;
      }
      assignments.set(wanted.key, tab.id);
    }
    for (const wanted of plan.tabs)
      if (
        wanted.name !== undefined &&
        existing.get(wanted.key)?.name !== wanted.name
      )
        await this.browser.rename(
          plan.windowId,
          assignments.get(wanted.key)!,
          wanted.name,
        );
    for (const wanted of plan.groups) {
      const ids = plan.tabs
        .filter((tab) => tab.groupKey === wanted.key)
        .map((tab) => assignments.get(tab.key)!);
      const snapshot = await this.browser.tabs(plan.windowId);
      const current = groupsFromTabs(snapshot).find(
        (group) =>
          group.tabIds.length === ids.length &&
          group.tabIds.every((id) => ids.includes(id)),
      );
      if (current)
        await this.browser.updateGroup(plan.windowId, current.id, {
          title: wanted.title,
          color: wanted.color,
        });
      else
        await this.browser.createGroup(
          plan.windowId,
          ids,
          wanted.title,
          wanted.color,
        );
    }
    const result = await waitForBatch(this.browser, plan, waitMs);
    const after = await this.browser.tabs(plan.windowId);
    assertPreserved(before, after, plan.batchId);
    return {
      batchId: plan.batchId,
      created,
      reused: assignments.size - created,
      groups: groupsFromTabs(after).filter((group) =>
        group.tabIds.some((id) => result.tabIds.includes(id)),
      ),
      ...result,
    };
  }
  async verify(plan: Plan, waitMs: number) {
    return waitForBatch(
      this.browser,
      { ...plan, windowId: await selectWindow(this.browser, plan.windowId) },
      waitMs,
    );
  }
  private checkLimits(plan: Plan) {
    for (const group of plan.groups)
      if (
        plan.tabs.filter((tab) => tab.groupKey === group.key).length <
        this.browser.limits.minGroupSize
      )
        throw new Error(
          `This browser requires at least ${this.browser.limits.minGroupSize} tabs per group.`,
        );
    for (const tab of plan.tabs)
      if (
        tab.name &&
        this.browser.limits.maxTabNameLength &&
        tab.name.length > this.browser.limits.maxTabNameLength
      )
        throw new Error(
          `Tab names must not exceed ${this.browser.limits.maxTabNameLength} UTF-16 code units.`,
        );
  }
  private checkExisting(plan: Plan, tabs: Tab[]) {
    const existing = new Map<string, Tab>();
    for (const tab of tabs.filter(
      (candidate) => candidate.ownership?.batchId === plan.batchId,
    )) {
      const key = tab.ownership!.key;
      const wanted = plan.tabs.find((item) => item.key === key);
      if (existing.has(key))
        throw new Error(`Duplicate existing ownership key: ${key}.`);
      if (!wanted || wanted.url !== tab.ownership!.sourceUrl)
        throw new Error(
          `Existing batch tab ${key} does not match this plan. Use the original plan or a new batch ID.`,
        );
      if (tab.pinned)
        throw new Error(
          `Batch tab ${key} is pinned. Unpin it before applying.`,
        );
      if (
        tab.group &&
        (!wanted.groupKey ||
          tabs.some(
            (other) =>
              other.group?.id === tab.group!.id &&
              other.ownership?.batchId !== plan.batchId,
          ))
      )
        throw new Error(
          `Batch tab ${key} has incompatible or unrelated group members.`,
        );
      existing.set(key, tab);
    }
    return existing;
  }
}
