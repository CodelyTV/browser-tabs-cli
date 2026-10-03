# browser-tabs-cli

Open, name, and organize tabs in the browser window you already use. Import a
JSON file to create native groups, set their colors, wait for pages to load, and
verify the result with one command.

Vivaldi is the first adapter. The CLI connects to an already running browser;
it never launches a browser or replaces your profile. It preserves existing tabs
when applying a batch. This is a new, independent TypeScript project.

## Getting started

1. Install **Node.js 22 or later**, Git, and Vivaldi. You need access to this
   private GitHub repository. Clone it using your configured GitHub SSH key:

   ```sh
   git clone git@github.com:CodelyTV/browser-tabs-cli.git
   cd browser-tabs-cli
   ```

2. Install the dependencies, build, and make the command available in your terminal:

   ```sh
   npm ci
   npm run build
   npm link
   browser-tabs-cli --help
   ```

   Alternatively, use `node dist/main.js` instead of `browser-tabs-cli`. After
   pulling updates, run `npm ci` and `npm run build` again.

3. Connect the browser once. **CDP** means **Chrome DevTools Protocol**: a debugging
   protocol that lets local tools communicate with Chromium-based browsers.
   This CLI uses it to reach Vivaldi's own browser interface and its native tab APIs.
   A website's JavaScript context cannot manage Vivaldi stacks.

   Your Vivaldi instance must expose a local debugging endpoint and its privileged
   UI. See [Vivaldi connection setup](docs/vivaldi.md) for the tested setup and the
   limitation of enabling debugging in an existing personal session. This is a
   prerequisite, not something `npm link` configures.

   ```sh
   browser-tabs-cli doctor
   ```

   Automatic discovery reads Vivaldi's `DevToolsActivePort` file. If you already
   know the port, specify it explicitly:

   ```sh
   browser-tabs-cli --cdp 9222 doctor
   export BROWSER_TABS_CDP=9222
   ```

4. Open and organize tabs. With one browser window open, its ID is selected
   automatically. With several windows, run `browser-tabs-cli windows` and add
   `--window ID` to the operation. The CLI fails before modifying anything if the
   destination is ambiguous.

   ```sh
   browser-tabs-cli tab open https://codely.com/ --name "Codely home"
   browser-tabs-cli group open "Codely learning" https://codely.com/ https://codely.com/en/courses --color yellow
   browser-tabs-cli tab list
   browser-tabs-cli group list
   ```

   Listings return the IDs needed for subsequent commands. For example, replace
   `123` with a returned tab ID:

   ```sh
   browser-tabs-cli tab rename 123 "Codely courses"
   ```

5. Import the included example. This creates four named tabs in two colored
   native stacks and verifies them in the same command:

   ```sh
   browser-tabs-cli batch apply examples/codely-tabs.json --wait 60
   ```

   Keep the JSON response. `data.verified` confirms names, exact group membership,
   colors, and ownership; `data.ready` also requires every page to have finished
   loading. `data.windowId` identifies the selected window. Add it to the saved
   JSON before resuming later so that the destination remains fixed.

## JSON import

The authoritative format is [schemas/tab-batch.schema.json](schemas/tab-batch.schema.json).
The CLI validates against that same schema, then checks key uniqueness and group
references. [examples/codely-tabs.json](examples/codely-tabs.json) is a complete,
ready-to-run Codely example. Private GitHub schema URLs require authentication;
editors can use the local schema path instead.

```json
{
  "$schema": "../schemas/tab-batch.schema.json",
  "version": 1,
  "batchId": "codely-example",
  "tabs": [
    {
      "key": "home",
      "url": "https://codely.com/",
      "name": "Codely home",
      "groupKey": "learning"
    },
    {
      "key": "courses",
      "url": "https://codely.com/en/courses",
      "name": "Codely courses",
      "groupKey": "learning"
    },
    {
      "key": "typescript",
      "url": "https://github.com/CodelyTV/typescript-ddd-example",
      "name": "TypeScript example",
      "groupKey": "examples"
    },
    {
      "key": "php",
      "url": "https://github.com/CodelyTV/php-ddd-example",
      "name": "PHP example",
      "groupKey": "examples"
    }
  ],
  "groups": [
    { "key": "learning", "title": "Codely learning", "color": "yellow" },
    { "key": "examples", "title": "DDD examples", "color": "blue" }
  ]
}
```

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
browser-tabs-cli batch validate examples/codely-tabs.json
browser-tabs-cli batch apply examples/codely-tabs.json --wait 60
browser-tabs-cli batch verify examples/codely-tabs.json --wait 60
browser-tabs-cli batch close codely-example
```

`validate` is entirely local. `apply` already verifies; call `verify` only to check
later or wait again for unfinished pages. `close` explicitly closes only tabs
owned by that batch. Review their contents first if you have since used them for
other work.

The CLI preserves URLs exactly. URL cleanup, deduplication, source selection,
short-name policies, and decisions about which tabs belong together belong to
the caller or Skill. No Slack or weekly-news rules are built into the program.

## All commands

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
| `schemas`              | Versioned JSON import contract used directly by runtime validation      |
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
with a small, typed contract. A direct CDP connection reaches Vivaldi's bundled
privileged UI, so the implementation needs neither the AIPex extension/daemon
setup nor a general page-automation engine. Browser-specific code stays in an
adapter; batch policy, validation, and verification can be reused. The tradeoff is
maintaining private Vivaldi APIs, with probes and real-browser tests to detect changes.

`agent-browser` can attach to an existing visible browser using CDP, and it already
supports batching. Those are not reasons to discard it. Its documented commands
and Chrome DevTools MCP do not supply this complete native Vivaldi naming and
stack contract; either upstream would still need a browser-specific adapter and
an agreed support scope. A future upstream contribution remains possible. See
[design.md](docs/design.md) for the evidence, alternatives, and compatibility limits.

## Development and tests

```sh
npm ci
npm run check
npm run dev -- --help
```

`check` runs strict TypeScript checks, builds both runtimes, runs the tests, and
checks formatting. Tests use Node's built-in runner, fake native APIs, and a local
CDP WebSocket server that executes the actual built runtime. They need no installed
browser and perform no external navigation. CI runs on Node 22 and 24.

```sh
npm run format
npm run build
BROWSER_TABS_CDP=9222 npm run smoke:vivaldi
```

The opt-in smoke test uses an already configured Vivaldi instance, creates eight
local pages in four colored stacks, replays the batch, exercises unit commands,
and cleans up only its own tabs. It checks the original inventory after cleanup.
With several windows, use `npm run smoke:vivaldi -- 123`. Prefer a disposable
profile for adapter development; see [the Vivaldi guide](docs/vivaldi.md).
