# Validation of browser-tabs-cli 0.1.0

Date: 2026-10-03. macOS, Node.js 24.18.0, Vivaldi 8.2.4133.80.

## Automated checks

Strict TypeScript compilation, both runtime builds, 35 automated tests, and
Oxlint and Oxfmt checks pass. Tests cover schema validation, command parsing, window
selection, partial-failure recovery, ownership conflicts, exact group membership,
load deadlines, native adapter mappings, and the built runtime over a loopback
CDP WebSocket fixture. No real browser is required for the automated suite.

## Real Vivaldi

The CLI was tested against the installed browser in an empty temporary
profile with loopback debugging and `--debug-packed-apps`. Native preference reads
confirmed vertical tabs and a locked second level. A pre-existing test stack was
made active before the final smoke test.

| Scenario                                                     | Apply  | Identical replay | Result                                      |
| ------------------------------------------------------------ | ------ | ---------------- | ------------------------------------------- |
| 8 local pages in 4 stacks                                    | 439 ms | 27 ms            | All checks passed                           |
| Same batch size with an active stack and locked second level | 472 ms | 25 ms            | All checks passed; original stack preserved |

Times are the CLI's `elapsedMs`, measured after Node loads the CLI dependencies.
They include connection, native operations, verification and local page loading;
they exclude process startup, input preparation and external website latency.
These are two smoke measurements, not a statistical performance comparison.

The smoke test also exercised individual tab opening/renaming/closing, group
creation/renaming/color changes, moving a tab from another group, listings, and
rejection of a retry after a foreign member was added. Each replay created zero
tabs. Cleanup removed only test-owned tabs and compared the original inventory.
Group state and layout settings were read through native APIs. This run did not
perform a screenshot-based visual assessment.

## Findings incorporated into the implementation

The live test caught movement at the outer boundary of a destination stack:
Vivaldi could return success while the selected tab retained its old group or
became ungrouped. The adapter now inserts after the first member inside the
destination stack, uses its native extension ID, and verifies the resulting
membership. A regression test covers preserving unselected source members.

New-tab placement can follow Vivaldi preferences even when an explicit index is
requested. The adapter reads back placement and explicitly moves a newly created
tab to the end, ungrouping only that tab when necessary. Existing tabs are not
selected during this operation.

The first smoke fixture also exposed idle browser preconnections preventing its
HTTP server from shutting down. Fixture cleanup now destroys its own sockets.

## Existing-session checkbox connection

The normal running Vivaldi 8.2.4133.80 session was also tested with **Allow remote
debugging for this browser instance** enabled at
`vivaldi://inspect/#remote-debugging`. Its process had no debugging startup flags.

`browser-tabs doctor` succeeded with both connection environment variables unset
and without `--cdp`. Vivaldi requested permission on the first connection;
after approval, automatic discovery found the existing window and native APIs.

The same smoke test then passed with `BROWSER_TABS_CDP=auto` and no custom data
directory: eight local pages in four stacks, **1,448 ms** to apply and **977 ms**
for an identical replay. Unit opening, naming, grouping, group renaming, colors,
and movement passed. Cleanup removed only test-created tabs and confirmed that
the original inventory was unchanged. The browser was not restarted or set as
default by the test.

These timings are individual local-page measurements and are not a benchmark of
external website loading. Visual appearance was not assessed by screenshots.
Private APIs may change with Vivaldi updates; rerun an isolated-session smoke test.
