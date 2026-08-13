import { z } from "zod";
import { answerWithAlex, demoAnswer } from "@/agent/models/gateway";
import { isCloudConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";

const inputSchema = z.object({ message: z.string().trim().min(1).max(8000), conversationId: z.string().uuid().optional() });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid message is required." }, { status: 400 });
  try {
    if (!isCloudConfigured) return Response.json(demoAnswer(parsed.data.message));
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { data: membership } = await supabase.from("organization_members").select("organization_id,party_id").eq("user_id", user.id).single();
    if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
    const admin = createAdminClient();
    const { data: agent } = await admin.from("agents").select("id,party_id").eq("organization_id", membership.organization_id).eq("active", true).single();
    if (!agent) return Response.json({ error: "Alex is not configured for this organization." }, { status: 503 });
    let conversationId = parsed.data.conversationId;
    if (conversationId) {
      const { data: allowedConversation } = await supabase.from("conversations").select("id").eq("id", conversationId).eq("organization_id", membership.organization_id).maybeSingle();
      if (!allowedConversation) conversationId = undefined;
    }
    if (!conversationId) {
      const { data: conversation, error } = await admin.from("conversations").insert({ organization_id: membership.organization_id, agent_id: agent.id, title: parsed.data.message.slice(0, 100) }).select("id").single();
      if (error || !conversation) throw new Error("Could not create the web conversation");
      conversationId = conversation.id;
      await admin.from("channel_threads").insert({ organization_id: membership.organization_id, conversation_id: conversationId, channel: "web", external_thread_id: conversationId });
    }
    const { data: inbound, error: inboundError } = await admin.from("interactions").insert({ organization_id: membership.organization_id, conversation_id: conversationId, channel: "web", direction: "inbound", sender_party_id: membership.party_id, content_text: parsed.data.message, occurred_at: new Date().toISOString(), participation: { addressedToAgent: true, agentWasToRecipient: true }, provenance: { rawType: "tripine.web", untrusted: true } }).select("id").single();
    if (inboundError || !inbound) throw new Error("Could not persist the web interaction");
    const [interactions, tasks, commitments, events] = await Promise.all([
      supabase.from("interactions").select("subject,content_text,direction,occurred_at").eq("organization_id", membership.organization_id).order("occurred_at", { ascending: false }).limit(20),
      supabase.from("tasks").select("description,status,due_at").eq("organization_id", membership.organization_id).neq("status", "completed").limit(10),
      supabase.from("commitments").select("description,status,due_at,external_party_aware").eq("organization_id", membership.organization_id).neq("status", "completed").limit(10),
      supabase.from("agent_events").select("action,status,reason,created_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(20),
    ]);
    const result = await answerWithAlex(parsed.data.message, { interactions: interactions.data, tasks: tasks.data, commitments: commitments.data, events: events.data });
    const { data: outbound, error: outboundError } = await admin.from("interactions").insert({ organization_id: membership.organization_id, conversation_id: conversationId, channel: "web", direction: "outbound", sender_party_id: agent.party_id, content_text: result.answer, occurred_at: new Date().toISOString(), participation: { responseTo: inbound.id }, provenance: { rawType: "tripine.agent", model: process.env.OPENAI_MODEL ?? "configured-default" } }).select("id").single();
    if (outboundError || !outbound) throw new Error("Could not persist Alex's response");
    await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: agent.id, interaction_id: outbound.id, action: "web.responded", status: "success", reason: "Alex responded through web chat" });
    return Response.json({ ...result, conversationId });
  }
  catch (error) { console.error("chat_failed", { error: error instanceof Error ? error.message : "unknown" }); return Response.json({ error: "Alex could not complete that request." }, { status: 500 }); }
}
