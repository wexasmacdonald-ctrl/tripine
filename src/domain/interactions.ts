export type ChannelKind = "web" | "email" | "teams";
export type PartyKind = "human" | "agent" | "external_person";
export type RecipientRole = "to" | "cc" | "bcc";

export interface CommunicationIdentity {
  partyId: string;
  channel: ChannelKind;
  address: string;
  providerTenantId?: string;
  providerObjectId?: string;
  verified: boolean;
}

export interface InteractionParticipant {
  partyId?: string;
  name?: string;
  address: string;
  role?: RecipientRole;
  verifiedInternal: boolean;
}

export interface AttachmentReference {
  id: string;
  name: string;
  contentType: string;
  size: number;
  source: "channel" | "tool";
  contentHash?: string;
}

export interface InboundInteraction {
  organizationId: string;
  agentId: string;
  channel: ChannelKind;
  sender: InteractionParticipant;
  recipients: InteractionParticipant[];
  subject?: string;
  content: string;
  occurredAt: string;
  attachments: AttachmentReference[];
  forwardedSegments: Array<{ author?: string; content: string; confidence: number }>;
  channelThread?: {
    externalThreadId?: string;
    externalMessageId?: string;
    internetMessageId?: string;
    replyToMessageId?: string;
    references?: string[];
  };
  participation: {
    addressedToAgent: boolean;
    agentWasToRecipient: boolean;
    agentWasCcRecipient: boolean;
    agentWasBccRecipient?: boolean;
    explicitMention: boolean;
  };
  provenance: { connectionId?: string; rawType: string; untrusted: true };
}

export interface OutboundInteraction extends Omit<InboundInteraction, "participation" | "forwardedSegments" | "provenance"> {
  action: "reply" | "replyAll" | "forward" | "send";
}

export interface ChannelAdapter<RawInbound = unknown> {
  channel: ChannelKind;
  normalizeInbound(raw: RawInbound, context: { organizationId: string; agentId: string; agentAddress: string; verifiedInternalAddresses?: string[] }): Promise<InboundInteraction>;
  sendOutbound(interaction: OutboundInteraction, context: { connectionId: string }): Promise<{ externalMessageId?: string; status: "sent" | "needs_reconciliation" }>;
}
