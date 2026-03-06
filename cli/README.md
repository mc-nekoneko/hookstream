# hookstream CLI

CLI for managing [hookstream](https://github.com/mc-nekoneko/hookstream) channels.

## Installation

```bash
npm install -g hookstream-cli
```

Or run without installing:

```bash
npx hookstream-cli channels list
```

## Configuration

Set your Worker URL and Admin key via environment variables:

```bash
export HOOKSTREAM_URL=https://your-worker.workers.dev
export HOOKSTREAM_ADMIN_KEY=your-admin-key
```

Or pass them as flags on each command:

```bash
hookstream --url https://your-worker.workers.dev --admin-key your-key channels list
```

## Commands

### `channels list`

List all channels.

```bash
hookstream channels list
```

### `channels create`

Create a channel.

```bash
# Minimal (no auth)
hookstream channels create --id my-channel

# With SSE token
hookstream channels create --id my-channel --token sse-token

# With event type header
hookstream channels create --id my-channel --event-header X-Event-Type

# With signature verification
hookstream channels create \
  --id my-channel \
  --token sse-token \
  --event-header X-Event-Type \
  --max-history 100 \
  --sig-header X-Webhook-Signature \
  --sig-algorithm hmac-sha256-hex \
  --sig-secret my-secret \
  --sig-prefix sha256=
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--id <id>` | Channel ID (`a-z0-9_-`, max 64 chars) | required |
| `--token <token>` | Bearer token for SSE access. If omitted, SSE is public. | — |
| `--event-header <header>` | Header to read event type from. If omitted, all events are `"message"`. | — |
| `--max-history <n>` | Ring buffer size for reconnect replay | `50` |
| `--sig-header <header>` | Signature header name | — |
| `--sig-algorithm <alg>` | `hmac-sha256-hex` or `hmac-sha256-base64` | — |
| `--sig-secret <secret>` | HMAC secret | — |
| `--sig-prefix <prefix>` | Prefix to strip before comparing (e.g. `sha256=`) | — |

### `channels delete <id>`

Delete a channel.

```bash
hookstream channels delete my-channel
```

## Development

```bash
cd cli
npm install
npm run dev -- channels list   # run without building
npm run build                  # compile to dist/
```
