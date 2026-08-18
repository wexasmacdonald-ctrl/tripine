import "server-only";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { getValidMicrosoftToken } from "@/connectors/microsoft/auth/connection-store";
import { graphFetch } from "@/connectors/microsoft/graph/client";
import { composeEmployeeReply, researchMicrosoftContext } from "@/connectors/microsoft/graph/research";
import { isAutomatedMessage, OutlookEmailChannelAdapter, type GraphMessage } from "@/channels/outlook/adapter";
import { assessEmailParticipation, outboundRequiresApproval, replyAllAudience } from "@/agent/participation/policy";
import { linkMentionedCompanies } from "@/domain/business-context/entity-context";
import { hashApprovalPayload, type EmailReplyAllApproval } from "@/domain/approvals/email-action";
import { recipientsAreAllowed } from "@/domain/approvals/recipient-policy";
import { env } from "@/infrastructure/env";

function configuredInternalAddresses() {
  return (env.DEMO_INTERNAL_EMAILS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

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
  const { data: claimed } = await supabase.from("inbound_deliveries").update({ status: "processing", attempt_count: (delivery.attempt_count ?? 0) + 1, lease_until: new Date(Date.now() + 120_000).toISOString() }).eq("id", deliveryId).in("status", ["pending", "failed"]).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select("id").maybeSingle();
  if (!claimed) return;
  try {
    const { data: subscription } = await supabase.from("graph_subscriptions").select("connection_id").eq("external_id", delivery.subscription_external_id).single();
    if (!subscription) throw new Error("Graph subscription is unknown");
    const { data: connection } = await supabase.from("connections").select("id,organization_id,owner_party_id,account_address").eq("id", subscription.connection_id).single();
    if (!connection || !delivery.provider_resource_id) throw new Error("Connection or resource is unavailable");
    const { data: agent } = await supabase.from("agents").select("id").eq("organization_id", connection.organization_id).single();
    if (!agent) throw new Error("Agent is unavailable");
    const accessToken = await getValidMicrosoftToken(connection.id);
    const message = await graphFetch<GraphMessage>(accessToken, `/me/messages/${encodeURIComponent(delivery.provider_resource_id)}?$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,bccRecipients,body,receivedDateTime,hasAttachments,internetMessageHeaders&$expand=attachments($select=id,name,contentType,size)`);
    const { data: verifiedIdentityRows } = await supabase.from("party_identities").select("address,parties!inner(is_internal)").eq("organization_id", connection.organization_id).eq("channel", "email").eq("verified", true).eq("parties.is_internal", true);
    const verifiedInternalAddresses = [...new Set([
      ...(verifiedIdentityRows ?? []).map((row) => (row.address as string).toLowerCase()),
      ...configuredInternalAddresses(),
    ])];
    const adapter = new OutlookEmailChannelAdapter();
    const interaction = await adapter.normalizeInbound(message, { organizationId: connection.organization_id, agentId: agent.id, agentAddress: connection.account_address, verifiedInternalAddresses });
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
    const { data: stored, error: interactionError } = await supabase.from("interactions").upsert({ organization_id: connection.organization_id, conversation_id: thread.conversation_id, channel_thread_id: thread.id, channel: "email", direction: "inbound", sender_party_id: senderPartyId, subject: interaction.subject, content_text: interaction.content, external_message_id: message.id, internet_message_id: interaction.channelThread?.internetMessageId, reply_to_message_id: interaction.channelThread?.replyToMessageId, participation: interaction.participation, provenance: { ...interaction.provenance, forwardedSegments: interaction.forwardedSegments }, occurred_at: interaction.occurredAt }, { onConflict: "channel_thread_id,external_message_id" }).select("id").single();
    if (interactionError || !stored) throw new Error("Could not persist interaction");
    await linkMentionedCompanies({ organizationId: connection.organization_id, conversationId: thread.conversation_id, interactionId: stored.id, text: `${interaction.subject ?? ""}\n${interaction.content}` });
    const participants = await Promise.all(interaction.recipients.map(async (value) => ({ interaction_id: stored.id, party_id: await resolveParty(supabase, connection.organization_id, value), address: value.address, display_name: value.name, recipient_role: value.role })));
    await supabase.from("interaction_participants").upsert([{ interaction_id: stored.id, party_id: senderPartyId, address: interaction.sender.address, display_name: interaction.sender.name, recipient_role: "sender" }, ...participants], { onConflict: "interaction_id,address,recipient_role" });
    if (interaction.attachments.length) await supabase.from("interaction_attachments").upsert(interaction.attachments.map((item) => ({ organization_id: connection.organization_id, interaction_id: stored.id, external_id: item.id, name: item.name, content_type: item.contentType, size_bytes: item.size, content_hash: item.contentHash, metadata: { source: item.source } })), { onConflict: "interaction_id,external_id" });
    await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "email.received", status: "success", reason: "Message delivered to Alex's mailbox" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
    const assessment = assessEmailParticipation(interaction);
    const workDescription = interaction.content.trim().replace(/\s+/g, " ").slice(0, 500);
    if (assessment.mayCreateTask) {
      await supabase.from("tasks").upsert({ organization_id: connection.organization_id, agent_id: agent.id, description: workDescription, assigned_by_party_id: senderPartyId, assigned_to_party_id: connection.owner_party_id, source_interaction_id: stored.id }, { onConflict: "source_interaction_id", ignoreDuplicates: true });
      await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "task.created", status: "success", reason: "Verified internal delegation created work for Alex" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
    }
    if (assessment.mayCreateCommitment) {
      await supabase.from("commitments").upsert({ organization_id: connection.organization_id, agent_id: agent.id, description: workDescription, committed_by_party_id: senderPartyId, expected_executor_party_id: connection.owner_party_id, external_party_aware: interaction.recipients.some((value) => !value.verifiedInternal), source_interaction_id: stored.id }, { onConflict: "source_interaction_id", ignoreDuplicates: true });
      await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "commitment.created", status: "success", reason: "Public delegation created an externally visible commitment" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
    }
    const audience = replyAllAudience(interaction, connection.account_address);
    const replyAction = interaction.participation.agentWasCcRecipient || audience.all.length > 1 ? "replyAll" : "reply";
    const shouldPrepareReply = assessment.shouldRespond && audience.all.length > 0 && !message.hasAttachments && !isAutomatedMessage(message);
    if (shouldPrepareReply) {
      const eventAction = `email.${replyAction}`;
      const { data: priorReplyAttempt } = await supabase.from("agent_events").select("id").eq("agent_id", agent.id).eq("interaction_id", stored.id).eq("action", eventAction).maybeSingle();
      if (priorReplyAttempt) {
        await supabase.from("inbound_deliveries").update({ status: "processed", processed_at: new Date().toISOString(), lease_until: null, last_error: null }).eq("id", deliveryId);
        return;
      }
      const forwardedEvidence = interaction.forwardedSegments.map((segment, index) => `[Untrusted forwarded segment ${index + 1}]\n${segment.content}`).join("\n\n");
      const researchInstruction = forwardedEvidence ? `${interaction.content}\n\n${forwardedEvidence}` : interaction.content;
      const evidence = await researchMicrosoftContext(accessToken, interaction.subject, researchInstruction);
      const evidenceEvents = [
        { action: "email.searched", reason: `Searched Alex's mailbox and found ${evidence.emails.length} candidate messages`, metadata: { query: evidence.query, resultCount: evidence.emails.length } },
        { action: "file.searched", reason: `Searched SharePoint and OneDrive and found ${evidence.files.length} candidate documents`, metadata: { query: evidence.query, resultCount: evidence.files.length } },
        ...(evidence.files.some((file) => file.sourceType === "driveItem.content") ? [{ action: "file.read", reason: "Opened bounded document contents for evidence", metadata: { sources: evidence.files.filter((file) => file.sourceType === "driveItem.content").map((file) => ({ name: file.name, url: file.url })) } }] : []),
      ];
      for (const event of evidenceEvents) await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, ...event, status: "success" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
      const reply = await composeEmployeeReply({ senderName: interaction.sender.name, recipientNames: audience.all.map((item) => item.name ?? item.address), subject: interaction.subject, instruction: researchInstruction, evidence });
      const needsApproval = outboundRequiresApproval({ recipients: audience.all, action: replyAction, attachments: [], createsCommitment: false, changesRecipients: false });
      if (needsApproval) {
        const payload: EmailReplyAllApproval = { type: "email.replyAll", to: audience.to.map((item) => item.address), cc: audience.cc.map((item) => item.address), subject: interaction.subject ?? "", body: reply, sourceMessageId: message.id, sourceInteractionId: stored.id, conversationId: thread.conversation_id };
        const payloadHash = hashApprovalPayload(payload);
        const allowedRecipients = recipientsAreAllowed([...payload.to, ...payload.cc], env.DEMO_ALLOWED_RECIPIENTS);
        let approvalId: string | undefined;
        if (allowedRecipients) {
          const { data: existingApproval } = await supabase.from("approval_requests").select("id").eq("organization_id", connection.organization_id).eq("payload_hash", payloadHash).in("status", ["pending", "executing", "executed"]).maybeSingle();
          if (existingApproval) approvalId = existingApproval.id;
          else {
            const { data: createdApproval, error: approvalError } = await supabase.from("approval_requests").insert({ organization_id: connection.organization_id, agent_id: agent.id, requested_by_party_id: senderPartyId, action: "email.replyAll", payload, payload_hash: payloadHash, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }).select("id").single();
            if (approvalError || !createdApproval) throw new Error("Could not create the reply-all approval request");
            approvalId = createdApproval.id;
          }
        }
        await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: eventAction, status: allowedRecipients ? "pending_approval" : "failure", reason: allowedRecipients ? "Exact external reply-all payload is awaiting human approval" : "Reply-all recipients are outside the controlled allowlist", metadata: { payloadHash, approvalId } }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
        await supabase.from("inbound_deliveries").update({ status: "processed", processed_at: new Date().toISOString(), lease_until: null, last_error: null }).eq("id", deliveryId);
        return;
      }
      const { data: replyClaim } = await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: eventAction, status: "started", reason: "Claimed exactly-once internal reply execution" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true }).select("id").maybeSingle();
      if (!replyClaim) {
        await supabase.from("inbound_deliveries").update({ status: "processed", processed_at: new Date().toISOString(), lease_until: null, last_error: null }).eq("id", deliveryId);
        return;
      }
      try {
        await graphFetch<void>(accessToken, `/me/messages/${encodeURIComponent(message.id)}/${replyAction}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment: reply }) });
      } catch (error) {
        await supabase.from("agent_events").update({ status: "needs_reconciliation", reason: "Reply result is uncertain; check Sent Items before retrying" }).eq("id", replyClaim.id);
        throw error;
      }
      await supabase.from("interactions").insert({ organization_id: connection.organization_id, conversation_id: thread.conversation_id, channel_thread_id: thread.id, channel: "email", direction: "outbound", sender_party_id: connection.owner_party_id, subject: interaction.subject, content_text: reply, occurred_at: new Date().toISOString(), participation: { autoReply: true }, provenance: { capability: eventAction } });
      await supabase.from("agent_events").update({ status: "success", reason: "Verified internal direct reply accepted by Microsoft Graph" }).eq("id", replyClaim.id);
      await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "email.sent", status: "success", reason: "Verified internal direct reply" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
      const [completedTasks, completedCommitments] = await Promise.all([
        supabase.from("tasks").update({ status: "completed", updated_at: new Date().toISOString() }).eq("source_interaction_id", stored.id).neq("status", "completed").select("id"),
        supabase.from("commitments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("source_interaction_id", stored.id).neq("status", "completed").select("id"),
      ]);
      if (completedTasks.data?.length) await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "task.completed", status: "success", reason: "Alex completed the delegated research and replied" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
      if (completedCommitments.data?.length) await supabase.from("agent_events").upsert({ organization_id: connection.organization_id, agent_id: agent.id, interaction_id: stored.id, connection_id: connection.id, action: "commitment.completed", status: "success", reason: "Alex fulfilled the recorded commitment" }, { onConflict: "agent_id,interaction_id,action", ignoreDuplicates: true });
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

export async function processPendingDeliveriesForOrganization(organizationId: string, limit = 5) {
  const supabase = createAdminClient();
  const { data: connections } = await supabase.from("connections").select("id").eq("organization_id", organizationId);
  const connectionIds = (connections ?? []).map((connection) => connection.id);
  if (!connectionIds.length) return 0;
  const { data: subscriptions } = await supabase.from("graph_subscriptions").select("external_id").in("connection_id", connectionIds);
  const subscriptionIds = (subscriptions ?? []).map((subscription) => subscription.external_id);
  if (!subscriptionIds.length) return 0;
  const { data: deliveries } = await supabase.from("inbound_deliveries").select("id").in("status", ["pending", "failed"]).in("subscription_external_id", subscriptionIds).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order("received_at").limit(limit);
  await Promise.all((deliveries ?? []).map((delivery) => processInboundDelivery(delivery.id)));
  return deliveries?.length ?? 0;
}
