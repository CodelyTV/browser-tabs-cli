import { readFile } from "node:fs/promises";
import type { Command, Connection } from "../../domain/command.js";
import { CdpClient } from "../../transport/cdp.js";
import { discoverEndpoint } from "./discovery.js";
interface Evaluation {
  result: { value?: unknown };
  exceptionDetails?: { text: string; exception?: { description?: string } };
}
const origin = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/";
export async function connectVivaldi(
  endpoint: string,
  runtimeFile = new URL("./vivaldi-runtime.js", import.meta.url),
): Promise<Connection> {
  const source = await readFile(runtimeFile, "utf8");
  const cdp = await CdpClient.connect(
    endpoint === "auto" ? await discoverEndpoint() : endpoint,
  );
  try {
    const { targetInfos } = await cdp.request<{
      targetInfos: { targetId: string; type: string; url: string }[];
    }>("Target.getTargets", { filter: [{}] });
    for (const target of targetInfos.filter((candidate) =>
      candidate.url.startsWith(origin),
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
              "Boolean(globalThis.chrome?.tabs && globalThis.chrome?.windows && globalThis.vivaldi?.tabsPrivate?.move && globalThis.vivaldi?.tabsPrivate?.setGroupProperties)",
            returnByValue: true,
          },
          sessionId,
        );
        if (probe.result.value === true) {
          const attached = sessionId;
          return {
            async execute(command: Command) {
              const verifyAfterMs =
                "verifyAfterMs" in command ? (command.verifyAfterMs ?? 0) : 0;
              const result = await cdp.request<Evaluation>(
                "Runtime.evaluate",
                {
                  expression: `(() => {\n${source}\nreturn BrowserTabsRuntime.run(${JSON.stringify(command)});\n})()`,
                  awaitPromise: true,
                  returnByValue: true,
                },
                attached,
                Math.max(60_000, verifyAfterMs + 30_000),
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
        }
      } catch {
        /* Some UI targets disappear or do not support Runtime.evaluate. */
      }
      if (sessionId)
        await cdp
          .request("Target.detachFromTarget", { sessionId })
          .catch(() => undefined);
    }
    throw new Error(
      "CDP is reachable, but Vivaldi's privileged UI is unavailable. No tabs were changed. See docs/vivaldi.md.",
    );
  } catch (error) {
    cdp.close();
    throw error;
  }
}
