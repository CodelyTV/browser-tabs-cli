import type { Color } from "./browser.js";
import type { Plan } from "./plan.js";
type WindowTarget = { windowId?: number };
export type Command =
  | { type: "windows" }
  | ({ type: "tabs" | "groups" } & WindowTarget)
  | ({ type: "tab.open"; url: string; name?: string } & WindowTarget)
  | ({ type: "tab.rename"; tabId: number; name: string } & WindowTarget)
  | ({ type: "tab.close"; tabIds: number[] } & WindowTarget)
  | ({
      type: "group.create";
      title: string;
      tabIds: number[];
      color?: Color;
    } & WindowTarget)
  | ({
      type: "group.update";
      groupId: string;
      title?: string;
      color?: Color;
    } & WindowTarget)
  | ({ type: "group.move"; groupId: string; tabIds: number[] } & WindowTarget)
  | { type: "batch.open"; plan: Plan; verifyAfterMs?: number }
  | { type: "batch.verify"; plan: Plan; verifyAfterMs?: number }
  | ({ type: "batch.close"; batchId: string } & WindowTarget);
export interface Connection {
  execute(command: Command): Promise<unknown>;
  close(): void;
}
