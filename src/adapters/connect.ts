import type { Connection } from "../domain/command.js";
import { connectVivaldi } from "./vivaldi/connection.js";
import { connectChromium } from "./chromium/connection.js";
import { chromiumBrowsers, type ChromiumName } from "./chromium/discovery.js";
export function connect(
  browser: string,
  endpoint: string,
): Promise<Connection> {
  if (browser === "vivaldi") return connectVivaldi(endpoint);
  if (chromiumBrowsers.includes(browser as ChromiumName))
    return connectChromium(browser as ChromiumName, endpoint);
  throw new Error(
    `Unsupported browser: ${browser}. Available adapters: vivaldi, ${chromiumBrowsers.join(", ")}.`,
  );
}
