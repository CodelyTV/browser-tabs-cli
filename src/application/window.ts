import type { Browser } from "../domain/browser.js";
export async function selectWindow(
  browser: Browser,
  requested?: number,
): Promise<number> {
  const windows = await browser.windows();
  if (requested !== undefined) {
    if (!windows.some((window) => window.id === requested))
      throw new Error(`Window ${requested} is not open.`);
    return requested;
  }
  if (windows.length === 0) throw new Error("No browser window is open.");
  if (windows.length !== 1)
    throw new Error(
      "Multiple browser windows are open. Run windows and specify --window or windowId.",
    );
  return windows[0]!.id;
}
