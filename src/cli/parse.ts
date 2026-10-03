import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Command } from "../domain/command.js";
import type { Plan } from "../domain/plan.js";
import {
  color,
  id,
  ids,
  navigationUrl,
  parsePlan,
  text,
} from "../domain/validation.js";
export type Input =
  | { kind: "help" }
  | { kind: "validate"; plan: Plan }
  | {
      kind: "execute";
      browser: string;
      endpoint: string;
      command: Command;
      doctor: boolean;
    };
export function parse(argv: string[]): Input {
  const { values, positionals: words } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      browser: { type: "string" },
      cdp: { type: "string" },
      window: { type: "string" },
      name: { type: "string" },
      tabs: { type: "string" },
      color: { type: "string" },
      batch: { type: "string" },
      wait: { type: "string" },
    },
  });
  if (values.help || !words.length) return { kind: "help" };
  const args = words.slice(2);
  const arg = (index: number) => text(args[index], "command argument");
  const check = (count: number | undefined, allowed: string[] = []) => {
    if (count !== undefined && args.length !== count)
      throw new Error("Unexpected or missing arguments. See --help.");
    for (const key of Object.keys(values))
      if (!["browser", "cdp", "help", ...allowed].includes(key))
        throw new Error(`--${key} does not apply to this command.`);
  };
  const windowId = values.window === undefined ? undefined : id(values.window);
  const target = windowId === undefined ? {} : { windowId };
  const waitMs = (defaultSeconds: number) => {
    const seconds =
      values.wait === undefined
        ? defaultSeconds
        : Number(text(values.wait, "--wait"));
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300)
      throw new Error("--wait must be between 0 and 300 seconds.");
    return seconds * 1000;
  };
  let command: Command;
  if (words[0] === "doctor" || words[0] === "windows") {
    check(undefined);
    if (words.length !== 1) throw new Error("Unexpected arguments.");
    command = { type: "windows" };
  } else
    switch (`${words[0]} ${words[1]}`) {
      case "tab list":
        check(0, ["window"]);
        command = { type: "tabs", ...target };
        break;
      case "group list":
        check(0, ["window"]);
        command = { type: "groups", ...target };
        break;
      case "tab open":
        check(1, ["window", "name"]);
        command = {
          type: "tab.open",
          ...target,
          url: navigationUrl(arg(0)),
          ...(values.name === undefined
            ? {}
            : { name: text(values.name, "name") }),
        };
        break;
      case "tab rename":
        check(2, ["window"]);
        command = {
          type: "tab.rename",
          ...target,
          tabId: id(arg(0)),
          name: arg(1),
        };
        break;
      case "tab close":
        check(0, ["window", "tabs"]);
        command = { type: "tab.close", ...target, tabIds: ids(values.tabs) };
        break;
      case "group create":
        check(1, ["window", "tabs", "color"]);
        command = {
          type: "group.create",
          ...target,
          tabIds: ids(values.tabs),
          title: arg(0),
          color: color(values.color),
        };
        break;
      case "group rename":
        check(2, ["window"]);
        command = {
          type: "group.update",
          ...target,
          groupId: arg(0),
          title: arg(1),
        };
        break;
      case "group color":
        check(2, ["window"]);
        command = {
          type: "group.update",
          ...target,
          groupId: arg(0),
          color: color(arg(1)),
        };
        break;
      case "group move":
        check(1, ["window", "tabs"]);
        command = {
          type: "group.move",
          ...target,
          groupId: arg(0),
          tabIds: ids(values.tabs),
        };
        break;
      case "group open": {
        check(undefined, ["window", "color", "batch", "wait"]);
        if (args.length < 2)
          throw new Error("Provide a group title and its URLs.");
        const plan = parsePlan({
          version: 1,
          batchId: values.batch ?? randomUUID(),
          ...target,
          tabs: args.slice(1).map((url, index) => ({
            key: `tab-${index + 1}`,
            url,
            groupKey: "group",
          })),
          groups: [
            {
              key: "group",
              title: arg(0),
              ...(values.color === undefined
                ? {}
                : { color: color(values.color) }),
            },
          ],
        });
        command = { type: "batch.apply", plan, waitMs: waitMs(30) };
        break;
      }
      case "batch validate":
      case "batch apply":
      case "batch verify": {
        const local = words[1] === "validate";
        check(1, local ? [] : ["window", "wait"]);
        const plan = parsePlan(JSON.parse(readFileSync(arg(0), "utf8")));
        if (local) return { kind: "validate", plan };
        if (
          windowId !== undefined &&
          plan.windowId !== undefined &&
          windowId !== plan.windowId
        )
          throw new Error("--window conflicts with windowId in the JSON.");
        command = {
          type: words[1] === "apply" ? "batch.apply" : "batch.verify",
          plan: { ...plan, ...target },
          waitMs: waitMs(words[1] === "apply" ? 30 : 0),
        };
        break;
      }
      case "batch close":
        check(1, ["window"]);
        command = { type: "batch.close", ...target, batchId: arg(0) };
        break;
      default:
        throw new Error("Unknown command. See --help.");
    }
  return {
    kind: "execute",
    browser: values.browser ?? "vivaldi",
    endpoint: values.cdp ?? process.env.BROWSER_TABS_CDP ?? "auto",
    command,
    doctor: words[0] === "doctor",
  };
}
