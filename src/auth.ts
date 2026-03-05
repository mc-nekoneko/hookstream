/**
 * Verify GitHub-style HMAC-SHA256 webhook signature.
 * Header: X-Hub-Signature-256: sha256=<hex>
 */
export async function verifySignature(
  body: string,
  secret: string,
  sigHeader: string | null,
): Promise<boolean> {
  if (!sigHeader) return false;
  const prefix = "sha256=";
  if (!sigHeader.startsWith(prefix)) return false;
  const expected = sigHeader.slice(prefix.length);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Extract token from Authorization header or ?token= query param */
export function extractToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return new URL(request.url).searchParams.get("token");
}
