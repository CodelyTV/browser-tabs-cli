# Contributing

Use Conventional Commits: `feat:`, `fix:`, `docs:`, `ci:`, `build:`, and the
other standard types. Scopes are optional. Mark incompatible changes with `!`
or a `BREAKING CHANGE:` footer. CI validates commit messages against Conventional Commits.

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
Dependabot uses `ci(deps)` for Actions, `fix(deps)` for production packages,
and `build(deps-dev)` for development packages.

## Releases and npm publishing

Every successful CI run for a new commit on `main` uses
[semantic-release](https://semantic-release.org/) to publish an npm package and a
GitHub release with provenance. It considers all commits since the previous tag:
`feat` increments the minor version, breaking changes increment the major version,
and other Conventional Commit types increment the patch version. The largest
change wins. This includes documentation and dependency updates. Re-running CI
without new commits does not publish another version. The first release is 1.0.0.

Release tags and npm are the version source of truth; the checkout keeps its
development version. CI sets the package version before publishing without a
release commit or release PR. Builds and dependency installation use pnpm;
semantic-release uses npm only for registry publication.

### One-time npm setup

1. For a new package, create a short-lived
   [npm granular access token](https://docs.npmjs.com/creating-and-viewing-access-tokens/)
   with permission to create and publish the package and **Bypass 2FA** enabled.
   Store it as the repository Actions secret `NPM_TOKEN`, then run the **CI**
   workflow on `main`. This first publication also includes provenance.
2. In the package's npm settings, add a
   [GitHub Actions trusted publisher](https://docs.npmjs.com/trusted-publishers/):
   organization **CodelyTV**, repository **browser-tabs-cli**, workflow filename
   **ci.yml**, and no environment name. Allow direct **npm publish**.
3. Delete the GitHub `NPM_TOKEN` secret and revoke the temporary npm token.
   Subsequent releases authenticate through GitHub OIDC, without an npm secret.
   Node 24 supplies the required modern npm CLI; the workflow grants `id-token: write`.

Until the initial npm authorization is configured, CI can validate the project
but its release job cannot publish. Use **Run workflow** after setup to retry
without creating an empty commit. Never put npm tokens in Git, commands, or chat.
