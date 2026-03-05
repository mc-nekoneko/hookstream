import type { ChannelConfig, Env } from "./types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function kvKey(channelId: string): string {
  return `channel:${channelId}`;
}

export async function handleAdmin(
  request: Request,
  env: Env,
): Promise<Response> {
  // Auth check
  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${env.ADMIN_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/admin\//, "").split("/");

  // POST /admin/channels — create channel
  if (request.method === "POST" && parts[0] === "channels" && !parts[1]) {
    const body = await request.json<Partial<ChannelConfig>>();
    const id = body.id?.trim();
    if (!id || !/^[a-z0-9-_]{1,64}$/.test(id)) {
      return json({ error: "Invalid channel id (a-z0-9-_ max 64)" }, 400);
    }
    const existing = await env.CHANNELS_KV.get(kvKey(id));
    if (existing) return json({ error: "Channel already exists" }, 409);

    const config: ChannelConfig = {
      id,
      secret: body.secret,
      token: body.token,
      maxHistory: body.maxHistory ?? 50,
      createdAt: new Date().toISOString(),
    };
    await env.CHANNELS_KV.put(kvKey(id), JSON.stringify(config));
    return json(config, 201);
  }

  // GET /admin/channels — list channels
  if (request.method === "GET" && parts[0] === "channels" && !parts[1]) {
    const list = await env.CHANNELS_KV.list({ prefix: "channel:" });
    const channels = await Promise.all(
      list.keys.map(async (k) => {
        const v = await env.CHANNELS_KV.get(k.name);
        return v ? JSON.parse(v) : null;
      }),
    );
    return json(channels.filter(Boolean));
  }

  // DELETE /admin/channels/:id — delete channel
  if (request.method === "DELETE" && parts[0] === "channels" && parts[1]) {
    const id = parts[1];
    await env.CHANNELS_KV.delete(kvKey(id));
    return json({ deleted: id });
  }

  return json({ error: "Not Found" }, 404);
}
