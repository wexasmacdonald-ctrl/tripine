import { env } from "@/infrastructure/env";
import { processPendingDeliveries } from "@/infrastructure/delivery-inbox/processor";

export const maxDuration = 60;
export async function POST(request: Request) {
  if (!env.INTERNAL_JOB_SECRET || request.headers.get("authorization") !== `Bearer ${env.INTERNAL_JOB_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ processed: await processPendingDeliveries() });
}
