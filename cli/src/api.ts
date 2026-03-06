import type { ChannelConfig, RelayEvent, SignatureAlgorithm } from "./types.js";

export type CreateChannelInput = {
  id: string;
  token?: string;
  eventHeader?: string;
  maxHistory?: number;
  signature?: {
    header: string;
    algorithm: SignatureAlgorithm;
    secret: string;
    prefix?: string;
  };
};

export type TestResult = {
  ok: boolean;
  channelId: string;
  webhookStatus: number;
  eventReceived: boolean;
  eventId?: string;
  roundTripMs?: number;
  error?: string;
};

export class HookstreamClient {
  constructor(
    private readonly url: string,
    private readonly adminKey: string,
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.adminKey}`,
      "Content-Type": "application/json",
    };
  }

  async listChannels(): Promise<ChannelConfig[]> {
    const res = await fetch(`${this.url}/admin/channels`, {
      headers: this.headers(),
    });
    const data = (await res.json()) as ChannelConfig[] | { error: string };
    if (!res.ok) throw new Error((data as { error: string }).error);
    return data as ChannelConfig[];
  }

  async createChannel(input: CreateChannelInput): Promise<ChannelConfig> {
    const res = await fetch(`${this.url}/admin/channels`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as ChannelConfig | { error: string };
    if (!res.ok) throw new Error((data as { error: string }).error);
    return data as ChannelConfig;
  }

  async deleteChannel(id: string): Promise<{ deleted: string }> {
    const res = await fetch(`${this.url}/admin/channels/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    const data = (await res.json()) as { deleted: string } | { error: string };
    if (!res.ok) throw new Error((data as { error: string }).error);
    return data as { deleted: string };
  }

  /**
   * End-to-end test: subscribe to SSE, send a test webhook, verify delivery.
   */
  async testChannel(
    channelId: string,
    opts: { token?: string; timeoutMs?: number } = {},
  ): Promise<TestResult> {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const testPayload = {
      _hookstream_test: true,
      ts: Date.now(),
      nonce: crypto.randomUUID(),
    };

    const sseUrl = `${this.url}/${channelId}/events`;
    const webhookUrl = `${this.url}/${channelId}`;

    // 1. Connect to SSE
    const sseHeaders: Record<string, string> = {};
    if (opts.token) sseHeaders.Authorization = `Bearer ${opts.token}`;

    const sseRes = await fetch(sseUrl, { headers: sseHeaders });
    if (!sseRes.ok) {
      return {
        ok: false,
        channelId,
        webhookStatus: 0,
        eventReceived: false,
        error: `SSE connect failed: HTTP ${sseRes.status}`,
      };
    }

    const reader = sseRes.body?.getReader();
    if (!reader) {
      return {
        ok: false,
        channelId,
        webhookStatus: 0,
        eventReceived: false,
        error: "SSE response has no readable body",
      };
    }

    const decoder = new TextDecoder();
    const startMs = Date.now();

    // 2. Send test webhook
    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    });

    if (!webhookRes.ok) {
      reader.cancel().catch(() => {});
      const body = await webhookRes.text().catch(() => "");
      return {
        ok: false,
        channelId,
        webhookStatus: webhookRes.status,
        eventReceived: false,
        error: `Webhook POST failed: HTTP ${webhookRes.status} ${body}`,
      };
    }

    const webhookData = (await webhookRes.json()) as {
      ok: boolean;
      id: string;
    };

    // 3. Read SSE stream until we see our test event or timeout
    let buffer = "";
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>(
        (resolve) =>
          setTimeout(
            () => resolve({ done: true, value: undefined }),
            remaining,
          ),
      );

      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
      if (done && !value) break;
      if (value) buffer += decoder.decode(value, { stream: true });

      // Parse SSE frames from buffer
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;

        try {
          const event = JSON.parse(dataLine.slice(6)) as RelayEvent;
          if (event.id === webhookData.id) {
            const roundTripMs = Date.now() - startMs;
            reader.cancel().catch(() => {});
            return {
              ok: true,
              channelId,
              webhookStatus: webhookRes.status,
              eventReceived: true,
              eventId: event.id,
              roundTripMs,
            };
          }
        } catch {
          // not our event, continue
        }
      }
    }

    reader.cancel().catch(() => {});
    return {
      ok: false,
      channelId,
      webhookStatus: webhookRes.status,
      eventReceived: false,
      error: `Timeout: event not received within ${timeoutMs}ms`,
    };
  }

  /**
   * Subscribe to a channel's SSE stream. Calls `onEvent` for each received
   * event. Returns when the stream closes or `signal` is aborted.
   */
  async subscribe(
    channelId: string,
    opts: {
      token?: string;
      lastEventId?: string;
      onEvent: (event: RelayEvent) => void;
      onKeepalive?: () => void;
      onError?: (error: Error) => void;
      signal?: AbortSignal;
    },
  ): Promise<void> {
    const sseUrl = `${this.url}/${channelId}/events`;
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.lastEventId) headers["Last-Event-ID"] = opts.lastEventId;

    const res = await fetch(sseUrl, { headers, signal: opts.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SSE connect failed: HTTP ${res.status} ${body}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("SSE response has no readable body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        if (opts.signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          // Keepalive
          if (frame.trim() === ":keepalive") {
            opts.onKeepalive?.();
            continue;
          }

          const dataLine = frame
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const event = JSON.parse(dataLine.slice(6)) as RelayEvent;
            opts.onEvent(event);
          } catch {
            // skip malformed frames
          }
        }
      }
    } catch (err) {
      if (opts.signal?.aborted) return;
      if (opts.onError) opts.onError(err as Error);
      else throw err;
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
