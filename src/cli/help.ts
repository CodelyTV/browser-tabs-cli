export const help = `browser-tabs [--browser NAME] [--cdp auto|port|url] <command>

  doctor                                        Check the connection and Chromium capabilities
  windows                                       List open windows
  tab list [--window ID]                         List tabs and native group membership
  tab open URL [--name NAME] [--window ID]
  tab rename ID NAME [--window ID]
  tab close --tabs ID,ID [--window ID]
  group list [--window ID]
  group open TITLE URL... [--color COLOR] [--batch ID] [--verify-after-seconds SECONDS] [--window ID]
  group create TITLE --tabs ID,ID [--color COLOR] [--window ID]
  group rename ID TITLE [--window ID]
  group color ID COLOR [--window ID]
  group move ID --tabs ID,ID [--window ID]
  batch validate FILE                           Validate JSON without a browser
  batch open FILE [--verify-after-seconds SECONDS] [--window ID]      Open, name, group, and color
  batch verify FILE [--verify-after-seconds SECONDS] [--window ID]
  batch close ID [--window ID]

One open window is selected automatically. Multiple windows require an ID.
Opening a batch or group skips post-open verification by default.
--verify-after-seconds waits 0 to 300 seconds after opening, then verifies once.
batch verify checks immediately unless a verification delay is supplied.
CDP means Chrome DevTools Protocol. The browser must already expose a local endpoint.
This CLI never launches a browser, creates a profile, or enables debugging.
Browsers: vivaldi (default), helium, chromium, chrome, brave, edge, opera.
Chromium basic commands (doctor, windows, tab list/open/close) work without an extension.
Groups and batches require the bundled extension; doctor reports their availability.
When debugging is enabled via the browser UI, each CLI command requests permission.
See docs/chromium.md for extension setup and connection behavior.
Without the extension, tab IDs use cdp:TARGET; native tab metadata is unavailable.
Opening with multiple windows in the same browser context requires the extension.
Native custom tab names are supported only by Vivaldi.
Set BROWSER_TABS_CDP or BROWSER_TABS_<BROWSER>_DATA_DIR to customize discovery.
BROWSER_TABS_DATA_DIR sets a shared data directory for Chromium adapters.
`;
