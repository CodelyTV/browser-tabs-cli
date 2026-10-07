import { homedir, platform } from "node:os";
import { join } from "node:path";
import { discoverEndpoint as readEndpoint } from "../vivaldi/discovery.js";
export const chromiumBrowsers = [
  "helium",
  "chromium",
  "chrome",
  "brave",
  "edge",
  "opera",
] as const;
export type ChromiumName = (typeof chromiumBrowsers)[number];
const paths: Record<ChromiumName, [string, string, string]> = {
  helium: ["net.imput.helium", "Helium/User Data", "helium"],
  chromium: ["Chromium", "Chromium/User Data", "chromium"],
  chrome: ["Google/Chrome", "Google/Chrome/User Data", "google-chrome"],
  brave: [
    "BraveSoftware/Brave-Browser",
    "BraveSoftware/Brave-Browser/User Data",
    "BraveSoftware/Brave-Browser",
  ],
  edge: ["Microsoft Edge", "Microsoft/Edge/User Data", "microsoft-edge"],
  opera: ["com.operasoftware.Opera", "Opera Software/Opera Stable", "opera"],
};
export function dataDirectory(
  browser: ChromiumName,
  os = platform(),
  home = homedir(),
  env = process.env,
): string {
  const override =
    env[`BROWSER_TABS_${browser.toUpperCase()}_DATA_DIR`] ??
    env.BROWSER_TABS_DATA_DIR;
  if (override) return override;
  if (os === "darwin")
    return join(home, "Library", "Application Support", paths[browser][0]);
  if (os === "win32")
    return join(
      browser === "opera" ? (env.APPDATA ?? "") : (env.LOCALAPPDATA ?? ""),
      paths[browser][1],
    );
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), paths[browser][2]);
}
export async function discoverChromiumEndpoint(browser: ChromiumName) {
  try {
    return await readEndpoint(dataDirectory(browser));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Invalid DevToolsActivePort file."
    )
      throw error;
    throw new Error(
      `${browser} debugging is unavailable: cannot read DevToolsActivePort in ${dataDirectory(browser)}. Enable remote debugging at chrome://inspect/#remote-debugging if available, then retry without --cdp. For an already configured endpoint use --cdp; for a custom profile use BROWSER_TABS_${browser.toUpperCase()}_DATA_DIR. See docs/chromium.md.`,
      { cause: error },
    );
  }
}
