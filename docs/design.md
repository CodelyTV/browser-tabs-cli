# Design decisions

## A small CLI for native tab organization

The input is an explicit set of URLs, names, and groups. The output is that state
in an existing visible browser window. The tool does not decide which sources to
read or how to classify them. It does not automate page content, take screenshots,
or launch a browser engine. Those responsibilities belong to other tools.

This repository starts with its own code organization and Git history. It is not
a fork, runtime wrapper, or migration layer for AIPex browser-cli. The public
entry point is `browser-tabs-cli`, and browser metadata uses its own namespace.
It does not adopt tabs tagged by an older tool automatically.

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

| Alternative                       | Assessment                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent-browser                     | Can connect to a user's existing browser through CDP and supports batching. Its documented tab handles and labels do not establish native Vivaldi names, stacks, or colors. An adapter would still be required. |
| Chrome DevTools MCP               | Provides browser inspection and automation and also has a CLI. Its documented support is Chrome and Chrome for Testing. Native Vivaldi stacks would extend its browser-specific scope.                          |
| AIPex browser-cli                 | Uses an installed extension and local daemon for broader page automation. Adopting that bridge adds setup without removing the Vivaldi native mapping.                                                          |
| Vivaldi AppleScript               | Useful for opening or navigating tabs on macOS; the installed scripting dictionary exposes read-only titles and no stack operations.                                                                            |
| Accessibility automation          | Works in the user's existing UI, but state reads, selection, menus and focus make repeated naming/grouping slower and more fragile. Useful as a fallback or for visual inspection.                              |
| Direct CDP plus a Vivaldi adapter | Chosen: a narrow connection with native operations, one batch execution and explicit verification. Requires a reachable privileged UI and maintenance of private APIs.                                          |

### Why not a PR to agent-browser?

A contribution is technically possible. It would need a generic native tab/group
contract, browser capability handling, Vivaldi discovery, and tests for private
APIs. Existing-browser attachment is already supported, so claiming the tool
always launches a separate Chrome instance would be incorrect. Its
[CDP documentation](https://agent-browser.dev/cdp-mode) explicitly describes
connecting to a running browser. See also its
[tab commands and batch support](https://github.com/vercel-labs/agent-browser).

The decision here is to validate a narrowly scoped adapter independently.
Upstream maintainers have not been asked to accept or reject it. The isolated
contract and tests can support a later upstream proposal without forcing a
page-automation dependency on people who only want tab organization.

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
is not a capability of ordinary website JavaScript. AIPex now includes the CLI
in [its main project](https://github.com/AIPexStudio/AIPex).

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
