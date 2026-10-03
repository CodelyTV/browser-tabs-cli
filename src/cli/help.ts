export const help = `browser-tabs [--browser vivaldi] [--cdp auto|port|url] <command>

  doctor                                        Check the existing browser connection
  windows                                       List open windows
  tab list [--window ID]                         List tabs and native group membership
  tab open URL [--name NAME] [--window ID]
  tab rename ID NAME [--window ID]
  tab close --tabs ID,ID [--window ID]
  group list [--window ID]
  group open TITLE URL... [--color COLOR] [--batch ID] [--wait 30] [--window ID]
  group create TITLE --tabs ID,ID [--color COLOR] [--window ID]
  group rename ID TITLE [--window ID]
  group color ID COLOR [--window ID]
  group move ID --tabs ID,ID [--window ID]
  batch validate FILE                           Validate JSON without a browser
  batch apply FILE [--wait 30] [--window ID]      Open, name, group, wait, and verify
  batch verify FILE [--wait 0] [--window ID]
  batch close ID [--window ID]

One open window is selected automatically. Multiple windows require an ID.
--wait is a loading deadline in seconds, from 0 to 300.
CDP means Chrome DevTools Protocol. The browser must already expose a local endpoint.
This CLI never launches a browser, creates a profile, or enables debugging.
Set BROWSER_TABS_CDP or BROWSER_TABS_VIVALDI_DATA_DIR to customize discovery.
`;
