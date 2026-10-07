import type { Color, Ownership } from "../../domain/browser.js";
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
  groupId: number;
}
export interface NativeGroup {
  id: number;
  windowId: number;
  title?: string;
  color: Color;
}
export interface NativeApi {
  windows: {
    getAll(options: {
      windowTypes: string[];
    }): Promise<{ id: number; focused?: boolean; incognito?: boolean }[]>;
  };
  tabs: {
    query(options: { windowId: number }): Promise<NativeTab[]>;
    get(id: number): Promise<NativeTab>;
    create(options: {
      windowId: number;
      url: string;
      active: false;
      index: number;
    }): Promise<NativeTab>;
    remove(ids: number[]): Promise<void>;
    group(options: {
      tabIds: number[];
      groupId?: number;
      createProperties?: { windowId: number };
    }): Promise<number>;
  };
  tabGroups: {
    query(options: { windowId: number }): Promise<NativeGroup[]>;
    get(id: number): Promise<NativeGroup>;
    update(
      id: number,
      changes: { title?: string; color?: Color },
    ): Promise<NativeGroup>;
  };
  storage: {
    session: {
      get(keys: string[]): Promise<Record<string, Ownership>>;
      set(values: Record<string, Ownership>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
  };
}
