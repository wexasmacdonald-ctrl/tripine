import { env } from "@/infrastructure/env";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { after } from "next/server";
import { processInboundDelivery } from "@/infrastructure/delivery-inbox/processor";

export async function POST(request: Request) {
  const url = new URL(request.url); const validationToken = url.searchParams.get("validationToken");
  if (validationToken) return new Response(validationToken, { status: 200, headers: { "content-type": "text/plain" } });
  const payload = await request.json().catch(() => null) as { value?: Array<{ subscriptionId?: string; clientState?: string; tenantId?: string; resourceData?: { id?: string }; lifecycleEvent?: string }> } | null;
  if (!payload?.value) return new Response(null, { status: 202 });
  const expectedTenant = env.MICROSOFT_TENANT_ID.toLowerCase();
  const accepted = payload.value.filter((item) =>
    item.clientState &&
    item.clientState === env.MICROSOFT_GRAPH_CLIENT_STATE &&
    (expectedTenant === "organizations" || item.tenantId?.toLowerCase() === expectedTenant),
  );
  if (accepted.length && env.NEXT_PUBLIC_SUPABASE_URL && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    const supabase = createAdminClient();
    const subscriptionIds = [...new Set(accepted.map((item) => item.subscriptionId).filter((value): value is string => Boolean(value)))];
    const { data: knownSubscriptions } = await supabase.from("graph_subscriptions").select("external_id").in("external_id", subscriptionIds);
    const known = new Set((knownSubscriptions ?? []).map((item) => item.external_id));
    const verified = accepted.filter((item) => item.subscriptionId && known.has(item.subscriptionId));
    for (const item of verified.filter((value) => value.lifecycleEvent)) {
      await supabase.from("graph_subscriptions").update({ status: "error", last_notification_at: new Date().toISOString() }).eq("external_id", item.subscriptionId);
      console.error("graph_subscription_lifecycle_event", { subscriptionId: item.subscriptionId, lifecycleEvent: item.lifecycleEvent });
    }
    const rows = verified.filter((item) => !item.lifecycleEvent && item.resourceData?.id).map((item) => ({ provider: "microsoft", subscription_external_id: item.subscriptionId, provider_resource_id: item.resourceData?.id, payload: item, status: "pending" }));
    if (!rows.length) return new Response(null, { status: 202 });
    const { data, error } = await supabase.from("inbound_deliveries").upsert(rows, { onConflict: "provider,subscription_external_id,provider_resource_id" }).select("id,status");
    if (error) console.error("graph_delivery_persist_failed", { code: error.code });
    await supabase.from("graph_subscriptions").update({ last_notification_at: new Date().toISOString() }).in("external_id", [...new Set(rows.map((item) => item.subscription_external_id).filter((value): value is string => Boolean(value)))]);
    for (const delivery of data ?? []) if (delivery.status !== "processed") after(() => processInboundDelivery(delivery.id));
  }
  return new Response(null, { status: 202 });
}
