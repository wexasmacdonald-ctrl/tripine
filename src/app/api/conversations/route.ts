import { createServerSupabase } from "@/infrastructure/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
  if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
  const { data: conversations, error } = await supabase.from("conversations").select("id,title,status,created_at,updated_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(40);
  if (error) return Response.json({ error: "Conversations could not be loaded." }, { status: 500 });
  const ids = (conversations ?? []).map((item) => item.id);
  const { data: threads } = ids.length
    ? await supabase.from("channel_threads").select("conversation_id,channel").in("conversation_id", ids)
    : { data: [] };
  const channels = new Map((threads ?? []).map((thread) => [thread.conversation_id, thread.channel]));
  return Response.json({ conversations: (conversations ?? []).map((item) => ({ ...item, channel: channels.get(item.id) ?? "web" })) });
}
