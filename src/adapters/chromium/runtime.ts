import { execute } from "../../application/execute.js";
import type { Command } from "../../domain/command.js";
import { ChromiumBrowser } from "./browser.js";
import type { NativeApi } from "./native-api.js";
declare const chrome: NativeApi;
export const adapter = "browser-tabs-chromium-v1";
export function run(command: Command) {
  return execute(new ChromiumBrowser(chrome), command);
}
