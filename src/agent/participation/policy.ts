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

export function assessEmailParticipation(interaction: InboundInteraction): ParticipationAssessment {
  const directLanguage = /\b(can you|could you|please|take care of|figure this out|check|find|prepare|send|let us know|tell us|tell me)\b/i.test(interaction.content);
  const publicPromise = /\b(?:alex|he)\s+(?:will|'ll)|\b(?:i'?ve|i have)\s+(?:asked|assigned)\s+alex\b/i.test(interaction.content);
  const explicitDelegation = interaction.sender.verifiedInternal && interaction.participation.explicitMention && directLanguage;
  const externalPartyAware = interaction.recipients.some((recipient) => !recipient.verifiedInternal);
  const directlyAddressed = interaction.participation.agentWasToRecipient || interaction.participation.explicitMention;
  const proposed: ParticipationAssessment = {
    role: explicitDelegation || publicPromise ? "explicit_delegate" : interaction.participation.agentWasCcRecipient ? "cc_awareness" : "direct_recipient",
    intent: publicPromise ? "commitment" : explicitDelegation ? "delegation" : /\?|\b(check|find|tell|send|prepare)\b/i.test(interaction.content) ? "request" : "inform",
    shouldRespond: directlyAddressed && (interaction.sender.verifiedInternal || interaction.participation.agentWasToRecipient),
    mayCreateTask: explicitDelegation || publicPromise,
    mayCreateCommitment: publicPromise || (explicitDelegation && externalPartyAware),
    confidence: explicitDelegation || publicPromise ? 0.95 : 0.8,
  };
  return enforceParticipationPolicy(interaction, proposed);
}

export function replyAllAudience(interaction: InboundInteraction, agentAddress: string) {
  const agent = agentAddress.toLowerCase();
  const seen = new Set<string>();
  const to = [interaction.sender, ...interaction.recipients.filter((recipient) => recipient.role === "to")]
    .filter((recipient) => recipient.address !== agent && !seen.has(recipient.address) && Boolean(seen.add(recipient.address)));
  const cc = interaction.recipients
    .filter((recipient) => recipient.role === "cc" && recipient.address !== agent && !seen.has(recipient.address) && Boolean(seen.add(recipient.address)));
  return { to, cc, all: [...to, ...cc] };
}

export function outboundRequiresApproval(interaction: { recipients: Array<{ verifiedInternal: boolean }>; action: string; attachments: unknown[]; createsCommitment?: boolean; changesRecipients?: boolean }) {
  return Boolean(interaction.action !== "reply" || interaction.recipients.some((r) => !r.verifiedInternal) || interaction.attachments.length > 0 || interaction.createsCommitment || interaction.changesRecipients);
}
