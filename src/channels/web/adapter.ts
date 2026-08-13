import type { ChannelAdapter, InboundInteraction } from "@/domain/interactions";

export class WebChannelAdapter implements ChannelAdapter<{ message: string; userId: string }> {
  channel = "web" as const;
  async normalizeInbound(raw: { message: string; userId: string }, context: { organizationId: string; agentId: string; agentAddress: string }): Promise<InboundInteraction> {
    return { organizationId: context.organizationId, agentId: context.agentId, channel: "web", sender: { partyId: raw.userId, address: raw.userId, verifiedInternal: true }, recipients: [{ address: context.agentAddress, verifiedInternal: true, role: "to" }], content: raw.message, occurredAt: new Date().toISOString(), attachments: [], forwardedSegments: [], participation: { addressedToAgent: true, agentWasToRecipient: true, agentWasCcRecipient: false, explicitMention: false }, provenance: { rawType: "tripine.web.message", untrusted: true } };
  }
  async sendOutbound(): Promise<{ status: "sent" }> { return { status: "sent" }; }
}
