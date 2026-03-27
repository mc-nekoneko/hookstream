# hookstream CLI

CLI for managing [hookstream](https://github.com/mc-nekoneko/hookstream) channels.

## Installation

```bash
npm install -g @mcnekoneko/hookstream-cli
```

After installation, the `hookstream` command is available anywhere in your terminal.

To uninstall:

```bash
npm uninstall -g @mcnekoneko/hookstream-cli
```

## Configuration

### Profile-based (recommended)

```bash
# Configure the default profile
hookstream configure

# Configure a named profile
hookstream configure --profile production
```

Credentials are saved to `~/.config/hookstream-cli/config.json`.

```bash
# Use default profile
hookstream channels list

# Use named profile
hookstream --profile production channels list
```

### Environment variables

```bash
export HOOKSTREAM_URL=https://your-worker.workers.dev
export HOOKSTREAM_ADMIN_KEY=your-admin-key
```

### Inline flags

```bash
hookstream --url https://your-worker.workers.dev --admin-key your-key channels list
```

**Priority:** inline flags > environment variables > profile config

## Commands

### `configure`

Save Worker URL and admin key to a config profile.

```bash
hookstream configure                     # default profile
hookstream configure --profile staging   # named profile
```

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

### `channels test <id>`

Open an SSE subscription, send a test webhook, and verify it is received.

```bash
hookstream channels test my-channel
hookstream channels test my-channel --token sse-token --timeout 10
```

### `channels subscribe <id>`

Subscribe to channel events in real time.

```bash
hookstream channels subscribe my-channel
hookstream channels subscribe my-channel --token sse-token
hookstream channels subscribe my-channel --json | jq .
hookstream channels subscribe my-channel --last-event-id 42
```

## Releasing

The npm publish workflow lives at `.github/workflows/publish-cli.yml`.

Publishing flow:

1. Bump `cli/package.json` version
2. Commit and push to GitHub
3. Create and push a tag in the form `cli-vX.Y.Z`

```bash
git tag cli-v0.1.0
git push origin cli-v0.1.0
```

GitHub Actions will build the CLI and publish it to npm.

## Development

```bash
cd cli
npm install
npm run dev -- channels list   # run without building
npm run lint
npm run typecheck
npm run build
```
