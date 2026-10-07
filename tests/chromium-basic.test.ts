import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocketServer } from "ws";
import { connect } from "../src/adapters/connect.js";
import { parse } from "../src/cli/parse.js";
import { run } from "../src/cli/run.js";

async function fixture() {
	const targets = [
		{
			targetId: "FIRST",
			type: "page",
			windowId: 1,
			url: "https://example.test/first",
			title: "First",
		},
		{
			targetId: "SECOND",
			type: "page",
			windowId: 1,
			url: "https://example.test/second",
			title: "Second",
		},
		{
			targetId: "WORKER",
			type: "service_worker",
			windowId: 1,
			url: "https://example.test/worker",
			title: "Worker",
		},
		{
			targetId: "TOOLS",
			type: "page",
			windowId: 1,
			url: "devtools://devtools/bundled/inspector.html",
			title: "Tools",
		},
	];
	const calls: { method: string; params: Record<string, unknown> }[] = [];
	const options = {
		createWindow: 1,
		createError: "",
		movedOnClose: false,
		failClose: false,
	};
	const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(wss, "listening");
	const address = wss.address();
	assert.ok(address && typeof address !== "string");
	wss.on("connection", (socket) =>
		socket.on("message", (raw) => {
			const { id, method, params } = JSON.parse(String(raw));
			calls.push({ method, params });
			let result: unknown = {};
			if (method === "Target.getTargets") result = { targetInfos: targets };
			if (method === "Browser.getWindowForTarget") {
				const target = targets.find(
					(candidate) => candidate.targetId === params.targetId,
				);
				if (!target) {
					socket.send(
						JSON.stringify({ id, error: { message: "Missing target" } }),
					);
					return;
				}
				const checks = calls.filter(
					(call) =>
						call.method === method && call.params.targetId === params.targetId,
				).length;
				result = {
					windowId: options.movedOnClose && checks > 1 ? 2 : target.windowId,
				};
			}
			if (method === "Target.createTarget") {
				if (options.createError) {
					socket.send(
						JSON.stringify({ id, error: { message: options.createError } }),
					);
					return;
				}
				targets.push({
					targetId: "CREATED",
					type: "page",
					windowId: options.createWindow,
					url: params.url,
					title: "",
				});
				result = { targetId: "CREATED" };
			}
			if (method === "Target.closeTarget") {
				if (!options.failClose)
					targets.splice(
						targets.findIndex((target) => target.targetId === params.targetId),
						1,
					);
				result = { success: !options.failClose };
			}
			socket.send(JSON.stringify({ id, result }));
		}),
	);
	return {
		targets,
		calls,
		options,
		endpoint: `ws://127.0.0.1:${address.port}`,
		async close() {
			for (const socket of wss.clients) socket.terminate();
			await new Promise<void>((resolve) => wss.close(() => resolve()));
		},
	};
}
test("basic CLI connects without extensions, opens and closes stable CDP IDs across connections", async () => {
	const f = await fixture();
	const dispatch = (browser: string) => connect(browser, f.endpoint);
	try {
		const doctor = await run(["--browser", "helium", "doctor"], dispatch);
		assert.deepEqual(doctor.data, {
			connected: true,
			adapter: "helium",
			windows: [{ id: 1 }],
			capabilities: {
				mode: "basic-cdp",
				groups: false,
				batches: false,
				tabNames: false,
			},
		});
		const listed = await run(["--browser", "helium", "tab", "list"], dispatch);
		assert.deepEqual(listed.data, [
			{
				id: "cdp:FIRST",
				windowId: 1,
				url: "https://example.test/first",
				title: "First",
			},
			{
				id: "cdp:SECOND",
				windowId: 1,
				url: "https://example.test/second",
				title: "Second",
			},
		]);
		const opened = await run(
			["--browser", "helium", "tab", "open", "https://example.test/new"],
			dispatch,
		);
		assert.deepEqual(opened.data, {
			id: "cdp:CREATED",
			windowId: 1,
			url: "https://example.test/new",
			title: "",
		});
		assert.deepEqual(
			f.calls.find((call) => call.method === "Target.createTarget")?.params,
			{ url: "https://example.test/new", background: true, newWindow: false },
		);
		await run(
			["--browser", "helium", "tab", "close", "--tabs", "cdp:CREATED"],
			dispatch,
		);
		assert.equal(
			f.targets.some((target) => target.targetId === "CREATED"),
			false,
		);
		assert.equal(
			f.targets.some((target) => target.targetId === "FIRST"),
			true,
		);
		assert.equal(
			f.calls.some((call) => call.method === "Runtime.evaluate"),
			false,
		);
	} finally {
		await f.close();
	}
});
test("basic operations reject unsupported commands and names before mutations", async () => {
	const f = await fixture();
	const connection = await connect("helium", f.endpoint);
	try {
		for (const command of [
			{ type: "groups" as const },
			{ type: "group.create" as const, title: "Group", tabIds: ["cdp:FIRST"] },
			{ type: "batch.close" as const, batchId: "owned" },
			{
				type: "batch.open" as const,
				plan: {
					version: 1 as const,
					batchId: "owned",
					tabs: [{ key: "one", url: "https://example.test" }],
					groups: [],
				},
			},
		])
			await assert.rejects(
				connection.execute(command),
				/requires the Browser Tabs CLI extension/,
			);
		await assert.rejects(
			connection.execute({
				type: "tab.open",
				url: "https://example.test",
				name: "Name",
			}),
			/native custom tab names/,
		);
		await assert.rejects(
			connection.execute({
				type: "tab.rename",
				tabId: "cdp:FIRST",
				name: "Name",
			}),
			/native custom tab names/,
		);
		assert.deepEqual(
			f.calls.map((call) => call.method),
			["Target.getTargets"],
		);
	} finally {
		connection.close();
		await f.close();
	}
});
test("multiple windows require explicit selection and closing checks all IDs before mutation", async () => {
	const f = await fixture();
	f.targets[1]!.windowId = 2;
	const connection = await connect("helium", f.endpoint);
	try {
		assert.deepEqual(await connection.execute({ type: "windows" }), [
			{ id: 1 },
			{ id: 2 },
		]);
		await assert.rejects(connection.execute({ type: "tabs" }), /Multiple/);
		const selected = (await connection.execute({
			type: "tabs",
			windowId: 2,
		})) as { id: string }[];
		assert.deepEqual(
			selected.map((tab) => tab.id),
			["cdp:SECOND"],
		);
		await assert.rejects(
			connection.execute({ type: "tabs", windowId: 99 }),
			/not open/,
		);
		await assert.rejects(
			connection.execute({
				type: "tab.close",
				windowId: 1,
				tabIds: ["cdp:FIRST", "cdp:SECOND"],
			}),
			/another window/,
		);
		await assert.rejects(
			connection.execute({
				type: "tab.close",
				windowId: 1,
				tabIds: ["cdp:FIRST", "cdp:MISSING"],
			}),
			/not open/,
		);
		await assert.rejects(
			connection.execute({
				type: "tab.close",
				windowId: 1,
				tabIds: ["cdp:FIRST", "cdp:FIRST"],
			}),
			/distinct/,
		);
		await assert.rejects(
			connection.execute({
				type: "tab.open",
				windowId: 1,
				url: "https://example.test",
			}),
			/multiple windows requires/,
		);
		assert.equal(
			f.calls.some((call) =>
				["Target.closeTarget", "Target.createTarget"].includes(call.method),
			),
			false,
		);
	} finally {
		connection.close();
		await f.close();
	}
});
test("a misplaced created tab is closed without touching pre-existing tabs", async () => {
	const f = await fixture();
	f.options.createWindow = 2;
	const connection = await connect("helium", f.endpoint);
	try {
		await assert.rejects(
			connection.execute({ type: "tab.open", url: "https://example.test" }),
			/another window; it was closed/,
		);
		assert.equal(
			f.calls.some((call) => call.method === "Page.navigate"),
			false,
		);
		assert.equal(
			f.targets.some((target) => target.targetId === "CREATED"),
			false,
		);
		assert.equal(f.targets[0]!.targetId, "FIRST");
	} finally {
		connection.close();
		await f.close();
	}
});
test("target creation failure is reported without leaving a new tab", async () => {
	const f = await fixture();
	f.options.createError = "Cannot create target";
	const connection = await connect("helium", f.endpoint);
	try {
		await assert.rejects(
			connection.execute({ type: "tab.open", url: "https://example.test" }),
			/Cannot create target/,
		);
		assert.equal(
			f.targets.some((target) => target.targetId === "CREATED"),
			false,
		);
	} finally {
		connection.close();
		await f.close();
	}
});
test("closing a tab moved to another window fails without closing it", async () => {
	const f = await fixture();
	f.options.movedOnClose = true;
	const connection = await connect("helium", f.endpoint);
	try {
		await assert.rejects(
			connection.execute({ type: "tab.close", tabIds: ["cdp:FIRST"] }),
			/another window/,
		);
		assert.equal(
			f.calls.some((call) => call.method === "Target.closeTarget"),
			false,
		);
	} finally {
		connection.close();
		await f.close();
	}
});
test("CDP close failure is propagated", async () => {
	const f = await fixture();
	f.options.failClose = true;
	const connection = await connect("helium", f.endpoint);
	try {
		await assert.rejects(
			connection.execute({ type: "tab.close", tabIds: ["cdp:FIRST"] }),
			/did not close/,
		);
	} finally {
		connection.close();
		await f.close();
	}
});
test("CLI rejects malformed or repeated CDP tab IDs", () => {
	for (const ids of [
		"cdp:",
		"cdp:FIRST,cdp:FIRST",
		"cdp:FIRST bad",
		"not-an-id",
	])
		assert.throws(() => parse(["tab", "close", "--tabs", ids]));
});
