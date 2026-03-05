import type { SignatureAlgorithm } from "./types";

/**
 * Verify an HMAC-SHA256 webhook signature.
 *
 * Supports two encoding formats:
 *   - "hmac-sha256-hex"    → hex digest, e.g. GitHub's "sha256=<hex>"
 *   - "hmac-sha256-base64" → base64 digest, e.g. Shopify's raw base64
 *
 * @param body      Raw request body string
 * @param secret    HMAC secret
 * @param sigHeader Value of the signature header (e.g. "sha256=abc123")
 * @param algorithm Digest encoding (default: "hmac-sha256-hex")
 * @param prefix    Optional prefix to strip before comparing (default: "")
 */
export async function verifySignature(
  body: string,
  secret: string,
  sigHeader: string | null,
  algorithm: SignatureAlgorithm = "hmac-sha256-hex",
  prefix = "",
): Promise<boolean> {
  if (!sigHeader) return false;
  if (prefix && !sigHeader.startsWith(prefix)) return false;

  const expected = prefix ? sigHeader.slice(prefix.length) : sigHeader;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

  const actual =
    algorithm === "hmac-sha256-hex"
      ? Array.from(new Uint8Array(sigBytes))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Timing-safe comparison
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Extract token from Authorization header or ?token= query param */
export function extractToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return new URL(request.url).searchParams.get("token");
}
