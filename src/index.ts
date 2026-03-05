import { handleAdmin } from "./admin";
import { extractToken, verifySignature } from "./auth";
import type { ChannelConfig, RelayEvent } from "./types";

export { Channel } from "./channel";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getChannelConfig(
  env: Env,
  channelId: string,
): Promise<ChannelConfig | null> {
  const v = await env.CHANNELS_KV.get(`channel:${channelId}`);
  return v ? (JSON.parse(v) as ChannelConfig) : null;
}

function getChannelDO(env: Env, channelId: string): DurableObjectStub {
  const id = env.CHANNEL.idFromName(channelId);
  return env.CHANNEL.get(id);
}

// ─── POST /{channel} — receive webhook ───────────────────────────────────────
async function handleWebhook(
  request: Request,
  channelId: string,
  env: Env,
): Promise<Response> {
  const config = await getChannelConfig(env, channelId);
  if (!config) return json({ error: "Channel not found" }, 404);

  const body = await request.text();

  // Verify signature if configured
  if (config.signature) {
    const { header, secret, algorithm, prefix } = config.signature;
    const sigHeader = request.headers.get(header);
    const valid = await verifySignature(
      body,
      secret,
      sigHeader,
      algorithm,
      prefix,
    );
    if (!valid) return json({ error: "Invalid signature" }, 401);
  }

  // Detect event type from common webhook headers
  const event =
    request.headers.get("X-GitHub-Event") ??
    request.headers.get("X-Gitlab-Event") ??
    request.headers.get("X-Event-Key") ??
    "message";

  // Build relay event
  const relayEvent: RelayEvent = {
    id: crypto.randomUUID(),
    channel: channelId,
    event,
    timestamp: new Date().toISOString(),
    source: request.headers.get("User-Agent") ?? undefined,
    payload: (() => {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    })(),
  };

  // Forward to DO for broadcast
  const stub = getChannelDO(env, channelId);
  await stub.fetch("https://do/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(relayEvent),
  });

  return json({ ok: true, id: relayEvent.id });
}

// ─── GET /{channel}/events — SSE subscribe ────────────────────────────────────
async function handleSubscribe(
  request: Request,
  channelId: string,
  env: Env,
): Promise<Response> {
  const config = await getChannelConfig(env, channelId);
  if (!config) return json({ error: "Channel not found" }, 404);

  // Check token if configured
  if (config.token) {
    const token = extractToken(request);
    if (token !== config.token) return json({ error: "Unauthorized" }, 401);
  }

  // Delegate to DO — it returns a streaming SSE response
  const stub = getChannelDO(env, channelId);
  return stub.fetch("https://do/subscribe", {
    method: "GET",
    headers: {
      "Last-Event-ID": request.headers.get("Last-Event-ID") ?? "",
    },
  });
}

// ─── Main router ──────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // /admin/*
    if (parts[0] === "admin") {
      return handleAdmin(request, env);
    }

    // POST /{channel}
    if (request.method === "POST" && parts.length === 1 && parts[0]) {
      return handleWebhook(request, parts[0], env);
    }

    // GET /{channel}/events
    if (
      request.method === "GET" &&
      parts.length === 2 &&
      parts[1] === "events" &&
      parts[0]
    ) {
      return handleSubscribe(request, parts[0], env);
    }

    // Health check
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    return json({ error: "Not Found" }, 404);
  },
} satisfies ExportedHandler<Env>;
