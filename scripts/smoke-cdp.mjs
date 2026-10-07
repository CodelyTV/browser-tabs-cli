import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const stable = (tabs) =>
	tabs
		.map(({ id, windowId, url }) => ({ id, windowId, url }))
		.toSorted((a, b) => a.id.localeCompare(b.id));
const browser = process.env.BROWSER_TABS_BROWSER ?? "helium";
if (
	!process.env.BROWSER_TABS_CDP &&
	!process.env.BROWSER_TABS_DATA_DIR &&
	!process.env[`BROWSER_TABS_${browser.toUpperCase()}_DATA_DIR`]
)
	throw new Error(
		"Set the CDP endpoint or data directory of an isolated Chromium browser without the extension first.",
	);
const exec = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const run = async (...args) => {
	const { stdout } = await exec(
		process.execPath,
		[binary, "--browser", browser, ...args],
		{ timeout: 90_000 },
	);
	const result = JSON.parse(stdout);
	assert.equal(result.ok, true);
	return result.data;
};
const target = process.argv[2] ? ["--window", process.argv[2]] : [];
const before = await run("tab", "list", ...target);
assert.ok(
	before.length &&
		before.every(
			(tab) => typeof tab.id === "string" && tab.id.startsWith("cdp:"),
		),
	"This smoke test requires the basic connection without an extension page.",
);
const server = createServer((_request, response) => {
	response.setHeader("Content-Type", "text/html");
	response.end("<title>CDP smoke test</title>");
});
const sockets = new Set();
server.on("connection", (socket) => {
	sockets.add(socket);
	socket.on("close", () => sockets.delete(socket));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const created = [];
try {
	assert.equal((await run("doctor")).connected, true);
	assert.ok(
		(await run("windows")).some((window) => window.id === before[0].windowId),
	);
	for (const path of ["one", "two"]) {
		const tab = await run("tab", "open", `${base}/${path}`, ...target);
		created.push(tab.id);
		assert.equal(tab.windowId, before[0].windowId);
		assert.ok(tab.id.startsWith("cdp:"));
	}
	const listed = await run("tab", "list", ...target);
	for (const id of created)
		assert.ok(listed.some((tab) => tab.id === id && tab.url.startsWith(base)));
	await assert.rejects(run("group", "list", ...target), (error) =>
		/requires the Browser Tabs CLI extension/.test(error.stdout ?? ""),
	);
	await assert.rejects(
		run("tab", "open", `${base}/named`, "--name", "Name", ...target),
		(error) => /native custom tab names/.test(error.stdout ?? ""),
	);
	console.log(
		JSON.stringify(
			{
				passed: true,
				browser,
				mode: "basic-cdp",
				opened: created.length,
				operations:
					"doctor, windows, list, open, close, unsupported-operation errors",
			},
			null,
			2,
		),
	);
} catch (error) {
	console.error(error);
	throw error;
} finally {
	try {
		if (created.length)
			await run("tab", "close", "--tabs", created.join(","), ...target);
		const after = await run("tab", "list", ...target);
		assert.deepEqual(stable(after), stable(before));
	} finally {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	}
}
