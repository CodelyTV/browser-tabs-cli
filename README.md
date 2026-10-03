<p align="center">
  <a href="https://codely.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://codely.com/logo/codely_logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://codely.com/logo/codely_logo-light.svg">
      <img alt="Codely logo" src="https://codely.com/logo/codely_logo.svg">
    </picture>
  </a>
</p>

<h1 align="center">browser-tabs-cli</h1>

<p align="center">
  <a href="https://github.com/CodelyTV"><img alt="Codely OS" src="https://img.shields.io/badge/Codely-OS-green?style=flat-square"></a>
  <a href="https://codely.com/cafe"><img alt="Codely Cafe News" src="https://img.shields.io/badge/Codely-Cafe_News-%235A3E2B?style=flat-square"></a>
  <a href="https://codely.com/newsletter"><img alt="Codely Newsletter" src="https://img.shields.io/badge/Codely-Newsletter-%23D3D3D3?style=flat-square"></a>
  <a href="https://youtube.com/codelytv"><img alt="Codely YouTube" src="https://img.shields.io/badge/Codely-YouTube-red?style=flat-square"></a>
  <a href="https://codely.com/courses"><img alt="Codely Courses" src="https://img.shields.io/badge/Codely-Courses-black?style=flat-square"></a>
  <a href="https://github.com/CodelyTV/browser-tabs-cli/actions/workflows/ci.yml"><img alt="Build Status" src="https://img.shields.io/github/actions/workflow/status/codelytv/browser-tabs-cli/ci.yml?branch=main&amp;style=flat-square"></a>
  <a href="https://github.com/CodelyTV/browser-tabs-cli/stargazers"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/codelytv/browser-tabs-cli"></a>
</p>

Open, name, and organize tabs in the browser window you already use. Import a
JSON file to create native groups, set their colors, wait for pages to load, and
verify the result with one command. The project and package are named
`browser-tabs-cli`; the terminal command is `browser-tabs`.

Vivaldi is the first adapter. The CLI connects to an already running browser;
it never launches a browser or replaces your profile. It preserves existing tabs
when applying a batch.

## Getting started

1. Install **Node.js 24.x**, Git, Vivaldi, and
   [pnpm](https://pnpm.io/installation). This project pins **pnpm 12.4.1**.
   Clone it using your configured GitHub SSH key:

   ```sh
   git clone git@github.com:CodelyTV/browser-tabs-cli.git
   cd browser-tabs-cli
   ```

2. Install the dependencies, build, and make the command available in your terminal:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   pnpm add -g .
   browser-tabs --help
   ```

   If pnpm reports a missing global binary directory, run `pnpm setup`, restart
   your terminal and retry `pnpm add -g .`. Alternatively, use `node dist/main.js`
   instead of `browser-tabs`. After pulling updates, run `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm add -g .` again
   to refresh the installed command.

3. Connect the browser once. **CDP** means **Chrome DevTools Protocol**: a debugging
   protocol that lets local tools communicate with Chromium-based browsers.
   This CLI uses it to reach Vivaldi's own browser interface and its native tab APIs.
   A website's JavaScript context cannot manage Vivaldi stacks.

   Open `vivaldi://inspect/#remote-debugging` in Vivaldi and enable
   **Allow remote debugging for this browser instance**. Run the connection check
   and accept Vivaldi's permission prompt:

   ```sh
   browser-tabs doctor
   ```

   The CLI discovers the connection automatically, so no port is needed.
   Vivaldi does not need to be your default browser. See the
   [Vivaldi setup guide](docs/vivaldi.md) for other connection options and
   troubleshooting.

4. Open and organize tabs. With one browser window open, its ID is selected
   automatically. With several windows, run `browser-tabs windows` and add
   `--window ID` to the operation. The CLI fails before modifying anything if the
   destination is ambiguous.

   ```sh
   browser-tabs tab open https://codely.com/ --name "Codely home"
   browser-tabs group open "Codely learning" https://codely.com/ https://codely.com/courses --color yellow
   browser-tabs tab list
   browser-tabs group list
   ```

   Listings return the IDs needed for subsequent commands. For example, replace
   `123` with a returned tab ID:

   ```sh
   browser-tabs tab rename 123 "Codely courses"
   ```

5. Import the included example. This creates 17 named tabs in three colored
   native stacks and verifies them in the same command:

   ```sh
   browser-tabs batch apply tab-batch-schema/example.json --wait 60
   ```

   Keep the JSON response. `data.verified` confirms names, exact group membership,
   colors, and ownership; `data.ready` also requires every page to have finished
   loading. `data.windowId` identifies the selected window. Add it to the saved
   JSON before resuming later so that the destination remains fixed.

## Open tabs in batch

The authoritative format is [tab-batch-schema/schema.json](tab-batch-schema/schema.json).
The CLI validates against that same schema, then checks key uniqueness and group
references. [tab-batch-schema/example.json](tab-batch-schema/example.json) is a complete,
ready-to-run example. Private GitHub schema URLs require authentication;
editors can use the local schema path instead.

`windowId` is optional. A tab without `groupKey` remains at the top level. `name`
and group `color` are optional. Vivaldi requires at least two unpinned tabs per
stack and limits tab names to 50 UTF-16 code units. Tabs open in the active
workspace, in input order; grouping makes their members consecutive.

Use a distinct `batchId` for each independent import. Keep the same ID and tab
keys when retrying: only tabs tagged by this tool are reused. An existing personal
tab with the same URL is never adopted. Do not change URLs under existing keys;
use a new batch ID for a new selection. A failed operation can leave partial work,
which a retry of the original plan can complete. Batches are not transactions.

```sh
browser-tabs batch validate tab-batch-schema/example.json
browser-tabs batch apply tab-batch-schema/example.json --wait 60
browser-tabs batch verify tab-batch-schema/example.json --wait 60
browser-tabs batch close codely-example
```

`validate` is entirely local. `apply` already verifies; call `verify` only to check
later or wait again for unfinished pages. `close` explicitly closes only tabs
owned by that batch. Review their contents first if you have since used them for
other work.

The CLI preserves URLs exactly. URL cleanup, deduplication, source selection,
short-name policies, and decisions about which tabs belong together belong to
the caller or Skill. No Slack or weekly-news rules are built into the program.

## All commands

Run each command below as `browser-tabs <command>`, for example `browser-tabs tab list`.
Square brackets mean optional arguments; do not type the brackets. All IDs come
from the JSON returned by `windows`, `tab list`, or `group list`.

| Command                                                                               | Operation                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `doctor`                                                                              | Probe native browser access and list windows without changing tabs         |
| `windows`                                                                             | List all open windows                                                      |
| `tab list [--window ID]`                                                              | List URLs, page titles, custom names, loading state, groups, and ownership |
| `tab open URL [--name NAME] [--window ID]`                                            | Open a background tab at the top level                                     |
| `tab rename ID NAME [--window ID]`                                                    | Set a visible native tab name                                              |
| `tab close --tabs ID,ID [--window ID]`                                                | Close exactly the selected tabs                                            |
| `group list [--window ID]`                                                            | List native groups and their tab IDs                                       |
| `group open TITLE URL... [--color COLOR] [--batch ID] [--wait SECONDS] [--window ID]` | Open URLs as a new stack, wait, and verify                                 |
| `group create TITLE --tabs ID,ID [--color COLOR] [--window ID]`                       | Stack selected existing tabs                                               |
| `group rename ID TITLE [--window ID]`                                                 | Rename a stack                                                             |
| `group color ID COLOR [--window ID]`                                                  | Change a stack color                                                       |
| `group move ID --tabs ID,ID [--window ID]`                                            | Move selected tabs into the target stack                                   |
| `batch validate FILE`                                                                 | Validate an import without connecting to a browser                         |
| `batch apply FILE [--wait SECONDS] [--window ID]`                                     | Open all tabs, name, group, color, wait, and verify                        |
| `batch verify FILE [--wait SECONDS] [--window ID]`                                    | Read and verify an existing batch                                          |
| `batch close ID [--window ID]`                                                        | Close tabs tagged with the given batch ID                                  |

Colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `teal`, `orange`.
`group open` uses the batch engine; supply `--batch` for a predictable retry ID,
or keep the generated `data.batchId`. Individual mutation commands do not all
have batch-style retry semantics, so inspect state after an interrupted command.

Global options: `--help`, `--browser vivaldi`, `--cdp auto|PORT|URL`.
`BROWSER_TABS_CDP` supplies the default endpoint.
`BROWSER_TABS_VIVALDI_DATA_DIR` overrides the directory used for automatic
endpoint discovery. Only loopback HTTP and WebSocket endpoints are accepted.
`--window` cannot conflict with a JSON `windowId`.

`--wait` accepts 0 to 300 seconds. The defaults are 30 for `apply` and `group open`,
and 0 for `verify`. The CLI returns JSON with `ok`, `data`, and `elapsedMs`, or
`ok: false` and `error`. Exit codes:

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | Command succeeded; batch structure is verified and all pages finished loading |
| `1`  | Invalid input, connection/operation failure, or verification mismatch         |
| `2`  | Batch structure is verified, but pages are still loading                      |

A completed load can still display an HTTP error, login screen, or blocked page.
The CLI verifies browser state, not the editorial relevance or content of a page.

# Contributing

## Architecture

The TypeScript code separates a generic browser contract from Vivaldi's private
APIs. The application layer owns batch sequencing, retries, and verification;
it does not know how any browser stores groups.

| Directory              | Responsibility                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| `src/cli`              | Parse commands, validate input, format results and exit codes           |
| `src/domain`           | Typed commands, plans, browser contract, schema-backed validation       |
| `src/application`      | Resolve windows, execute commands, apply batches, verify preservation   |
| `src/adapters`         | Choose a browser and implement its native operations                    |
| `src/adapters/vivaldi` | Discover the privileged UI, map native tabs/stacks, execute the runtime |
| `src/transport`        | Loopback CDP connection, request timeouts and disconnect handling       |
| `tab-batch-schema`     | Versioned JSON import contract used directly by runtime validation      |
| `tests`                | Application, adapter, CLI, schema, and CDP integration tests            |

The build produces a Node.js CLI and a browser runtime. Each command attaches
once, probes the privileged UI, then evaluates the whole operation once. All
per-tab reads, writes, and final verification happen within that evaluation;
there is no separate CLI process or tool call per tab. Native calls remain
sequential where order matters. There is no daemon or extra browser extension.

## Add adapters for other browsers

1. Implement the `Browser` interface in `src/domain/browser.ts`. Return normalized
   tab/group state and declare browser limits. Implement visible native names
   and groups, or report an explicit unsupported-operation error.
2. Implement a `Connection` that accepts typed `Command` values. Reuse
   `execute` and `BatchService`; keep discovery, transport details, and native
   metadata mapping inside the adapter. An adapter can use a transport other
   than CDP without changing the CLI or import contract.
3. Register the adapter in `src/adapters/connect.ts`. Add only the capabilities
   the browser actually needs; there is no plugin system or speculative base class.
4. Test the same observable requirements: selecting the right window, preserving
   existing tabs, exact native group membership, visible names, colors, retries,
   and explicit failures. Add a disposable-profile integration test and document
   the tested browser version and connection method.

Do not emulate a visible tab name by changing `document.title`, or treat a CLI
label as a native tab name. Do not assume Chromium groups and Vivaldi stacks are
interchangeable.

## Design decisions and discarded alternatives

This tool focuses on opening and organizing native tabs in an existing browser
with a small, typed contract. Direct CDP access to Vivaldi's bundled privileged UI
avoids an additional extension or daemon. Browser-specific code stays in an
adapter; validation, batch application, retries and verification are reusable.
Existing tools can provide CDP transport, but the reviewed alternatives do not
supply this complete native Vivaldi tab-plan contract with the same minimal setup.
The tradeoff is maintaining private APIs, backed by capability probes and real
browser tests.

Upstream integration is possible, but delivery should not depend on a broad
Vivaldi PR clearing agent-browser's 17-page queue or AIPex's older pending PRs.
AIPex's standalone CLI has moved into its main project, which uses an extension
and daemon. Browser Use CLI delegates to Browser Harness; both can attach to an
existing browser, but the current CLI path uses a daemon. browsemake's CLI launches
its own Chromium profile. We would gladly switch to an upstream project and stop
maintaining `browser-tabs-cli` once it covers these features without requiring
extensions or background daemons. See [design.md](docs/design.md) for the dated
evidence, technical comparisons and the distinction between facts and our
assessment of integration risk.

## Development and tests

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev --help
```

`check` runs Oxlint, strict TypeScript checks, builds both runtimes, runs the
tests, and checks formatting with Oxfmt. Oxlint warnings fail the check.
Use pnpm for installs and scripts; `pnpm-lock.yaml` is the
only dependency lockfile. `pnpm-workspace.yaml` defines dependency installation
policies, including a seven-day minimum release age and explicit build permission
for esbuild. Tests use Node's built-in runner, fake native APIs, and a local
CDP WebSocket server that executes the actual built runtime. They need no installed
browser and perform no external navigation. CI runs only on Node 24.
The Node requirement is enforced during installation;
`nvm use` selects the version from `.nvmrc`.

```sh
pnpm lint       # Check JavaScript and TypeScript with Oxlint
pnpm lint:fix   # Apply automatic lint fixes
pnpm format     # Format supported files with Oxfmt
pnpm format:check
pnpm build
BROWSER_TABS_CDP=9222 pnpm smoke:vivaldi
```

The opt-in smoke test uses an already configured Vivaldi instance, creates eight
local pages in four colored stacks, replays the batch, exercises unit commands,
and cleans up only its own tabs. It checks the original inventory after cleanup.
With several windows, use `pnpm smoke:vivaldi 123`. Prefer a disposable
profile for adapter development; see [the Vivaldi guide](docs/vivaldi.md).

## Dependency updates

Dependabot checks pnpm packages and GitHub Actions on Mondays at 06:00
Europe/Madrid. It allows up to five open PRs per ecosystem, with a seven-day
cooldown and a 30-day cooldown for major package updates. Minor and
patch package updates are grouped separately for production and development;
major updates stay separate. GitHub Actions updates share one group. Major
`@types/node` updates are ignored until the supported Node version changes.
Dependabot calls the pnpm ecosystem `npm`; it updates `pnpm-lock.yaml`.
