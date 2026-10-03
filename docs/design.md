# Design decisions

## A small CLI for native tab organization

The input is an explicit set of URLs, names, and groups. The output is that state
in an existing visible browser window. The tool does not decide which sources to
read or how to classify them. It does not automate page content, take screenshots,
or launch a browser engine. Those responsibilities belong to other tools.

The public entry point is `browser-tabs`. Browser metadata identifies the tabs
owned by each batch, so retries reuse only those tabs.

## Architecture and dependencies

A small `Browser` interface expresses the actual operations needed. Application
services implement window selection, deterministic batch application and
verification against that interface. The CLI produces a discriminated command
union rather than sending arbitrary JavaScript from command-line input.

The Vivaldi adapter connects through CDP and evaluates a bundled application
runtime in the browser's privileged UI. The whole batch runs there, minimizing
process and protocol overhead while keeping dependent operations ordered. CDP
is only the transport; standard CDP does not define Vivaldi custom tab names,
stack colors, or locked second-level behavior.

JSON Schema is the runtime source of format validation, via Ajv. Small semantic
checks handle uniqueness and references that are awkward in schema alone.
Browser limits remain in the adapter. TypeScript runs in strict mode, and esbuild
produces two bundles. There is no framework, daemon, dependency-injection
container, generic plugin loader, or abstract base class without an actual use.

## Alternatives

Reviewed on **2026-10-03** using official documentation, public repository source,
and GitHub's API. PR counts and inactivity periods below are a dated snapshot,
not permanent properties of the projects. These alternatives were reviewed from
source; they were not benchmarked or validated live against Vivaldi in this review.

| Alternative                       | Assessment                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| agent-browser                     | Supports existing-browser CDP attachment and batching. Native Vivaldi names, stacks, colors and a validated tab-plan import would still need integration. Its large, aging PR queue also makes timely upstream acceptance uncertain. |
| Chrome DevTools MCP               | Supports Chrome inspection and automation through MCP and a CLI. Native Vivaldi stacks would extend its browser-specific support scope.                                                                                              |
| AIPex browser-cli / AIPex         | The standalone CLI has moved into AIPex. The extension plus daemon architecture is more infrastructure than this task needs; the main project also has months-old open PRs.                                                          |
| Browser Use CLI                   | Can attach to an existing browser through CDP and run several actions in one Python invocation. Its current browser-control entry point delegates to Browser Harness, including the daemon.                                          |
| Browser Harness                   | A technically viable CDP foundation for custom helpers, but its CLI starts or reuses a daemon and does not provide the complete native Vivaldi tab-plan contract.                                                                    |
| browsemake/browser-cli            | Uses a daemon and launches a separate Playwright Chromium profile. Its current implementation does not attach to the user's running Vivaldi.                                                                                         |
| Vivaldi AppleScript               | Opens and navigates tabs on macOS; the installed scripting dictionary exposes read-only titles and no stack operations.                                                                                                              |
| Accessibility automation          | Can operate the existing UI, but repeated selection, menus and focus changes make naming and grouping slower and more fragile. Useful for fallback and visual inspection.                                                            |
| Direct CDP plus a Vivaldi adapter | Chosen: a narrow connection with native operations, one batch execution and explicit verification. Requires access to Vivaldi's privileged UI and maintenance of private APIs.                                                       |

### Why not a PR to agent-browser?

A contribution is technically possible. The project's
[CDP mode](https://agent-browser.dev/cdp-mode) can attach to an existing browser,
and it already supports batching. The proposed contribution would go further:
a Vivaldi-specific adapter, a JSON Schema for tab imports, native visible tab
names, stack colors, and verification of exact membership and preserved tabs.
Those capabilities introduce browser-specific behavior and maintenance beyond
ordinary page automation.

At review time, GitHub's API reported **421 open PRs**, corresponding to
**17 pages** at 25 PRs per page. The
[open PR queue](https://github.com/vercel-labs/agent-browser/pulls) includes
[#96](https://github.com/vercel-labs/agent-browser/pull/96), opened on
2026-01-14 and still open, so some contributions have been waiting for months.
Given that backlog and the scope of this proposed integration, we judge the
chance of a timely merge too low to make delivery depend on an upstream PR.
This is our planning assessment, not a measured acceptance probability or a
rejection from the maintainers. A backlog does not by itself mean the project
is unmaintained.

### Why not a PR to AIPexStudio/browser-cli or AIPex?

The standalone repository's
[latest default-branch commit](https://github.com/AIPexStudio/browser-cli/commit/a116f74e5be6f15d4b5bd7dc0ea54359b95cd2a5)
is dated **2026-03-30**, just over six months before this review. It is not
formally archived, but it has had no newer default-branch commits during that
period. AIPex's own
[terminal CLI documentation](https://github.com/AIPexStudio/AIPex#use-from-the-terminal-browser-cli)
confirms that `browser-cli` was merged into the main project. That makes the
standalone repository a poor target for a new integration PR.

The current AIPex architecture still uses a local WebSocket daemon and an
installed browser extension. It can control an existing browser, but this setup
is more complex than needed for a short-lived native tab-management command.
The main project's [PR queue](https://github.com/AIPexStudio/AIPex/pulls) also
contained nine open PRs, including
[#217](https://github.com/AIPexStudio/AIPex/pull/217) from **2026-04-13**, nearly
six months earlier. That example is a dependency-update PR; its age is evidence
of pending work, not proof that every feature PR would wait as long. Together,
the setup cost and uncertain integration lead time make a separate small tool
more practical for this requirement.

### Could Browser Use CLI or Browser Harness do this?

**Yes, they could provide the connection and execution foundation.**
[Browser Use CLI](https://docs.browser-use.com/open-source/browser-use-cli)
explicitly supports a running local browser or an existing CDP endpoint through
`BU_CDP_URL` / `BU_CDP_WS`. A single Python invocation can open several tabs, so
neither a separate browser nor one tool call per tab is an inherent limitation.

They are also closely related alternatives: the reviewed
[Browser Use CLI entry point](https://github.com/browser-use/browser-use/blob/7be96ed8bafa8dfe1eef228b59cf5c884b8b2431/browser_use/cli.py#L185-L201)
delegates browser control to Browser Harness. The
[Harness CLI implementation](https://github.com/browser-use/browser-harness/blob/afbcc381b963040c19627d788e40c7e7663171ee/src/browser_harness/run.py#L388-L409)
starts or reuses a daemon before executing browser actions. Automatic startup
reduces manual setup, but a background daemon still exists. The documented local
CDP path does not require an extra browser extension.

Harness is designed to grow custom Python helpers and is the closest foundation
among these three additional suggestions. Its
[tab helper guide](https://github.com/browser-use/browser-harness/blob/afbcc381b963040c19627d788e40c7e7663171ee/interaction-skills/tabs.md)
covers opening, listing, attaching and activating tabs; it directs user-visible
ordering to platform UI automation. It does not document our complete native
Vivaldi contract. We would still need to build the privileged-UI adapter,
visible-name and stack-color operations, JSON Schema validation, ownership-based
retry handling, and preservation checks. A Python wrapper could import a plan in
one invocation, but it would be custom functionality we maintain on top of the
Harness runtime. For this narrow task and the requirement to avoid a daemon,
that does not simplify the current implementation.

### Why not browsemake/browser-cli?

The project's [README](https://github.com/browsemake/browser-cli) describes a
persistent daemon for general page automation. More decisively, its reviewed
[daemon implementation](https://github.com/browsemake/browser-cli/blob/bd5267e4f983a53a6c658b4569fc62994831aba8/daemon.js#L18-L26)
calls Playwright's `chromium.launchPersistentContext` with a separate
`br_user_data` directory under the system temporary directory. The source uses
`headless: false`, despite the README describing a headless browser. Either way,
it launches its own browser context instead of attaching to the existing
Vivaldi session.

Using it here would therefore require changing the connection model as well as
adding native Vivaldi naming, grouping, colors, and plan verification. It is a
weaker starting point for this requirement than the existing-browser CDP tools.

### Why not Chrome DevTools MCP?

MCP does not force one call per tab: a batch operation could do the same work.
The difference is product scope and browser support, not the protocol's latency.
The project's [documentation](https://github.com/ChromeDevTools/chrome-devtools-mcp)
focuses on Chrome and Chrome for Testing. Native Vivaldi stacks need an additional
integration regardless of whether its entry point is MCP or a terminal command.

### Why no extra extension?

The original [AIPex browser-cli architecture](https://github.com/AIPexStudio/browser-cli#architecture)
uses an installed extension as its browser bridge. This implementation reaches
Vivaldi's own internal UI extension over CDP and uses the native APIs available
there. Nothing is installed into Vivaldi. This requires debugging access; it
is not a capability of ordinary website JavaScript.

### We would prefer to retire this tool when an upstream fits

We would gladly switch to any of these projects and stop maintaining
`browser-tabs-cli` if it supports the required operations in the user's existing
browser with minimal setup, **without an installed extension or a background
daemon**. That includes native visible names, stacks and colors, JSON-based batch
imports, safe retries, and verification that existing tabs are preserved.
Maintaining another browser tool is not a goal in itself. These are the current
reasons for a small independent implementation, and we will reconsider them when
upstream capabilities or setup requirements change.

## Batch guarantees and limits

Input format, semantic references, window ambiguity and adapter limits are
checked before opening tabs. New tabs carry a batch ID, stable key and source URL.
Retries reuse only that ownership namespace. They do not take over a personal tab
merely because its URL matches. A conflicting source URL, duplicate ownership or
foreign stack member causes a failure.

Operations are not transactional. If a browser API or connection fails, completed
changes remain and an unchanged plan can be retried after inspection. Concurrent
runs of the same batch are unsupported: two writers could both observe a missing
tab. Apply a batch from one process at a time.

Verification checks names, exact stack membership, colors and loading state.
The saved source URL identifies intended navigation while allowing redirects;
it is not proof that the current page still contains the intended content.
Preservation checks compare the IDs, URLs, custom names, groups, pinning and
ownership of pre-existing unrelated tabs. User changes during a run can therefore
cause verification to fail. Existing order may shift as new tabs are inserted.

The CLI reads `DevToolsActivePort` for discovery but never edits profile files or
restarts a browser. It accepts only local endpoints and only evaluates its runtime
in the known Vivaldi UI origin. If privileged APIs are unavailable it stops;
it never falls back to injecting management code into a website.

## Compatibility

Vivaldi's internal APIs are not a public stability promise. Keep their mapping in
one adapter, probe capabilities on connection, read back every important mutation,
and repeat a small disposable-profile test after browser upgrades. A working CDP
socket alone does not prove that the required native APIs are available.

See [vivaldi.md](vivaldi.md) for setup and [validation.md](validation.md) for the
new implementation's live validation. Results from an earlier prototype are not
benchmarks for this project.
