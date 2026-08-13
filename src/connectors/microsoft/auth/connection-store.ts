import "server-only";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { decryptCredential, encryptCredential } from "@/infrastructure/encryption/credentials";
import { env } from "@/infrastructure/env";
import { microsoftScopes } from "./oauth";

export type MicrosoftCredential = { accessToken: string; refreshToken?: string; expiresAt: string };

export async function saveMicrosoftConnection(profile: { id: string; mail?: string; userPrincipalName: string }, token: { access_token: string; refresh_token?: string; expires_in: number; scope: string }) {
  const supabase = createAdminClient();
  const { data: org, error: orgError } = await supabase.from("organizations").select("id").eq("slug", env.DEMO_ORGANIZATION_SLUG).single();
  if (orgError || !org) throw new Error("Demo organization is not seeded");
  const expectedEmail = env.DEMO_AGENT_EMAIL?.toLowerCase();
  const accountAddress = (profile.mail ?? profile.userPrincipalName).toLowerCase();
  if (expectedEmail && accountAddress !== expectedEmail) throw new Error(`Sign in as the configured Alex mailbox (${expectedEmail})`);
  const { data: identity } = await supabase.from("party_identities").select("party_id").eq("organization_id", org.id).eq("channel", "email").eq("address", accountAddress).maybeSingle();
  let ownerPartyId = identity?.party_id as string | undefined;
  if (!ownerPartyId) {
    const { data: agent } = await supabase.from("agents").select("party_id").eq("organization_id", org.id).single();
    ownerPartyId = agent?.party_id;
    if (!ownerPartyId) throw new Error("Alex agent is not seeded");
    await supabase.from("party_identities").upsert({ organization_id: org.id, party_id: ownerPartyId, channel: "email", address: accountAddress, provider_object_id: profile.id, verified: true }, { onConflict: "organization_id,channel,address" });
  }
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const { data: connection, error } = await supabase.from("connections").upsert({ organization_id: org.id, owner_party_id: ownerPartyId, provider: "microsoft", auth_type: "oauth", owner_type: "service", status: "connected", capabilities: ["files.search","files.read","email.search","email.read","email.reply","email.replyAll","email.forward","email.send"], provider_account_id: profile.id, account_address: accountAddress, scopes: token.scope.split(" "), expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: "organization_id,provider,provider_account_id" }).select("id,organization_id,owner_party_id").single();
  if (error || !connection) throw new Error(`Could not store Microsoft connection: ${error?.message ?? "unknown"}`);
  const encrypted = encryptCredential({ accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt } satisfies MicrosoftCredential);
  const { error: credentialError } = await supabase.from("connection_credentials").upsert({ connection_id: connection.id, ...encrypted, updated_at: new Date().toISOString() });
  if (credentialError) throw new Error(`Could not store encrypted credentials: ${credentialError.message}`);
  return { ...connection, accountAddress };
}

export async function getValidMicrosoftToken(connectionId: string) {
  const supabase = createAdminClient();
  const { data: record, error } = await supabase.from("connection_credentials").select("ciphertext,iv,auth_tag").eq("connection_id", connectionId).single();
  if (error || !record) throw new Error("Microsoft credentials are unavailable");
  const credential = decryptCredential<MicrosoftCredential>(record);
  if (new Date(credential.expiresAt).getTime() > Date.now() + 120_000) return credential.accessToken;
  if (!credential.refreshToken || !env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) throw new Error("Microsoft connection requires reauthorization");
  const response = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.MICROSOFT_CLIENT_ID, client_secret: env.MICROSOFT_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: credential.refreshToken, scope: microsoftScopes.join(" ") }), cache: "no-store" });
  if (!response.ok) throw new Error("Microsoft token refresh failed");
  const refreshed = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const updated: MicrosoftCredential = { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token ?? credential.refreshToken, expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() };
  const encrypted = encryptCredential(updated);
  await supabase.from("connection_credentials").update({ ...encrypted, updated_at: new Date().toISOString() }).eq("connection_id", connectionId);
  await supabase.from("connections").update({ status: "connected", expires_at: updated.expiresAt, updated_at: new Date().toISOString() }).eq("id", connectionId);
  return updated.accessToken;
}
