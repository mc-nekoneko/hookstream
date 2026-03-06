import type { ChannelConfig, SignatureAlgorithm } from "./types.js";

export type CreateChannelInput = {
  id: string;
  token?: string;
  eventHeader?: string;
  maxHistory?: number;
  signature?: {
    header: string;
    algorithm: SignatureAlgorithm;
    secret: string;
    prefix?: string;
  };
};

export class HookstreamClient {
  constructor(
    private readonly url: string,
    private readonly adminKey: string,
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.adminKey}`,
      "Content-Type": "application/json",
    };
  }

  async listChannels(): Promise<ChannelConfig[]> {
    const res = await fetch(`${this.url}/admin/channels`, {
      headers: this.headers(),
    });
    const data = (await res.json()) as ChannelConfig[] | { error: string };
    if (!res.ok) throw new Error((data as { error: string }).error);
    return data as ChannelConfig[];
  }

  async createChannel(input: CreateChannelInput): Promise<ChannelConfig> {
    const res = await fetch(`${this.url}/admin/channels`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as ChannelConfig | { error: string };
    if (!res.ok) throw new Error((data as { error: string }).error);
    return data as ChannelConfig;
  }

  async deleteChannel(id: string): Promise<{ deleted: string }> {
    const res = await fetch(`${this.url}/admin/channels/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    const data = (await res.json()) as { deleted: string } | { error: string };
    if (!res.ok) throw new Error((data as { error: string }).error);
    return data as { deleted: string };
  }
}
