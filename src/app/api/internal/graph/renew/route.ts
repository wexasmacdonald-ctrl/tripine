import { env } from "@/infrastructure/env";
import { renewDueSubscriptions } from "@/connectors/microsoft/subscriptions/manager";
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
