# How to use `browser-tabs-cli` with Vivaldi

Install the CLI following the [README](../README.md), then connect it to the
Vivaldi session whose tabs you want to organize. The terminal command is
`browser-tabs`.

**Vivaldi does not need to be your default browser.** The CLI opens tabs through
its connection to Vivaldi, so your operating system's default-browser setting
does not affect where the links open.

## Option 1: Enable debugging in the open session (recommended)

This option discovers Vivaldi automatically. You do not need to choose a port,
pass `--cdp`, or launch Vivaldi with special flags.

1. Open `vivaldi://inspect/#remote-debugging` in the Vivaldi session you want to use.
2. Enable **Allow remote debugging for this browser instance**.
3. Run the connection check from your terminal:

   ```sh
   browser-tabs doctor
   ```

4. If Vivaldi asks for remote-debugging permission, choose **Allow**. Keep the
   browser visible while connecting. The CLI waits up to 60 seconds for this
   approval; if it times out, run the command again and accept the prompt.
5. Check that the JSON response has `ok: true`, `data.connected: true`, and lists
   the intended window. You can now open and organize tabs without a port:

   ```sh
   browser-tabs tab open https://codely.com/courses --name "Codely Courses"
   browser-tabs batch open tab-batch-schema/example.json --verify-after-seconds 30
   ```

With one window open, it is selected automatically. With several windows, run
`browser-tabs windows` and append `--window ID` to the operation.

Automatic discovery reads `DevToolsActivePort` from Vivaldi's user data directory.
The checkbox connection was validated in an existing Vivaldi 8.2.4133.80 session
on macOS without startup flags or an explicit port. See [validation details](validation.md).
Check the setting again if discovery stops working after restarting Vivaldi.

## Option 2: Select a different user data directory

Use this if the session was started with a custom user data directory. Enable
its debugging checkbox as above, then point the CLI to the directory that
contains `DevToolsActivePort`, not its `Default` or `Profile 1` subdirectory:

```sh
export BROWSER_TABS_VIVALDI_DATA_DIR="/absolute/path/to/vivaldi-user-data"
browser-tabs doctor
browser-tabs tab list
```

To return to the default Vivaldi data directory:

```sh
unset BROWSER_TABS_VIVALDI_DATA_DIR
```

## Option 3: Use an existing debugging endpoint

If Vivaldi already exposes a known local CDP endpoint, you can select it directly.
CDP means **Chrome DevTools Protocol**, the protocol the CLI uses to communicate
with the browser.

```sh
browser-tabs --cdp 9222 doctor
```

You can also set the endpoint once for the current terminal:

```sh
export BROWSER_TABS_CDP=9222
browser-tabs doctor
browser-tabs tab list
```

`--cdp` and `BROWSER_TABS_CDP` accept a port, a loopback HTTP endpoint, or the
browser's loopback WebSocket endpoint. They take precedence over data-directory
discovery. To return to automatic discovery:

```sh
unset BROWSER_TABS_CDP
```

If the connection fails, check which session and endpoint you selected. A
successful `doctor` response confirms access to Vivaldi's native tab APIs, not
just an open debugging port. If it reports that the privileged UI is unavailable,
try the checkbox method in the intended session. The CLI does not restart the
browser or change its settings. Keep debugging access local and disable it when
no longer needed.

# How to develop the Vivaldi adapter

This section is for contributors implementing or testing the adapter. It is not
required for normal use, and there is no browser extension to install or develop.

## Run automated checks

```sh
pnpm install --frozen-lockfile
pnpm check
```

These checks use fake native APIs and a local CDP fixture. They do not open a
real browser.

## Start an isolated test session on macOS

Use a temporary user data directory to test native operations in an empty browser
session:

```sh
export BROWSER_TABS_VIVALDI_DATA_DIR="$(mktemp -d -t browser-tabs-test)"
unset BROWSER_TABS_CDP
/Applications/Vivaldi.app/Contents/MacOS/Vivaldi \
  --user-data-dir="$BROWSER_TABS_VIVALDI_DATA_DIR" \
  --remote-debugging-port=0 \
  --remote-debugging-address=127.0.0.1 \
  --debug-packed-apps \
  --no-first-run \
  --no-default-browser-check \
  about:blank &
```

Wait for the window and complete or dismiss onboarding. Then run:

```sh
pnpm build
browser-tabs doctor
pnpm smoke:vivaldi
```

The smoke test creates eight local pages in four colored stacks, checks a retry
and unit operations, closes only its own tabs, and compares the original
inventory after cleanup. With multiple windows, pass the intended window ID:

```sh
pnpm smoke:vivaldi 123
```

To explicitly test automatic discovery in an already prepared session, use
`BROWSER_TABS_CDP=auto pnpm smoke:vivaldi`. This opts into real browser changes
without specifying a port. Prefer an isolated session for routine development.

Close only the test window when finished, then run
`unset BROWSER_TABS_VIVALDI_DATA_DIR`. The temporary directory remains available
for inspection and can be removed afterwards.

Launching an already running profile with extra flags may forward to its existing
process without applying those flags. Do not restart a user's session as a
routine test step. Recheck the adapter after Vivaldi updates because its native
APIs are private.

## Native API mapping

The adapter locates the bundled UI at
`chrome-extension://mpognobbkildjkofajifpdfhcoklimli/`. It probes each matching
target because some duplicate targets do not support runtime evaluation.

| Operation         | Native implementation                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| List windows/tabs | `chrome.windows.getAll`, `chrome.tabs.query`                                 |
| Open              | `chrome.tabs.create`, preserving the active workspace                        |
| Visible tab name  | `chrome.tabs.update` with a `vivExtData.fixedTitle` patch                    |
| Create stack      | `vivaldi.tabsPrivate.move` with `create-new-group`                           |
| Stack name/color  | `vivaldi.tabsPrivate.setGroupProperties`                                     |
| Move into stack   | `vivaldi.tabsPrivate.move`, targeting a member with `below` and `strip-down` |
| Close             | `chrome.tabs.remove`                                                         |

Native colors `color1` through `color9` map to grey, blue, red, yellow, green,
pink, purple, teal, and orange. Batch metadata keys are `browserTabsBatchId`,
`browserTabsKey`, and `browserTabsSourceUrl`.

A locked second tab level can cause new tabs to inherit an active stack even
when creation metadata requests an empty group. The adapter creates with
`invokedBy: "mainStrip"`, reads back the result, and detaches only the newly
created tab with `untile` and `ungroup` if necessary. It verifies placement and
ownership before continuing. Existing stack members are not selected or detached.

Vivaldi limits custom tab names to 50 UTF-16 code units. Stacks require at least
two unpinned tabs. API mappings are private and require version-specific testing.
