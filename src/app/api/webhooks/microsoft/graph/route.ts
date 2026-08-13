import { env } from "@/infrastructure/env";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { after } from "next/server";
import { processInboundDelivery } from "@/infrastructure/delivery-inbox/processor";

export async function POST(request: Request) {
  const url = new URL(request.url); const validationToken = url.searchParams.get("validationToken");
  if (validationToken) return new Response(validationToken, { status: 200, headers: { "content-type": "text/plain" } });
  const payload = await request.json().catch(() => null) as { value?: Array<{ subscriptionId?: string; clientState?: string; tenantId?: string; resourceData?: { id?: string }; lifecycleEvent?: string }> } | null;
  if (!payload?.value) return new Response(null, { status: 202 });
  const accepted = payload.value.filter((item) => item.clientState && item.clientState === env.MICROSOFT_GRAPH_CLIENT_STATE);
  if (accepted.length && env.NEXT_PUBLIC_SUPABASE_URL && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    const supabase = createAdminClient();
    const rows = accepted.filter((item) => item.resourceData?.id).map((item) => ({ provider: "microsoft", subscription_external_id: item.subscriptionId, provider_resource_id: item.resourceData?.id, payload: item, status: "pending" }));
    if (!rows.length) return new Response(null, { status: 202 });
    const { data, error } = await supabase.from("inbound_deliveries").upsert(rows, { onConflict: "provider,subscription_external_id,provider_resource_id" }).select("id,status");
    if (error) console.error("graph_delivery_persist_failed", { code: error.code });
    for (const delivery of data ?? []) if (delivery.status !== "processed") after(() => processInboundDelivery(delivery.id));
  }
  return new Response(null, { status: 202 });
}
