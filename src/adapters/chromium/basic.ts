import type { Command, Connection } from "../../domain/command.js";
import type { CdpClient } from "../../transport/cdp.js";

interface Target {
	targetId: string;
	type: string;
	url: string;
	title: string;
	browserContextId?: string;
}
interface BasicTab {
	id: string;
	windowId: number;
	url: string;
	title: string;
	browserContextId?: string;
}
const visible = ({ browserContextId: _context, ...tab }: BasicTab) => tab;
function window(tabsInBrowser: BasicTab[], requested?: number) {
	const ids = [...new Set(tabsInBrowser.map((tab) => tab.windowId))];
	if (requested !== undefined) {
		if (!ids.includes(requested))
			throw new Error(`Window ${requested} is not open.`);
		return requested;
	}
	if (!ids.length) throw new Error("No browser window is open.");
	if (ids.length !== 1)
		throw new Error(
			"Multiple browser windows are open. Run windows and specify --window or windowId.",
		);
	return ids[0]!;
}
export function basicConnection(cdp: CdpClient): Connection {
	async function tabs(): Promise<BasicTab[]> {
		const { targetInfos } = await cdp.request<{ targetInfos: Target[] }>(
			"Target.getTargets",
			{ filter: [{}] },
		);
		const result: BasicTab[] = [];
		for (const target of targetInfos.filter(
			(candidate) =>
				candidate.type === "page" && !candidate.url.startsWith("devtools://"),
		)) {
			const { windowId } = await cdp.request<{ windowId: number }>(
				"Browser.getWindowForTarget",
				{ targetId: target.targetId },
			);
			result.push({
				id: `cdp:${target.targetId}`,
				windowId,
				url: target.url,
				title: target.title,
				browserContextId: target.browserContextId,
			});
		}
		return result;
	}
	return {
		capabilities: {
			mode: "basic-cdp",
			groups: false,
			batches: false,
			tabNames: false,
		},
		async execute(command: Command) {
			if (
				command.type === "tab.rename" ||
				(command.type === "tab.open" && command.name !== undefined)
			)
				throw new Error(
					"This browser does not support native custom tab names.",
				);
			if (
				command.type !== "windows" &&
				command.type !== "tabs" &&
				command.type !== "tab.open" &&
				command.type !== "tab.close"
			)
				throw new Error(
					"This command requires the Browser Tabs CLI extension. The connection is in basic CDP mode. In chrome://extensions, load dist/chromium-extension, then open Details > Extension options for Browser Tabs CLI and keep that page open. Accepting the debugging prompt does not enable group APIs. See docs/chromium.md. No tabs were changed.",
				);
			const snapshot = await tabs();
			if (command.type === "windows")
				return [...new Set(snapshot.map((tab) => tab.windowId))].map((id) => ({
					id,
				}));
			const windowId = window(snapshot, command.windowId);
			if (command.type === "tabs")
				return snapshot.filter((tab) => tab.windowId === windowId).map(visible);
			if (command.type === "tab.close") {
				if (
					!command.tabIds.length ||
					new Set(command.tabIds).size !== command.tabIds.length
				)
					throw new Error("Select distinct tab IDs.");
				const selected = command.tabIds.map((id) => {
					const tab = snapshot.find((candidate) => candidate.id === id);
					if (!tab)
						throw new Error(
							`Tab ${id} is not open. Run tab list to get CDP tab IDs.`,
						);
					if (tab.windowId !== windowId)
						throw new Error("A selected tab belongs to another window.");
					return tab;
				});
				for (const tab of selected) {
					// Recheck immediately before closing; tabs can move between windows.
					const { windowId: currentWindow } = await cdp.request<{
						windowId: number;
					}>("Browser.getWindowForTarget", { targetId: tab.id.slice(4) });
					if (currentWindow !== windowId)
						throw new Error("A selected tab belongs to another window.");
					const { success } = await cdp.request<{ success: boolean }>(
						"Target.closeTarget",
						{ targetId: tab.id.slice(4) },
					);
					if (!success)
						throw new Error(
							`CDP did not close tab ${tab.id}. Inspect partial changes before retrying.`,
						);
				}
				return { windowId, closed: command.tabIds };
			}
			if (command.type !== "tab.open")
				throw new Error("Unsupported basic CDP command.");
			const reference = snapshot.find((tab) => tab.windowId === windowId);
			if (!reference) {
				throw new Error("Unable to find reference on snapshot");
			}

			const contextWindows = new Set(
				snapshot
					.filter((tab) => tab.browserContextId === reference.browserContextId)
					.map((tab) => tab.windowId),
			);
			if (contextWindows.size > 1)
				throw new Error(
					"Opening in a specific window when this browser context has multiple windows requires the Browser Tabs CLI extension. No tabs were changed.",
				);
			// CDP creates in the sole window of this context; verify the returned placement.
			const { targetId } = await cdp.request<{ targetId: string }>(
				"Target.createTarget",
				{
					url: command.url,
					background: true,
					newWindow: false,
					...(reference.browserContextId === undefined
						? {}
						: { browserContextId: reference.browserContextId }),
				},
			);
			const { windowId: actualWindow } = await cdp.request<{
				windowId: number;
			}>("Browser.getWindowForTarget", { targetId });
			if (actualWindow !== windowId) {
				await cdp.request("Target.closeTarget", { targetId });
				throw new Error(
					"CDP opened the tab in another window; it was closed. Use the extension for window-specific opening.",
				);
			}
			return { id: `cdp:${targetId}`, windowId, url: command.url, title: "" };
		},
		close: () => cdp.close(),
	};
}
