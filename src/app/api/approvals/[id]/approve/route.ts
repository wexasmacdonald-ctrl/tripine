import { createHash } from "node:crypto";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { getValidMicrosoftToken } from "@/connectors/microsoft/auth/connection-store";

type EmailPayload = { type: "email.send"; to: string[]; cc: string[]; subject: string; body: string };
function canonical(value: unknown) { return JSON.stringify(value, Object.keys(value as object).sort()); }

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
  const payload = approval.payload as EmailPayload;
  if (createHash("sha256").update(canonical(payload)).digest("hex") !== approval.payload_hash) return Response.json({ error: "Approval payload integrity check failed." }, { status: 409 });
  const { data: claimed } = await admin.from("approval_requests").update({ status: "executing", decided_by_user_id: user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (!claimed) return Response.json({ error: "Approval is already being executed." }, { status: 409 });
  const { data: connection } = await admin.from("connections").select("id").eq("organization_id", membership.organization_id).eq("provider", "microsoft").eq("owner_type", "service").eq("status", "connected").single();
  if (!connection) {
    await admin.from("approval_requests").update({ status: "pending" }).eq("id", id).eq("status", "executing");
    return Response.json({ error: "Connect Alex's Microsoft mailbox first." }, { status: 503 });
  }
  try {
    const token = await getValidMicrosoftToken(connection.id);
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { subject: payload.subject, body: { contentType: "Text", content: payload.body }, toRecipients: payload.to.map((address) => ({ emailAddress: { address } })), ccRecipients: payload.cc.map((address) => ({ emailAddress: { address } })) }, saveToSentItems: true }), cache: "no-store" });
    if (response.status === 202) {
      await admin.from("approval_requests").update({ status: "executed" }).eq("id", id).eq("status", "executing");
      await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: approval.agent_id, connection_id: connection.id, action: "email.sent", status: "success", reason: "Approved immutable payload accepted by Microsoft Graph", metadata: { approvalId: id, payloadHash: approval.payload_hash } });
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
