import { connect } from "../adapters/connect.js";
import { run } from "./run.js";
const started = performance.now();
try {
  const result = await run(process.argv.slice(2), connect);
  process.stdout.write(
    result.text ??
      `${JSON.stringify({ ok: result.exitCode === 0, data: result.data, elapsedMs: Math.round(performance.now() - started) })}\n`,
  );
  process.exitCode = result.exitCode;
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
}
