// Extend the generated Env (worker-configuration.d.ts) with secrets
// (secrets are not in wrangler.toml, so wrangler types can't infer them)
declare global {
  interface Env {
    ADMIN_KEY: string;
  }
}

export type ChannelConfig = {
  id: string;
  secret?: string; // HMAC-SHA256 webhook signature secret (optional)
  token?: string; // SSE access token (optional = public)
  maxHistory: number; // ring buffer size for late-join replay
  createdAt: string;
};

export type RelayEvent = {
  id: string;
  channel: string;
  event: string; // e.g. "push", "pull_request"
  timestamp: string;
  source?: string;
  payload: unknown;
};
