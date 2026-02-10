import WebSocket from "ws";
import { WS_BASE_URL } from "./context.js";
import { log } from "./log.js";

export interface StreamChatOptions {
  token: string;
  chatId: number;
  prompt: string;
  timeoutMs?: number;
  onDelta?: (delta: string, toolName?: string) => void;
}

export interface StreamChatResult {
  sessionId?: string;
  updatedFiles: boolean;
  costUsd?: number;
  durationMs?: number;
}

/**
 * Connect to the backend WebSocket, send a chat:stream message,
 * and stream deltas until chat:response:end or error/timeout.
 */
export function streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
  const { token, chatId, prompt, timeoutMs = 600_000, onDelta } = opts;

  return new Promise((resolve, reject) => {
    const url = `${WS_BASE_URL}/ws?token=${token}`;
    const ws = new WebSocket(url);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      ws.close();
      fn();
    }

    timer = setTimeout(() => {
      settle(() => reject(new Error(`streamChat timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    ws.on("open", () => {
      // Wait for the "connected" welcome message before sending
    });

    ws.on("message", (data) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // ignore non-JSON
      }

      switch (msg.type) {
        case "connected":
          // Server acknowledged connection, now send the prompt
          ws.send(JSON.stringify({ type: "chat:stream", chatId, prompt }));
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "chat:response:delta":
          if (onDelta && typeof msg.delta === "string") {
            onDelta(msg.delta, msg.toolName as string | undefined);
          }
          break;

        case "chat:response:end":
          settle(() =>
            resolve({
              sessionId: msg.sessionId as string | undefined,
              updatedFiles: (msg.updatedFiles as boolean) ?? false,
              costUsd: msg.costUsd as number | undefined,
              durationMs: msg.durationMs as number | undefined,
            }),
          );
          break;

        case "chat:response:error":
          settle(() =>
            reject(new Error(`chat:response:error: ${msg.error ?? "unknown"}`)),
          );
          break;

        // Ignore other message types (chat:response:chunk, chat:title:update, etc.)
      }
    });

    ws.on("error", (err) => {
      settle(() => reject(err));
    });

    ws.on("close", (code, reason) => {
      settle(() =>
        reject(
          new Error(
            `WebSocket closed unexpectedly: code=${code} reason=${reason?.toString()}`,
          ),
        ),
      );
    });
  });
}

// --- CLI mode ---
// Usage: bun run sandbox/lib/ws-chat.ts --token X --chat-id N --prompt "..."
if (import.meta.main) {
  const args = process.argv.slice(2);

  function getArg(name: string): string {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length) {
      console.error(`Missing required argument: ${name}`);
      console.error(
        'Usage: bun run sandbox/lib/ws-chat.ts --token X --chat-id N --prompt "..."',
      );
      process.exit(1);
    }
    return args[idx + 1];
  }

  const token = getArg("--token");
  const chatId = Number.parseInt(getArg("--chat-id"), 10);
  const prompt = getArg("--prompt");

  log("info", `Streaming chat ${chatId}: "${prompt.slice(0, 80)}..."`);

  try {
    const result = await streamChat({
      token,
      chatId,
      prompt,
      onDelta: (d) => process.stdout.write(d),
    });
    process.stdout.write("\n");
    console.error(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(
      `\nError: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
