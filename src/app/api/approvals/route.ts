import { createHash } from "node:crypto";
import { z } from "zod";
import { createServerSupabase } from "@/infrastructure/supabase/server";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { env } from "@/infrastructure/env";
import { recipientsAreAllowed } from "@/domain/approvals/recipient-policy";

const payloadSchema = z.object({
  to: z.array(z.email()).min(1).max(10),
  cc: z.array(z.email()).max(10).default([]),
  subject: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(20000),
});

function canonical(value: unknown) { return JSON.stringify(value, Object.keys(value as object).sort()); }

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid email draft is required." }, { status: 400 });
  if (!recipientsAreAllowed([...parsed.data.to, ...parsed.data.cc], env.DEMO_ALLOWED_RECIPIENTS)) return Response.json({ error: "Every recipient must be present in the controlled demo recipient allowlist." }, { status: 403 });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id,party_id,role").eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const admin = createAdminClient();
  const { data: agent } = await admin.from("agents").select("id").eq("organization_id", membership.organization_id).eq("active", true).single();
  if (!agent) return Response.json({ error: "Alex is not configured." }, { status: 503 });
  const payload = { type: "email.send", ...parsed.data };
  const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
  const { data, error } = await admin.from("approval_requests").insert({ organization_id: membership.organization_id, agent_id: agent.id, requested_by_party_id: membership.party_id, action: "email.send", payload, payload_hash: payloadHash, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }).select("id,status,payload,expires_at").single();
  if (error || !data) return Response.json({ error: "The approval request could not be created." }, { status: 500 });
  await admin.from("agent_events").insert({ organization_id: membership.organization_id, agent_id: agent.id, action: "email.send", status: "pending_approval", reason: "Exact outbound email payload is awaiting approval", metadata: { approvalId: data.id, payloadHash } });
  return Response.json(data, { status: 201 });
}
