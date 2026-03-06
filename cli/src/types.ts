export type SignatureAlgorithm = "hmac-sha256-hex" | "hmac-sha256-base64";

export type SignatureConfig = {
  header: string;
  algorithm: SignatureAlgorithm;
  prefix?: string;
  secret: string;
};

export type ChannelConfig = {
  id: string;
  signature?: Omit<SignatureConfig, "secret">; // secret is stripped in API responses
  token?: string;
  eventHeader?: string;
  maxHistory: number;
  createdAt: string;
};

export type RelayEvent = {
  id: string;
  channel: string;
  event: string;
  timestamp: string;
  source?: string;
  payload: unknown;
};
