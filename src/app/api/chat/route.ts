import { z } from "zod";
import { answerWithAlex } from "@/agent/models/gateway";
import { isCloudConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";

const inputSchema = z.object({ message: z.string().trim().min(1).max(8000) });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid message is required." }, { status: 400 });
  try {
    if (!isCloudConfigured) return Response.json(await answerWithAlex(parsed.data.message));
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).single();
    if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
    const [interactions, tasks, commitments, events] = await Promise.all([
      supabase.from("interactions").select("subject,content_text,direction,occurred_at").eq("organization_id", membership.organization_id).order("occurred_at", { ascending: false }).limit(20),
      supabase.from("tasks").select("description,status,due_at").eq("organization_id", membership.organization_id).neq("status", "completed").limit(10),
      supabase.from("commitments").select("description,status,due_at,external_party_aware").eq("organization_id", membership.organization_id).neq("status", "completed").limit(10),
      supabase.from("agent_events").select("action,status,reason,created_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(20),
    ]);
    return Response.json(await answerWithAlex(parsed.data.message, { interactions: interactions.data, tasks: tasks.data, commitments: commitments.data, events: events.data }));
  }
  catch (error) { console.error("chat_failed", { error: error instanceof Error ? error.message : "unknown" }); return Response.json({ error: "Alex could not complete that request." }, { status: 500 }); }
}
