import type { ChannelAdapter, InboundInteraction, OutboundInteraction } from "@/domain/interactions";

type GraphRecipient = { emailAddress?: { name?: string; address?: string } };
export type GraphMessage = {
  id: string; conversationId?: string; internetMessageId?: string; subject?: string;
  from?: GraphRecipient; toRecipients?: GraphRecipient[]; ccRecipients?: GraphRecipient[]; bccRecipients?: GraphRecipient[];
  body?: { content?: string; contentType?: string }; receivedDateTime?: string; hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  attachments?: Array<{ id: string; name?: string; contentType?: string; size?: number }>;
};

export function isAutomatedMessage(raw: GraphMessage) {
  const headers = new Map((raw.internetMessageHeaders ?? []).map((header) => [header.name.toLowerCase(), header.value.toLowerCase()]));
  const sender = raw.from?.emailAddress?.address?.toLowerCase() ?? "";
  const autoSubmitted = headers.get("auto-submitted");
  const precedence = headers.get("precedence");
  return Boolean(
    (autoSubmitted && autoSubmitted !== "no") ||
    precedence === "bulk" ||
    precedence === "junk" ||
    precedence === "list" ||
    /(^|[._-])(no-?reply|mailer-daemon|postmaster)([+@._-]|$)/i.test(sender),
  );
}

function participant(value: GraphRecipient, role?: "to" | "cc" | "bcc", verifiedAddresses: string[] = []) {
  const address = value.emailAddress?.address?.toLowerCase() ?? "unknown";
  return { name: value.emailAddress?.name, address, role, verifiedInternal: verifiedAddresses.includes(address) };
}

function plainText(content: string, contentType?: string) {
  if (contentType?.toLowerCase() !== "html") return content.trim();
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function forwardedSegment(content: string) {
  const author = content.match(/^\s*From:\s*(.+)$/im)?.[1]?.trim();
  return { author, content: content.trim(), confidence: author ? 0.75 : 0.6 };
}

export class OutlookEmailChannelAdapter implements ChannelAdapter<GraphMessage> {
  channel = "email" as const;
  async normalizeInbound(raw: GraphMessage, context: { organizationId: string; agentId: string; agentAddress: string; verifiedInternalAddresses?: string[] }): Promise<InboundInteraction> {
    const verifiedAddresses = (context.verifiedInternalAddresses ?? []).map((value) => value.toLowerCase());
    const to = (raw.toRecipients ?? []).map((v) => participant(v, "to", verifiedAddresses));
    const cc = (raw.ccRecipients ?? []).map((v) => participant(v, "cc", verifiedAddresses));
    const bcc = (raw.bccRecipients ?? []).map((v) => participant(v, "bcc", verifiedAddresses));
    const headers = new Map((raw.internetMessageHeaders ?? []).map((h) => [h.name.toLowerCase(), h.value]));
    const content = plainText(raw.body?.content ?? "", raw.body?.contentType);
    const forwardMarker = /(?:-{2,}\s*(?:original|forwarded) message\s*-{2,}|\n\s*From:\s+.+\n\s*(?:Sent|Date):)/i;
    const parts = content.split(forwardMarker);
    return {
      organizationId: context.organizationId, agentId: context.agentId, channel: "email",
      sender: participant(raw.from ?? {}, undefined, verifiedAddresses), recipients: [...to, ...cc, ...bcc], subject: raw.subject,
      content: parts[0].trim(), occurredAt: raw.receivedDateTime ?? new Date().toISOString(), attachments: (raw.attachments ?? []).map((item) => ({ id: item.id, name: item.name ?? "attachment", contentType: item.contentType ?? "application/octet-stream", size: item.size ?? 0, source: "channel" as const })),
      forwardedSegments: parts.slice(1).map(forwardedSegment),
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
