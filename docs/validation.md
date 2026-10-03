# Validation of browser-tabs-cli 0.1.0

Date: 2026-10-03. macOS, Node.js 24.18.0, Vivaldi 8.2.4133.80.

## Automated checks

Strict TypeScript compilation, both runtime builds, 35 automated tests, and
Prettier checks pass. Tests cover schema validation, command parsing, window
selection, partial-failure recovery, ownership conflicts, exact group membership,
load deadlines, native adapter mappings, and the built runtime over a loopback
CDP WebSocket fixture. No real browser is required for the automated suite.

## Real Vivaldi

The rewritten CLI was tested against the installed browser in an empty temporary
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

## Remaining boundary

The user's personal Vivaldi profile was not reconfigured. Connecting to that
existing session through its remote-debugging checkbox remains unverified.
A successful test-profile connection does not establish that the personal session
is ready. Run `doctor` against the intended profile after configuring debugging.
Private APIs may change with Vivaldi updates; rerun a disposable-profile smoke test.
