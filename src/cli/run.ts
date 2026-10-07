import type { Connection } from "../domain/command.js";
import { help } from "./help.js";
import { parse } from "./parse.js";
export function statusCode(data: unknown): number {
  if (data && typeof data === "object") {
    if ("verified" in data && data.verified === false) return 1;
    if ("ready" in data && data.ready === false) return 2;
  }
  return 0;
}
export async function run(
  argv: string[],
  connect: (browser: string, endpoint: string) => Promise<Connection>,
) {
  const input = parse(argv);
  if (input.kind === "help") return { text: help, exitCode: 0 };
  if (input.kind === "validate") return { data: { valid: true }, exitCode: 0 };
  const connection = await connect(input.browser, input.endpoint);
  try {
    const result = await connection.execute(input.command);
    const data = input.doctor
      ? {
          connected: true,
          adapter: input.browser,
          windows: result,
          ...(connection.capabilities
            ? { capabilities: connection.capabilities }
            : {}),
        }
      : result;
    return { data, exitCode: statusCode(data) };
  } finally {
    connection.close();
  }
}
