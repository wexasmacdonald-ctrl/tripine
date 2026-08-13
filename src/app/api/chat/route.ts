import { z } from "zod";
import { answerWithAlex, demoAnswer } from "@/agent/models/gateway";
import { isPersistenceConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { reconcileAuthenticatedEmailIdentity } from "@/domain/parties/authenticated-identity";
import { linkMentionedCompanies } from "@/domain/business-context/entity-context";

const inputSchema = z.object({ message: z.string().trim().min(1).max(8000), conversationId: z.string().uuid().optional() });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid message is required." }, { status: 400 });
  try {
    if (!isPersistenceConfigured) return Response.json(demoAnswer(parsed.data.message));
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { data: membership } = await supabase.from("organization_members").select("organization_id,party_id").eq("user_id", user.id).single();
    if (!membership) return Response.json({ error: "No organization membership was found." }, { status: 403 });
    await reconcileAuthenticatedEmailIdentity({ organizationId: membership.organization_id, partyId: membership.party_id, user });
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
    if (!conversationId) throw new Error("Conversation resolution failed");
    const { data: inbound, error: inboundError } = await admin.from("interactions").insert({ organization_id: membership.organization_id, conversation_id: conversationId, channel: "web", direction: "inbound", sender_party_id: membership.party_id, content_text: parsed.data.message, occurred_at: new Date().toISOString(), participation: { addressedToAgent: true, agentWasToRecipient: true }, provenance: { rawType: "tripine.web", untrusted: true } }).select("id").single();
    if (inboundError || !inbound) throw new Error("Could not persist the web interaction");
    await linkMentionedCompanies({ organizationId: membership.organization_id, conversationId, interactionId: inbound.id, text: parsed.data.message });
    const { data: activeEntities } = await supabase.from("conversation_entity_context").select("company_id").eq("conversation_id", conversationId);
    let relevantConversationIds = [conversationId];
    const companyIds = (activeEntities ?? []).map((item) => item.company_id as string);
    if (companyIds.length) {
      const { data: relatedContexts } = await supabase.from("conversation_entity_context").select("conversation_id").eq("organization_id", membership.organization_id).in("company_id", companyIds).order("last_mentioned_at", { ascending: false }).limit(30);
      relevantConversationIds = [...new Set([conversationId, ...(relatedContexts ?? []).map((item) => item.conversation_id as string)])];
    }
    const interactionQuery = companyIds.length
      ? supabase.from("interactions").select("subject,content_text,direction,occurred_at,channel").eq("organization_id", membership.organization_id).in("conversation_id", relevantConversationIds).order("occurred_at", { ascending: false }).limit(30)
      : supabase.from("interactions").select("subject,content_text,direction,occurred_at,channel").eq("organization_id", membership.organization_id).order("occurred_at", { ascending: false }).limit(20);
    const [interactions, tasks, commitments, events] = await Promise.all([
      interactionQuery,
      supabase.from("tasks").select("description,status,due_at").eq("organization_id", membership.organization_id).neq("status", "completed").limit(10),
      supabase.from("commitments").select("description,status,due_at,external_party_aware").eq("organization_id", membership.organization_id).neq("status", "completed").limit(10),
      supabase.from("agent_events").select("action,status,reason,created_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(20),
    ]);
    const result = await answerWithAlex(parsed.data.message, { activeCompanyIds: companyIds, interactions: interactions.data, tasks: tasks.data, commitments: commitments.data, events: events.data });
    const { data: outbound, error: outboundError } = await admin.from("interactions").insert({ organization_id: membership.organization_id, conversation_id: conversationId, channel: "web", direction: "outbound", sender_party_id: agent.party_id, content_text: result.answer, occurred_at: new Date().toISOString(), participation: { responseTo: inbound.id }, provenance: { rawType: "tripine.agent", model: process.env.OPENAI_MODEL ?? "configured-default" } }).select("id").single();
    if (outboundError || !outbound) throw new Error("Could not persist Alex's response");
    await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: agent.id, interaction_id: outbound.id, action: "web.responded", status: "success", reason: "Alex responded through web chat" });
    return Response.json({ ...result, conversationId });
  }
  catch (error) { console.error("chat_failed", { error: error instanceof Error ? error.message : "unknown" }); return Response.json({ error: "Alex could not complete that request." }, { status: 500 }); }
}
