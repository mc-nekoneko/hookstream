import type { RelayEvent } from "./types";

const KEEPALIVE_INTERVAL_MS = 15_000;
const DEFAULT_MAX_HISTORY = 50;

/**
 * Durable Object that manages SSE connections for a single channel.
 * One instance per channel name.
 */
export class Channel extends CloudflareWorkersModule.DurableObject<Env> {
  private connections = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private history: RelayEvent[] = [];
  private maxHistory = DEFAULT_MAX_HISTORY;
  private encoder = new TextEncoder();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Worker → DO: broadcast an event to all SSE clients
    if (request.method === "POST" && url.pathname === "/broadcast") {
      const event = await request.json<RelayEvent>();
      this.history.push(event);
      while (this.history.length > this.maxHistory) this.history.shift();
      await this.broadcast(event);
      return new Response("OK");
    }

    // Worker → DO: open an SSE subscription
    if (request.method === "GET" && url.pathname === "/subscribe") {
      const lastEventId = request.headers.get("Last-Event-ID");
      return this.handleSubscribe(lastEventId, request.signal);
    }

    return new Response("Not Found", { status: 404 });
  }

  private handleSubscribe(
    lastEventId: string | null,
    signal: AbortSignal,
  ): Response {
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();
    this.connections.add(writer);

    // Send missed events (Last-Event-ID replay)
    if (lastEventId) {
      const idx = this.history.findIndex((e) => e.id === lastEventId);
      const missed = idx >= 0 ? this.history.slice(idx + 1) : this.history;
      (async () => {
        for (const ev of missed) {
          await writer.write(this.encoder.encode(this.format(ev)));
        }
      })();
    }

    // Keepalive timer
    const timer = setInterval(async () => {
      try {
        await writer.write(this.encoder.encode(":keepalive\n\n"));
      } catch {
        clearInterval(timer);
        this.connections.delete(writer);
      }
    }, KEEPALIVE_INTERVAL_MS);

    // Cleanup on disconnect
    signal.addEventListener("abort", () => {
      clearInterval(timer);
      this.connections.delete(writer);
      writer.close().catch(() => {});
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  private async broadcast(event: RelayEvent): Promise<void> {
    const data = this.encoder.encode(this.format(event));
    const dead = new Set<WritableStreamDefaultWriter<Uint8Array>>();
    for (const writer of this.connections) {
      try {
        await writer.write(data);
      } catch {
        dead.add(writer);
      }
    }
    for (const w of dead) this.connections.delete(w);
  }

  private format(event: RelayEvent): string {
    return [
      `id: ${event.id}`,
      `event: ${event.event}`,
      `data: ${JSON.stringify(event)}`,
      "",
      "",
    ].join("\n");
  }
}
