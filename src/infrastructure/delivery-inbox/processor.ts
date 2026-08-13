import "server-only";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { getValidMicrosoftToken } from "@/connectors/microsoft/auth/connection-store";
import { graphFetch } from "@/connectors/microsoft/graph/client";
import { composeEmployeeReply, researchMicrosoftContext } from "@/connectors/microsoft/graph/research";
import { OutlookEmailChannelAdapter, type GraphMessage } from "@/channels/outlook/adapter";

async function resolveParty(supabase: ReturnType<typeof createAdminClient>, organizationId: string, participant: { address: string; name?: string; verifiedInternal: boolean }) {
  const { data: existing } = await supabase.from("party_identities").select("party_id").eq("organization_id", organizationId).eq("channel", "email").eq("address", participant.address).maybeSingle();
  if (existing?.party_id) return existing.party_id as string;
  const { data: party, error } = await supabase.from("parties").insert({ organization_id: organizationId, kind: participant.verifiedInternal ? "human" : "external_person", display_name: participant.name ?? participant.address, is_internal: participant.verifiedInternal }).select("id").single();
  if (error || !party) throw new Error("Could not resolve message participant");
  await supabase.from("party_identities").insert({ organization_id: organizationId, party_id: party.id, channel: "email", address: participant.address, verified: participant.verifiedInternal });
  return party.id as string;
}

export async function processInboundDelivery(deliveryId: string) {
  const supabase = createAdminClient();
  const { data: delivery } = await supabase.from("inbound_deliveries").select("*").eq("id", deliveryId).single();
  if (!delivery || delivery.status === "processed") return;
  await supabase.from("inbound_deliveries").update({ status: "processing", attempt_count: (delivery.attempt_count ?? 0) + 1, lease_until: new Date(Date.now() + 120_000).toISOString() }).eq("id", deliveryId).neq("status", "processed");
  try {
    const { data: subscription } = await supabase.from("graph_subscriptions").select("connection_id").eq("external_id", delivery.subscription_external_id).single();
    if (!subscription) throw new Error("Graph subscription is unknown");
    const { data: connection } = await supabase.from("connections").select("id,organization_id,owner_party_id,account_address").eq("id", subscription.connection_id).single();
    if (!connection || !delivery.provider_resource_id) throw new Error("Connection or resource is unavailable");
    const { data: agent } = await supabase.from("agents").select("id").eq("organization_id", connection.organization_id).single();
    if (!agent) throw new Error("Agent is unavailable");
    const accessToken = await getValidMicrosoftToken(connection.id);
    const message = await graphFetch<GraphMessage>(accessToken, `/me/messages/${encodeURIComponent(delivery.provider_resource_id)}?$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,bccRecipients,body,receivedDateTime,hasAttachments,internetMessageHeaders`);
    const adapter = new OutlookEmailChannelAdapter();
    const interaction = await adapter.normalizeInbound(message, { organizationId: connection.organization_id, agentId: agent.id, agentAddress: connection.account_address });
    if (interaction.sender.address === connection.account_address.toLowerCase()) { await supabase.from("inbound_deliveries").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", deliveryId); return; }
    const senderPartyId = await resolveParty(supabase, connection.organization_id, interaction.sender);
    const externalThreadId = interaction.channelThread?.externalThreadId ?? interaction.channelThread?.internetMessageId ?? message.id;
    let { data: thread } = await supabase.from("channel_threads").select("id,conversation_id").eq("connection_id", connection.id).eq("channel", "email").eq("external_thread_id", externalThreadId).maybeSingle();
    if (!thread) {
      const { data: conversation, error: conversationError } = await supabase.from("conversations").insert({ organization_id: connection.organization_id, agent_id: agent.id, title: interaction.subject }).select("id").single();
      if (conversationError || !conversation) throw new Error("Could not create conversation");
      const { data: createdThread, error: threadError } = await supabase.from("channel_threads").insert({ organization_id: connection.organization_id, conversation_id: conversation.id, connection_id: connection.id, channel: "email", external_thread_id: externalThreadId }).select("id,conversation_id").single();
      if (threadError || !createdThread) throw new Error("Could not create channel thread"); thread = createdThread;
    }
    const { data: stored, error: interactionError } = await supabase.from("interactions").upsert({ organization_id: connection.organization_id, conversation_id: thread.conversation_id, channel_thread_id: thread.id, channel: "email", direction: "inbound", sender_party_id: senderPartyId, subject: interaction.subject, content_text: interaction.content, external_message_id: message.id, internet_message_id: interaction.channelThread?.internetMessageId, reply_to_message_id: interaction.channelThread?.replyToMessageId, participation: interaction.participation, provenance: interaction.provenance, occurred_at: interaction.occurredAt }, { onConflict: "channel_thread_id,external_message_id" }).select("id").single();
    if (interactionError || !stored) throw new Error("Could not persist interaction");
    const participants = await Promise.all(interaction.recipients.map(async (value) => ({ interaction_id: stored.id, party_id: await resolveParty(supabase, connection.organization_id, value), address: value.address, display_name: value.name, recipient_role: value.role })));
    await supabase.from("interaction_participants").upsert([{ interaction_id: stored.id, party_id: senderPartyId, address: interaction.sender.address, display_name: interaction.sender.name, recipient_role: "sender" }, ...participants], { onConflict: "interaction_id,address,recipient_role" });
    await supabase.from("agent_events").insert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "email.received", status: "success", reason: "Message delivered to Alex's mailbox" });
    const explicitDelegation = interaction.sender.verifiedInternal && interaction.participation.explicitMention && /\b(can you|please|will|you'll|he'll|assigned)\b/i.test(interaction.content);
    if (explicitDelegation) await supabase.from("tasks").insert({ organization_id: connection.organization_id, agent_id: agent.id, description: interaction.content.replace(/<[^>]*>/g, " ").trim().slice(0, 500), assigned_by_party_id: senderPartyId, assigned_to_party_id: connection.owner_party_id, source_interaction_id: stored.id });
    const mayAutoReply = interaction.sender.verifiedInternal && interaction.participation.agentWasToRecipient && !interaction.participation.agentWasCcRecipient && !message.hasAttachments;
    if (mayAutoReply) {
      const evidence = await researchMicrosoftContext(accessToken, interaction.subject, interaction.content);
      const reply = await composeEmployeeReply({ senderName: interaction.sender.name, subject: interaction.subject, instruction: interaction.content, evidence });
      await graphFetch<void>(accessToken, `/me/messages/${encodeURIComponent(message.id)}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment: reply }) });
      await supabase.from("interactions").insert({ organization_id: connection.organization_id, conversation_id: thread.conversation_id, channel_thread_id: thread.id, channel: "email", direction: "outbound", sender_party_id: connection.owner_party_id, subject: interaction.subject, content_text: reply, occurred_at: new Date().toISOString(), participation: { autoReply: true }, provenance: { capability: "email.reply" } });
      await supabase.from("agent_events").insert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "email.sent", status: "success", reason: "Verified internal direct reply" });
    }
    await supabase.from("inbound_deliveries").update({ status: "processed", processed_at: new Date().toISOString(), lease_until: null, last_error: null }).eq("id", deliveryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown delivery error";
    await supabase.from("inbound_deliveries").update({ status: "failed", lease_until: null, last_error: message.slice(0, 500) }).eq("id", deliveryId);
    console.error("inbound_delivery_failed", { deliveryId, error: message });
  }
}

export async function processPendingDeliveries(limit = 5) {
  const supabase = createAdminClient();
  const { data } = await supabase.from("inbound_deliveries").select("id").in("status", ["pending", "failed"]).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order("received_at").limit(limit);
  await Promise.all((data ?? []).map((row) => processInboundDelivery(row.id)));
  return data?.length ?? 0;
}
