import { env } from "@/infrastructure/env";
import { recreateMailboxSubscriptions, renewDueSubscriptions } from "@/connectors/microsoft/subscriptions/manager";
import { processPendingDeliveries } from "@/infrastructure/delivery-inbox/processor";

export async function GET(request: Request) {
  const expected = env.CRON_SECRET ?? env.INTERNAL_JOB_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [renewed, recoveredDeliveries] = await Promise.all([
    renewDueSubscriptions(),
    processPendingDeliveries(10),
  ]);
  return Response.json({ renewed, recoveredDeliveries });
}

export async function POST(request: Request) {
  const expected = env.INTERNAL_JOB_SECRET ?? env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const recreated = await recreateMailboxSubscriptions();
    return Response.json({ recreated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Graph subscription reconciliation failed";
    console.error("graph_subscription_reconciliation_failed", { message });
    return Response.json({ error: message }, { status: 500 });
  }
}
