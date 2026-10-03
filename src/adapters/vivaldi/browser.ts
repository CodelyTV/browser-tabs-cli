import {
  colors,
  type Browser,
  type Color,
  type Ownership,
  type Tab,
} from "../../domain/browser.js";
import {
  metadata,
  type Metadata,
  type NativeApi,
  type NativeTab,
} from "./native-api.js";
const nativeColors: Record<Color, string> = {
  grey: "color1",
  blue: "color2",
  red: "color3",
  yellow: "color4",
  green: "color5",
  pink: "color6",
  purple: "color7",
  teal: "color8",
  orange: "color9",
};
function toTab(tab: NativeTab): Tab {
  const data = metadata(tab);
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.pendingUrl ?? tab.url ?? "",
    title: tab.title ?? "",
    name: data.fixedTitle,
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    loaded: tab.status === "complete" && !tab.discarded,
    ...(data.group
      ? {
          group: {
            id: data.group,
            title: data.fixedGroupTitle ?? "",
            color: colors.find(
              (color) => nativeColors[color] === data.groupColor,
            ),
          },
        }
      : {}),
    ...(data.browserTabsBatchId &&
    data.browserTabsKey &&
    data.browserTabsSourceUrl
      ? {
          ownership: {
            batchId: data.browserTabsBatchId,
            key: data.browserTabsKey,
            sourceUrl: data.browserTabsSourceUrl,
          },
        }
      : {}),
  };
}
export class VivaldiBrowser implements Browser {
  readonly limits = { minGroupSize: 2, maxTabNameLength: 50 };
  constructor(private readonly api: NativeApi) {}
  async windows() {
    return (await this.api.windows.getAll()).map((window) => ({
      id: window.id,
      focused: Boolean(window.focused),
      incognito: Boolean(window.incognito),
    }));
  }
  async tabs(windowId: number) {
    return (await this.api.tabs.query({ windowId })).map(toTab);
  }
  private async selected(windowId: number, ids: number[]) {
    if (!ids.length || new Set(ids).size !== ids.length)
      throw new Error("Select distinct tab IDs.");
    const tabs = await Promise.all(ids.map((id) => this.api.tabs.get(id)));
    if (tabs.some((tab) => tab.windowId !== windowId))
      throw new Error("A selected tab belongs to another window.");
    return tabs;
  }
  async open(windowId: number, url: string, ownership?: Ownership) {
    const before = await this.api.tabs.query({ windowId });
    const active = before.find((tab) => tab.active);
    const data: Metadata = {
      group: "",
      workspaceId: active ? (metadata(active).workspaceId ?? 0) : 0,
    };
    if (ownership)
      Object.assign(data, {
        browserTabsBatchId: ownership.batchId,
        browserTabsKey: ownership.key,
        browserTabsSourceUrl: ownership.sourceUrl,
      });
    const created = await this.api.tabs.create({
      windowId,
      url,
      active: false,
      index: before.length,
      invokedBy: "mainStrip",
      vivExtData: JSON.stringify(data),
    });
    // Locked second-level tabs can inherit the current stack even with group: "".
    const placed = await this.api.tabs.get(created.id);
    if (metadata(placed).group || placed.index !== before.length)
      await this.api.stacks.move({
        windowId,
        tabIds: [created.id],
        target: "last",
        tweaks: ["untile", "ungroup"],
        debug: "BrowserTabs.open",
      });
    const actual = toTab(await this.api.tabs.get(created.id));
    if (
      actual.windowId !== windowId ||
      actual.group ||
      (ownership &&
        JSON.stringify(actual.ownership) !== JSON.stringify(ownership))
    )
      throw new Error(
        `Created tab ${created.id}, but top-level placement or ownership was not persisted. Inspect it before retrying.`,
      );
    return actual;
  }
  async rename(windowId: number, tabId: number, name: string) {
    if (name.length > this.limits.maxTabNameLength)
      throw new Error("Vivaldi tab names are limited to 50 UTF-16 code units.");
    await this.selected(windowId, [tabId]);
    await this.api.tabs.update(tabId, {
      vivExtData: JSON.stringify({ fixedTitle: name }),
    });
    if (metadata(await this.api.tabs.get(tabId)).fixedTitle !== name)
      throw new Error("Vivaldi did not save the tab name.");
  }
  async close(windowId: number, ids: number[]) {
    await this.selected(windowId, ids);
    await this.api.tabs.remove(ids);
  }
  async createGroup(
    windowId: number,
    ids: number[],
    title: string,
    color?: Color,
  ) {
    const tabs = await this.selected(windowId, ids);
    if (tabs.length < 2 || tabs.some((tab) => tab.pinned))
      throw new Error("Vivaldi stacks require at least two unpinned tabs.");
    const result = await this.api.stacks.move({
      windowId,
      tabIds: ids,
      target: ids[0]!,
      tweaks: ["do-not-reparent", "create-new-group", "target-is-tab"],
      debug: "BrowserTabs.createGroup",
    });
    if (!result.group) throw new Error("Vivaldi did not create a stack.");
    await this.updateGroup(windowId, result.group, { title, color });
    const actual = (await this.tabs(windowId)).filter(
      (tab) => tab.group?.id === result.group,
    );
    if (
      actual.length !== ids.length ||
      actual.some((tab) => !ids.includes(tab.id))
    )
      throw new Error("Vivaldi returned unexpected stack members.");
    return { id: result.group, title, color };
  }
  async updateGroup(
    windowId: number,
    groupId: string,
    changes: { title?: string; color?: Color },
  ) {
    if (!(await this.tabs(windowId)).some((tab) => tab.group?.id === groupId))
      throw new Error("Stack is not in the selected window.");
    await this.api.stacks.setGroupProperties({
      groupExtId: groupId,
      ...(changes.title === undefined ? {} : { groupTitle: changes.title }),
      ...(changes.color === undefined
        ? {}
        : { groupColor: nativeColors[changes.color] }),
    });
    const members = (await this.tabs(windowId)).filter(
      (tab) => tab.group?.id === groupId,
    );
    if (
      !members.length ||
      members.some(
        (tab) =>
          (changes.title !== undefined && tab.group!.title !== changes.title) ||
          (changes.color !== undefined && tab.group!.color !== changes.color),
      )
    )
      throw new Error("Vivaldi did not save the stack properties.");
  }
  async moveToGroup(windowId: number, ids: number[], groupId: string) {
    if ((await this.selected(windowId, ids)).some((tab) => tab.pinned))
      throw new Error("Unpin tabs before moving them into a stack.");
    const members = (await this.tabs(windowId)).filter(
      (tab) => tab.group?.id === groupId,
    );
    if (!members.length)
      throw new Error("Target stack is not in the selected window.");
    const moving = (await this.selected(windowId, ids))
      .filter((tab) => metadata(tab).group !== groupId)
      .map((tab) => tab.id);
    if (!moving.length) return;
    // Insert after the first member, inside the stack. Its outer boundary can
    // resolve to the next stack even when the native call reports success.
    const reference = metadata(await this.api.tabs.get(members[0]!.id)).ext_id;
    if (!reference) throw new Error("Target tab has no native extension ID.");
    const result = await this.api.stacks.move({
      windowId,
      tabIds: moving,
      target: reference,
      tweaks: ["target-is-tab", "below", "strip-down"],
      debug: "BrowserTabs.moveToGroup",
    });
    if (
      (await this.selected(windowId, ids)).some(
        (tab) => metadata(tab).group !== groupId,
      )
    )
      throw new Error(
        `Vivaldi did not move the tabs into stack ${groupId}: ${JSON.stringify(result)}; observed ${JSON.stringify((await this.selected(windowId, ids)).map((tab) => ({ id: tab.id, group: metadata(tab).group })))}`,
      );
  }
}
