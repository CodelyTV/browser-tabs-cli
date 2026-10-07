# Helium and Chromium browsers

Select `--browser helium`, `chromium`, `chrome`, `brave`, `edge`, or `opera`.
These selectors share an adapter with direct CDP for basic commands and optional
standard Chromium extension APIs for groups and batches.
Other Chromium forks can use `--browser chromium --cdp PORT` or set
`BROWSER_TABS_DATA_DIR` to their user data directory. Extension features require
`chrome.tabs.group`, `chrome.tabGroups`, and `chrome.storage.session`.
Vivaldi remains the default and uses its own adapter without an extension.

## Basic commands without an extension

An extension is optional, but remote debugging is required. `--cdp 9222` selects
an existing endpoint; it does not start a debugging server or enable debugging.

### Connect an existing Helium session

In recent Chromium-based versions, including the Chromium 154 build used by
Helium 0.18.3.1, check the remote-debugging page in the intended session:

1. Open `chrome://inspect/#remote-debugging` in Helium.
2. Enable **Allow remote debugging for this browser instance**, if available.
3. Run `browser-tabs --browser helium doctor` without `--cdp`.
4. If Helium prompts for debugging access, accept the connection. Keep the browser
   visible while connecting; the CLI waits up to 60 seconds for the prompt.
5. Run `browser-tabs --browser helium tab list`.

The [Chromium debugging UI](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)
lets the browser choose its port. Automatic discovery reads `DevToolsActivePort`
from Helium's user data directory. Do not assume the selected port is 9222.
The CLI has been tested with Helium startup-flag debugging; this settings-based
flow uses Chromium's UI and must be enabled by the user in their session.

### Why Helium asks for permission on every command

The browser's settings-based remote debugging runs in approval mode:
[Chromium requires approval for each incoming connection](https://github.com/chromium/chromium/blob/main/chrome/browser/devtools/remote_debugging_server.cc).
The CLI opens one CDP connection per command and closes it when the command
finishes. Therefore, accepting `doctor` does not authorize a later `tab list` or
`group open`. The optional extension does not change this connection lifecycle.
Passing the same port with `--cdp` also does not change the approval mode.

The CLI currently has no persistent session or daemon to reuse an approved
connection across commands. Startup-flag debugging is a separate browser mode
and can avoid this per-connection approval flow, but must be configured when the
browser starts. It cannot be enabled by a CLI option on an already running
session. The isolated-profile example below is a separate session and does not
expose tabs in your usual profile; it is not a fix for access to those tabs.

If the setting is unavailable in your build, prepare a separate test profile
with debugging startup flags yourself, or use an endpoint you have already
configured. For macOS, an isolated Helium session can be started with:

```sh
BROWSER_TABS_HELIUM_DATA_DIR="$(mktemp -d -t helium-cdp)"
export BROWSER_TABS_HELIUM_DATA_DIR
/Applications/Helium.app/Contents/MacOS/Helium \
  --user-data-dir="$BROWSER_TABS_HELIUM_DATA_DIR" \
  --remote-debugging-port=0 \
  --remote-debugging-address=127.0.0.1 \
  --no-first-run --no-default-browser-check about:blank
```

Run `browser-tabs --browser helium doctor` from another terminal with the same
`BROWSER_TABS_HELIUM_DATA_DIR` value. This temporary profile has its own tabs;
it does not give access to tabs in your usual profile. Do not restart an existing
profile with flags as a routine troubleshooting step. The CLI itself never
launches or restarts browsers or enables debugging.

### Select a known endpoint

Use `--cdp` only when that session already exposes the endpoint:

```sh
browser-tabs --browser helium --cdp 9222 doctor
browser-tabs --browser helium --cdp 9222 windows
browser-tabs --browser helium --cdp 9222 tab list
browser-tabs --browser helium --cdp 9222 tab open https://example.com
browser-tabs --browser helium --cdp 9222 tab close --tabs cdp:TARGET_ID
```

Use the exact `id` returned by `tab list` or `tab open` when closing tabs. Direct
CDP IDs are strings prefixed with `cdp:` and remain valid across CLI connections
while the target exists. Extension connections return native numeric tab IDs;
list tabs again when changing connection modes.

Without a usable extension options page, the CLI automatically selects basic CDP.
It lists page targets and their window IDs, URLs, and titles. CDP does not expose
native group membership, tab order, pinned/active/loading state, or window
focus/incognito state, so these fields are omitted. Worker, iframe, and DevTools
page targets are excluded. Window discovery requires at least one page target.

With multiple windows, use `--window ID` to list or close tabs. Opening requires
one window in the selected browser context: CDP's
[`Target.createTarget`](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-createTarget)
does not accept a destination window ID. New tabs open in the background, and their window is checked after creation.
If a concurrent window change causes placement elsewhere, the new tab is closed
and the command fails. Multiple windows in the same context require the extension
for opening. Groups and batches fail with an extension setup message before
mutation. Native custom tab names remain unsupported in both Chromium modes.

## Optional extension for groups and batches

Approving browser debugging grants a CDP connection, not extension API access.
`group open` needs the extension even after you accept the debugging prompt.
Installing the extension alone is insufficient: its options page must stay open
in the browser profile being controlled.

1. Build the project (`pnpm build`) or install the published package. The extension
   is included at `dist/chromium-extension` inside the installed package.
   For a global pnpm installation, locate the package under `pnpm root -g`.
   Keep that directory in place while the extension is installed.
2. In the intended browser, open `chrome://extensions`, enable **Developer mode**,
   choose **Load unpacked**, and select `dist/chromium-extension`.
3. Open **Details → Extension options** for **Browser Tabs CLI**. Keep that page
   open while running CLI commands. Reopen it after restarting the browser.
4. Configure an existing loopback CDP endpoint in that browser. Debugging setup
   varies by browser/version; where available, use the browser's remote debugging
   setting. Otherwise prepare a separate profile with startup flags yourself.
   The CLI never launches or restarts browsers or enables debugging.
5. Check the connection:

   ```sh
   browser-tabs --browser helium --cdp 9222 doctor
   browser-tabs --browser helium --cdp 9222 windows
   browser-tabs --browser helium --cdp 9222 tab list --window 123
   browser-tabs --browser helium --cdp 9222 group open "Reading" https://example.com https://codely.com --color blue --window 123
   ```

After opening the options page, run:

```sh
browser-tabs --browser helium doctor
```

Check `data.capabilities.mode`: `chromium-extension` reports `groups: true` and
`batches: true`. `basic-cdp` reports both as false. If the mode is still basic,
check that the extension is enabled and its options page is open in this same
browser session. After connecting in extension mode, the original command works:

```sh
browser-tabs group open "Codely learning" https://codely.com/ https://codely.com/courses --color yellow --browser helium
```

If the browser writes `DevToolsActivePort`, omit `--cdp` to discover it from the
browser's default user data directory. For custom directories use
`BROWSER_TABS_HELIUM_DATA_DIR` (or the equivalent browser name), or the shared
`BROWSER_TABS_DATA_DIR`. A browser-specific override takes precedence.
Point to the user data root, not its `Default` or `Profile 1` subdirectory.
`--cdp` or `BROWSER_TABS_CDP` takes precedence over directory discovery.
Helium's macOS default is `~/Library/Application Support/net.imput.helium`.
Use an override if your distribution uses a different location.

## Extension capabilities and limits

- List normal windows and tabs; open inactive tabs; close selected tabs.
- Create native groups (including one-tab groups), rename groups, set colors,
  and move unpinned tabs into groups in the selected window.
- Open, verify, replay, and close batches. Remove optional tab `name` fields from
  batch JSON. `tab rename` and `tab open --name` fail before any tab is created:
  the standard [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
  does not provide native custom tab names.
- Ownership metadata uses
  [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage),
  surviving CLI disconnections and extension page reloads, but clearing when the
  browser restarts or the extension is reloaded, updated, or disabled. Replaying
  a batch after that creates new tabs; previous tabs are treated as unowned.
- Incognito windows require enabling the extension for incognito.

The extension requests `tabs`, `tabGroups`, and `storage` permissions. It has no
host permissions, content scripts, remote code, or network listener. The CLI
only evaluates its connection page, never website JavaScript. It checks the
extension manifest name and native APIs, then loads the runtime bundled with
the CLI into that page for each command. The page does not need its own runtime
script, so an absent or stale extension script cannot force basic CDP mode.

## Validation

Automated tests execute the built extension runtime against a local CDP server
and simulated native APIs. They cover native group membership, colors, one-tab
batches, ownership across connections, safe retries/cleanup, window isolation,
and rejection of unsupported names before mutation. Selector support does not
mean every listed browser/version has been tested live.

## Real-browser smoke test

After configuring an isolated test profile and opening the extension options page:

```sh
pnpm build
BROWSER_TABS_CDP=9222 pnpm smoke:chromium
BROWSER_TABS_BROWSER=brave BROWSER_TABS_CDP=9222 pnpm smoke:chromium 123
```

`smoke:chromium` defaults to Helium. It opens eight local pages in four colored
native groups, repeats the batch, exercises unit operations, checks foreign-member
conflicts, closes its own tabs, and compares the original inventory after cleanup.
The script never launches or restarts a browser.

On 2026-10-07 this passed on macOS with Helium **0.18.3.1** (Chromium
**154.0.8037.97**) and Node **24.19.0**, using an empty temporary profile,
`--headless=new`, `--remote-debugging-port=0`, and the unpacked extension.
The test attached to the extension options page over loopback CDP. Applying and
verifying the batch took 1539 ms; replaying and verifying took 1089 ms. Both
include the explicit one-second verification delay. The initial tabs were
preserved after cleanup. This validates native API state; no visual inspection
of the browser UI was performed. Other listed browser versions remain untested
live.

## Basic CDP smoke test

Use an isolated browser session without the Browser Tabs CLI extension options
page. No extension installation is needed:

```sh
pnpm build
BROWSER_TABS_CDP=9222 pnpm smoke:cdp
```

`BROWSER_TABS_BROWSER` selects another Chromium browser; the default is Helium.
The test runs `doctor`, lists windows and tabs, opens two local pages, closes
only their CDP IDs across separate CLI connections, and checks that the original
tabs remain. It also checks that groups and custom names fail explicitly.

This passed on macOS with Helium **0.18.3.1** (Chromium **154.0.8037.97**) and
Node **24.19.0**, using an empty temporary profile with `--headless=new`,
`--remote-debugging-port=0`, and `--disable-extensions`. The Browser Tabs CLI
extension was not loaded. The final implementation opens URLs directly with
`Target.createTarget`; navigating a newly created blank target separately caused
aborted navigations in this Helium test session.

## Connection errors

- **Debugging is unavailable:** no readable `DevToolsActivePort` was found at
  the selected user data root. Enable debugging in the intended session or set
  `BROWSER_TABS_HELIUM_DATA_DIR` to its actual user data root.
- **Cannot reach CDP** (older versions report **fetch failed**): the selected HTTP
  endpoint could not be reached. For `--cdp 9222`, check
  `curl http://127.0.0.1:9222/json/version`. If the connection is refused, that
  port has no reachable debugging server. Enable debugging and use automatic
  discovery or the port the browser actually reports.
- If discovery fails after a restart, recheck the browser's debugging setting.
