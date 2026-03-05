# hookstream

Generic webhook → SSE relay on Cloudflare Workers + Durable Objects.

## How it works

```
Any webhook source
  POST /{channel}
      ↓
CF Worker (signature verification)
      ↓ Durable Object broadcast
 Channel DO ──── SSE ──→ Browser / client
              GET /{channel}/events
```

## Setup

```bash
npm install

# Create KV namespace
wrangler kv namespace create CHANNELS_KV
# → update wrangler.toml with the returned id

# Set admin key
wrangler secret put ADMIN_KEY

# Deploy
npm run deploy
```

## Usage

### Create a channel

```bash
curl -X POST https://hookstream.example.com/admin/channels \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-github",
    "secret": "your-webhook-secret",
    "token": "your-sse-token",
    "maxHistory": 50
  }'
```

### Set GitHub webhook

- URL: `https://hookstream.example.com/my-github`
- Content type: `application/json`
- Secret: same as `secret` above

### Subscribe (browser / EventSource)

```js
const es = new EventSource(
  'https://hookstream.example.com/my-github/events?token=your-sse-token'
);
es.addEventListener('push', e => console.log(JSON.parse(e.data)));
es.addEventListener('pull_request', e => console.log(JSON.parse(e.data)));
```

## Event schema

```ts
{
  id: string        // uuid
  channel: string
  event: string     // e.g. "push", "pull_request"
  timestamp: string
  source?: string   // User-Agent
  payload: unknown  // original webhook body
}
```

## Admin API

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/channels` | Create channel |
| `GET` | `/admin/channels` | List channels |
| `DELETE` | `/admin/channels/:id` | Delete channel |

All admin endpoints require `Authorization: Bearer <ADMIN_KEY>`.
