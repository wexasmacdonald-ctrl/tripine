import { isPersistenceConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { processPendingDeliveriesForOrganization } from "@/infrastructure/delivery-inbox/processor";

export async function POST() {
  if (!isPersistenceConfigured) return Response.json({ error: "Persistence is not configured." }, { status: 503 });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const processed = await processPendingDeliveriesForOrganization(membership.organization_id);
  return Response.json({ processed });
}
