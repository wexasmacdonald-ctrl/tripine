import { isCloudConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";

export async function GET() {
  if (!isCloudConfigured) return Response.json({ mode: "demo" });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
  const [connections, tasks, commitments, events, approvals] = await Promise.all([
    supabase.from("connections").select("id,provider,status,account_address,updated_at").eq("organization_id", membership.organization_id).order("updated_at", { ascending: false }),
    supabase.from("tasks").select("id,description,status,due_at,created_at").eq("organization_id", membership.organization_id).neq("status", "completed").order("created_at", { ascending: false }).limit(10),
    supabase.from("commitments").select("id,description,status,due_at,external_party_aware,created_at").eq("organization_id", membership.organization_id).neq("status", "completed").order("created_at", { ascending: false }).limit(10),
    supabase.from("agent_events").select("id,action,status,reason,created_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(12),
    supabase.from("approval_requests").select("id,action,payload,status,expires_at,created_at").eq("organization_id", membership.organization_id).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
  ]);
  const error = [connections, tasks, commitments, events, approvals].find((result) => result.error)?.error;
  if (error) return Response.json({ error: "Workspace data could not be loaded." }, { status: 500 });
  return Response.json({ mode: "connected", connections: connections.data, tasks: tasks.data, commitments: commitments.data, events: events.data, approvals: approvals.data });
}
