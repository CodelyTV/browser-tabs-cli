import { groupsFromTabs, type Browser } from "../domain/browser.js";
import type { Command } from "../domain/command.js";
import { BatchService } from "./batch.js";
import { selectWindow } from "./window.js";
export async function execute(
  browser: Browser,
  command: Command,
): Promise<unknown> {
  if (command.type === "windows") return browser.windows();
  if (command.type === "batch.open")
    return new BatchService(browser).open(command.plan, command.verifyAfterMs);
  if (command.type === "batch.verify")
    return new BatchService(browser).verify(
      command.plan,
      command.verifyAfterMs,
    );
  const windowId = await selectWindow(browser, command.windowId);
  switch (command.type) {
    case "tabs":
      return browser.tabs(windowId);
    case "groups":
      return groupsFromTabs(await browser.tabs(windowId));
    case "tab.open": {
      if (
        command.name &&
        browser.limits.maxTabNameLength &&
        command.name.length > browser.limits.maxTabNameLength
      )
        throw new Error("Tab name exceeds the browser limit.");
      const tab = await browser.open(windowId, command.url);
      if (command.name) await browser.rename(windowId, tab.id, command.name);
      return { ...tab, ...(command.name ? { name: command.name } : {}) };
    }
    case "tab.rename":
      await browser.rename(windowId, command.tabId, command.name);
      return { windowId, renamed: command.tabId };
    case "tab.close":
      await browser.close(windowId, command.tabIds);
      return { windowId, closed: command.tabIds };
    case "group.create":
      return browser.createGroup(
        windowId,
        command.tabIds,
        command.title,
        command.color,
      );
    case "group.update":
      await browser.updateGroup(windowId, command.groupId, command);
      return { windowId, updated: command.groupId };
    case "group.move":
      await browser.moveToGroup(windowId, command.tabIds, command.groupId);
      return { windowId, moved: command.tabIds, groupId: command.groupId };
    case "batch.close": {
      const ids = (await browser.tabs(windowId))
        .filter((tab) => tab.ownership?.batchId === command.batchId)
        .map((tab) => tab.id);
      if (ids.length) await browser.close(windowId, ids);
      return { windowId, closed: ids.length };
    }
    default: {
      const unhandled: never = command;
      throw new Error(`Unsupported command: ${JSON.stringify(unhandled)}`);
    }
  }
}
