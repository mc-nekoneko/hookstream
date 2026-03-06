import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const CONFIG_DIR = join(homedir(), ".config", "hookstream-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type Profile = {
  url: string;
  adminKey: string;
};

export type Config = Record<string, Profile>;

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getProfile(name = "default"): Profile | undefined {
  return loadConfig()[name];
}

export async function runConfigure(profileName = "default"): Promise<void> {
  const config = loadConfig();
  const existing = config[profileName];

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(
    profileName === "default"
      ? "Configure hookstream CLI (default profile)"
      : `Configure hookstream CLI (profile: ${profileName})`,
  );

  const url = await rl.question(
    `Worker URL${existing?.url ? ` [${existing.url}]` : ""}: `,
  );
  const adminKey = await rl.question(
    `Admin key${existing?.adminKey ? " [****]" : ""}: `,
  );

  rl.close();

  config[profileName] = {
    url: url.trim() || existing?.url || "",
    adminKey: adminKey.trim() || existing?.adminKey || "",
  };

  if (!config[profileName].url || !config[profileName].adminKey) {
    console.error("Error: URL and admin key are required.");
    process.exit(1);
  }

  saveConfig(config);
  console.log(`\nSaved profile '${profileName}' to ${CONFIG_FILE}`);
}
