interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
export function localEndpoint(input: string): URL {
  const url = new URL(
    /^\d+$/.test(input) ? `http://127.0.0.1:${input}` : input,
  );
  if (
    !["http:", "ws:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("CDP must use a loopback HTTP or WebSocket endpoint.");
  return url;
}
export class CdpClient {
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      let reply: { id?: number; result?: unknown; error?: { message: string } };
      try {
        reply = JSON.parse(String(event.data));
      } catch {
        this.fail(new Error("Malformed CDP response."));
        return;
      }
      if (reply.id === undefined) return;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error.message));
      else pending.resolve(reply.result);
    });
    socket.addEventListener("close", () =>
      this.fail(
        new Error("CDP disconnected. Inspect partial changes before retrying."),
      ),
    );
    socket.addEventListener("error", () =>
      this.fail(
        new Error(
          "CDP connection failed. Inspect partial changes before retrying.",
        ),
      ),
    );
  }
  static async connect(endpoint: string, connectTimeoutMs = 60_000) {
    let url = localEndpoint(endpoint);
    if (url.protocol === "http:") {
      let response: Response;
      try {
        response = await fetch(new URL("/json/version", url), {
          redirect: "error",
          signal: AbortSignal.timeout(3000),
        });
      } catch (error) {
        throw new Error(
          `Cannot reach CDP at ${url.origin}. Enable remote debugging in the intended browser and check the endpoint. --cdp selects an existing endpoint; it does not enable debugging.`,
          { cause: error },
        );
      }
      if (!response.ok)
        throw new Error(`CDP discovery returned HTTP ${response.status}.`);
      const info = (await response.json()) as { webSocketDebuggerUrl?: string };
      if (!info.webSocketDebuggerUrl)
        throw new Error("Missing browser WebSocket endpoint.");
      url = localEndpoint(info.webSocketDebuggerUrl);
    }
    if (url.protocol !== "ws:")
      throw new Error("Discovery must return a WebSocket endpoint.");
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        socket.removeEventListener("open", opened);
        socket.removeEventListener("error", failed);
        socket.removeEventListener("close", closed);
        if (error) {
          socket.close();
          reject(error);
        } else resolve();
      };
      const opened = () => finish();
      const failed = () => finish(new Error("Cannot connect to CDP."));
      const closed = () => finish(new Error("CDP closed before connecting."));
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              "CDP connection timed out. Check the browser's debugging permission prompt.",
            ),
          ),
        connectTimeoutMs,
      );
      socket.addEventListener("open", opened);
      socket.addEventListener("error", failed);
      socket.addEventListener("close", closed);
    });
    return new CdpClient(socket);
  }
  request<T>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 60_000,
  ): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("CDP is not connected."));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "CDP request timed out. Inspect partial changes before retrying.",
          ),
        );
      }, timeoutMs);
      this.pending.set(id, {
        timer,
        resolve: (value) => resolve(value as T),
        reject,
      });
      try {
        this.socket.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private fail(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
  close() {
    this.fail(new Error("CDP connection closed."));
    this.socket.close();
  }
}
