export const colors = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "teal",
  "orange",
] as const;
export type Color = (typeof colors)[number];
export interface BrowserWindow {
  id: number;
  focused: boolean;
  incognito: boolean;
}
export interface Ownership {
  batchId: string;
  key: string;
  sourceUrl: string;
}
export interface Group {
  id: string;
  title: string;
  color?: Color;
}
export interface Tab {
  id: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  name?: string;
  active: boolean;
  pinned: boolean;
  loaded: boolean;
  group?: Group;
  ownership?: Ownership;
}
export interface GroupWithTabs extends Group {
  tabIds: number[];
}
export interface Browser {
  readonly limits: {
    minGroupSize: number;
    maxTabNameLength?: number;
    tabNames?: boolean;
  };
  windows(): Promise<BrowserWindow[]>;
  tabs(windowId: number): Promise<Tab[]>;
  open(windowId: number, url: string, ownership?: Ownership): Promise<Tab>;
  rename(windowId: number, tabId: number, name: string): Promise<void>;
  close(windowId: number, tabIds: number[]): Promise<void>;
  createGroup(
    windowId: number,
    tabIds: number[],
    title: string,
    color?: Color,
  ): Promise<Group>;
  updateGroup(
    windowId: number,
    groupId: string,
    changes: { title?: string; color?: Color },
  ): Promise<void>;
  moveToGroup(
    windowId: number,
    tabIds: number[],
    groupId: string,
  ): Promise<void>;
}
export function groupsFromTabs(tabs: Tab[]): GroupWithTabs[] {
  const groups = new Map<string, GroupWithTabs>();
  for (const tab of tabs) {
    if (!tab.group) continue;
    const group = groups.get(tab.group.id) ?? { ...tab.group, tabIds: [] };
    group.tabIds.push(tab.id);
    groups.set(group.id, group);
  }
  return [...groups.values()];
}
