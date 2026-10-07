import type { Browser, Color, Ownership, Tab } from "../../domain/browser.js";
import type { NativeApi } from "./native-api.js";
const key = (id: number) => `browser-tabs:${id}`;
export class ChromiumBrowser implements Browser {
  readonly limits = { minGroupSize: 1, tabNames: false };
  constructor(private readonly api: NativeApi) {}
  async windows() {
    return (await this.api.windows.getAll({ windowTypes: ["normal"] })).map(
      (window) => ({
        id: window.id,
        focused: Boolean(window.focused),
        incognito: Boolean(window.incognito),
      }),
    );
  }
  async tabs(windowId: number): Promise<Tab[]> {
    const tabs = await this.api.tabs.query({ windowId });
    const groups = await this.api.tabGroups.query({ windowId });
    const ownership = await this.api.storage.session.get(
      tabs.map((tab) => key(tab.id)),
    );
    return tabs.map((tab) => {
      const group = groups.find((candidate) => candidate.id === tab.groupId);
      return {
        id: tab.id,
        windowId: tab.windowId,
        index: tab.index,
        url: tab.pendingUrl ?? tab.url ?? "",
        title: tab.title ?? "",
        active: Boolean(tab.active),
        pinned: Boolean(tab.pinned),
        loaded: tab.status === "complete" && !tab.discarded,
        ...(group
          ? {
              group: {
                id: String(group.id),
                title: group.title ?? "",
                color: group.color,
              },
            }
          : {}),
        ...(ownership[key(tab.id)]
          ? { ownership: ownership[key(tab.id)] }
          : {}),
      };
    });
  }
  private async selected(windowId: number, ids: number[]) {
    if (!ids.length || new Set(ids).size !== ids.length)
      throw new Error("Select distinct tab IDs.");
    const tabs = await Promise.all(ids.map((id) => this.api.tabs.get(id)));
    if (tabs.some((tab) => tab.windowId !== windowId))
      throw new Error("A selected tab belongs to another window.");
    return tabs;
  }
  private async group(windowId: number, groupId: string) {
    if (!/^\d+$/.test(groupId) || !Number.isSafeInteger(Number(groupId)))
      throw new Error("Invalid Chromium group ID.");
    const group = await this.api.tabGroups.get(Number(groupId));
    if (group.windowId !== windowId)
      throw new Error("Group is not in the selected window.");
    return group;
  }
  async open(windowId: number, url: string, ownership?: Ownership) {
    const before = await this.api.tabs.query({ windowId });
    const tab = await this.api.tabs.create({
      windowId,
      url,
      active: false,
      index: before.length,
    });
    if (ownership)
      await this.api.storage.session.set({ [key(tab.id)]: ownership });
    const actual = (await this.tabs(windowId)).find(
      (candidate) => candidate.id === tab.id,
    );
    if (
      !actual ||
      actual.group ||
      (ownership &&
        JSON.stringify(actual.ownership) !== JSON.stringify(ownership))
    )
      throw new Error(
        `Created tab ${tab.id}, but placement or ownership was not persisted. Inspect it before retrying.`,
      );
    return actual;
  }
  async rename(
    _windowId: number,
    _tabId: number,
    _name: string,
  ): Promise<void> {
    throw new Error("This browser does not support native custom tab names.");
  }
  async close(windowId: number, ids: number[]) {
    await this.selected(windowId, ids);
    await this.api.tabs.remove(ids);
    await this.api.storage.session.remove(ids.map(key));
  }
  async createGroup(
    windowId: number,
    ids: number[],
    title: string,
    color?: Color,
  ) {
    if ((await this.selected(windowId, ids)).some((tab) => tab.pinned))
      throw new Error("Unpin tabs before grouping them.");
    const groupId = await this.api.tabs.group({
      tabIds: ids,
      createProperties: { windowId },
    });
    await this.updateGroup(windowId, String(groupId), { title, color });
    const actual = (await this.tabs(windowId)).filter(
      (tab) => tab.group?.id === String(groupId),
    );
    if (
      actual.length !== ids.length ||
      actual.some((tab) => !ids.includes(tab.id))
    )
      throw new Error("Chromium returned unexpected group members.");
    return actual[0]!.group!;
  }
  async updateGroup(
    windowId: number,
    groupId: string,
    changes: { title?: string; color?: Color },
  ) {
    const group = await this.group(windowId, groupId);
    const patch = {
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.color === undefined ? {} : { color: changes.color }),
    };
    await this.api.tabGroups.update(group.id, patch);
    const actual = await this.group(windowId, groupId);
    if (
      (changes.title !== undefined && actual.title !== changes.title) ||
      (changes.color !== undefined && actual.color !== changes.color)
    )
      throw new Error("Chromium did not save the group properties.");
  }
  async moveToGroup(windowId: number, ids: number[], groupId: string) {
    const group = await this.group(windowId, groupId);
    if ((await this.selected(windowId, ids)).some((tab) => tab.pinned))
      throw new Error("Unpin tabs before grouping them.");
    await this.api.tabs.group({ tabIds: ids, groupId: group.id });
    if (
      (await this.selected(windowId, ids)).some(
        (tab) => tab.groupId !== group.id,
      )
    )
      throw new Error("Chromium did not move the tabs into the group.");
  }
}
