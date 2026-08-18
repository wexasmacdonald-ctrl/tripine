import { z } from "zod";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";

const bodySchema = z.object({ status: z.enum(["open", "waiting", "completed", "cancelled"]) });

export async function PATCH(request: Request, context: RouteContext<"/api/work/[kind]/[id]">) {
  const { kind, id } = await context.params;
  if (kind !== "tasks" && kind !== "commitments") return Response.json({ error: "Unknown work item type." }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid status is required." }, { status: 400 });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", user.id).single();
  if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
  const admin = createAdminClient();
  const { data: item, error } = await admin.from(kind).update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", membership.organization_id).select("id,agent_id,description,status").maybeSingle();
  if (error || !item) return Response.json({ error: "Work item was not found or could not be updated." }, { status: 404 });
  await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: item.agent_id, action: `${kind === "tasks" ? "task" : "commitment"}.${parsed.data.status}`, status: "success", reason: item.description, metadata: { workItemId: item.id, changedByUserId: user.id } });
  return Response.json(item);
}
