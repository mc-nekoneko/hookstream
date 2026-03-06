#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { HookstreamClient } from "./api.js";
import { getProfile, runConfigure } from "./config.js";
import type { SignatureAlgorithm } from "./types.js";

const program = new Command();

program
  .name("hookstream")
  .description("CLI for managing hookstream channels")
  .option("-p, --profile <name>", "Config profile to use", "default")
  .option("-u, --url <url>", "Worker URL (overrides profile)")
  .option("-k, --admin-key <key>", "Admin key (overrides profile)");

function getClient(): HookstreamClient {
  const opts = program.opts<{
    profile: string;
    url?: string;
    adminKey?: string;
  }>();

  // Priority: flag > env var > profile
  const url =
    opts.url ?? process.env.HOOKSTREAM_URL ?? getProfile(opts.profile)?.url;
  const adminKey =
    opts.adminKey ??
    process.env.HOOKSTREAM_ADMIN_KEY ??
    getProfile(opts.profile)?.adminKey;

  if (!url) {
    console.error(
      `Error: Worker URL is required.\n  Run: hookstream configure --profile ${opts.profile}`,
    );
    process.exit(1);
  }
  if (!adminKey) {
    console.error(
      `Error: Admin key is required.\n  Run: hookstream configure --profile ${opts.profile}`,
    );
    process.exit(1);
  }
  return new HookstreamClient(url.replace(/\/$/, ""), adminKey);
}

// ─── configure ───────────────────────────────────────────────────────────────
program
  .command("configure")
  .description("Save Worker URL and admin key to a config profile")
  .option("-p, --profile <name>", "Profile name to configure", "default")
  .action(async (opts: { profile: string }) => {
    await runConfigure(opts.profile);
  });

// ─── channels ────────────────────────────────────────────────────────────────
const channels = program.command("channels").description("Manage channels");

channels
  .command("list")
  .description("List all channels")
  .action(async () => {
    try {
      const client = getClient();
      const list = await client.listChannels();
      if (list.length === 0) {
        console.log("No channels found.");
        return;
      }
      for (const ch of list) {
        const sig = ch.signature
          ? ` sig:${ch.signature.algorithm}(${ch.signature.header})`
          : "";
        const tok = ch.token ? " token:✓" : "";
        const ev = ch.eventHeader ? ` event:${ch.eventHeader}` : "";
        console.log(
          `  ${ch.id.padEnd(24)} maxHistory:${ch.maxHistory}${sig}${tok}${ev}  [${ch.createdAt}]`,
        );
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

channels
  .command("create")
  .description("Create a channel")
  .requiredOption("--id <id>", "Channel ID (a-z0-9_-, max 64)")
  .option("--token <token>", "Bearer token for SSE access")
  .option("--event-header <header>", "Header to read event type from")
  .option(
    "--max-history <n>",
    "Ring buffer size for reconnect replay",
    (v) => {
      const n = parseInt(v, 10);
      if (Number.isNaN(n) || n < 1)
        throw new InvalidArgumentError("Must be a positive integer.");
      return n;
    },
    50,
  )
  .option("--sig-header <header>", "Signature header name")
  .option(
    "--sig-algorithm <alg>",
    "Signature algorithm (hmac-sha256-hex|hmac-sha256-base64)",
  )
  .option("--sig-secret <secret>", "HMAC secret")
  .option(
    "--sig-prefix <prefix>",
    "Prefix to strip before comparing (e.g. sha256=)",
  )
  .action(async (opts) => {
    try {
      const client = getClient();

      // Build signature config if provided
      let signature:
        | {
            header: string;
            algorithm: SignatureAlgorithm;
            secret: string;
            prefix?: string;
          }
        | undefined;

      if (opts.sigHeader || opts.sigAlgorithm || opts.sigSecret) {
        if (!opts.sigHeader || !opts.sigAlgorithm || !opts.sigSecret) {
          console.error(
            "Error: --sig-header, --sig-algorithm, and --sig-secret are all required when configuring signature verification.",
          );
          process.exit(1);
        }
        if (
          opts.sigAlgorithm !== "hmac-sha256-hex" &&
          opts.sigAlgorithm !== "hmac-sha256-base64"
        ) {
          console.error(
            "Error: --sig-algorithm must be 'hmac-sha256-hex' or 'hmac-sha256-base64'.",
          );
          process.exit(1);
        }
        signature = {
          header: opts.sigHeader,
          algorithm: opts.sigAlgorithm as SignatureAlgorithm,
          secret: opts.sigSecret,
          prefix: opts.sigPrefix,
        };
      }

      const ch = await client.createChannel({
        id: opts.id,
        token: opts.token,
        eventHeader: opts.eventHeader,
        maxHistory: opts.maxHistory as number,
        signature,
      });

      console.log(`Channel created: ${ch.id}`);
      console.log(JSON.stringify(ch, null, 2));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

channels
  .command("delete <id>")
  .description("Delete a channel")
  .action(async (id: string) => {
    try {
      const client = getClient();
      const result = await client.deleteChannel(id);
      console.log(`Deleted: ${result.deleted}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

channels
  .command("test <id>")
  .description(
    "End-to-end test: subscribe SSE → send test webhook → verify delivery",
  )
  .option("--token <token>", "Bearer token for SSE (if channel requires auth)")
  .option(
    "--timeout <ms>",
    "Timeout in milliseconds",
    (v) => {
      const n = parseInt(v, 10);
      if (Number.isNaN(n) || n < 1)
        throw new InvalidArgumentError("Must be a positive integer.");
      return n;
    },
    10_000,
  )
  .action(async (id: string, opts: { token?: string; timeout: number }) => {
    try {
      const client = getClient();
      console.log(`Testing channel: ${id}`);
      console.log(
        `  SSE:     ${program.opts().url ?? getProfile(program.opts().profile)?.url}/${id}/events`,
      );
      console.log(
        `  Webhook: ${program.opts().url ?? getProfile(program.opts().profile)?.url}/${id}`,
      );
      console.log();

      const result = await client.testChannel(id, {
        token: opts.token,
        timeoutMs: opts.timeout,
      });

      if (result.ok) {
        console.log(`✅ PASS`);
        console.log(`  Webhook POST:  HTTP ${result.webhookStatus}`);
        console.log(`  SSE received:  ${result.eventId}`);
        console.log(`  Round-trip:    ${result.roundTripMs}ms`);
      } else {
        console.log(`❌ FAIL`);
        if (result.webhookStatus)
          console.log(`  Webhook POST:  HTTP ${result.webhookStatus}`);
        console.log(`  Error:         ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
