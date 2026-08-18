import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { getValidMicrosoftToken } from "@/connectors/microsoft/auth/connection-store";
import { env } from "@/infrastructure/env";
import { recipientsAreAllowed } from "@/domain/approvals/recipient-policy";
import { hashApprovalPayload, type EmailApprovalPayload } from "@/domain/approvals/email-action";

export async function POST(_request: Request, context: RouteContext<"/api/approvals/[id]/approve">) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const admin = createAdminClient();
  const { data: approval } = await admin.from("approval_requests").select("id,agent_id,payload,payload_hash,status,expires_at").eq("id", id).eq("organization_id", membership.organization_id).single();
  if (!approval) return Response.json({ error: "Approval request was not found." }, { status: 404 });
  if (approval.status !== "pending") return Response.json({ error: `Approval is already ${approval.status}.` }, { status: 409 });
  if (new Date(approval.expires_at).getTime() <= Date.now()) {
    await admin.from("approval_requests").update({ status: "expired" }).eq("id", id).eq("status", "pending");
    return Response.json({ error: "Approval request expired." }, { status: 410 });
  }
  const payload = approval.payload as EmailApprovalPayload;
  if (hashApprovalPayload(payload) !== approval.payload_hash) return Response.json({ error: "Approval payload integrity check failed." }, { status: 409 });
  if (!recipientsAreAllowed([...payload.to, ...payload.cc], env.DEMO_ALLOWED_RECIPIENTS)) return Response.json({ error: "A recipient is no longer in the controlled demo allowlist." }, { status: 403 });
  const { data: claimed } = await admin.from("approval_requests").update({ status: "executing", decided_by_user_id: user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (!claimed) return Response.json({ error: "Approval is already being executed." }, { status: 409 });
  const { data: connection } = await admin.from("connections").select("id,owner_party_id").eq("organization_id", membership.organization_id).eq("provider", "microsoft").eq("owner_type", "service").eq("status", "connected").single();
  if (!connection) {
    await admin.from("approval_requests").update({ status: "pending" }).eq("id", id).eq("status", "executing");
    return Response.json({ error: "Connect Alex's Microsoft mailbox first." }, { status: 503 });
  }
  try {
    const token = await getValidMicrosoftToken(connection.id);
    const endpoint = payload.type === "email.replyAll"
      ? `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(payload.sourceMessageId)}/replyAll`
      : "https://graph.microsoft.com/v1.0/me/sendMail";
    const requestBody = payload.type === "email.replyAll"
      ? { comment: payload.body }
      : { message: { subject: payload.subject, body: { contentType: "Text", content: payload.body }, toRecipients: payload.to.map((address) => ({ emailAddress: { address } })), ccRecipients: payload.cc.map((address) => ({ emailAddress: { address } })) }, saveToSentItems: true };
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(requestBody), cache: "no-store" });
    if (response.status === 202) {
      await admin.from("approval_requests").update({ status: "executed" }).eq("id", id).eq("status", "executing");
      if (payload.type === "email.replyAll") {
        const { data: outbound } = await admin.from("interactions").insert({ organization_id: membership.organization_id, conversation_id: payload.conversationId, channel: "email", direction: "outbound", sender_party_id: connection.owner_party_id, subject: payload.subject, content_text: payload.body, occurred_at: new Date().toISOString(), participation: { approvedReplyAll: true }, provenance: { capability: "email.replyAll", approvalId: id } }).select("id").single();
        const [completedTasks, completedCommitments] = await Promise.all([
          admin.from("tasks").update({ status: "completed", updated_at: new Date().toISOString() }).eq("source_interaction_id", payload.sourceInteractionId).neq("status", "completed").select("id"),
          admin.from("commitments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("source_interaction_id", payload.sourceInteractionId).neq("status", "completed").select("id"),
        ]);
        await admin.from("agent_events").upsert([
          { organization_id: membership.organization_id, agent_id: approval.agent_id, interaction_id: payload.sourceInteractionId, connection_id: connection.id, action: "email.replyAll", status: "success", reason: "Human-approved reply-all accepted by Microsoft Graph", metadata: { approvalId: id, outboundInteractionId: outbound?.id } },
          ...((completedTasks.data?.length ?? 0) ? [{ organization_id: membership.organization_id, agent_id: approval.agent_id, interaction_id: payload.sourceInteractionId, connection_id: connection.id, action: "task.completed", status: "success", reason: "Delegated research was reported to the thread" }] : []),
          ...((completedCommitments.data?.length ?? 0) ? [{ organization_id: membership.organization_id, agent_id: approval.agent_id, interaction_id: payload.sourceInteractionId, connection_id: connection.id, action: "commitment.completed", status: "success", reason: "Public commitment was fulfilled by the approved reply-all" }] : []),
        ], { onConflict: "agent_id,interaction_id,action" });
      }
      await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: approval.agent_id, connection_id: connection.id, action: "email.sent", status: "success", reason: "Approved immutable payload accepted by Microsoft Graph", metadata: { approvalId: id, payloadHash: approval.payload_hash, type: payload.type } });
      return Response.json({ status: "executed" });
    }
    if (response.status >= 400 && response.status < 500) {
      await admin.from("approval_requests").update({ status: "pending" }).eq("id", id).eq("status", "executing");
      return Response.json({ error: `Microsoft rejected the message (${response.status}).` }, { status: 502 });
    }
    throw new Error(`Ambiguous Microsoft response (${response.status})`);
  } catch (error) {
    await admin.from("approval_requests").update({ status: "needs_reconciliation" }).eq("id", id).eq("status", "executing");
    await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: approval.agent_id, connection_id: connection.id, action: "email.sent", status: "needs_reconciliation", reason: "Delivery result is uncertain; do not retry automatically", metadata: { approvalId: id } });
    console.error("approved_email_needs_reconciliation", { approvalId: id, error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "Delivery is uncertain and requires Sent Items reconciliation before retrying." }, { status: 502 });
  }
}
