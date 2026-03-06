// Extend the generated Env (worker-configuration.d.ts) with secrets
// (secrets are not in wrangler.toml, so wrangler types can't infer them)
declare global {
  interface Env {
    ADMIN_KEY: string;
  }
}

export type SignatureAlgorithm = "hmac-sha256-hex" | "hmac-sha256-base64";

/**
 * Signature verification config for incoming webhooks.
 *
 * Common provider examples:
 *
 * GitHub / GitLab / Bitbucket:
 *   { header: "X-Hub-Signature-256", algorithm: "hmac-sha256-hex", prefix: "sha256=", secret: "..." }
 *
 * Shopify:
 *   { header: "X-Shopify-Hmac-Sha256", algorithm: "hmac-sha256-base64", secret: "..." }
 *
 * Generic HMAC-SHA256 (hex, no prefix):
 *   { header: "X-My-Signature", algorithm: "hmac-sha256-hex", secret: "..." }
 */
export type SignatureConfig = {
  header: string;
  algorithm: SignatureAlgorithm;
  prefix?: string;
  secret: string;
};

export type ChannelConfig = {
  id: string;
  signature?: SignatureConfig; // if omitted, all incoming requests are accepted
  token?: string; // SSE access token (if omitted, SSE endpoint is public)
  eventHeader?: string; // header to read event type from (e.g. "X-GitHub-Event")
  maxHistory: number; // ring buffer size for late-join replay
  createdAt: string;
};

export type RelayEvent = {
  id: string;
  channel: string;
  event: string; // value of eventHeader if configured, otherwise "message"
  timestamp: string;
  source?: string;
  payload: unknown;
};
