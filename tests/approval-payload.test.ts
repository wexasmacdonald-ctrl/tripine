import { describe, expect, it } from "vitest";
import { hashApprovalPayload, type EmailReplyAllApproval } from "../src/domain/approvals/email-action";

describe("email approval payloads", () => {
  it("binds a reply-all approval to its exact source and recipients", () => {
    const payload: EmailReplyAllApproval = { type: "email.replyAll", to: ["connor@example.com", "sarah@example.com"], cc: [], subject: "ABC quote", body: "Installation is not included.", sourceMessageId: "message-1", sourceInteractionId: "interaction-1", conversationId: "conversation-1" };
    expect(hashApprovalPayload(payload)).not.toBe(hashApprovalPayload({ ...payload, body: "Installation is included." }));
    expect(hashApprovalPayload(payload)).not.toBe(hashApprovalPayload({ ...payload, to: ["connor@example.com"] }));
    expect(hashApprovalPayload(payload)).not.toBe(hashApprovalPayload({ ...payload, sourceMessageId: "message-2" }));
  });

  it("is stable when object keys are reconstructed in a different order", () => {
    const first: EmailReplyAllApproval = { type: "email.replyAll", to: ["sarah@example.com"], cc: [], subject: "ABC", body: "Reply", sourceMessageId: "m1", sourceInteractionId: "i1", conversationId: "c1" };
    const second = { conversationId: "c1", sourceInteractionId: "i1", sourceMessageId: "m1", body: "Reply", subject: "ABC", cc: [], to: ["sarah@example.com"], type: "email.replyAll" } as EmailReplyAllApproval;
    expect(hashApprovalPayload(first)).toBe(hashApprovalPayload(second));
  });
});
