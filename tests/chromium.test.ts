import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { WebSocketServer } from "ws";
import { ChromiumBrowser } from "../src/adapters/chromium/browser.js";
import { connectChromium } from "../src/adapters/chromium/connection.js";
import {
	chromiumBrowsers,
	dataDirectory,
} from "../src/adapters/chromium/discovery.js";
import type {
	NativeApi,
	NativeGroup,
	NativeTab,
} from "../src/adapters/chromium/native-api.js";
import { connect } from "../src/adapters/connect.js";
import { execute } from "../src/application/execute.js";
import { parse } from "../src/cli/parse.js";
import type { Ownership } from "../src/domain/browser.js";

function fixture() {
	const tabs: NativeTab[] = [
		{
			id: 1,
			windowId: 1,
			index: 0,
			url: "https://existing.test",
			active: true,
			pinned: false,
			status: "complete",
			groupId: -1,
		},
		{ id: 2, windowId: 2, index: 0, groupId: -1 },
	];
	const groups: NativeGroup[] = [];
	const stored: Record<string, Ownership> = {};
	let nextId = 3;
	const api: NativeApi = {
		windows: { getAll: async () => [{ id: 1, focused: true }, { id: 2 }] },
		tabs: {
			query: async ({ windowId }) =>
				tabs
					.filter((tab) => tab.windowId === windowId)
					.map((tab) => ({ ...tab })),
			get: async (id) => {
				const tab = tabs.find((candidate) => candidate.id === id);
				if (!tab) throw new Error("Missing tab");
				return { ...tab };
			},
			create: async (options) => {
				const tab = {
					...options,
					id: nextId++,
					groupId: -1,
					status: "complete",
				};
				tabs.push(tab);
				return { ...tab };
			},
			remove: async (ids) => {
				for (const id of ids)
					tabs.splice(
						tabs.findIndex((tab) => tab.id === id),
						1,
					);
			},
			group: async ({ tabIds, groupId, createProperties }) => {
				const id = groupId ?? groups.length + 10;
				if (groupId === undefined)
					groups.push({
						id,
						windowId: createProperties!.windowId,
						title: "",
						color: "grey",
					});
				for (const tab of tabs.filter((candidate) =>
					tabIds.includes(candidate.id),
				))
					tab.groupId = id;
				return id;
			},
		},
		tabGroups: {
			query: async ({ windowId }) =>
				groups.filter((group) => group.windowId === windowId),
			get: async (id) => {
				const group = groups.find((candidate) => candidate.id === id);
				if (!group) throw new Error("Missing group");
				return { ...group };
			},
			update: async (id, changes) => {
				const group = groups.find((candidate) => candidate.id === id)!;
				Object.assign(group, changes);
				return { ...group };
			},
		},
		storage: {
			session: {
				get: async (keys) =>
					Object.fromEntries(
						keys.filter((key) => stored[key]).map((key) => [key, stored[key]!]),
					),
				set: async (values) => {
					Object.assign(stored, values);
				},
				remove: async (keys) => {
					for (const key of keys) delete stored[key];
				},
			},
		},
	};
	return { api, tabs, groups, stored, browser: new ChromiumBrowser(api) };
}
const plan = {
	version: 1 as const,
	batchId: "chromium-test",
	windowId: 1,
	tabs: [{ key: "one", url: "https://example.test/one", groupKey: "g" }],
	groups: [{ key: "g", title: "Native group", color: "blue" as const }],
};
test("Chromium batches preserve existing tabs, allow single-tab groups, reuse ownership and close only their tabs", async () => {
	const f = fixture();
	const before = structuredClone(f.tabs);
	const result = (await execute(f.browser, {
		type: "batch.open",
		plan,
		verifyAfterMs: 0,
	})) as { created: number; verified: boolean };
	assert.equal(result.created, 1);
	assert.equal(result.verified, true);
	assert.deepEqual(f.tabs.slice(0, 2), before);
	const retry = (await execute(new ChromiumBrowser(f.api), {
		type: "batch.open",
		plan,
	})) as { reused: number };
	assert.equal(retry.reused, 1);
	assert.equal(f.groups.length, 1);
	await execute(f.browser, {
		type: "batch.close",
		windowId: 1,
		batchId: plan.batchId,
	});
	assert.deepEqual(f.tabs, before);
	assert.deepEqual(f.stored, {});
});
test("unsupported native names fail before tab creation", async () => {
	const f = fixture();
	for (const command of [
		{
			type: "tab.open" as const,
			windowId: 1,
			url: "https://example.test",
			name: "Name",
		},
		{ type: "tab.rename" as const, windowId: 1, tabId: 1, name: "Name" },
		{
			type: "batch.open" as const,
			plan: { ...plan, tabs: [{ ...plan.tabs[0]!, name: "Name" }] },
		},
	])
		await assert.rejects(
			execute(f.browser, command),
			/native custom tab names/,
		);
	assert.equal(f.tabs.length, 2);
});
test("Chromium native operations validate window membership and pinned tabs before mutations", async () => {
	const f = fixture();
	await assert.rejects(f.browser.close(1, [2]), /another window/);
	await assert.rejects(f.browser.createGroup(1, [1, 1], "Group"), /distinct/);
	f.tabs[0]!.pinned = true;
	await assert.rejects(f.browser.createGroup(1, [1], "Group"), /Unpin/);
	f.tabs[0]!.pinned = false;
	const group = await f.browser.createGroup(1, [1], "Group", "green");
	await assert.rejects(
		f.browser.updateGroup(2, group.id, { title: "Wrong" }),
		/selected window/,
	);
	await assert.rejects(
		f.browser.moveToGroup(1, [2], group.id),
		/another window/,
	);
	await assert.rejects(f.browser.updateGroup(1, "1e1", {}), /Invalid/);
	const opened = await f.browser.open(1, "https://example.test");
	await f.browser.moveToGroup(1, [opened.id], group.id);
	await f.browser.updateGroup(1, group.id, {
		title: "Updated",
		color: "orange",
	});
	assert.equal(
		(await f.browser.tabs(1)).find((tab) => tab.id === opened.id)?.group?.title,
		"Updated",
	);
	assert.equal(f.tabs[1]!.windowId, 2);
});
test("browser selectors and discovery honor platform paths and overrides", () => {
	for (const browser of chromiumBrowsers) {
		const input = parse(["--browser", browser, "doctor"]);
		assert.ok(input.kind === "execute" && input.browser === browser);
	}
	assert.equal(
		dataDirectory("helium", "darwin", "/home/test", {}),
		"/home/test/Library/Application Support/net.imput.helium",
	);
	assert.equal(
		dataDirectory("brave", "linux", "/home/test", {
			XDG_CONFIG_HOME: "/custom",
		}),
		"/custom/BraveSoftware/Brave-Browser",
	);
	assert.equal(
		dataDirectory("chrome", "win32", "/home/test", { LOCALAPPDATA: "/local" }),
		"/local/Google/Chrome/User Data",
	);
	assert.equal(
		dataDirectory("helium", "darwin", "/home", {
			BROWSER_TABS_DATA_DIR: "/generic",
			BROWSER_TABS_HELIUM_DATA_DIR: "/specific",
		}),
		"/specific",
	);
});
for (const installedRuntime of ["missing", "preloaded", "stale"])
	test(`Chromium injects the CLI runtime when the extension script is ${installedRuntime}`, async () => {
		const f = fixture();
		const context = vm.createContext({
			chrome: {
				...f.api,
				runtime: { getManifest: () => ({ name: "Browser Tabs CLI" }) },
			},
			setTimeout,
		});
		if (installedRuntime === "stale")
			vm.runInContext(
				'globalThis.BrowserTabsRuntime = { run() { throw new Error("Stale extension runtime"); } };',
				context,
			);
		if (installedRuntime === "preloaded")
			vm.runInContext(
				readFileSync(
					new URL("../dist/chromium-extension/runtime.js", import.meta.url),
					"utf8",
				),
				context,
			);
		const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
		await once(wss, "listening");
		const address = wss.address();
		assert.ok(address && typeof address !== "string");
		const attached: string[] = [];
		wss.on("connection", (socket) =>
			socket.on("message", async (raw) => {
				const { id, method, params } = JSON.parse(String(raw));
				let result: unknown = {};
				if (method === "Target.getTargets")
					result = {
						targetInfos: [
							{
								targetId: "website",
								type: "page",
								url: "https://example.test/browser-tabs.html",
							},
							{
								targetId: "extension",
								type: "page",
								url: `chrome-extension://${"a".repeat(32)}/browser-tabs.html`,
							},
						],
					};
				if (method === "Target.attachToTarget") {
					attached.push(params.targetId);
					result = { sessionId: "extension" };
				}
				if (method === "Runtime.evaluate") {
					try {
						result = {
							result: {
								value: await vm.runInContext(params.expression, context),
							},
						};
					} catch (error) {
						result = { result: {}, exceptionDetails: { text: String(error) } };
					}
				}
				socket.send(JSON.stringify({ id, result }));
			}),
		);
		try {
			const connection = await connectChromium(
				"helium",
				`ws://127.0.0.1:${address.port}`,
				new URL("../dist/chromium-extension/runtime.js", import.meta.url),
			);
			try {
				assert.deepEqual(connection.capabilities, {
					mode: "chromium-extension",
					groups: true,
					batches: true,
					tabNames: false,
				});
				const result = (await connection.execute({
					type: "batch.open",
					plan,
					verifyAfterMs: 0,
				})) as { verified: boolean };
				assert.equal(result.verified, true);
				await assert.rejects(
					connection.execute({
						type: "tab.open",
						windowId: 1,
						url: "https://example.test",
						name: "No",
					}),
					/native custom tab names/,
				);
				assert.deepEqual(attached, ["extension"]);
			} finally {
				connection.close();
			}
		} finally {
			for (const client of wss.clients) client.terminate();
			await new Promise<void>((resolve) => wss.close(() => resolve()));
		}
	});
test("unsupported browser fails with available adapters", () => {
	assert.throws(() => connect("firefox", "9222"), /helium, chromium/);
});
test("commands requiring an extension fail without evaluating website JavaScript", async () => {
	const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(wss, "listening");
	const address = wss.address();
	assert.ok(address && typeof address !== "string");
	const methods: string[] = [];
	wss.on("connection", (socket) =>
		socket.on("message", (raw) => {
			const { id, method } = JSON.parse(String(raw));
			methods.push(method);
			socket.send(
				JSON.stringify({
					id,
					result: {
						targetInfos: [
							{
								targetId: "website",
								type: "page",
								url: "https://example.test/",
							},
						],
					},
				}),
			);
		}),
	);
	try {
		const connection = await connect(
			"helium",
			`ws://127.0.0.1:${address.port}`,
		);
		try {
			await assert.rejects(
				connection.execute({ type: "groups" }),
				/requires the Browser Tabs CLI extension/,
			);
		} finally {
			connection.close();
		}
		assert.deepEqual(methods, ["Target.getTargets"]);
	} finally {
		for (const client of wss.clients) client.terminate();
		await new Promise<void>((resolve) => wss.close(() => resolve()));
	}
});
test("missing automatic endpoint includes the data directory and setup instructions", async (context) => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { discoverChromiumEndpoint } = await import(
		"../src/adapters/chromium/discovery.js"
	);
	const directory = await mkdtemp(join(tmpdir(), "helium-discovery-"));
	const previous = process.env.BROWSER_TABS_HELIUM_DATA_DIR;
	process.env.BROWSER_TABS_HELIUM_DATA_DIR = directory;
	context.after(async () => {
		if (previous === undefined) delete process.env.BROWSER_TABS_HELIUM_DATA_DIR;
		else process.env.BROWSER_TABS_HELIUM_DATA_DIR = previous;
		await rm(directory, { recursive: true });
	});
	await assert.rejects(discoverChromiumEndpoint("helium"), (error: unknown) => {
		assert.ok(error instanceof Error);
		assert.ok(error.message.includes(directory));
		assert.match(error.message, /chrome:\/\/inspect\/#remote-debugging/);
		assert.match(error.message, /retry without --cdp/);
		return true;
	});
});
