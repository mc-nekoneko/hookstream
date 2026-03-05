import type { ChannelConfig, SignatureConfig } from "./types";

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
    if (!id || !/^[a-z0-9_-]{1,64}$/.test(id)) {
      return json({ error: "Invalid channel id (a-z0-9_- max 64)" }, 400);
    }
    const existing = await env.CHANNELS_KV.get(kvKey(id));
    if (existing) return json({ error: "Channel already exists" }, 409);

    // Validate signature config if provided
    let signature: SignatureConfig | undefined;
    if (body.signature) {
      const { header, algorithm, prefix, secret } = body.signature;
      if (!header || !algorithm || !secret) {
        return json(
          { error: "signature requires: header, algorithm, secret" },
          400,
        );
      }
      if (
        algorithm !== "hmac-sha256-hex" &&
        algorithm !== "hmac-sha256-base64"
      ) {
        return json(
          {
            error:
              "signature.algorithm must be 'hmac-sha256-hex' or 'hmac-sha256-base64'",
          },
          400,
        );
      }
      signature = { header, algorithm, prefix, secret };
    }

    const config: ChannelConfig = {
      id,
      signature,
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
      list.keys.map(async (k: { name: string }) => {
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
