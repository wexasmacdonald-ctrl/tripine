import type { ChannelAdapter, InboundInteraction, OutboundInteraction } from "@/domain/interactions";

type GraphRecipient = { emailAddress?: { name?: string; address?: string } };
export type GraphMessage = {
  id: string; conversationId?: string; internetMessageId?: string; subject?: string;
  from?: GraphRecipient; toRecipients?: GraphRecipient[]; ccRecipients?: GraphRecipient[]; bccRecipients?: GraphRecipient[];
  body?: { content?: string; contentType?: string }; receivedDateTime?: string; hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
};

function participant(value: GraphRecipient, role?: "to" | "cc" | "bcc", internalDomain?: string) {
  const address = value.emailAddress?.address?.toLowerCase() ?? "unknown";
  return { name: value.emailAddress?.name, address, role, verifiedInternal: Boolean(internalDomain && address.endsWith(`@${internalDomain}`)) };
}

export class OutlookEmailChannelAdapter implements ChannelAdapter<GraphMessage> {
  channel = "email" as const;
  async normalizeInbound(raw: GraphMessage, context: { organizationId: string; agentId: string; agentAddress: string }): Promise<InboundInteraction> {
    const domain = context.agentAddress.split("@")[1];
    const to = (raw.toRecipients ?? []).map((v) => participant(v, "to", domain));
    const cc = (raw.ccRecipients ?? []).map((v) => participant(v, "cc", domain));
    const bcc = (raw.bccRecipients ?? []).map((v) => participant(v, "bcc", domain));
    const headers = new Map((raw.internetMessageHeaders ?? []).map((h) => [h.name.toLowerCase(), h.value]));
    const content = raw.body?.content ?? "";
    const forwardMarker = /-{2,}\s*forwarded message\s*-{2,}/i;
    const parts = content.split(forwardMarker);
    return {
      organizationId: context.organizationId, agentId: context.agentId, channel: "email",
      sender: participant(raw.from ?? {}, undefined, domain), recipients: [...to, ...cc, ...bcc], subject: raw.subject,
      content: parts[0], occurredAt: raw.receivedDateTime ?? new Date().toISOString(), attachments: [],
      forwardedSegments: parts.slice(1).map((segment) => ({ content: segment, confidence: 0.6 })),
      channelThread: { externalThreadId: raw.conversationId, externalMessageId: raw.id, internetMessageId: raw.internetMessageId, replyToMessageId: headers.get("in-reply-to"), references: headers.get("references")?.split(/\s+/) },
      participation: { addressedToAgent: [...to, ...cc].some((r) => r.address === context.agentAddress.toLowerCase()), agentWasToRecipient: to.some((r) => r.address === context.agentAddress.toLowerCase()), agentWasCcRecipient: cc.some((r) => r.address === context.agentAddress.toLowerCase()), agentWasBccRecipient: bcc.some((r) => r.address === context.agentAddress.toLowerCase()), explicitMention: new RegExp(`\\b${context.agentAddress.split("@")[0]}\\b`, "i").test(parts[0]) },
      provenance: { rawType: "microsoft.graph.message", untrusted: true },
    };
  }
  async sendOutbound(interaction: OutboundInteraction): Promise<{ status: "needs_reconciliation" }> {
    void interaction;
    throw new Error("Use the approval-gated Microsoft email provider for outbound delivery.");
  }
}
