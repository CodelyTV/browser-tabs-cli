import { build } from "esbuild";
import { chmod, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/cli/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
});
await build({
  entryPoints: ["src/adapters/vivaldi/runtime.ts"],
  outfile: "dist/vivaldi-runtime.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "BrowserTabsRuntime",
  target: "chrome120",
});
await chmod("dist/main.js", 0o755);
