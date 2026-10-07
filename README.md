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
JSON file to create native groups, set their colors, and optionally verify the result with one command. The project and package are named
`browser-tabs-cli`; the terminal command is `browser-tabs`.

Vivaldi, Helium, Chrome, Chromium, Brave, Edge, and Opera have adapters.
Vivaldi supports custom tab names. The Chromium adapter lists, opens, and closes
tabs directly through CDP, with an optional bundled extension for native groups
and batches. See [Helium and Chromium setup](docs/chromium.md).
The CLI connects to an already running browser;
it never launches a browser or replaces your profile. It preserves existing tabs
when applying a batch.

## Getting started

1. Install **Node.js 24.x**, a supported browser, and [pnpm](https://pnpm.io/installation).

2. Choose one installation method:

   **Install the published package globally:**

   ```sh
   pnpm add -g browser-tabs-cli
   browser-tabs --help
   ```

   Update it later with `pnpm update -g browser-tabs-cli`.

   **Or clone and build from source:**

   ```sh
   git clone https://github.com/CodelyTV/browser-tabs-cli.git
   cd browser-tabs-cli
   pnpm install --frozen-lockfile
   pnpm build
   pnpm add -g .
   browser-tabs --help
   ```

   Source builds pin **pnpm 12.4.1**. After pulling updates, repeat the install,
   build, and global installation commands. You can also run `node dist/main.js`
   from the checkout.

   If pnpm reports a missing global binary directory, run `pnpm setup`, restart
   your terminal, and retry the global installation.

3. Connect the browser once. For Helium and other Chromium browsers, follow
   [the Chromium setup guide](docs/chromium.md). The steps below apply to Vivaldi.
   **CDP** means **Chrome DevTools Protocol**: a debugging
   protocol that lets local tools communicate with Chromium-based browsers.
   This CLI uses it to reach Vivaldi's own browser interface and its native tab APIs.
   A website's JavaScript context cannot manage Vivaldi stacks.

   **3.1. Enable remote debugging.** Open `vivaldi://inspect/#remote-debugging`
   in Vivaldi and enable **Allow remote debugging for this browser instance**.

   **3.2. Check the connection.** Run the following command and accept Vivaldi's
   permission prompt:

   ```sh
   browser-tabs doctor
   ```

   The CLI discovers the connection automatically, so no port is needed.
   Vivaldi does not need to be your default browser. See the
   [Vivaldi setup guide](docs/vivaldi.md) for other connection options and
   troubleshooting.

## Common use cases

### Open and organize tabs

With one browser window open, its ID is selected automatically. With several
windows, run `browser-tabs windows` and add `--window ID` to the operation.
The CLI fails before modifying anything if the destination is ambiguous.

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

### Open tabs in batch

The authoritative format is [tab-batch-schema/schema.json](tab-batch-schema/schema.json).
The CLI validates against that same schema, then checks key uniqueness and group
references. [tab-batch-schema/example.json](tab-batch-schema/example.json) is a complete,
ready-to-run example. Both files are publicly available; editors can also use
the local schema path.

`windowId` is optional. A tab without `groupKey` remains at the top level. `name`
and group `color` are optional. Vivaldi requires at least two unpinned tabs per
stack and limits tab names to 50 UTF-16 code units. Tabs open in the active
workspace, in input order; grouping makes their members consecutive.

Download the example JSON, or use the copy included in the clone. The commands
below assume you saved it as `tab-batch-schema/example.json`. Open it to create
17 named tabs in three colored native stacks, without post-open verification:

```sh
browser-tabs batch open tab-batch-schema/example.json
```

To check the result, add `--verify-after-seconds 30`. The CLI waits 30 seconds
after organizing the tabs, then checks names, group membership, colors, and loading:

```sh
browser-tabs batch open tab-batch-schema/example.json --verify-after-seconds 30
```

Keep the JSON response. `data.verified` and `data.ready` are `null` when
verification is skipped. `data.windowId` identifies the selected window. Add it
to the saved JSON before resuming later so that the destination remains fixed.

## All commands

Run each command below as `browser-tabs <command>`, for example `browser-tabs tab list`.
Square brackets mean optional arguments; do not type the brackets. All IDs come
from the JSON returned by `windows`, `tab list`, or `group list`.

### Connection and windows

| Command   | Operation                                                          |
| --------- | ------------------------------------------------------------------ |
| `doctor`  | Probe native browser access and list windows without changing tabs |
| `windows` | List all open windows                                              |

### Tabs

| Command                                    | Operation                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `tab list [--window ID]`                   | List URLs, page titles, custom names, loading state, groups, and ownership |
| `tab open URL [--name NAME] [--window ID]` | Open a background tab at the top level                                     |
| `tab rename ID NAME [--window ID]`         | Set a visible native tab name                                              |
| `tab close --tabs ID,ID [--window ID]`     | Close exactly the selected tabs                                            |

### Groups and stacks

| Command                                                                                               | Operation                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `group list [--window ID]`                                                                            | List native groups and their tab IDs        |
| `group open TITLE URL... [--color COLOR] [--batch ID] [--verify-after-seconds SECONDS] [--window ID]` | Open URLs as a new stack; optionally verify |
| `group create TITLE --tabs ID,ID [--color COLOR] [--window ID]`                                       | Stack selected existing tabs                |
| `group rename ID TITLE [--window ID]`                                                                 | Rename a stack                              |
| `group color ID COLOR [--window ID]`                                                                  | Change a stack color                        |
| `group move ID --tabs ID,ID [--window ID]`                                                            | Move selected tabs into the target stack    |

Colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `teal`, `orange`.
`group open` uses the batch engine; supply `--batch` for a predictable retry ID,
or keep the generated `data.batchId`. Individual mutation commands do not all
have batch-style retry semantics, so inspect state after an interrupted command.

### Batches

| Command                                                            | Operation                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `batch validate FILE`                                              | Validate an import without connecting to a browser   |
| `batch open FILE [--verify-after-seconds SECONDS] [--window ID]`   | Open, name, group, and color tabs; optionally verify |
| `batch verify FILE [--verify-after-seconds SECONDS] [--window ID]` | Read and verify an existing batch                    |
| `batch close ID [--window ID]`                                     | Close tabs tagged with the given batch ID            |

Use a distinct `batchId` for each independent import. Keep the same ID and tab
keys when retrying: only tabs tagged by this tool are reused. An existing personal
tab with the same URL is never adopted. Do not change URLs under existing keys;
use a new batch ID for a new selection. A failed operation can leave partial work,
which a retry of the original plan can complete. Batches are not transactions.

- Validate the JSON locally without connecting to the browser:

  ```sh
  browser-tabs batch validate tab-batch-schema/example.json
  ```

- Open, name, and group all tabs without waiting for page loads or running post-open verification:

  ```sh
  browser-tabs batch open tab-batch-schema/example.json
  ```

- Open the batch, wait 30 seconds after organizing it, and verify names, membership, colors, and loading:

  ```sh
  browser-tabs batch open tab-batch-schema/example.json --verify-after-seconds 30
  ```

- Verify an existing batch immediately without opening more tabs:

  ```sh
  browser-tabs batch verify tab-batch-schema/example.json
  ```

- Close only tabs owned by this batch. Review their contents first if you have since used them for other work:

  ```sh
  browser-tabs batch close codely-example
  ```

The CLI preserves URLs exactly. URL cleanup, deduplication, source selection,
short-name policies, and decisions about which tabs belong together belong to
the caller or Skill. No Slack or weekly-news rules are built into the program.

### Connection options

Global options: `--help`, `--browser vivaldi`, `--cdp auto|PORT|URL`.
`BROWSER_TABS_CDP` supplies the default endpoint.
`BROWSER_TABS_VIVALDI_DATA_DIR` overrides the directory used for automatic
endpoint discovery. Only loopback HTTP and WebSocket endpoints are accepted.
`--window` cannot conflict with a JSON `windowId`.

### Verification and results

`--verify-after-seconds` accepts a number from 0 to 300. After opening and
organizing all tabs, the CLI waits that many seconds and verifies once. It does
not poll or return early when pages finish loading. `0` verifies immediately.
Without the flag, `batch open` and `group open` skip post-open verification and
return `verified: null` and `ready: null`. Input validation, ownership checks, and
protection of existing tabs always apply. `batch verify` checks immediately by
default because verification is its explicit purpose.

The CLI returns JSON with `ok`, `data`, and `elapsedMs`, or `ok: false` and
`error`. When requested, `data.verified` confirms names, exact group membership,
colors, and ownership; `data.ready` additionally requires all pages to finish
loading. Exit codes:

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| `0`  | Command succeeded; if verification was requested, structure and loading passed |
| `1`  | Invalid input, connection/operation failure, or verification mismatch          |
| `2`  | Batch structure is verified, but pages are still loading                       |

A completed load can still display an HTTP error, login screen, or blocked page.
The CLI verifies browser state, not the editorial relevance or content of a page.

## Why other CLI to manage your browser

We evaluated several alternatives before building this tool. [design.md](docs/design.md)
explains our design decisions and why we have not adopted projects such as Agent
Browser, Browser Use CLI, and `browser-cli` for now. Our need is narrow: organize
tabs in an existing browser, using browser-specific APIs such as Vivaldi's.
Installing extensions or running daemons adds more setup than this task needs.

We assume these features may fall outside those projects' scope, and would gladly
stop maintaining `browser-tabs-cli` if an alternative meets them with minimal
setup. Thank you to all the alternative projects for inspiring this work.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, adding browser adapters,
development and tests, commit conventions, and release configuration.
