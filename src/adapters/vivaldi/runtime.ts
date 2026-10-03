import { execute } from "../../application/execute.js";
import type { Command } from "../../domain/command.js";
import { VivaldiBrowser } from "./browser.js";
import type { NativeApi } from "./native-api.js";
declare const chrome: {
  windows: NativeApi["windows"];
  tabs: NativeApi["tabs"];
};
declare const vivaldi: { tabsPrivate: NativeApi["stacks"] };
export function run(command: Command) {
  return execute(
    new VivaldiBrowser({
      windows: chrome.windows,
      tabs: chrome.tabs,
      stacks: vivaldi.tabsPrivate,
    }),
    command,
  );
}
