import type { Connection } from "../domain/command.js";
import { connectVivaldi } from "./vivaldi/connection.js";
export function connect(
  browser: string,
  endpoint: string,
): Promise<Connection> {
  if (browser === "vivaldi") return connectVivaldi(endpoint);
  throw new Error(
    `Unsupported browser: ${browser}. Available adapter: vivaldi.`,
  );
}
