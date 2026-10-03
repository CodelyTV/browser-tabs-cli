import type { Color } from "./browser.js";
export interface PlannedTab {
  key: string;
  url: string;
  name?: string;
  groupKey?: string;
}
export interface PlannedGroup {
  key: string;
  title: string;
  color?: Color;
}
export interface Plan {
  $schema?: string;
  version: 1;
  batchId: string;
  windowId?: number;
  tabs: PlannedTab[];
  groups: PlannedGroup[];
}
export type ResolvedPlan = Plan & { windowId: number };
