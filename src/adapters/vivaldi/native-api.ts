export interface Metadata {
  ext_id?: string;
  group?: string;
  fixedTitle?: string;
  fixedGroupTitle?: string;
  groupColor?: string;
  workspaceId?: number;
  browserTabsBatchId?: string;
  browserTabsKey?: string;
  browserTabsSourceUrl?: string;
}
export interface NativeTab {
  id: number;
  windowId: number;
  index: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  active?: boolean;
  pinned?: boolean;
  status?: string;
  discarded?: boolean;
  vivExtData?: string;
}
export interface NativeApi {
  windows: {
    getAll(): Promise<{ id: number; focused?: boolean; incognito?: boolean }[]>;
  };
  tabs: {
    query(options: { windowId: number }): Promise<NativeTab[]>;
    get(id: number): Promise<NativeTab>;
    create(options: {
      windowId: number;
      url: string;
      active: false;
      index: number;
      invokedBy: string;
      vivExtData: string;
    }): Promise<NativeTab>;
    update(id: number, options: { vivExtData: string }): Promise<NativeTab>;
    remove(ids: number[]): Promise<void>;
  };
  stacks: {
    move(options: {
      tabIds: number[];
      target: number | string;
      windowId: number;
      tweaks: string[];
      debug: string;
    }): Promise<{ group?: string }>;
    setGroupProperties(options: {
      groupExtId: string;
      groupTitle?: string;
      groupColor?: string;
    }): Promise<unknown>;
  };
}
export function metadata(tab: NativeTab): Metadata {
  return JSON.parse(tab.vivExtData || "{}");
}
