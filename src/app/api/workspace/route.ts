import { isPersistenceConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { reconcileAuthenticatedEmailIdentity } from "@/domain/parties/authenticated-identity";

export async function GET() {
  if (!isPersistenceConfigured) return Response.json({ mode: "demo" });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,party_id").eq("user_id", user.id).single();
  if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
  await reconcileAuthenticatedEmailIdentity({ organizationId: membership.organization_id, partyId: membership.party_id, user });
  const [connections, tasks, commitments, events, approvals] = await Promise.all([
    supabase.from("connections").select("id,provider,status,account_address,updated_at").eq("organization_id", membership.organization_id).order("updated_at", { ascending: false }),
    supabase.from("tasks").select("id,description,status,due_at,created_at").eq("organization_id", membership.organization_id).neq("status", "completed").order("created_at", { ascending: false }).limit(10),
    supabase.from("commitments").select("id,description,status,due_at,external_party_aware,created_at").eq("organization_id", membership.organization_id).neq("status", "completed").order("created_at", { ascending: false }).limit(10),
    supabase.from("agent_events").select("id,action,status,reason,created_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(12),
    supabase.from("approval_requests").select("id,action,payload,status,expires_at,created_at").eq("organization_id", membership.organization_id).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
  ]);
  const namedResults = { connections, tasks, commitments, events, approvals };
  const failedEntry = Object.entries(namedResults).find(([, result]) => result.error);
  if (failedEntry) return Response.json({ error: `Workspace data could not be loaded (${failedEntry[0]}).`, code: failedEntry[1].error?.code }, { status: 500 });

  const admin = createAdminClient();
  const connectionIds = (connections.data ?? []).map((connection) => connection.id);
  const { data: subscriptions } = connectionIds.length
    ? await admin.from("graph_subscriptions").select("id,external_id,status,expires_at,last_notification_at").in("connection_id", connectionIds).order("created_at", { ascending: false })
    : { data: [] };
  const subscriptionIds = (subscriptions ?? []).map((subscription) => subscription.external_id);
  const { data: deliveries } = subscriptionIds.length
    ? await admin.from("inbound_deliveries").select("id,status,attempt_count,last_error,received_at,processed_at").in("subscription_external_id", subscriptionIds).order("received_at", { ascending: false }).limit(8)
    : { data: [] };

  return Response.json({
    mode: "connected",
    connections: connections.data,
    subscriptions,
    deliveries,
    tasks: tasks.data,
    commitments: commitments.data,
    events: events.data,
    approvals: approvals.data,
  });
}
