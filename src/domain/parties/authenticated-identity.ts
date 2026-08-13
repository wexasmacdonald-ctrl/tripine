import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/infrastructure/supabase/admin";

export async function reconcileAuthenticatedEmailIdentity(input: { organizationId: string; partyId: string; user: User }) {
  const address = input.user.email?.trim().toLowerCase();
  if (!address) return;
  const admin = createAdminClient();
  const { error } = await admin.from("party_identities").upsert({ organization_id: input.organizationId, party_id: input.partyId, channel: "email", address, verified: true, metadata: { verificationSource: "supabase.auth", authUserId: input.user.id } }, { onConflict: "organization_id,channel,address" });
  if (error) throw new Error(`Could not reconcile authenticated email identity: ${error.message}`);
}
