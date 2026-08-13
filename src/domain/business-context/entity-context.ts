import { createAdminClient } from "@/infrastructure/supabase/admin";
import { findCompanyMentions } from "./mentions";

export async function linkMentionedCompanies(input: { organizationId: string; conversationId: string; interactionId: string; text: string }) {
  const admin = createAdminClient();
  const { data: companies, error } = await admin.from("companies").select("id,name").eq("organization_id", input.organizationId);
  if (error) throw new Error(`Could not resolve company context: ${error.message}`);
  const normalized = input.text.toLowerCase();
  const matches = findCompanyMentions(companies ?? [], input.text);
  if (!matches.length) return [];
  const rows = matches.map((company) => ({ organization_id: input.organizationId, conversation_id: input.conversationId, company_id: company.id, source_interaction_id: input.interactionId, confidence: normalized.includes(company.name.toLowerCase()) ? 1 : 0.85, last_mentioned_at: new Date().toISOString() }));
  const { error: contextError } = await admin.from("conversation_entity_context").upsert(rows, { onConflict: "conversation_id,company_id" });
  if (contextError) throw new Error(`Could not persist company context: ${contextError.message}`);
  return matches;
}
