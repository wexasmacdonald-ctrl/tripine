import { describe, expect, it } from "vitest";
import { enforceParticipationPolicy, outboundRequiresApproval, type ParticipationAssessment } from "../src/agent/participation/policy";
import type { InboundInteraction } from "../src/domain/interactions";
import { recipientsAreAllowed } from "../src/domain/approvals/recipient-policy";

const proposed: ParticipationAssessment = { role: "direct_recipient", intent: "request", shouldRespond: true, mayCreateTask: true, mayCreateCommitment: true, confidence: 0.9 };
function interaction(overrides: Partial<InboundInteraction> = {}): InboundInteraction {
  return { organizationId: "org", agentId: "agent", channel: "email", sender: { address: "client@example.com", verifiedInternal: false }, recipients: [], content: "Do this", occurredAt: new Date().toISOString(), attachments: [], forwardedSegments: [], participation: { addressedToAgent: true, agentWasToRecipient: true, agentWasCcRecipient: false, explicitMention: false }, provenance: { rawType: "test", untrusted: true }, ...overrides };
}

describe("participation policy", () => {
  it("prevents external senders from assigning tasks or commitments", () => {
    expect(enforceParticipationPolicy(interaction(), proposed)).toMatchObject({ mayCreateTask: false, mayCreateCommitment: false });
  });

  it("keeps silent on non-delegating CC mail", () => {
    const result = enforceParticipationPolicy(interaction({ sender: { address: "connor@example.com", verifiedInternal: true }, participation: { addressedToAgent: true, agentWasToRecipient: false, agentWasCcRecipient: true, explicitMention: false } }), proposed);
    expect(result).toMatchObject({ role: "cc_awareness", shouldRespond: false, mayCreateTask: false, mayCreateCommitment: false });
  });

  it("requires approval for external recipients, attachments, forwards, and recipient changes", () => {
    expect(outboundRequiresApproval({ recipients: [{ verifiedInternal: false }], action: "reply", attachments: [] })).toBe(true);
    expect(outboundRequiresApproval({ recipients: [{ verifiedInternal: true }], action: "reply", attachments: [{}] })).toBe(true);
    expect(outboundRequiresApproval({ recipients: [{ verifiedInternal: true }], action: "forward", attachments: [] })).toBe(true);
    expect(outboundRequiresApproval({ recipients: [{ verifiedInternal: true }], action: "reply", attachments: [], changesRecipients: true })).toBe(true);
  });

  it("allows only a narrow internal reply without approval", () => {
    expect(outboundRequiresApproval({ recipients: [{ verifiedInternal: true }], action: "reply", attachments: [] })).toBe(false);
  });
});

describe("controlled recipient policy", () => {
  it("requires an explicit exact-address allowlist", () => {
    expect(recipientsAreAllowed(["sarah@example.com"], undefined)).toBe(false);
    expect(recipientsAreAllowed(["Sarah@Example.com"], "sarah@example.com,connor@example.com")).toBe(true);
    expect(recipientsAreAllowed(["attacker@example.com"], "sarah@example.com")).toBe(false);
  });
});
