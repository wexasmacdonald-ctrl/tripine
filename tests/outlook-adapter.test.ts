import { describe, expect, it } from "vitest";
import { isAutomatedMessage, OutlookEmailChannelAdapter, type GraphMessage } from "../src/channels/outlook/adapter";

const context = { organizationId: "org", agentId: "agent", agentAddress: "alex@tripine.onmicrosoft.com", verifiedInternalAddresses: ["alex@tripine.onmicrosoft.com", "connor@tripine.onmicrosoft.com"] };

function message(overrides: Partial<GraphMessage> = {}): GraphMessage {
  return {
    id: "message-1",
    conversationId: "thread-1",
    internetMessageId: "<message-1@tripine.test>",
    subject: "ABC quote",
    from: { emailAddress: { name: "Connor", address: "connor@tripine.onmicrosoft.com" } },
    toRecipients: [{ emailAddress: { name: "Alex", address: "alex@tripine.onmicrosoft.com" } }],
    body: { contentType: "html", content: "<p>Alex, can you check the ABC quote?</p>" },
    receivedDateTime: "2026-08-13T12:00:00Z",
    internetMessageHeaders: [{ name: "In-Reply-To", value: "<prior@tripine.test>" }],
    ...overrides,
  };
}

describe("OutlookEmailChannelAdapter", () => {
  it("preserves direct-recipient and thread semantics", async () => {
    const interaction = await new OutlookEmailChannelAdapter().normalizeInbound(message(), context);
    expect(interaction.sender.verifiedInternal).toBe(true);
    expect(interaction.participation).toMatchObject({ addressedToAgent: true, agentWasToRecipient: true, agentWasCcRecipient: false, explicitMention: true });
    expect(interaction.channelThread?.replyToMessageId).toBe("<prior@tripine.test>");
    expect(interaction.content).toContain("ABC quote");
  });

  it("does not trust an unknown address merely because its domain matches", async () => {
    const interaction = await new OutlookEmailChannelAdapter().normalizeInbound(message({ from: { emailAddress: { name: "Unknown", address: "unknown@tripine.onmicrosoft.com" } } }), context);
    expect(interaction.sender.verifiedInternal).toBe(false);
  });

  it("retains CC participation without converting it into direct delegation", async () => {
    const interaction = await new OutlookEmailChannelAdapter().normalizeInbound(message({ toRecipients: [{ emailAddress: { address: "connor@tripine.onmicrosoft.com" } }], ccRecipients: [{ emailAddress: { address: "alex@tripine.onmicrosoft.com" } }], body: { contentType: "text", content: "Connor, can you send the quote?" } }), context);
    expect(interaction.participation).toMatchObject({ agentWasToRecipient: false, agentWasCcRecipient: true, explicitMention: false });
  });

  it("separates forwarded evidence and preserves attachment metadata", async () => {
    const interaction = await new OutlookEmailChannelAdapter().normalizeInbound(message({ body: { contentType: "text", content: "Alex, assess the impact.\n\n---------- Forwarded message ----------\nFrom: Vendor\nPrices rise 8%." }, attachments: [{ id: "a1", name: "pricing.pdf", contentType: "application/pdf", size: 4200 }] }), context);
    expect(interaction.content).toBe("Alex, assess the impact.");
    expect(interaction.forwardedSegments[0]?.content).toContain("Prices rise 8%");
    expect(interaction.forwardedSegments[0]?.author).toBe("Vendor");
    expect(interaction.forwardedSegments[0]?.confidence).toBeLessThan(1);
    expect(interaction.attachments[0]).toMatchObject({ id: "a1", name: "pricing.pdf", size: 4200 });
  });

  it("detects automated messages that must never trigger a reply loop", () => {
    expect(isAutomatedMessage(message({ internetMessageHeaders: [{ name: "Auto-Submitted", value: "auto-generated" }] }))).toBe(true);
    expect(isAutomatedMessage(message({ from: { emailAddress: { address: "no-reply@example.com" } } }))).toBe(true);
    expect(isAutomatedMessage(message())).toBe(false);
  });
});
