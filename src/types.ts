export type Env = {
  CHANNEL: DurableObjectNamespace;
  CHANNELS_KV: KVNamespace;
  ADMIN_KEY: string;
};

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
