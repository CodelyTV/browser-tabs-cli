import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { type WebSocket, WebSocketServer } from "ws";
import { connectVivaldi } from "../src/adapters/vivaldi/connection.js";
import { discoverEndpoint } from "../src/adapters/vivaldi/discovery.js";
import { CdpClient, localEndpoint } from "../src/transport/cdp.js";
import { FakeNative, plan } from "./support/native.js";

async function server() {
	const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(wss, "listening");
	const address = wss.address();
	if (typeof address === "string" || !address)
		throw new Error("Missing address");
	return {
		wss,
		endpoint: `ws://127.0.0.1:${address.port}`,
		close: async () => {
			for (const client of wss.clients) client.terminate();
			await new Promise<void>((resolve) => wss.close(() => resolve()));
		},
	};
}
test("the compiled runtime applies and verifies a batch with one execution over CDP", async () => {
	const fixture = await server();
	const api = new FakeNative();
	const requests: { method: string; params: Record<string, unknown> }[] = [];
	const context = vm.createContext({
		chrome: api,
		vivaldi: { tabsPrivate: api.stacks },
		performance,
		setTimeout,
	});
	fixture.wss.on("connection", (socket) =>
		socket.on("message", async (raw) => {
			const request = JSON.parse(String(raw));
			requests.push(request);
			const { id, method, params } = request;
			let result: unknown = {};
			if (method === "Target.getTargets")
				result = {
					targetInfos: [
						{ targetId: "website", type: "page", url: "https://example.com/" },
						{
							targetId: "unsupported",
							type: "other",
							url: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/browser.html",
						},
						{
							targetId: "ui",
							type: "other",
							url: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/browser.html",
						},
					],
				};
			if (method === "Target.attachToTarget")
				result = { sessionId: params.targetId };
			if (method === "Runtime.evaluate") {
				if (request.sessionId === "unsupported") {
					socket.send(
						JSON.stringify({ id, error: { message: "Runtime unavailable" } }),
					);
					return;
				}
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
		const connection = await connectVivaldi(
			fixture.endpoint,
			new URL("../dist/vivaldi-runtime.js", import.meta.url),
		);
		try {
			const result = (await connection.execute({
				type: "batch.open",
				plan,
				verifyAfterMs: 0,
			})) as { verified: boolean; created: number };
			assert.equal(result.verified, true);
			assert.equal(result.created, 3);
			assert.equal(
				requests.filter((request) => request.params.awaitPromise).length,
				1,
			);
			const reused = (await connection.execute({
				type: "batch.open",
				plan,
			})) as {
				verified: null;
				ready: null;
				reused: number;
			};
			assert.equal(reused.verified, null);
			assert.equal(reused.ready, null);
			assert.equal(reused.reused, 3);
			assert.equal(
				requests.some((request) => request.params.targetId === "website"),
				false,
			);
			assert.ok(
				requests.some(
					(request) => request.method === "Target.detachFromTarget",
				),
			);
			await assert.rejects(
				connection.execute({ type: "tabs", windowId: 999 }),
				/window/i,
			);
		} finally {
			connection.close();
		}
	} finally {
		await fixture.close();
	}
});
test("missing privileged UI fails without executing page JavaScript", async () => {
	const fixture = await server();
	const calls: string[] = [];
	fixture.wss.on("connection", (socket) =>
		socket.on("message", (raw) => {
			const request = JSON.parse(String(raw));
			calls.push(request.method);
			socket.send(
				JSON.stringify({
					id: request.id,
					result: {
						targetInfos: [
							{ targetId: "site", type: "page", url: "https://example.com/" },
						],
					},
				}),
			);
		}),
	);
	try {
		await assert.rejects(
			connectVivaldi(
				fixture.endpoint,
				new URL("../dist/vivaldi-runtime.js", import.meta.url),
			),
			/privileged UI is unavailable/,
		);
		assert.deepEqual(calls, ["Target.getTargets"]);
	} finally {
		await fixture.close();
	}
});
test("CDP requests time out and reject promptly on disconnect", async () => {
	const fixture = await server();
	let socket: WebSocket | undefined;
	fixture.wss.on("connection", (client) => {
		socket = client;
	});
	const client = await CdpClient.connect(fixture.endpoint);
	try {
		await assert.rejects(
			client.request("Unanswered", {}, undefined, 15),
			/timed out/,
		);
		const pending = client.request("Disconnected", {}, undefined, 1000);
		socket!.terminate();
		await assert.rejects(pending, /disconnected|connection failed/);
	} finally {
		client.close();
		await fixture.close();
	}
});
test("endpoint validation keeps browser control local", () => {
	assert.equal(localEndpoint("9222").host, "127.0.0.1:9222");
	for (const endpoint of [
		"ws://example.com/",
		"https://localhost/",
		"ws://user:secret@localhost/",
		"file:///tmp/socket",
	])
		assert.throws(() => localEndpoint(endpoint), /loopback/);
});
test("automatic discovery validates DevToolsActivePort without modifying it", async () => {
	const dir = await mkdtemp(join(tmpdir(), "browser-tabs-discovery-"));
	try {
		const file = join(dir, "DevToolsActivePort");
		await writeFile(file, "9222\n/devtools/browser/abc-123\n");
		assert.equal(
			await discoverEndpoint(dir),
			"ws://127.0.0.1:9222/devtools/browser/abc-123",
		);
		await writeFile(file, "99999\n/devtools/browser/abc\n");
		await assert.rejects(discoverEndpoint(dir), /Invalid/);
	} finally {
		await rm(dir, { recursive: true });
	}
});
test("unreachable HTTP endpoints explain that --cdp does not enable debugging", async (context) => {
	const cause = new TypeError("fetch failed");
	context.mock.method(globalThis, "fetch", async () => {
		throw cause;
	});
	await assert.rejects(CdpClient.connect("9222"), (error: unknown) => {
		assert.ok(error instanceof Error);
		assert.match(
			error.message,
			/Cannot reach CDP at http:\/\/127\.0\.0\.1:9222/,
		);
		assert.match(error.message, /does not enable debugging/);
		assert.equal(error.cause, cause);
		return true;
	});
});
