import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";

export async function POST(_request: Request, context: RouteContext<"/api/approvals/[id]/cancel">) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const admin = createAdminClient();
  const { data: approval } = await admin.from("approval_requests").update({ status: "cancelled", decided_by_user_id: user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("organization_id", membership.organization_id).eq("status", "pending").select("id,agent_id,action").maybeSingle();
  if (!approval) return Response.json({ error: "Pending approval was not found." }, { status: 404 });
  await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: approval.agent_id, action: approval.action, status: "failure", reason: "Outbound email was cancelled by a human", metadata: { approvalId: id, decidedByUserId: user.id } });
  return Response.json({ status: "cancelled" });
}
