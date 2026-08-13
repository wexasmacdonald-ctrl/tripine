import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/infrastructure/env";

export const microsoftScopes = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send", "Files.Read.All"];
export function createOAuthRequest() {
  if (!env.MICROSOFT_CLIENT_ID) throw new Error("Microsoft OAuth is not configured");
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirect = env.MICROSOFT_REDIRECT_URI ?? `${env.NEXT_PUBLIC_APP_URL}/api/connections/microsoft/callback`;
  const params = new URLSearchParams({ client_id: env.MICROSOFT_CLIENT_ID, response_type: "code", redirect_uri: redirect, response_mode: "query", scope: microsoftScopes.join(" "), state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
  return { url: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`, state, verifier };
}
export async function exchangeCode(code: string, verifier: string) {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) throw new Error("Microsoft OAuth is not configured");
  const redirect = env.MICROSOFT_REDIRECT_URI ?? `${env.NEXT_PUBLIC_APP_URL}/api/connections/microsoft/callback`;
  const response = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.MICROSOFT_CLIENT_ID, client_secret: env.MICROSOFT_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier, scope: microsoftScopes.join(" ") }), cache: "no-store" });
  if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status})`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>;
}
