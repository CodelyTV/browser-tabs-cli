import type { Browser, Tab } from "../domain/browser.js";
import type { ResolvedPlan } from "../domain/plan.js";
export interface Verification {
  windowId: number;
  verified: boolean;
  ready: boolean;
  issues: string[];
  loading: number[];
  tabIds: number[];
  tabs: number;
}
export function verifySnapshot(plan: ResolvedPlan, tabs: Tab[]): Verification {
  const issues: string[] = [],
    loading: number[] = [],
    tabIds: number[] = [];
  const owned = tabs.filter((tab) => tab.ownership?.batchId === plan.batchId);
  const groupIds = new Map<string, string>();
  if (
    owned.some(
      (tab) => !plan.tabs.some((wanted) => wanted.key === tab.ownership!.key),
    )
  )
    issues.push("Batch contains unplanned tabs.");
  for (const wanted of plan.tabs) {
    const matches = owned.filter((tab) => tab.ownership!.key === wanted.key);
    if (matches.length !== 1) {
      issues.push(
        `Expected one tab for ${wanted.key}, found ${matches.length}.`,
      );
      continue;
    }
    const tab = matches[0]!;
    tabIds.push(tab.id);
    if (wanted.name !== undefined && tab.name !== wanted.name)
      issues.push(`Wrong name for ${wanted.key}.`);
    if (tab.ownership!.sourceUrl !== wanted.url)
      issues.push(`Wrong source URL for ${wanted.key}.`);
    if (!tab.loaded) loading.push(tab.id);
    if (!wanted.groupKey && tab.group)
      issues.push(`Unexpected group for ${wanted.key}.`);
    if (wanted.groupKey) {
      if (!tab.group) issues.push(`Missing group for ${wanted.key}.`);
      else if (
        groupIds.has(wanted.groupKey) &&
        groupIds.get(wanted.groupKey) !== tab.group.id
      )
        issues.push(`Split group ${wanted.groupKey}.`);
      else groupIds.set(wanted.groupKey, tab.group.id);
    }
  }
  for (const group of plan.groups) {
    const groupId = groupIds.get(group.key);
    const actual = tabs.filter(
      (tab) => groupId !== undefined && tab.group?.id === groupId,
    );
    const expected = plan.tabs.filter((tab) => tab.groupKey === group.key);
    if (
      actual.length !== expected.length ||
      actual.some(
        (tab) =>
          tab.ownership?.batchId !== plan.batchId ||
          !expected.some((wanted) => wanted.key === tab.ownership!.key),
      )
    )
      issues.push(`Unexpected members in ${group.key}.`);
    if (
      actual.some(
        (tab) =>
          tab.group!.title !== group.title ||
          (group.color !== undefined && tab.group!.color !== group.color),
      )
    )
      issues.push(`Wrong properties for ${group.key}.`);
  }
  return {
    windowId: plan.windowId,
    verified: issues.length === 0,
    ready: issues.length === 0 && loading.length === 0,
    issues,
    loading,
    tabIds,
    tabs: plan.tabs.length,
  };
}
export async function waitForBatch(
  browser: Browser,
  plan: ResolvedPlan,
  waitMs: number,
): Promise<Verification> {
  const deadline = performance.now() + waitMs;
  let result = verifySnapshot(plan, await browser.tabs(plan.windowId));
  while (result.verified && !result.ready && performance.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, Math.min(200, deadline - performance.now())),
      ),
    );
    result = verifySnapshot(plan, await browser.tabs(plan.windowId));
  }
  return result;
}
export function assertPreserved(before: Tab[], after: Tab[], batchId: string) {
  const stable = (tab: Tab) =>
    JSON.stringify({
      url: tab.url,
      name: tab.name,
      group: tab.group,
      pinned: tab.pinned,
      ownership: tab.ownership,
    });
  for (const original of before) {
    const current = after.find((tab) => tab.id === original.id);
    if (
      !current ||
      (original.ownership?.batchId !== batchId &&
        stable(original) !== stable(current))
    )
      throw new Error(
        `Pre-existing tab ${original.id} changed or disappeared. Inspect the window before retrying.`,
      );
  }
}
