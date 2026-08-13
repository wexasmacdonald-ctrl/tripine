import type { InboundInteraction } from "@/domain/interactions";

export type ParticipationAssessment = {
  role: "direct_recipient" | "cc_awareness" | "explicit_delegate";
  intent: "inform" | "question" | "request" | "delegation" | "commitment";
  shouldRespond: boolean;
  mayCreateTask: boolean;
  mayCreateCommitment: boolean;
  confidence: number;
};

export function enforceParticipationPolicy(interaction: InboundInteraction, proposed: ParticipationAssessment): ParticipationAssessment {
  const verifiedInternal = interaction.sender.verifiedInternal;
  if (!verifiedInternal) return { ...proposed, mayCreateTask: false, mayCreateCommitment: false };
  if (interaction.participation.agentWasCcRecipient && !interaction.participation.explicitMention && proposed.role !== "explicit_delegate") {
    return { ...proposed, role: "cc_awareness", shouldRespond: false, mayCreateTask: false, mayCreateCommitment: false };
  }
  return proposed;
}

export function outboundRequiresApproval(interaction: { recipients: Array<{ verifiedInternal: boolean }>; action: string; attachments: unknown[]; createsCommitment?: boolean; changesRecipients?: boolean }) {
  return Boolean(interaction.action !== "reply" || interaction.recipients.some((r) => !r.verifiedInternal) || interaction.attachments.length > 0 || interaction.createsCommitment || interaction.changesRecipients);
}
