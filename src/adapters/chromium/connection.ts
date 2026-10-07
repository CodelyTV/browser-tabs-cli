import { readFile } from "node:fs/promises";
import type { Command, Connection } from "../../domain/command.js";
import { CdpClient } from "../../transport/cdp.js";
import { basicConnection } from "./basic.js";
import { type ChromiumName, discoverChromiumEndpoint } from "./discovery.js";

interface Evaluation {
	result: { value?: unknown };
	exceptionDetails?: { text: string; exception?: { description?: string } };
}
export async function connectChromium(
	browser: ChromiumName,
	endpoint: string,
	runtimeFile = new URL("./chromium-extension/runtime.js", import.meta.url),
): Promise<Connection> {
	const cdp = await CdpClient.connect(
		endpoint === "auto" ? await discoverChromiumEndpoint(browser) : endpoint,
	);
	try {
		const { targetInfos } = await cdp.request<{
			targetInfos: { targetId: string; type: string; url: string }[];
		}>("Target.getTargets", { filter: [{}] });
		let attached: string | undefined;
		for (const target of targetInfos.filter(
			(candidate) =>
				candidate.type === "page" &&
				/^chrome-extension:\/\/[a-p]{32}\/browser-tabs\.html$/.test(
					candidate.url,
				),
		)) {
			let sessionId: string | undefined;
			try {
				({ sessionId } = await cdp.request<{ sessionId: string }>(
					"Target.attachToTarget",
					{ targetId: target.targetId, flatten: true },
				));
				const probe = await cdp.request<Evaluation>(
					"Runtime.evaluate",
					{
						expression:
							'Boolean(globalThis.chrome?.runtime?.getManifest?.().name === "Browser Tabs CLI" && globalThis.chrome?.tabs?.group && globalThis.chrome?.windows && globalThis.chrome?.tabGroups && globalThis.chrome?.storage?.session)',
						returnByValue: true,
					},
					sessionId,
				);
				if (probe.result.value === true) {
					attached = sessionId;
					break;
				}
			} catch {
				/* Extension pages may close while attaching. */
			}
			if (sessionId)
				await cdp
					.request("Target.detachFromTarget", { sessionId })
					.catch(() => undefined);
		}
		if (!attached) return basicConnection(cdp);
		// Use the CLI's runtime even if the installed page has no script or an older one.
		// Read outside the probe catch so packaging failures are never silently downgraded.
		const source = await readFile(runtimeFile, "utf8");
		return {
			capabilities: {
				mode: "chromium-extension",
				groups: true,
				batches: true,
				tabNames: false,
			},
			async execute(command: Command) {
				const delay =
					"verifyAfterMs" in command ? (command.verifyAfterMs ?? 0) : 0;
				const result = await cdp.request<Evaluation>(
					"Runtime.evaluate",
					{
						expression: `(() => {\n${source}\nreturn BrowserTabsRuntime.run(${JSON.stringify(command)});\n})()`,
						awaitPromise: true,
						returnByValue: true,
					},
					attached,
					Math.max(60_000, delay + 30_000),
				);
				if (result.exceptionDetails)
					throw new Error(
						result.exceptionDetails.exception?.description ??
							result.exceptionDetails.text,
					);
				return result.result.value;
			},
			close: () => cdp.close(),
		};
	} catch (error) {
		cdp.close();
		throw error;
	}
}
