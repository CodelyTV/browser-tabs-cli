import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
export async function discoverEndpoint(
  directory = process.env.BROWSER_TABS_VIVALDI_DATA_DIR,
): Promise<string> {
  const root =
    directory ??
    (platform() === "darwin"
      ? join(homedir(), "Library", "Application Support", "Vivaldi")
      : platform() === "win32"
        ? join(process.env.LOCALAPPDATA ?? "", "Vivaldi", "User Data")
        : join(
            process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
            "vivaldi",
          ));
  let file: string;
  try {
    file = await readFile(join(root, "DevToolsActivePort"), "utf8");
  } catch {
    throw new Error(
      "Vivaldi debugging is unavailable. Configure it first; see docs/vivaldi.md. Use --cdp for an explicit endpoint.",
    );
  }
  const [port, path] = file.trim().split(/\r?\n/);
  if (
    !port ||
    !/^\d+$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535 ||
    !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(path ?? "")
  )
    throw new Error("Invalid DevToolsActivePort file.");
  return `ws://127.0.0.1:${port}${path}`;
}
