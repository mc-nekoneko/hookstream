#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { HookstreamClient } from "./api.js";
import type { SignatureAlgorithm } from "./types.js";

const program = new Command();

program
  .name("hookstream")
  .description("CLI for managing hookstream channels")
  .option(
    "-u, --url <url>",
    "Hookstream Worker URL",
    process.env.HOOKSTREAM_URL,
  )
  .option(
    "-k, --admin-key <key>",
    "Admin API key",
    process.env.HOOKSTREAM_ADMIN_KEY,
  );

function getClient(): HookstreamClient {
  const opts = program.opts<{ url?: string; adminKey?: string }>();
  if (!opts.url) {
    console.error(
      "Error: Worker URL is required (--url or HOOKSTREAM_URL env)",
    );
    process.exit(1);
  }
  if (!opts.adminKey) {
    console.error(
      "Error: Admin key is required (--admin-key or HOOKSTREAM_ADMIN_KEY env)",
    );
    process.exit(1);
  }
  return new HookstreamClient(opts.url.replace(/\/$/, ""), opts.adminKey);
}

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

program.parse();
