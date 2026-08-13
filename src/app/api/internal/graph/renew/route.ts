import { env } from "@/infrastructure/env";
import { renewDueSubscriptions } from "@/connectors/microsoft/subscriptions/manager";

export async function GET(request: Request) {
  const expected = env.CRON_SECRET ?? env.INTERNAL_JOB_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ renewed: await renewDueSubscriptions() });
}
