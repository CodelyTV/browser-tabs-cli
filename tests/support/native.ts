import type {
  Metadata,
  NativeApi,
  NativeTab,
} from "../../src/adapters/vivaldi/native-api.js";
import { metadata } from "../../src/adapters/vivaldi/native-api.js";
import { VivaldiBrowser } from "../../src/adapters/vivaldi/browser.js";
export class FakeNative implements NativeApi {
  readonly rows: NativeTab[] = [];
  readonly mutations: string[] = [];
  openWindows = [{ id: 1, focused: true }];
  loading = false;
  lockedStack = false;
  failOpenAt = 0;
  private nextId = 10;
  private nextGroup = 0;
  readonly windows = { getAll: async () => structuredClone(this.openWindows) };
  readonly tabs = {
    query: async ({ windowId }: { windowId: number }) =>
      structuredClone(this.rows.filter((tab) => tab.windowId === windowId)),
    get: async (id: number) => structuredClone(this.row(id)),
    create: async (options: Parameters<NativeApi["tabs"]["create"]>[0]) => {
      if (
        this.failOpenAt &&
        this.mutations.filter((value) => value === "open").length + 1 ===
          this.failOpenAt
      )
        throw new Error("Simulated open failure");
      this.mutations.push("open");
      const data: Metadata = {
        ...JSON.parse(options.vivExtData),
        ext_id: `ext-${this.nextId}`,
      };
      if (this.lockedStack)
        data.group = metadata(this.rows.find((tab) => tab.active)!).group;
      const tab: NativeTab = {
        id: this.nextId++,
        windowId: options.windowId,
        index: this.rows.length,
        url: options.url,
        title: "Page title",
        active: false,
        status: this.loading ? "loading" : "complete",
        vivExtData: JSON.stringify(data),
      };
      this.rows.push(tab);
      return structuredClone(tab);
    },
    update: async (id: number, options: { vivExtData: string }) => {
      this.mutations.push("rename");
      this.patch(id, JSON.parse(options.vivExtData));
      return structuredClone(this.row(id));
    },
    remove: async (ids: number[]) => {
      this.mutations.push("close");
      for (const id of ids)
        this.rows.splice(
          this.rows.findIndex((tab) => tab.id === id),
          1,
        );
    },
  };
  readonly stacks = {
    move: async (options: Parameters<NativeApi["stacks"]["move"]>[0]) => {
      const creating = options.tweaks.includes("create-new-group");
      const ungrouping = options.tweaks.includes("ungroup");
      this.mutations.push(creating ? "group" : ungrouping ? "ungroup" : "move");
      const group = ungrouping
        ? ""
        : creating
          ? `group-${++this.nextGroup}`
          : options.tweaks.includes("target-is-tab")
            ? metadata(
                this.rows.find(
                  (tab) => metadata(tab).ext_id === options.target,
                )!,
              ).group!
            : String(options.target);
      const properties = this.rows.find((tab) => metadata(tab).group === group);
      for (const id of options.tabIds)
        this.patch(id, {
          ...(properties ? metadata(properties) : {}),
          ...metadata(this.row(id)),
          group,
          ...(properties
            ? {
                fixedGroupTitle: metadata(properties).fixedGroupTitle,
                groupColor: metadata(properties).groupColor,
              }
            : {}),
        });
      return { group };
    },
    setGroupProperties: async (
      options: Parameters<NativeApi["stacks"]["setGroupProperties"]>[0],
    ) => {
      this.mutations.push("properties");
      for (const tab of this.rows.filter(
        (tab) => metadata(tab).group === options.groupExtId,
      ))
        this.patch(tab.id, {
          ...(options.groupTitle === undefined
            ? {}
            : { fixedGroupTitle: options.groupTitle }),
          ...(options.groupColor === undefined
            ? {}
            : { groupColor: options.groupColor }),
        });
    },
  };
  row(id: number) {
    const tab = this.rows.find((tab) => tab.id === id);
    if (!tab) throw new Error(`Unknown tab ${id}`);
    return tab;
  }
  patch(id: number, change: Metadata) {
    const tab = this.row(id);
    tab.vivExtData = JSON.stringify({ ...metadata(tab), ...change });
  }
  seed(data: Metadata = {}) {
    const tab: NativeTab = {
      id: this.nextId++,
      windowId: 1,
      index: this.rows.length,
      url: "https://personal.example/",
      active: true,
      status: "complete",
      vivExtData: JSON.stringify(data),
    };
    this.rows.push(tab);
    return tab.id;
  }
}
export function fixture() {
  const api = new FakeNative();
  return { api, browser: new VivaldiBrowser(api) };
}
export const plan = {
  version: 1 as const,
  batchId: "test-batch",
  tabs: [
    {
      key: "one",
      url: "https://example.com/one",
      name: "First page",
      groupKey: "story",
    },
    {
      key: "two",
      url: "https://example.com/two",
      name: "Second page",
      groupKey: "story",
    },
    { key: "three", url: "https://example.com/three", name: "Standalone page" },
  ],
  groups: [{ key: "story", title: "Related pages", color: "yellow" as const }],
};
