import "server-only";
import { env } from "@/infrastructure/env";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { graphFetch } from "@/connectors/microsoft/graph/client";
import { getValidMicrosoftToken } from "@/connectors/microsoft/auth/connection-store";

export async function createMailboxSubscription(input: { connectionId: string; accountObjectId: string; accessToken: string }) {
  if (!env.MICROSOFT_GRAPH_CLIENT_STATE) throw new Error("MICROSOFT_GRAPH_CLIENT_STATE is not configured");
  const callback = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/microsoft/graph`;
  const expirationDateTime = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
  const subscription = await graphFetch<{ id: string; resource: string; expirationDateTime: string }>(input.accessToken, "/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changeType: "created", notificationUrl: callback, lifecycleNotificationUrl: callback, resource: `users/${input.accountObjectId}/mailFolders('Inbox')/messages`, expirationDateTime, clientState: env.MICROSOFT_GRAPH_CLIENT_STATE, latestSupportedTlsVersion: "v1_2" }) });
  const supabase = createAdminClient();
  const { error } = await supabase.from("graph_subscriptions").upsert({ connection_id: input.connectionId, external_id: subscription.id, resource: subscription.resource, expires_at: subscription.expirationDateTime, status: "active" }, { onConflict: "external_id" });
  if (error) throw new Error(`Could not persist Graph subscription: ${error.message}`);
  return subscription;
}

export async function renewDueSubscriptions() {
  const supabase = createAdminClient();
  const threshold = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("graph_subscriptions").select("id,external_id,connection_id").lt("expires_at", threshold).eq("status", "active");
  let renewed = 0;
  for (const item of data ?? []) {
    try {
      const accessToken = await getValidMicrosoftToken(item.connection_id);
      const expirationDateTime = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
      const subscription = await graphFetch<{ expirationDateTime: string }>(accessToken, `/subscriptions/${item.external_id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expirationDateTime }) });
      await supabase.from("graph_subscriptions").update({ expires_at: subscription.expirationDateTime }).eq("id", item.id); renewed++;
    } catch (error) {
      await supabase.from("graph_subscriptions").update({ status: "error" }).eq("id", item.id);
      console.error("graph_subscription_renewal_failed", { subscriptionId: item.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return renewed;
}
