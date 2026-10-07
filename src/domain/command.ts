import type { Color } from "./browser.js";
import type { Plan } from "./plan.js";
export type TabId = number | string;
type WindowTarget = { windowId?: number };
export type Command =
  | { type: "windows" }
  | ({ type: "tabs" | "groups" } & WindowTarget)
  | ({ type: "tab.open"; url: string; name?: string } & WindowTarget)
  | ({ type: "tab.rename"; tabId: TabId; name: string } & WindowTarget)
  | ({ type: "tab.close"; tabIds: TabId[] } & WindowTarget)
  | ({
      type: "group.create";
      title: string;
      tabIds: TabId[];
      color?: Color;
    } & WindowTarget)
  | ({
      type: "group.update";
      groupId: string;
      title?: string;
      color?: Color;
    } & WindowTarget)
  | ({ type: "group.move"; groupId: string; tabIds: TabId[] } & WindowTarget)
  | { type: "batch.open"; plan: Plan; verifyAfterMs?: number }
  | { type: "batch.verify"; plan: Plan; verifyAfterMs?: number }
  | ({ type: "batch.close"; batchId: string } & WindowTarget);
export interface Connection {
  readonly capabilities?: {
    mode: "basic-cdp" | "chromium-extension";
    groups: boolean;
    batches: boolean;
    tabNames: boolean;
  };
  execute(command: Command): Promise<unknown>;
  close(): void;
}
