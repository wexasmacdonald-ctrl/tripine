import { env, isPersistenceConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { configuredModelProvider, isModelConfigured } from "@/agent/models/client";

export async function GET() {
  if (!isPersistenceConfigured) return Response.json({ ready: false, mode: "demo", modelProvider: configuredModelProvider(), checks: { supabase: false, model: isModelConfigured(), microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET), encryption: Boolean(env.CREDENTIAL_ENCRYPTION_KEY), jobs: Boolean(env.INTERNAL_JOB_SECRET && (env.CRON_SECRET || env.INTERNAL_JOB_SECRET)) } });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,party_id,role").eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: agents }, { data: identities }, { data: connections }, { data: subscriptions }, { count: failedDeliveries }] = await Promise.all([
    admin.from("agents").select("id").eq("organization_id", membership.organization_id).eq("active", true),
    admin.from("party_identities").select("id").eq("organization_id", membership.organization_id).eq("party_id", membership.party_id).eq("channel", "email").eq("verified", true),
    admin.from("connections").select("id,status,account_address,scopes").eq("organization_id", membership.organization_id).eq("provider", "microsoft"),
    admin.from("graph_subscriptions").select("id,status,expires_at,connections!inner(organization_id)").eq("connections.organization_id", membership.organization_id),
    admin.from("inbound_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const connected = connections?.some((item) => item.status === "connected") ?? false;
  const grantedScopes = new Set((connections ?? []).flatMap((item) => (item.scopes ?? []) as string[]).map((scope) => scope.toLowerCase()));
  const requiredGraphScopes = ["mail.read", "mail.send", "files.read.all"];
  const graphPermissionsGranted = requiredGraphScopes.every((scope) => grantedScopes.has(scope));
  const subscribed = subscriptions?.some((item) => item.status === "active" && new Date(item.expires_at).getTime() > Date.now()) ?? false;
  const checks = { database: true, agentSeeded: Boolean(agents?.length), signedInUserEmailVerified: Boolean(identities?.length), internalIdentityAllowlist: Boolean(env.DEMO_INTERNAL_EMAILS?.trim()), model: isModelConfigured(), microsoftEnvironment: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_GRAPH_CLIENT_STATE), encryption: Boolean(env.CREDENTIAL_ENCRYPTION_KEY), outboundRecipientAllowlist: Boolean(env.DEMO_ALLOWED_RECIPIENTS?.trim()), alexConnected: connected, graphPermissionsGranted, webhookSubscribed: subscribed, failedDeliveries: failedDeliveries ?? 0 };
  return Response.json({ ready: Object.entries(checks).every(([key, value]) => key === "failedDeliveries" ? value === 0 : Boolean(value)), mode: "connected", modelProvider: configuredModelProvider(), checks });
}
