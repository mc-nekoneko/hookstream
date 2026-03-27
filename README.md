# hookstream

**A generic webhook → SSE relay running on Cloudflare Workers.**

Receive webhooks from any source (GitHub, Stripe, etc.) and stream them in real time to browsers or internal clients via [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), without exposing your internal services to the internet.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mc-nekoneko/hookstream)

## CLI

The official CLI is available on npm:

```bash
npm install -g @mcnekoneko/hookstream-cli
```

Use it to configure your worker, create channels, subscribe to SSE streams, and test webhook delivery from your terminal.

- Package: [`@mcnekoneko/hookstream-cli`](https://www.npmjs.com/package/@mcnekoneko/hookstream-cli)
- CLI docs: [`cli/README.md`](./cli/README.md)

---

## Why hookstream?

Webhooks require a **publicly accessible endpoint** to receive events. But what if:

- Your app or service is on a **private network or VPN** that can't receive inbound webhooks
- You're developing locally and want **live webhooks on `localhost`** without ngrok
- You want **multiple clients to subscribe** to the same event stream simultaneously

hookstream solves this by acting as a relay: it receives webhooks on a public Cloudflare Workers endpoint and fans them out to connected SSE clients over a persistent HTTP stream.

```
GitHub / Stripe / any webhook source
         │
         │  POST /{channel}
         ▼
  Cloudflare Worker  ──────────────────────────────────────┐
  (hookstream)                                              │
         │                                                  │
         │  Durable Object broadcast                        │
         ▼                                                  │
  ┌─────────────────────────┐    GET /{channel}/events      │
  │   Channel DO             │ ◄─────────────────────────── │
  │  (connection manager +   │                              │
  │   event ring buffer)     │    Browser / Internal        │
  └─────────────────────────┘    service / localhost        │
```

**Built on Cloudflare Workers + [Durable Objects](https://developers.cloudflare.com/durable-objects/)** — no server to maintain, globally distributed, scales automatically.

---

## Use Cases

### 🔒 Webhook relay for private networks
Forward webhooks from public services (GitHub, Stripe, etc.) to services running inside a VPN or private network — without opening any inbound ports or exposing internal endpoints to the internet.

```
GitHub ──POST──► hookstream (public CF Worker)
                      │
                      │  SSE
                      ▼
              Internal service (VPN / LAN)
```

### 🧪 Local development & testing
Receive live webhooks on `localhost` during development, without ngrok or port forwarding. Subscribe to hookstream from your local machine and get real webhook payloads instantly.

```bash
# Subscribe in your terminal or app
curl -N "https://your-worker.workers.dev/my-channel/events?token=xxx"
```

### 📡 Multi-subscriber fan-out
Broadcast a single webhook to multiple connected clients simultaneously. All subscribers on the same channel receive every event in real time — useful for triggering updates across multiple services or windows at once.

---

## Quick Start

### 1. Deploy

Click the **Deploy to Cloudflare Workers** button above, or deploy manually:

```bash
git clone https://github.com/mc-nekoneko/hookstream
cd hookstream
npm install

# Create KV namespace for channel config storage
npx wrangler kv namespace create CHANNELS_KV
# → Copy the returned id into wrangler.toml

# Set admin key (protects channel management API)
npx wrangler secret put ADMIN_KEY

# Deploy
npm run deploy
```

### 2. Create a channel

#### Option A: use the CLI (recommended)

```bash
# Configure your worker URL and admin key once
hookstream configure

# Create a channel
hookstream channels create \
  --id my-channel \
  --token your-sse-token \
  --event-header X-Event-Type \
  --max-history 50 \
  --sig-header X-Webhook-Signature \
  --sig-algorithm hmac-sha256-hex \
  --sig-secret your-webhook-secret \
  --sig-prefix sha256=
```

You can also inspect or test channels from the terminal:

```bash
hookstream channels list
hookstream channels subscribe my-channel --token your-sse-token
hookstream channels test my-channel --token your-sse-token
```

#### Option B: call the Admin API directly

```bash
curl -X POST https://your-worker.workers.dev/admin/channels \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-channel",
    "signature": {
      "header": "X-Webhook-Signature",
      "algorithm": "hmac-sha256-hex",
      "prefix": "sha256=",
      "secret": "your-webhook-secret"
    },
    "eventHeader": "X-Event-Type",
    "token": "your-sse-token",
    "maxHistory": 50
  }'
```

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Channel name (`a-z0-9-_`, max 64 chars) |
| `signature` | — | Signature verification config (see below). If omitted, all POST requests are accepted. |
| `token` | — | Bearer token for SSE access. If omitted, the SSE endpoint is public. |
| `eventHeader` | — | Header to read the event type from (e.g. `"X-GitHub-Event"`). If omitted, all events are delivered as `"message"`. |
| `maxHistory` | — | Number of events to replay on reconnect (default: `50`) |

#### `signature` object

| Field | Required | Description |
|---|---|---|
| `header` | ✅ | Request header to read the signature from |
| `algorithm` | ✅ | `"hmac-sha256-hex"` or `"hmac-sha256-base64"` |
| `secret` | ✅ | HMAC secret |
| `prefix` | — | Prefix to strip before comparing (e.g. `"sha256="`) |

**Provider examples:**

```jsonc
// GitHub / GitLab / Bitbucket
{ "header": "X-Hub-Signature-256", "algorithm": "hmac-sha256-hex", "prefix": "sha256=", "secret": "..." }

// Shopify
{ "header": "X-Shopify-Hmac-Sha256", "algorithm": "hmac-sha256-base64", "secret": "..." }
```

### 3. Configure your webhook source

Point your webhook source to:

```
POST https://your-worker.workers.dev/my-channel
Content-Type: application/json
```

Set the webhook secret on your provider to match `signature.secret`.

### 4. Subscribe (browser / EventSource)

If you want to inspect events from the terminal first, you can also use:

```bash
hookstream channels subscribe my-channel --token your-sse-token
```


```js
const es = new EventSource(
  'https://your-worker.workers.dev/my-channel/events?token=your-sse-token'
);

// With eventHeader configured: listen by event type (value of the configured header)
es.addEventListener('order.created', e => {
  const event = JSON.parse(e.data);
  console.log('New order:', event.payload);
});

es.addEventListener('payment.succeeded', e => {
  const event = JSON.parse(e.data);
  console.log('Payment:', event.payload);
});

// Without eventHeader (default): all events arrive as "message"
es.addEventListener('message', e => {
  const event = JSON.parse(e.data);
  console.log('Event received:', event.payload);
});
```

---

## Event Schema

Every SSE message carries the following JSON payload:

```ts
{
  id: string        // UUID, usable as Last-Event-ID for reconnect replay
  channel: string   // Channel name
  event: string     // Event type (value of eventHeader if configured, otherwise "message")
  timestamp: string // ISO 8601
  source?: string   // User-Agent of the webhook sender
  payload: unknown  // Original webhook body (parsed JSON or raw string)
}
```

SSE wire format:
```
id: <uuid>
event: order.created
data: {"id":"...","channel":"my-channel","event":"order.created","timestamp":"...","payload":{...}}

```

**Reconnect support**: hookstream keeps a ring buffer of recent events per channel. If a client reconnects with a `Last-Event-ID` header, it will receive any missed events automatically.

---

## Admin API

All admin endpoints require `Authorization: Bearer <ADMIN_KEY>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/channels` | Create a channel |
| `GET` | `/admin/channels` | List all channels |
| `DELETE` | `/admin/channels/:id` | Delete a channel |

---

## Limitations

hookstream provides **best-effort delivery** and is not a guaranteed message queue. Be aware of the following constraints:

### Connection drops
Cloudflare may evict a Durable Object instance after a period of inactivity, or during infrastructure events (e.g. restarts, geographic migration). When this happens, all active SSE connections on that channel are dropped.

Browsers using the native `EventSource` API will **automatically reconnect** and send a `Last-Event-ID` header. hookstream will replay missed events from its in-memory ring buffer if the DO instance is still alive. However, if the DO was evicted and restarted, the ring buffer is empty and replay is not possible.

For resilient clients, implement reconnect logic and treat missed events as a known edge case.

### Event loss during eviction
Events received while the Durable Object is between eviction and reconnection may be lost. This is an inherent trade-off of Cloudflare's serverless execution model.

### In-memory history only
The ring buffer (`maxHistory`) is held in the DO's memory and is **not persisted**. A DO restart clears the history entirely.

---

## Requirements

- Cloudflare Workers **Paid plan** (required for Durable Objects)
- Node.js 22+

---

## License

[MIT](./LICENSE)
