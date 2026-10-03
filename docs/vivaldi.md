# Vivaldi connection and adapter

## Connect to the intended window

The CLI needs a local CDP endpoint that exposes Vivaldi's privileged UI. It reads
`DevToolsActivePort` from the default Vivaldi data directory, or from
`BROWSER_TABS_VIVALDI_DATA_DIR`. You can instead set `BROWSER_TABS_CDP` or pass
`--cdp 9222` / a loopback WebSocket URL.

```sh
browser-tabs-cli doctor
browser-tabs-cli --cdp 9222 doctor
```

The tested Vivaldi build exposes **Allow remote debugging for this browser
instance** at `vivaldi://inspect/#remote-debugging`. Enabling that setting in the
user's existing personal session has not been validated with this tool. If you
choose to enable it, run `doctor` and accept any browser permission prompt.
Success means the CLI found the privileged API and lists the intended windows.
A reachable debugging port without that probe is insufficient.

If `doctor` reports that the privileged UI is unavailable, stop and inspect the
setup. The CLI does not silently switch profiles, restart Vivaldi, or enable
settings. Keep debugging access local and disable it when no longer needed.

## Disposable development instance on macOS

The following explicitly launches a separate empty test profile. It does not
connect to the tabs in your everyday session. This setup is for development and
compatibility tests, not a substitute for configuring the intended session.

```sh
export BROWSER_TABS_VIVALDI_DATA_DIR="$(mktemp -d -t browser-tabs-test)"
/Applications/Vivaldi.app/Contents/MacOS/Vivaldi \
  --user-data-dir="$BROWSER_TABS_VIVALDI_DATA_DIR" \
  --remote-debugging-port=0 \
  --remote-debugging-address=127.0.0.1 \
  --debug-packed-apps \
  --no-first-run \
  --no-default-browser-check \
  about:blank &
```

Wait for the window, then run:

```sh
browser-tabs-cli doctor
pnpm smoke:vivaldi
```

Complete or dismiss onboarding to inspect native stacks visually. Close only the
test window when done and run `unset BROWSER_TABS_VIVALDI_DATA_DIR`. The temporary
directory is retained for inspection and can be removed afterwards.

Launching an already running profile with extra flags may simply forward to its
existing process. The tool does not claim that flags enable debugging without a
restart in such a session. Do not restart a user's browser as a routine batch step.

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
