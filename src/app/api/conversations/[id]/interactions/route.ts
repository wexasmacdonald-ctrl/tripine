import { createServerSupabase } from "@/infrastructure/supabase/server";

export async function GET(_request: Request, context: RouteContext<"/api/conversations/[id]/interactions">) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
  const { data: conversation } = await supabase.from("conversations").select("id,title").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (!conversation) return Response.json({ error: "Conversation was not found." }, { status: 404 });
  const { data: interactions, error } = await supabase.from("interactions").select("id,direction,channel,subject,content_text,occurred_at").eq("conversation_id", id).eq("organization_id", membership.organization_id).order("occurred_at", { ascending: true }).limit(100);
  if (error) return Response.json({ error: "Conversation history could not be loaded." }, { status: 500 });
  return Response.json({ conversation, interactions });
}
